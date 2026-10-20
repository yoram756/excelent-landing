// Loads the n8n Code node sources with a fake $() so the funnel logic can be tested outside n8n.
const fs=require('fs');const path=require('path');
const SRC=path.resolve(__dirname,'../../automation/funnel');
const cfg=(id='refi')=>fs.readFileSync(path.resolve(__dirname,'../../campaigns/'+id+'.json'),'utf8');
function planner(mode='test',goLive='2026-10-20T07:00:00Z',pilot='',campaign='refi'){
  const code=fs.readFileSync(SRC+'/plan.js','utf8').replace('__CONFIG__',cfg(campaign)).replace('__BUSINESS__',fs.readFileSync(path.resolve(__dirname,'../../config/business.json'),'utf8')).replace('__MODE__',mode).replace('__GO_LIVE__',goLive).replace('__PILOT__',pilot);
  return ({items,convos=[],now,shabbat=[],convosDown=false})=>{
    const $=n=>({first:()=>({json:n==='Shabbat'?{items:shabbat}:n==='Convos'?(convosDown?{error:'down'}:{data:{items:convos}}):n==='Run test'?{body:{now}}:{data:{me:{id:1},boards:[{items_page:{items}}]}}})});
    return new Function('$',code)($).map(x=>x.json);
  };
}
function afterSend(planOut,response){
  const code=fs.readFileSync(SRC+'/after-send.js','utf8');
  const $=()=>({item:{json:planOut}});
  return new Function('$','$json',code)($,response).json;
}
const item=(o)=>({id:o.id||'1',name:o.name||'TEST דני כהן',created_at:o.created||'2026-10-20T08:00:00Z',
  column_values:Object.entries(o.cols||{}).map(([id,v])=>({id,text:typeof v==='string'?v:'',value:typeof v==='string'?null:JSON.stringify(v)}))});
module.exports={planner,afterSend,item};
function goLink(query,items,me=1){const code=require('fs').readFileSync(SRC+'/go.js','utf8').replace('__CONFIG__',cfg());
  const $=n=>({first:()=>({json:n==='Link'?{query}:{data:{me:{id:me},boards:[{items_page:{items}}]}}})});return new Function('$',code)($)[0].json;}
function calendly({body,mails=[],items,store={}}){const code=require('fs').readFileSync(SRC+'/calendly.js','utf8').replace('__CONFIG__',cfg());
  const $=n=>({first:()=>({json:n==='Run test'?{body}:{data:{boards:[{items_page:{items}}]}}}),all:()=>mails.map(j=>({json:j}))});
  return new Function('$','$getWorkflowStaticData',code)($,()=>store).map(x=>x.json);}
module.exports.goLink=goLink;module.exports.calendly=calendly;
function reconcile(planOut,gambot){const code=require('fs').readFileSync(SRC+'/reconcile.js','utf8');return new Function('$','$json',code)(()=>({item:{json:planOut}}),gambot).json;}
module.exports.reconcile=reconcile;
