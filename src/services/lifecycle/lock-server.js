// Minimal HTTP service over db.js so n8n can take the 60 second phone lock before "Find query".
//   POST /lock   {"phone": "...", "source": "..."}  -> {"locked": true|false, ...}; locked=true means this caller won the lock
//   GET  /health                                   -> {"ok": true}
// POST requires "Authorization: Bearer <LOCK_SERVER_TOKEN>". Listens on 127.0.0.1 unless LOCK_SERVER_HOST says otherwise.
// Env: LOCK_SERVER_TOKEN (required), LOCK_DB_PATH (absolute .sqlite, required), LOCK_SERVER_HOST, LOCK_SERVER_PORT.
const http=require('node:http'),crypto=require('node:crypto');
const {LifecycleDb}=require('./db');
const MAX_BODY=16384;
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
const authorized=(req,token)=>{const h=String(req.headers.authorization||'');const x=Buffer.from(h),y=Buffer.from('Bearer '+token);return x.length===y.length&&crypto.timingSafeEqual(x,y);};

const createLockServer=({db,token,now=()=>Date.now()})=>{
  if(typeof token!=='string'||token.length<32)throw Error('LOCK_SERVER_TOKEN of at least 32 characters required');
  const server=http.createServer({requestTimeout:10000,headersTimeout:5000},(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health'){if(req.method!=='GET')return send(res,405,{error:'method_not_allowed'});return send(res,200,{ok:true});}
    if(url.pathname!=='/lock')return send(res,404,{error:'not_found'});
    if(req.method!=='POST')return send(res,405,{error:'method_not_allowed'});
    if(!authorized(req,token))return send(res,401,{error:'unauthorized'});
    let raw='',size=0,tooBig=false;
    req.setEncoding('utf8');
    // Past MAX_BODY the rest is drained, not kept; requestTimeout bounds a slow sender.
    req.on('data',c=>{size+=Buffer.byteLength(c);if(size>MAX_BODY)tooBig=true;else raw+=c;});
    req.on('end',()=>{
      if(tooBig)return send(res,413,{error:'too_large'});
      let body;try{body=JSON.parse(raw);}catch(e){return send(res,400,{error:'bad_json'});}
      if(!body||typeof body.phone!=='string')return send(res,400,{error:'phone_required'});
      const source=typeof body.source==='string'&&/^[\w-]{1,40}$/.test(body.source)?body.source:'http';
      try{
        const r=db.admitLead({source,raw,phone:body.phone,now:now()});
        send(res,200,{locked:r.admitted,phone:r.phone,lockedUntil:r.lockedUntil,reason:r.reason});
      }catch(e){send(res,/Invalid phone/.test(e.message)?400:500,{error:/Invalid phone/.test(e.message)?'bad_phone':'lock_failed'});}
    });
  });
  return server;
};

if(require.main===module){
  const {LOCK_SERVER_TOKEN:token,LOCK_DB_PATH:dbPath,LOCK_SERVER_HOST:host='127.0.0.1',LOCK_SERVER_PORT:port='8787'}=process.env;
  const db=new LifecycleDb(dbPath);
  const server=createLockServer({db,token});
  server.listen(Number(port),host,()=>console.log(JSON.stringify({listening:`${host}:${port}`})));
  const stop=()=>server.close(()=>{db.close();process.exit(0);});
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

module.exports={createLockServer};
