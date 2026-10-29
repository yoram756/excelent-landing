import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createBridge,validateConfig,verifyUpstream} from '../bridge.mjs';
const require=createRequire(import.meta.url),{openStore}=require('../store.cjs'),{validateRpc,validateReadResult}=require('../policy.cjs');
const SCOPE='textme:read',callback='https://chatgpt.com/fixture-oauth-callback';
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
const jwks={keys:[{...privateKey.export({format:'jwk'}),kid:'synthetic-signing-key',use:'sig',alg:'RS256'}]};
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;};
const stop=server=>new Promise(resolve=>server.close(resolve));
function jar(){const cookies=new Map();return async(url,options={})=>{
 const u=new URL(url);if(u.hostname!=='127.0.0.1')throw Error('SYNTHETIC_TEST_EXTERNAL_NETWORK_BLOCKED');
 const allowed=[...cookies.values()].filter(c=>u.pathname===c.path||u.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/')).filter(c=>!c.secure||u.protocol==='https:').sort((a,b)=>b.path.length-a.path.length);
 const r=await fetch(url,{...options,redirect:'manual',headers:{Connection:'close',...options.headers,...(allowed.length?{Cookie:allowed.map(c=>c.name+'='+c.value).join('; ')}:{})}});
 for(const line of r.headers.getSetCookie()){const [pair,...fields]=line.split(';'),i=pair.indexOf('='),attrs=Object.fromEntries(fields.map(f=>{const [k,...v]=f.trim().split('=');return [k.toLowerCase(),v.join('=')];}));const cookie={name:pair.slice(0,i),value:pair.slice(i+1),path:attrs.path||u.pathname.slice(0,u.pathname.lastIndexOf('/')+1),secure:Object.hasOwn(attrs,'secure')},id=cookie.name+'|'+cookie.path;if(attrs['max-age']==='0')cookies.delete(id);else cookies.set(id,cookie);}
 return r;};}
async function fixture({broadTools=false}={}){
  const dir=mkdtempSync(join(tmpdir(),'textme-oauth-')),key=randomBytes(48).toString('hex'),storageKey=randomBytes(32),calls=[];
  const upstream=createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);calls.push(body);assert.equal(req.headers.authorization,'Bearer '+key);
    if(body.method==='notifications/initialized'){res.writeHead(202);return res.end();}
    const result=body.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'synthetic-upstream',version:'1'}}:body.method==='tools/list'?{tools:[{name:'textme_read',inputSchema:{type:'object',properties:{requestJson:{type:'string'}}}},...(broadTools?[{name:'send'}]:[])]}:{content:[{type:'text',text:JSON.stringify([{provider:'TextMe',operation:'balance',readOnly:true,httpStatus:200,providerStatus:0,balance:'123.00'}])}]};
    res.writeHead(200,{'Content-Type':'text/event-stream','Mcp-Session-Id':'synthetic-upstream-session'});res.end('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:body.id,result})+'\n\n');});
  const upstreamUrl=(await listen(upstream))+'/mcp';let handler;const server=createServer((req,res)=>handler?handler(req,res):res.writeHead(503).end());const origin=await listen(server);
  const config={synthetic:true,publicBase:origin+'/textme-dot',upstreamUrl,upstreamToken:key,username:'fixture@example.test',clientId:'excelent-textme-dot',redirectUris:[callback],storageKey,jwks,database:join(dir,'oauth.sqlite')};
  let bridge=createBridge(config);handler=bridge.app;
  return {dir,key,origin,config,calls,get bridge(){return bridge;},async restart(){await stop(server);bridge.close();bridge=createBridge(config);handler=bridge.app;server.listen(Number(new URL(origin).port),'127.0.0.1');await once(server,'listening');},async close(){await stop(server);bridge.close();await stop(upstream);rmSync(dir,{recursive:true,force:true});}};
}
async function authorization(f,{badOrigin=false,badCsrf=false,badKey=false,consent=true,params={}}={}){
  const send=jar(),verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const q=new URLSearchParams({client_id:f.config.clientId,redirect_uri:callback,response_type:'code',scope:SCOPE,resource:f.bridge.resource,code_challenge:challenge,code_challenge_method:'S256',state:'synthetic-owner-state',...params});
  let r=await send(f.bridge.issuer+'/authorize?'+q);if(r.status!==303&&r.status!==302)return {response:r,send,verifier};
  const firstRedirect=new URL(r.headers.get('location'),f.origin);if(firstRedirect.origin!==f.origin)return {error:firstRedirect.searchParams.get('error'),response:r,send,verifier};
  const interaction=firstRedirect.href;r=await send(interaction);const html=await r.text();if(r.status!==200)return {response:r,send,verifier};const csrf=/name="csrf" value="([^"]+)"/.exec(html)?.[1];assert.ok(csrf);
  r=await send(interaction,{method:'POST',headers:{Origin:badOrigin?'https://attacker.invalid':f.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:badCsrf?'incorrect':csrf,access_key:badKey?'incorrect-key':f.key,...(consent?{consent:'yes'}:{})})});
  if(r.status!==303&&r.status!==302)return {response:r,send,verifier};
  for(let i=0;i<6&&[302,303].includes(r.status);i++){const u=new URL(r.headers.get('location'),f.origin);if(u.origin!==f.origin)return {code:u.searchParams.get('code'),error:u.searchParams.get('error'),response:r,verifier,send,redirect:u};r=await send(u.href);}
  throw Error('Authorization did not finish; final HTTP '+r.status+'; '+(await r.text()).slice(0,150));
}
async function exchange(f,a,extra={}){return fetch(f.bridge.issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:f.config.clientId,redirect_uri:callback,code:a.code,code_verifier:a.verifier,resource:f.bridge.resource,...extra})});}
const rpc=(method,id,params)=>({jsonrpc:'2.0',id,method,...(params?{params}:{})});
const init=()=>rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'synthetic-client',version:'1'}});
async function mcp(f,token,body,session){return fetch(f.bridge.resource,{method:'POST',headers:{Connection:'close','Content-Type':'application/json',Authorization:'Bearer '+token,...(session?{'Mcp-Session-Id':session}:{})},body:JSON.stringify(body)});}

