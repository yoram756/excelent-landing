const assert=require('node:assert/strict');
function offsetBounds(samples,marginMs=50){
 if(!Array.isArray(samples)||samples.length<2)throw Error('Missing clock calibration');
 for(const r of samples){if(![r.sentEpochMs,r.receivedEpochMs,r.dateEpochMs,r.elapsedMs].every(Number.isFinite)||r.receivedEpochMs<r.sentEpochMs||Math.abs((r.receivedEpochMs-r.sentEpochMs)-r.elapsedMs)>=30)throw Error('Invalid or jumping client clock');}
 const low=Math.max(...samples.map(r=>r.dateEpochMs-r.receivedEpochMs))-marginMs;
 const high=Math.min(...samples.map(r=>r.dateEpochMs+1000-r.sentEpochMs))+marginMs;
 if(low>high)throw Error('Inconsistent server clock');
 return {low,high,marginMs};
}
function classify(lowerMs,upperMs){if(!Number.isFinite(lowerMs)||!Number.isFinite(upperMs)||lowerMs>upperMs||upperMs<0)return 'BLOCKED';return upperMs<2000?'PASS':lowerMs>=2000?'FAIL':'BLOCKED';}
function measure(client,server){
 assert.equal(client.eventId,server.eventId,'Event mismatch');assert.equal(server.status,'success');
 assert.ok(Number.isFinite(server.webhookStartMs));assert.ok(Math.abs(client.wallClockJumpMs)<30);
 const offset=offsetBounds([...client.before,...client.after]);
 const raw=server.webhookStartMs-client.startEpochMs,lowerMs=raw-offset.high,upperMs=raw-offset.low;
 return {eventId:client.eventId,campaign:client.campaign,executionId:server.executionId,requestId:client.response.request_id,status:classify(lowerMs,upperMs),lowerMs:Math.max(0,lowerMs),upperMs,clockOffsetBoundsMs:offset,fullResponseMs:client.fullResponseMs,n8nWebhookStartMs:server.webhookStartMs,clientStartMs:client.startEpochMs};
}
module.exports={offsetBounds,classify,measure};
if(require.main===module){const fs=require('node:fs'),path=require('node:path');const dir=process.argv[2];const c=JSON.parse(fs.readFileSync(path.join(dir,'client-result.json'))),s=JSON.parse(fs.readFileSync(path.join(dir,'server-result.json')));const results=c.results.map(r=>measure(r,s.results.find(x=>x.eventId===r.eventId)));const result={status:results.every(x=>x.status==='PASS')?'PASS':results.some(x=>x.status==='FAIL')?'FAIL':'BLOCKED',thresholdMs:2000,strictLessThan:true,method:'Client POST start to first n8n Lead webhook node start; conservative interval includes HTTP Date one-second quantization, observed network RTT and extra 50ms clock margin. Actual ingress occurs no later than this node start. This is not full response time or a browser click-to-submit measurement.',results};fs.writeFileSync(path.join(dir,'measurement.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;}

