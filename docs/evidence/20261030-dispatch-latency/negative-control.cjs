const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const dir=__dirname,source=fs.readFileSync(path.join(dir,'measure.cjs'),'utf8');
const needle="return upperMs<2000?'PASS':lowerMs>=2000?'FAIL':'BLOCKED';";
assert.ok(source.includes(needle));
fs.writeFileSync(path.join(dir,'measure-broken.cjs'),source.replace(needle,"return 'PASS';"),{flag:'wx'});
fs.writeFileSync(path.join(dir,'math-broken.test.cjs'),fs.readFileSync(path.join(dir,'math.test.cjs'),'utf8').replace("require('./measure.cjs')","require('./measure-broken.cjs')"),{flag:'wx'});
const run=cp.spawnSync(process.execPath,['--test',path.join(dir,'math-broken.test.cjs')],{encoding:'utf8'});
fs.writeFileSync(path.join(dir,'negative-control.log'),run.stdout+run.stderr,{flag:'wx'});
assert.equal(run.status,1,'A broken always-PASS classifier must fail the tests');
const proof={status:'PASS',control:'Intentionally return PASS for slow or uncertain ingress',expectedBrokenSuiteExitCode:1,actualBrokenSuiteExitCode:run.status,originalTestsUnchanged:true,scope:'Local calculation negative control, no production requests'};
fs.writeFileSync(path.join(dir,'negative-control.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));

