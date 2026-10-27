'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {OperationsStore}=require('./store');
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function createOperationsServer({store,tokens,now=()=>new Date().toISOString()}){
 if(!tokens||['ingest','review','read'].some(k=>typeof tokens[k]!=='string'||tokens[k].length<32)||new Set(Object.values(tokens)).size!==3)throw Error('Three distinct role tokens of at least 32 characters required');
 const server=http.createServer({requestTimeout:10000,headersTimeout:5000},async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/health'&&req.method==='GET')return send(res,200,{ok:true,dispatchEnabled:false});
  const role=route==='/events'?'ingest':route==='/reviews'||route==='/identity'?'review':route==='/snapshot'||route==='/metrics'?'read':null;
  if(!role)return send(res,404,{error:'not_found'});
  if(!equal(req.headers.authorization,'Bearer '+tokens[role]))return send(res,401,{error:'unauthorized'});
  if((role==='read'&&req.method!=='GET')||(role!=='read'&&req.method!=='POST'))return send(res,405,{error:'method_not_allowed'});
  try{
   if(route==='/metrics')return send(res,200,store.metrics({now:now()}));
   if(route==='/snapshot'){const caseId=new URL(req.url,'http://localhost').searchParams.get('caseId');return send(res,200,store.snapshot(caseId));}
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'json_required'});
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>131072){send(res,413,{error:'too_large'});return;}chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'bad_json'});}
   const result=route==='/events'?store.ingest(body,{now:now()}):route==='/identity'?store.resolveEvent(body.eventKey,{caseId:body.caseId,reason:body.reason,actor:'authenticated_reviewer',now:now()}):store.review(body.eventKey,body.observations,{actor:'authenticated_reviewer',now:now()});
   return send(res,200,result);
  }catch(error){
   // No source text, tokens or arbitrary exception content goes to logs/responses.
   return send(res,/conflict/i.test(error.message)?409:400,{error:'invalid_operation'});
  }
 });
 return server;
}
if(require.main===module){
 const store=new OperationsStore(process.env.OPS_DB_PATH),server=createOperationsServer({store,tokens:{ingest:process.env.OPS_INGEST_TOKEN,review:process.env.OPS_REVIEW_TOKEN,read:process.env.OPS_READ_TOKEN}});
 server.listen(Number(process.env.OPS_PORT||8791),'127.0.0.1',()=>console.log(JSON.stringify({service:'business-ops',listening:'127.0.0.1',dispatchEnabled:false})));
 const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
module.exports={createOperationsServer};