test('synthetic loopback OAuth code + PKCE, exact read MCP, restart and revoke',async()=>{
 const f=await fixture();try{
  const meta=await(await fetch(f.origin+'/.well-known/oauth-authorization-server/textme-dot/oauth')).json();assert.deepEqual(meta.scopes_supported,[SCOPE]);assert.equal(meta.registration_endpoint,undefined);assert.deepEqual(meta.code_challenge_methods_supported,['S256']);
  assert.equal((await fetch(f.origin+'/textme-dot/healthz',{headers:{'X-Forwarded-Host':'attacker.invalid'}})).status,400);
  const missing=await fetch(f.bridge.resource,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(init())});assert.equal(missing.status,401);assert.match(missing.headers.get('www-authenticate'),/oauth-protected-resource\/textme-dot\/mcp/);assert.equal(f.calls.length,0);
  for(const bad of [{badOrigin:true},{badCsrf:true},{consent:false},{badKey:true}]){const a=await authorization(f,bad);assert.equal(a.response.status,403);}
  const a=await authorization(f);assert.ok(a.code,a.error);assert.equal(a.redirect.searchParams.get('state'),'synthetic-owner-state');const tr=await exchange(f,a),tokenBody=await tr.json();assert.equal(tr.status,200,JSON.stringify(tokenBody));const token=tokenBody.access_token;assert.ok(token);assert.equal(tokenBody.refresh_token,undefined);assert.ok(tokenBody.expires_in<=900);
  const ir=await mcp(f,token,init()),ij=await ir.json();assert.equal(ir.status,200,JSON.stringify(ij));const session=ir.headers.get('mcp-session-id');assert.equal(session.length,43);assert.notEqual(session,'synthetic-upstream-session');
  assert.equal((await mcp(f,token,{jsonrpc:'2.0',method:'notifications/initialized'},session)).status,202);
  const tools=await(await mcp(f,token,rpc('tools/list',2),session)).json();assert.deepEqual(tools.result.tools.map(t=>t.name),['textme_read']);assert.equal(tools.result.tools[0].annotations.readOnlyHint,true);
  let n=f.calls.length;for(const args of [{requestJson:'{"operation":"sms"}'},{requestJson:'{"operation":"getApiToken"}'},{requestJson:'{"operation":"balance","url":"https://attacker.invalid"}'}])assert.equal((await mcp(f,token,rpc('tools/call',3,{name:'textme_read',arguments:args}),session)).status,400);assert.equal(f.calls.length,n);
  const read=await mcp(f,token,rpc('tools/call',4,{name:'textme_read',arguments:{requestJson:'{"operation":"balance"}'}}),session);assert.equal(read.status,200);const result=await read.json();assert.equal(JSON.parse(result.result.content[0].text).balance,'123.00');assert.equal(f.calls.filter(c=>c.method==='tools/call').length,1);
  const a2=await authorization(f),t2=await(await exchange(f,a2)).json();assert.equal((await mcp(f,t2.access_token,rpc('ping',8),session)).status,404);
  const access=await f.bridge.provider.AccessToken.find(t2.access_token),adapter=new f.bridge.store.Adapter('AccessToken'),payload=await adapter.find(access.jti);
  await adapter.upsert(access.jti,{...payload,scope:'workflow:write'},60);assert.equal((await mcp(f,t2.access_token,init())).status,401);
  await adapter.upsert(access.jti,{...payload,aud:f.origin+'/mcp-server/http'},60);assert.equal((await mcp(f,t2.access_token,init())).status,401);
  await adapter.upsert(access.jti,{...payload,exp:1},-1);assert.equal((await mcp(f,t2.access_token,init())).status,401);
  await f.restart();assert.equal((await mcp(f,token,rpc('ping',9),session)).status,200);
  const raw=readFileSync(f.config.database);assert.equal(raw.includes(Buffer.from(token)),false);assert.equal(raw.includes(Buffer.from(f.key)),false);assert.equal(raw.includes(Buffer.from('upstreamId')),false);
  const rev=await fetch(f.bridge.issuer+'/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:f.config.clientId,token})});assert.equal(rev.status,200);assert.equal((await mcp(f,token,rpc('ping',10),session)).status,401);
 }finally{await f.close();}
});

