import {writeFileSync,mkdirSync} from 'node:fs';
const report={at:new Date().toISOString(),mode:'UNAUTHENTICATED_PUBLIC_CAPABILITY_PROBE',endpoint:'https://mcp.cosend.app/mcp',requests:[],secretsUsed:false};
const base='docs/runtime/cosend-dot';mkdirSync(base,{recursive:true});
try{
 const r=await fetch(report.endpoint,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const raw=await r.text(),challenge=r.headers.get('www-authenticate');
 let body;try{body=JSON.parse(raw);}catch{body={bytes:Buffer.byteLength(raw)};}
 report.requests.push({method:'POST',url:report.endpoint,mcpMethod:'tools/list',http:r.status,body,wwwAuthenticate:challenge});
 const metadata=challenge?.match(/resource_metadata="([^"]+)"/)?.[1];
 if(metadata){const u=new URL(metadata);if(u.protocol!=='https:'||!/(^|\.)cosend\.app$/.test(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('untrusted_metadata_url');const m=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(15000)});const b=await m.json();report.requests.push({method:'GET',url:u.href,http:m.status,body:b});}
 report.status=r.status===401?'PASS_AUTH_REQUIRED':'NOT_TESTED';
 report.authenticatedRead='BLOCKED_PENDING_SECURE_OAUTH';
}catch(e){report.status='BLOCKED';report.error={name:e.name,message:e.message,code:e.cause?.code??null};process.exitCode=1;}
writeFileSync(base+'/public-probe-20261028.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
