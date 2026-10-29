const test=require('node:test'),assert=require('node:assert/strict');
const {patchCalendly}=require('../../scripts/patch-calendly-export.cjs');
const names=['Every 5 min','Calendly mails','Run test','Items','Match bookings','Matched?','Update lead','Create lead','Wait for board automation','Set meeting stage'];
const fixture=()=>({settings:{timezone:'Asia/Jerusalem',errorWorkflow:'unchanged'},nodes:names.map((name,i)=>({id:String(i),name,type:i===0?'n8n-nodes-base.scheduleTrigger':i===1?'n8n-nodes-base.gmail':'n8n-nodes-base.code',parameters:{jsCode:'old'},credentials:{existing:{id:'reference-only'}}})),connections:{'Run test':{main:[[{node:'Items',type:'main',index:0}]]}}});
const options={matchSource:'const CFG=__CONFIG__;',ackSource:'return $json;',campaign:{id:'generic'}};
test('Calendly export patch preserves settings, credentials and existing nodes',()=>{
  const w=fixture(),out=patchCalendly(w,options);assert.equal(out.nodes.length,11);
  assert.deepEqual(out.settings,w.settings);assert.deepEqual(out.connections['Run test'],w.connections['Run test']);
  assert.equal(out.connections['Every 5 min'].main[0][0].node,'Calendly mails');
  for(const name of ['Update lead','Set meeting stage'])assert.equal(out.connections[name].main[0][0].node,'Acknowledge booking');
  assert.equal(w.nodes.length,10);assert.equal(out.nodes.find(n=>n.name==='Match bookings').parameters.jsCode,'const CFG={"id":"generic"};');
});
test('Calendly patch rejects an ambiguous, repeated or foreign-provider export',()=>{
  for(const change of [w=>w.nodes.push({...w.nodes[0]}),w=>w.nodes.push({name:'Acknowledge booking'}),w=>w.nodes[1].type='unknown',w=>w.nodes.push({name:'Foreign',type:'n8n-nodes-base.httpRequest',parameters:{url:'https://foreign.example'}})]){
    const w=fixture();change(w);assert.throws(()=>patchCalendly(w,options));
  }
});
