import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {createBridge,verifyUpstream} from './bridge.mjs';

// Run only after the reviewed private deployment/configuration is approved.
// Secrets are read from owner-populated files, never CLI arguments or logs.
try{
  process.umask(0o077);
  const required=['TEXTME_AUTH_PUBLIC_BASE','TEXTME_READ_MCP_URL','TEXTME_CALLER_KEY_FILE','TEXTME_ACCOUNT_USERNAME','TEXTME_OAUTH_CLIENT_ID','TEXTME_OAUTH_CALLBACKS'];
  const missing=required.filter(name=>!process.env[name]);if(missing.length)throw Error('MISSING_FIELDS:'+missing.join(','));
  const secretFile=process.env.TEXTME_CALLER_KEY_FILE;
  if(!secretFile||!existsSync(secretFile))throw Error('OWNER_SECRET_FILE_REQUIRED');
  if(process.platform!=='win32'&&(statSync(secretFile).mode&0o077))throw Error('SECRET_FILE_MUST_BE_PRIVATE');
  const dir=resolve(process.env.TEXTME_AUTH_STATE_DIR||'.data');mkdirSync(dir,{recursive:true,mode:0o700});
  const upstreamToken=readFileSync(secretFile,'utf8').trim();
  const keyFile=join(dir,'storage.key'),jwkFile=join(dir,'signing.jwks');
  if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});
  if(!existsSync(jwkFile)){const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});writeFileSync(jwkFile,JSON.stringify({keys:[{...privateKey.export({format:'jwk'}),kid:randomBytes(12).toString('hex'),alg:'RS256',use:'sig'}]}),{flag:'wx',mode:0o600});}
  if(process.platform!=='win32'){chmodSync(keyFile,0o600);chmodSync(jwkFile,0o600);}
  const config={publicBase:process.env.TEXTME_AUTH_PUBLIC_BASE,upstreamUrl:process.env.TEXTME_READ_MCP_URL,upstreamToken,username:process.env.TEXTME_ACCOUNT_USERNAME,clientId:process.env.TEXTME_OAUTH_CLIENT_ID,redirectUris:JSON.parse(process.env.TEXTME_OAUTH_CALLBACKS||'[]'),storageKey:readFileSync(keyFile),jwks:JSON.parse(readFileSync(jwkFile,'utf8')),database:join(dir,'oauth.sqlite')};
  if(process.argv.includes('--verify-upstream')){console.log(JSON.stringify(await verifyUpstream(config)));}
  else{
  const bridge=createBridge(config);
  const bind=process.env.TEXTME_AUTH_BIND||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(bind))throw Error('INVALID_BIND');
  const port=Number(process.env.TEXTME_AUTH_PORT||8790);if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');
  const server=createServer(bridge.app);server.listen(port,bind,()=>console.log('TextMe read-only OAuth bridge ready; no provider reads performed'));
  const cleanup=setInterval(()=>bridge.store.cleanup(),60000);cleanup.unref();
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{clearInterval(cleanup);bridge.close();process.exit(0);}));
  }
}catch(error){
  const safe=['OWNER_SECRET_FILE_REQUIRED','SECRET_FILE_MUST_BE_PRIVATE','DEDICATED_PUBLIC_BASE_REQUIRED','FIXED_UPSTREAM_REQUIRED','VERIFIED_CALLBACK_REQUIRED','SECURE_CONFIGURATION_REQUIRED','INVALID_BIND','INVALID_PORT','UPSTREAM_SURFACE_NOT_READ_ONLY','UPSTREAM_PROTOCOL_MISSING'];
  const reason=error.message?.startsWith('MISSING_FIELDS:')?error.message:safe.includes(error.message)?error.message:['EACCES','ENOENT','EROFS'].includes(error.code)?error.code:'CONFIGURATION_OR_STATE_ERROR';
  console.error('TextMe OAuth startup blocked: '+reason+'; values withheld');process.exitCode=1;
}