test('wrong PKCE, callback, scope, resource and code replay fail in real OAuth HTTP flow',async()=>{const f=await fixture();try{
 for(const params of [{redirect_uri:'https://attacker.invalid/callback'},{scope:'workflow:write'},{resource:f.origin+'/mcp-server/http'},{code_challenge:''}]){const a=await authorization(f,{params});assert.ok(!a.code);}
 const bad=await authorization(f);assert.equal((await exchange(f,bad,{code_verifier:'incorrect-verifier-'.repeat(4)})).status,400);
 const good=await authorization(f),issued=await exchange(f,good);assert.equal(issued.status,200);const firstToken=(await issued.json()).access_token;assert.equal((await exchange(f,good)).status,400);assert.equal((await mcp(f,firstToken,init())).status,401);assert.equal(f.calls.length,0);
 }finally{await f.close();}});

test('login rate limits survive restart and never create provider reads',async()=>{const f=await fixture();try{for(let i=0;i<5;i++)assert.equal((await authorization(f,{badKey:true})).response.status,403);assert.equal((await authorization(f)).response.status,429);await f.restart();assert.equal((await authorization(f)).response.status,429);assert.equal(f.calls.length,0);}finally{await f.close();}});

test('durable encrypted adapter handles TTL, consumption, grant revoke and tampering',async()=>{const dir=mkdtempSync(join(tmpdir(),'textme-adapter-')),file=join(dir,'store.sqlite'),key=randomBytes(32);let s=openStore(file,key);try{const a=new s.Adapter('AuthorizationCode');await a.upsert('sensitive-id',{grantId:'grant',uid:'uid',secret:'synthetic-payload'},60);assert.equal((await a.findByUid('uid')).secret,'synthetic-payload');await a.consume('sensitive-id');assert.ok((await a.find('sensitive-id')).consumed);s.close();s=openStore(file,key);assert.equal((await new s.Adapter('AuthorizationCode').find('sensitive-id')).secret,'synthetic-payload');assert.equal(readFileSync(file).includes(Buffer.from('synthetic-payload')),false);await new s.Adapter('AuthorizationCode').revokeByGrantId('grant');assert.equal(await new s.Adapter('AuthorizationCode').find('sensitive-id'),undefined);await new s.Adapter('Session').upsert('expired',{x:1},-1);assert.equal(await new s.Adapter('Session').find('expired'),undefined);await new s.Adapter('Session').upsert('bad',{x:1},60);s.db.prepare("UPDATE records SET data=randomblob(length(data)) WHERE model='Session'").run();await assert.rejects(()=>new s.Adapter('Session').find('bad'));}finally{s.close();rmSync(dir,{recursive:true,force:true});}});

