// Exercise the actual HTTP node's cursor pagination on the real board, read only.
const fs=require('fs'),path=require('path');
const dir=path.resolve(__dirname,'../../automation/funnel/dist');
const go=JSON.parse(fs.readFileSync(path.join(dir,'go.json'),'utf8'));
const fetch=go.nodes.find(n=>n.name==='Fetch pages');
fetch.parameters.jsonBody=fetch.parameters.jsonBody.replace(/limit:500/g,'limit:1');
fetch.parameters.options.pagination.pagination.parameters.parameters[0].value=fetch.parameters.options.pagination.pagination.parameters.parameters[0].value.replace(/limit:500/g,'limit:1');
const items=go.nodes.find(n=>n.name==='Items');
const nodes=[{id:'pagination-manual',name:'Manual read only',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},{...fetch,position:[240,0]},{...items,position:[480,0]},
{id:'pagination-result',name:'Count only NO WRITES',type:'n8n-nodes-base.code',typeVersion:2,position:[720,0],parameters:{jsCode:"const pages=$('Fetch pages').all().length;const rows=$input.first().json.data.boards[0].items_page;if(pages<2||rows.cursor!==null)throw new Error('Pagination was not exercised fully');return [{json:{passed:true,pages,itemCount:rows.items.length,scope:'real Monday read-only cursor pagination with limit 1; no writes or messages'}}];"}}];
const connections={};for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
fs.writeFileSync(path.join(dir,'pagination-probe.json'),JSON.stringify({name:'TEST LP1 Monday pagination READ ONLY 20261020',active:false,settings:{executionOrder:'v1'},nodes,connections},null,2));
console.log('Built read-only pagination probe');
