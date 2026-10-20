// A separate OS process, sharing only the SQLite file with its competitors.
const {Store}=require('../../automation/lifecycle/store');
const [path,action,args]=process.argv.slice(2),store=new Store(path,{sandbox:true});
try{
 const input=JSON.parse(args),result=store[action](input);
 process.stdout.write(JSON.stringify(result));
 if(process.env.ATOMIC_CRASH==='1')process.exit(73); // intentionally bypass close
 store.close();
}catch(e){store.close();process.stderr.write(e.stack);process.exitCode=1;}
