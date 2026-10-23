// No secret or API key in the repository: known token shapes are absent and secret env vars are empty in .env.example.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const SKIP=new Set(['node_modules','.git','out']);
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>SKIP.has(e.name)?[]:e.isDirectory()?files(path.join(d,e.name)):/\.(png|webp|jpe?g|svg|ico|woff2?)$/.test(e.name)?[]:[path.join(d,e.name)]);
const PATTERNS=[[/EAA[A-Za-z0-9]{30,}/,'Meta access token'],[/access_token=[A-Za-z0-9._-]{10,}/,'token in a URL'],[/AKIA[0-9A-Z]{16}/,'AWS key'],
  [/AIza[0-9A-Za-z_-]{35}/,'Google API key'],[/-----BEGIN [A-Z ]*PRIVATE KEY-----/,'private key'],[/xox[baprs]-[A-Za-z0-9-]{10,}/,'Slack token'],
  [/Bearer [A-Za-z0-9._-]{32,}/,'literal bearer token'],[/sk-[A-Za-z0-9]{32,}/,'API secret key']];

test('no known secret shape appears in any tracked text file',()=>{
  const hits=[];for(const f of files(root)){const s=fs.readFileSync(f,'utf8');for(const [re,what] of PATTERNS)if(re.test(s))hits.push(path.relative(root,f)+': '+what);}
  assert.deepEqual(hits,[]);});

test('secret variables in .env.example have no value and .env is ignored',()=>{
  const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
  for(const k of ['LOCK_SERVER_TOKEN','META_APP_SECRET','META_VERIFY_TOKEN','META_ACCESS_TOKEN'])assert.match(env,new RegExp('^'+k+'=\s*$','m'),k);
  assert.match(fs.readFileSync(path.join(root,'.gitignore'),'utf8'),/^\.env$/m);});

test('the lock service and the Meta adapter read secrets only from env or their caller',()=>{
  const lock=fs.readFileSync(path.join(root,'src/services/lifecycle/lock-server.js'),'utf8');assert.match(lock,/process\.env/);
  const adapter=fs.readFileSync(path.join(root,'src/webhooks/intake/meta-adapter.js'),'utf8');
  assert.doesNotMatch(adapter,/(appSecret|accessToken|verifyToken)\s*=\s*['"][^'"]+['"]/);});
