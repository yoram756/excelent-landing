'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../../src/services/business-ops/build-workflow');
test('n8n draft cannot advance a cursor without a durable receipt and cannot accept source authority',()=>{
 const w=build();assert.equal(w.active,false);assert.equal(w.nodes.filter(n=>n.type.includes('httpRequest')).length,1);assert.ok(w.nodes.find(n=>n.type.includes('httpRequest')).disabled);
 assert.ok(!w.nodes.some(n=>/gmail|whatsapp|monday|scheduleTrigger/.test(n.type)));assert.ok(!JSON.stringify(w).includes('Bearer '));
 const names=new Set(w.nodes.map(n=>n.name));for(const [source,c]of Object.entries(w.connections)){assert.ok(names.has(source));for(const b of c.main)for(const e of b)assert.ok(names.has(e.node));}
 const guard=w.nodes.find(n=>n.name==='Business event boundary').parameters.jsCode;const run=e=>new Function('$input',guard)({all:()=>[{json:e}]});
 const valid={scope:'business',source:'gmail',id:'TEST-1',text:'test',url:'https://example.invalid/source'};assert.equal(run(valid).length,1);assert.throws(()=>run({...valid,verified:true}),/authority/);assert.throws(()=>run({...valid,scope:'private'}),/business/);
 const receipt=w.nodes.find(n=>n.name==='Require ingestion receipt').parameters.jsCode;assert.throws(()=>new Function('$input',receipt)({all:()=>[{json:valid}]}),/receipt/);
});
