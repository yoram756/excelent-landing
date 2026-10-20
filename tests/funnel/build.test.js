const test=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('child_process');const path=require('path');
const D=path.resolve(__dirname,'../../automation/funnel');
execFileSync('node',[D+'/build-workflows.js','test']);
const wfs=['engine-test','go','calendly'].map(f=>require(D+'/dist/'+f+'.json'));
test('every connection points at an existing node',()=>{for(const w of wfs){const n=new Set(w.nodes.map(x=>x.name));for(const [a,c] of Object.entries(w.connections)){assert.ok(n.has(a),a);for(const br of c.main)for(const x of br)assert.ok(n.has(x.node),x.node);}}});
test('no expression contains a run of closing braces (n8n breaks on it)',()=>{for(const w of wfs)for(const x of w.nodes){const b=x.parameters.jsonBody;if(typeof b==='string'&&b.startsWith('={{'))assert.ok(!/\}\}/.test(b.slice(3,-2)),w.name+' / '+x.name);}});
test('test build never contains a live engine',()=>{const p=wfs[0].nodes.find(x=>x.name==='Plan').parameters.jsCode;assert.ok(p.includes("MODE = 'test'"));});
test('no secret test path is baked into the build',()=>{for(const w of wfs)for(const x of w.nodes)if(x.type==='n8n-nodes-base.webhook'&&x.name==='Run test')assert.ok(x.parameters.path.startsWith('__TEST_PATH__'));});
