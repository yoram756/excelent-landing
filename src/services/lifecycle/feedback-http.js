// Local sandbox handler only. Links are capabilities; never put lead data in URLs.
const {render}=require('./feedback-page');
function handler(store,{clock=()=>new Date().toISOString()}={}){
 return async(req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const reply=(status,message,form=false,csrf='')=>{res.writeHead(status);res.end(render({message,form,csrf}));};
  try{
   // No reverse proxy or external bind is supported by this sandbox implementation.
   if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||''))return reply(403,'כתובת סביבה לא מאושרת.');
   const url=new URL(req.url,'http://'+req.headers.host),match=/^\/feedback\/([a-f0-9]{64})$/.exec(url.pathname);
   if(!match||url.search)return reply(404,'הקישור לא נמצא.');
   const link=store.feedbackLink(match[1],clock());
   if(req.method==='GET')return reply(200,'',true,link.csrf);
   if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return reply(405,'הפעולה אינה נתמכת.');}
   if(req.headers.origin!=='http://'+req.headers.host)return reply(403,'לא ניתן לאמת את מקור הבקשה.');
   if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))return reply(415,'סוג הבקשה אינו נתמך.');
   const parts=[];let size=0;
   for await(const part of req){size+=part.length;if(size>12000)return reply(413,'המשוב ארוך מדי.');parts.push(part);}
   const data=new URLSearchParams(Buffer.concat(parts).toString('utf8'));
   if(data.get('csrf')!==link.csrf)return reply(403,'לא ניתן לאמת את הבקשה.');
   const now=clock();
   store.feedbackLink(match[1],now); // recheck after reading the request body
   if(data.get('action')==='stop'){
    // Commit removal independently; feedback is never required to remove someone.
    store.record({eventId:'stop_'+link.token_hash,enrollmentId:link.enrollment_id,type:'optout',now});
    return reply(200,'הפסקת הקשר השיווקי נשמרה בכל הערוצים. אם תרצו, אפשר להשאיר משוב כאן למטה.',true,link.csrf);
   }
   if(data.get('action')!=='feedback')return reply(400,'הפעולה אינה מוכרת.');
   const answers={};for(const [key,value]of data){if(['csrf','action'].includes(key))continue;if(Object.hasOwn(answers,key))return reply(400,'שדה כפול אינו נתמך.');answers[key]=value;}
   store.saveFeedback({eventId:'fb_'+link.token_hash,enrollmentId:link.enrollment_id,answers,now});
   return reply(200,'תודה על המשוב. נשתמש בו כדי לשפר את השירות.');
  }catch(e){
   const code=e.code==='NOT_FOUND'?404:e.code==='EXPIRED'?410:e.code==='CONFLICT'?409:e.code?.startsWith('ERR_SQLITE')?503:400;
   // No contact details, token, free text or internal SQL error reflected in HTML.
   reply(code,code===410?'תוקף הקישור הסתיים. לא חודש קשר שיווקי.':'לא ניתן לשמור את הבקשה. אפשר לבדוק את השדות ולנסות שוב.');
  }
 };
}
module.exports={handler};
