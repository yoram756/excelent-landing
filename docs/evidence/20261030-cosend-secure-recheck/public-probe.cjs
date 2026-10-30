const fs=require('node:fs'),path=require('node:path'),dns=require('node:dns/promises');
const dir=path.resolve('tests/out/cosend-secure-recheck-20261030');fs.mkdirSync(dir,{recursive:true});
async function request(url,options={}){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});const text=await r.text();let json=null;try{json=JSON.parse(text);}catch{}return {url,status:r.status,date:r.headers.get('date'),wwwAuthenticate:r.headers.get('www-authenticate'),contentType:r.headers.get('content-type'),json};}
(async()=>{
 const result={checkedAtUtc:new Date().toISOString(),noCredentialsUsed:true,noProviderToolsCalled:true};
 try{result.dns=await dns.resolve4('mcp.cosend.app');}catch(e){result.dnsError=e.code;}
 result.get=await request('https://mcp.cosend.app/mcp');
 result.initialize=await request('https://mcp.cosend.app/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'ExcellentReadOnlyAvailabilityProbe',version:'1.0'}}})});
 const meta=result.initialize.wwwAuthenticate?.match(/resource_metadata="([^"]+)"/)?.[1];
 if(meta){const u=new URL(meta);if(u.protocol!=='https:'||u.hostname!=='api.cosend.app')throw Error('Unverified metadata destination');result.protectedResource=await request(u.href);
 const issuer=result.protectedResource.json?.authorization_servers?.[0];if(issuer){const a=new URL(issuer);if(a.protocol!=='https:'||a.hostname!=='auth.cosend.app')throw Error('Unverified issuer');result.authorizationServer=await request(new URL('/.well-known/oauth-authorization-server',a).href);}}
 fs.writeFileSync(path.join(dir,'public-probe.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});

