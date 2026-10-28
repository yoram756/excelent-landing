import {writeFileSync} from 'node:fs';
const report={at:new Date().toISOString(),mode:'PUBLIC_DNS_DIAGNOSTIC',requests:[],secretsUsed:false};
for(const hostname of ['cosend.app','mcp.cosend.app']){
 const url='https://dns.google/resolve?name='+hostname+'&type=A';
 try{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)}),d=await r.json();report.requests.push({hostname,url,http:r.status,dnsStatus:d.Status,answers:d.Answer?.map(x=>({name:x.name,type:x.type,data:x.data}))??[]});}
 catch(e){report.requests.push({hostname,url,error:{name:e.name,message:e.message,code:e.cause?.code??null}});}
}
writeFileSync('docs/runtime/cosend-dot/public-dns-20261028.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
