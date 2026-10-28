import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
const root='plugins/excellent-cosend-official';
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
export function validate(p,m,a){
 assert.equal(p.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');assert.equal(p.name,'excellent-cosend-official');assert.match(p.version,/^\d+\.\d+\.\d+$/);
 const i=p.extensions['com.openai'].interface;assert.ok(i.shortDescription.length<=30);assert.equal(i.category,'Communication');assert.ok(Array.isArray(i.capabilities));
 assert.equal(m.$schema,'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');assert.equal(Object.keys(m.mcpServers).length,1);
 const s=m.mcpServers['excellent-cosend-official'];assert.equal(s.url,'https://mcp.cosend.app/mcp');assert.equal(s.type,'streamable-http');
 const auth=s.extensions['com.openai'].auth;assert.equal(auth.type,'oauth');assert.equal(auth.client.mode,'cimd');
 const allowed=new Set(['messages:read','contacts:read','automations:read','templates:read']);
 for(const scopes of [auth.baseScopes,auth.defaultScopes]){assert.ok(Array.isArray(scopes));for(const scope of scopes)assert.ok(allowed.has(scope),'unapproved_scope');assert.ok(scopes.includes('messages:read'));}
 assert.equal(a.workspaceId,'org_01M5WPXWKXTYNDCHAJ6YTMWZ5Z');assert.equal(a.connectionId,'conn_01M5YC386Q2N9973TJG1M8H4DQ');assert.equal(a.phone,'+972559881245');assert.equal(a.phoneNumberId,'1138723472651617');
 assert.equal(a.stage,'READ_ONLY_PREPARATION');assert.equal(a.automaticSendingApproved,false);assert.equal(a.exclusiveResponderApproved,false);assert.deepEqual(a.writeScopesApproved,[]);assert.equal(a.responseRulesApproval,null);
}
const p=read('plugin.json'),m=read('mcp.json'),a=read('skills/excellent-official-conversations/references/activation.json');validate(p,m,a);
const mutations=[
 (p,m,a)=>m.mcpServers['excellent-cosend-official'].extensions['com.openai'].auth.defaultScopes.push('messages:write'),
 (p,m,a)=>m.mcpServers['excellent-cosend-official'].extensions['com.openai'].auth.baseScopes.push('automations:write'),
 (p,m,a)=>m.mcpServers['excellent-cosend-official'].url='https://other.example/mcp',
 (p,m,a)=>a.phoneNumberId='1350440204809114',
 (p,m,a)=>a.connectionId='other',
 (p,m,a)=>a.automaticSendingApproved=true,
 (p,m,a)=>a.exclusiveResponderApproved=true,
 (p,m,a)=>a.writeScopesApproved=['messages:write']
];
for(const f of mutations){const x=structuredClone(p),y=structuredClone(m),z=structuredClone(a);f(x,y,z);assert.throws(()=>validate(x,y,z));}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=join(dir,e.name);assert.ok(!lstatSync(p).isSymbolicLink());return e.isDirectory()?walk(p):[p];});}
for(const f of walk(root)){const s=readFileSync(f,'utf8');assert.ok(!/csk_live_[A-Za-z0-9]{12,}|sk-proj-[A-Za-z0-9]+|ghp_[A-Za-z0-9]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s));if(f.endsWith('SKILL.md'))assert.match(s,/^---\r?\nname: excellent-official-conversations\r?\ndescription: .+\r?\n---/);}
console.log(JSON.stringify({status:'PASS',validPackage:true,negativeControls:mutations.length,secretScan:'PASS',writeScopesRequested:0,liveCalls:0}));
