import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import {Broker} from './broker.mjs';
import {pathToFileURL} from 'node:url';
const secret=(name)=>{try{return readFileSync(`/run/secrets/${name}`,'utf8').trim();}catch{return '';}};
export function createIsolatedServer({broker,signing,workerKey}) {
const auth=req=>{const actual=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+workerKey);return workerKey.length>=32&&actual.length===expected.length&&timingSafeEqual(actual,expected);};
return createServer(async(req,res)=>{
  let status=404,result={code:'not_found'};
  try{
    if(req.method==='GET'&&req.url==='/health'){
      // Read each operational table so a missing/corrupt database cannot pass health.
      for(const table of ['events','messages','conversations','outbox','handoffs','audit','provider_receipts'])broker.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
      status=200;result={ok:true,mode:'ISOLATED_NO_SEND',signingConfigured:signing.length>0,workerConfigured:workerKey.length>=32};
    }
    if(req.method==='POST'&&req.url==='/ingest'){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>262144){res.writeHead(413).end();return;}chunks.push(chunk);}
      const r=broker.ingest(Buffer.concat(chunks),req.headers['cosend-signature'],signing);status=r.status;result={code:r.code};
    }
    if(req.method==='POST'&&req.url==='/simulate-one'){
      if(!auth(req)){status=401;result={code:'unauthorized'};}
      else{const prepared=broker.prepareOne();const simulated=prepared?.id?await broker.dispatch(prepared.id,null):null;status=200;result={prepared,simulated,live:false};}
    }
  }catch{status=503;result={code:'durable_storage_or_processing_failure'};}
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));
});
}
// Isolated draft deliberately contains NO HTTP route that can dispatch to customers.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const broker=new Broker(process.env.EXCELENT_DB_PATH||'./state.sqlite');
  const server=createIsolatedServer({broker,signing:[secret('cosend_webhook_current'),secret('cosend_webhook_previous')].filter(Boolean),workerKey:secret('excelent_worker')});
  server.listen(Number(process.env.EXCELENT_PORT||8789),process.env.EXCELENT_BIND||'127.0.0.1');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{broker.close();process.exit(0);}));
}
