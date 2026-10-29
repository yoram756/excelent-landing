const {hash}=require('./store'),{postEvent}=require('./client');
function configuration(campaign){
  const c=campaign.conversions;
  if(!c||!/^\d{8,20}$/.test(c.datasetId)||c.eventName!=='Lead'||c.actionSource!=='system_generated'||!/^v\d{1,3}\.\d+$/.test(c.graphVersion)||!c.sourceLabels?.length||c.sourceLabels.some(x=>typeof x!=='string'||!x))throw Error('Explicit conversion configuration required');
  const boardId=String(campaign.board),eventColumn=campaign.intake?.columns?.eventId,sourceColumn=campaign.columns?.source;
  if(!/^\d+$/.test(boardId)||!eventColumn||!sourceColumn)throw Error('Missing configured CRM mapping');
  const cfg={...c,boardId,eventColumn,sourceColumn,optOutColumn:campaign.columns.status,optOutLabel:campaign.channels?.optOut?.label};return {...cfg,binding:JSON.stringify([boardId,eventColumn,sourceColumn,c.datasetId,c.eventName,c.sourceLabels,cfg.optOutColumn,cfg.optOutLabel])};
}
function candidate(item,cfg,mode,cutoff,now){
  if(item?.state!=='active'||String(item.board?.id)!==cfg.boardId||!/^\d+$/.test(String(item.id)))return {skip:'wrong_item'};
  const created=Date.parse(item.created_at);if(!Number.isFinite(created)||created>now+300000)return {invalid:'invalid_creation_time'};
  if(created<cutoff)return {skip:'before_activation'};
  const source=item.column_values?.filter(c=>c.id===cfg.sourceColumn)||[];
  if(source.length!==1||!cfg.sourceLabels.includes(source[0].text))return {skip:'other_source'};
  if(cfg.optOutColumn&&cfg.optOutLabel&&item.column_values.some(c=>c.id===cfg.optOutColumn&&c.text===cfg.optOutLabel))return {skip:'opted_out'};
  const test=/^TEST(?:\s|_|-)/.test(item.name||'');if((mode==='test')!==test)return {skip:'mode_scope'};
  const values=item.column_values?.filter(c=>c.id===cfg.eventColumn)||[];
  let eventId;try{eventId=values.length===1?JSON.parse(values[0].value):null;}catch{}
  if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(eventId)||values[0].text!==eventId||(mode==='test'&&!eventId.startsWith('TEST-')))return {invalid:'missing_or_conflicting_event_id'};
  const user_data={external_id:[hash(JSON.stringify([cfg.datasetId,cfg.boardId,String(item.id)]))]};
  if(test)user_data.em=[hash('meta-auto-'+hash(eventId).slice(0,16)+'@example.invalid')];
  return {eventId,created,event:{event_name:cfg.eventName,event_time:Math.floor(created/1000),event_id:eventId,action_source:cfg.actionSource,opt_out:mode==='test',user_data}};
}
class CapiWorker{
  constructor({store,cfg,mode,monday,accessToken,testCode,transport,now=Date.now}){
    if(!['test','live'].includes(mode)||!accessToken||/[\s\x00-\x1f]/.test(accessToken)||(mode==='test'&&!/^TEST[A-Z0-9]{1,80}$/.test(testCode||'')))throw Error('Explicit mode and provider credential required');
    Object.assign(this,{store,cfg,mode,monday,accessToken,testCode,transport,now});this.cutoff=store.activate(mode,Math.floor(now()/1000)*1000);this.busy=false;
  }
  async tick(){
    if(this.busy)return {status:'BUSY'};this.busy=true;
    const counts={acknowledged:0,duplicates:0,skipped:0,blocked:0};
    try{
      const items=await this.monday.list();if(!Array.isArray(items))throw Error('Incomplete source');
      let newAttempts=0;
      for(const item of items){
        const snapshot=candidate(item,this.cfg,this.mode,this.cutoff,this.now());
        if(snapshot.skip){counts.skipped++;continue;}
        if(snapshot.invalid){this.store.issue(item.id,snapshot.invalid,this.now());counts.blocked++;continue;}
        const record={datasetId:this.cfg.datasetId,eventName:this.cfg.eventName,eventId:snapshot.eventId,boardId:this.cfg.boardId,itemId:item.id};
        const prior=this.store.inspect(record);
        if(prior){if(prior.state==='ACKED')counts.duplicates++;else{counts.blocked++;if(prior.state==='CONFLICT')this.store.issue(item.id,'event_item_conflict',this.now());}continue;}
        if(snapshot.created<this.now()-7*86400000){this.store.issue(item.id,'stale_conversion',this.now());counts.blocked++;continue;}
        if(newAttempts>=10){counts.skipped++;continue;}
        // A fresh authoritative read must match the scan. No write to Monday is made.
        const current=await this.monday.read(item.id),ready=candidate(current,this.cfg,this.mode,this.cutoff,this.now());
        if(ready.skip||ready.invalid||ready.eventId!==snapshot.eventId||ready.created!==snapshot.created||String(current.id)!==String(item.id)){this.store.issue(item.id,'changed_before_send',this.now());counts.blocked++;continue;}
        const claim=this.store.reserve({datasetId:this.cfg.datasetId,eventName:this.cfg.eventName,eventId:ready.eventId,boardId:this.cfg.boardId,itemId:item.id},this.now());
        if(!claim.claimed){if(claim.state==='ACKED')counts.duplicates++;else{counts.blocked++;if(claim.state==='CONFLICT')this.store.issue(item.id,'event_item_conflict',this.now());}continue;}
        newAttempts++;
        const receipt=await postEvent({datasetId:this.cfg.datasetId,graphVersion:this.cfg.graphVersion,event:ready.event,testCode:this.mode==='test'?this.testCode:undefined,accessToken:this.accessToken,transport:this.transport});
        const state=this.store.finish(claim,receipt);if(state==='ACKED')counts.acknowledged++;else counts.blocked++;
      }
      this.store.scan(this.now());return {status:counts.blocked?'ATTENTION':'PASS',...counts};
    }catch{this.store.scan(this.now(),'source_or_storage_failure');return {status:'BLOCKED',code:'source_or_storage_failure',...counts};}
    finally{this.busy=false;}
  }
}
module.exports={configuration,candidate,CapiWorker};
