const {DatabaseSync}=require('node:sqlite');
try{
  const db=new DatabaseSync(process.env.CAPI_DB_PATH,{readOnly:true});
  const scan=JSON.parse(db.prepare("SELECT value FROM capi_meta WHERE key='scan'").get()?.value||'null');
  const unsettled=db.prepare("SELECT count(*) n FROM capi_dispatch WHERE state IN ('UNKNOWN','FAILED') OR (state='SENDING' AND at<?)").get(Date.now()-60000).n;
  const issues=db.prepare('SELECT count(*) n FROM capi_issues').get().n;
  const maxAge=process.env.CAPI_MODE==='test'?60000:660000;
  const ok=!!scan&&!scan.error&&Date.now()-scan.at<maxAge&&!unsettled&&!issues;
  console.log(JSON.stringify({ok,unsettled,issues}));db.close();if(!ok)process.exitCode=1;
}catch{console.log(JSON.stringify({ok:false,code:'capi_health_unavailable'}));process.exitCode=1;}