test('production config and upstream result guards reject broader surfaces',()=>{const base={publicBase:'https://n8n-qhxa.srv1604140.hstgr.cloud/textme-dot',upstreamUrl:'https://n8n-qhxa.srv1604140.hstgr.cloud/mcp/fixture-not-deployed-0001',upstreamToken:'synthetic-key-'.repeat(4),clientId:'excelent-textme-dot',redirectUris:[callback],username:'fixture@example.test',jwks};assert.ok(validateConfig(base));for(const c of [{...base,publicBase:'http://example.test/textme-dot'},{...base,upstreamUrl:'https://attacker.invalid/mcp/fixture-not-deployed-0001'},{...base,redirectUris:['https://attacker.invalid/callback']},{...base,redirectUris:[]},{...base,upstreamToken:''}])assert.throws(()=>validateConfig(c));for(const b of [[init()],rpc('execute_workflow',1),rpc('tools/call',1,{name:'send',arguments:{}})])assert.throws(()=>validateRpc(b,'fixture@example.test'));assert.throws(()=>validateReadResult({isError:true},'balance'));assert.throws(()=>validateReadResult({content:[{type:'text',text:'{"provider":"TextMe","operation":"balance","readOnly":true,"httpStatus":200,"providerStatus":5}'}]},'balance'));});

test('standalone service environment contract documents every runtime input and never provides a key',()=>{
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8'),sample=readFileSync(new URL('../.env.example',import.meta.url),'utf8');
 const required=[...source.matchAll(/process\.env\.([A-Z_]+)/g)].map(m=>m[1]);const check=text=>{for(const name of required)assert.match(text,new RegExp('^'+name+'=','m'),name);assert.match(text,/^TEXTME_READ_MCP_URL=$/m);assert.equal(text.includes('Bearer '),false);};
 check(sample);assert.throws(()=>check(sample.replace(/^TEXTME_OAUTH_CALLBACKS=.*$/m,'')),'missing callback documentation fails');
});

test('upstream preflight checks authentication and exact tool surface without reading provider data',async()=>{
 for(const broadTools of [false,true]){const f=await fixture({broadTools});try{if(broadTools)await assert.rejects(()=>verifyUpstream(f.config),/SURFACE_NOT_READ_ONLY/);else assert.equal((await verifyUpstream(f.config)).providerDataReads,0);assert.deepEqual(f.calls.map(c=>c.method),['initialize','notifications/initialized','tools/list']);}finally{await f.close();}}
});

test('two concurrent exchanges cannot mint two tokens from one authorization code',async()=>{
 const f=await fixture();try{const a=await authorization(f),replies=await Promise.all([exchange(f,a),exchange(f,a)]);assert.equal(replies.filter(r=>r.status===200).length,1);assert.equal(replies.filter(r=>r.status>=400).length,1);assert.equal(f.calls.length,0);}finally{await f.close();}
});
