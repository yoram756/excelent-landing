// Source of the n8n "Save to Monday" request body expression. IDs and people belong to campaign config.
const {intakeConfig}=require('./source');
const createPayloadExpression=(campaign='refi')=>{
 const K=intakeConfig(campaign),mapping={eventId:K.columns.eventId||null,assignee:K.columns.assignee||null,people:K.assignees,attribution:K.attribution};
 if(mapping.assignee&&(!mapping.people.length||mapping.people.some(p=>!Number.isSafeInteger(p.id)||p.id<=0||!['person','team'].includes(p.kind))))throw Error('Invalid intake assignee configuration');
 const body=`JSON.stringify((() => {
 const input = $json;
 const variables = { ...input.variables };
 const mapping = ${JSON.stringify(mapping)};
 const columns = JSON.parse(variables.vals);
 const original=$('Lead webhook').first().json.body||{};
 const source=original.utm_source, campaign=original.utm_campaign;
 const invalid=value=>value!==undefined&&(typeof value!=='string'||value.length>100||/[\\u0000-\\u001f\\u007f<>{}]/.test(value));
 if(invalid(source)||invalid(campaign))throw Error('Invalid intake attribution');
 if(campaign?.startsWith('campaign_')&&!Object.hasOwn(mapping.attribution?.campaigns||{},campaign))throw Error('Unknown intake attribution campaign');
 if(mapping.attribution?.columns?.source&&source?.trim())columns[mapping.attribution.columns.source]=source.trim();
 if(mapping.attribution?.columns?.campaign&&campaign?.trim())columns[mapping.attribution.columns.campaign]=campaign.trim();
 let eventId = input.eventId || input.event_id;
 // The deployed Validate/Build mutation nodes may omit opaque event metadata. Read the original input only as a fallback.
 if (!eventId && mapping.eventId) {
   try { const body = $('Lead webhook').first().json.body || {}; eventId = body.eventId || body.event_id; } catch (e) {}
 }
 if (input.mode === 'create' && mapping.eventId && eventId) {
   if (!['string','number'].includes(typeof eventId)) throw Error('Invalid intake event id');
   columns[mapping.eventId] = String(eventId);
 }
 if (input.mode === 'create' && mapping.assignee) columns[mapping.assignee] = { personsAndTeams:mapping.people };
 variables.vals = JSON.stringify(columns);
 return { query:input.query, variables };
})())`;
 // n8n expression parsing cannot handle a run of closing braces inside the body.
 return '={{ '+body.replace(/\}(?=\})/g,'} ')+' }}';
};
module.exports={createPayloadExpression};
