// Child process for the concurrent dedup test: waits for a shared start time, then tries to admit one lead.
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const [dbPath,phone,startAt,tag]=process.argv.slice(2);
const db=new LifecycleDb(dbPath);
while(Date.now()<Number(startAt));
const r=db.admitLead({source:'test',raw:JSON.stringify({tag,phone}),phone,now:Date.now()});
db.close();
process.stdout.write(JSON.stringify({tag,admitted:r.admitted}));
