const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {build}=require('./build-lock-intake-sandbox');
const file=__dirname+'/../../src/services/funnel/dist/intake.json';
test('private runtime test retains source logic and real Lock, isolates CRM and disables every notification',()=>{
 const base=JSON.parse(fs.readFileSync(file));const w=build(base,{runId:'TEST-lock-intake-20261025-001'});const n=x=>w.nodes.find(y=>y.name===x);
 assert.equal(w.active,false);assert.equal(n('Lead webhook').type,'n8n-nodes-base.manualTrigger');
 assert.equal(n('Lock').credentials.httpHeaderAuth.id,'CQL12HWyZ5joQkb6');
 for(const name of ['Validate','Build mutation','Check save','Instant reply input'])assert.equal(n(name).parameters.jsCode,base.nodes.find(n=>n.name===name).parameters.jsCode);
 for(const name of ['Email alert','Alert Yoram','WhatsApp alert'])assert.equal(n(name).disabled,true);
 const col={phone_mm8crjmj:{phone:'972500000097'},color_mm8c4hcq:{label:'ליד חדש'},boolean_mm8ct8db:{checked:'true'}};
 const k=require('../../src/webhooks/intake/source').intakeConfig();const vals={[k.columns.phone]:col.phone_mm8crjmj,[k.columns.stage]:col.color_mm8c4hcq,[k.columns.consentService]:col.boolean_mm8ct8db};
 const v={name:'TEST Lock integration',phone:'972500000097',key:'TEST-lock-intake-20261025-001',marketing_consent:false,money_included:false};
 const m={mode:'create',query:'mutation{create_item(board_id: '+k.board+'){id}}',variables:{name:'TEST Lock integration 0500000097',vals:JSON.stringify(vals)}};
 const run=(input,validated)=>new Function('$input','$',n('Project private CRM fields').parameters.jsCode)({first:()=>({json:input})},()=>({first:()=>({json:validated})}));
 const out=run(m,v)[0].json;assert.match(out.query,/board_id:5106494186/);assert.ok(!out.query.includes(k.board));assert.equal(JSON.parse(out.variables.vals).phone_mm8crjmj.phone,v.phone);
 assert.throws(()=>run(m,{...v,name:'Real person'}),/Synthetic write guard/);assert.throws(()=>run({...m,mode:'update'},v),/Synthetic write guard/);
 const fresh=n('Guard fresh synthetic phone').parameters.jsCode;assert.throws(()=>new Function('$input',fresh)({first:()=>({json:{data:{items_page_by_column_values:{items:[{id:'123'}],cursor:null}}}})}),/already exists/);
 const names=new Set(w.nodes.map(x=>x.name));for(const [from,c]of Object.entries(w.connections)){assert.ok(names.has(from));for(const rows of Object.values(c))for(const row of rows)for(const edge of row)assert.ok(names.has(edge.node));}
 for(const node of w.nodes)if(node.type==='n8n-nodes-base.code')new Function(node.parameters.jsCode);
});

