const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../../site/lp1v2');
const T={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
let mode='ok',log=[];const seen={};
http.createServer((q,r)=>{
  const u=new URL(q.url,'http://x');
  if(u.pathname==='/__mode'){mode=u.searchParams.get('m');log=[];r.end('ok');return;}
  if(u.pathname==='/__log'){r.setHeader('content-type','application/json');r.end(JSON.stringify(log));return;}
  if(u.pathname.startsWith('/api/')){let b='';q.on('data',c=>b+=c);q.on('end',()=>{const j=JSON.parse(b||'{}');log.push({path:u.pathname,body:j});
    setTimeout(()=>{ if(mode==='fail'){r.statusCode=502;r.end('{"error":"x"}');return;}
      if(mode==='429'){r.statusCode=429;r.end('{}');return;}
      const k=j.idempotency_key;const id=seen[k]||('R'+Object.keys(seen).length);seen[k]=id;
      r.setHeader('content-type','application/json');r.end(JSON.stringify({ok:true,request_id:id,duplicate:log.filter(l=>l.body.idempotency_key===k).length>1}));},300);});return;}
  let p=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname);
  fs.readFile(p,(e,d)=>{if(e){r.statusCode=404;r.end();return;}r.setHeader('content-type',T[path.extname(p)]||'application/octet-stream');
  r.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'");r.end(d);});
}).listen(8090,()=>process.send&&process.send('ready'));
