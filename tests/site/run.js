// Starts the mock server (static site + fake /api), runs the browser tests, exits with their code.
const {fork}=require('child_process');const path=require('path');
const srv=fork(path.join(__dirname,'server.js'),{silent:true});
const kill=()=>{try{srv.kill();}catch(e){}};
const timer=setTimeout(()=>{console.error('mock server did not start');kill();process.exit(1);},10000);
srv.on('message',m=>{if(m!=='ready')return;clearTimeout(timer);
  const t=fork(path.join(__dirname,'paths.test.js'),{cwd:__dirname});
  t.on('exit',code=>{kill();process.exit(code===0?0:1);});});
