// The callback SLA reminder takes its Monday ids from the campaign config, not from code.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {reminderQuery}=require('../../src/webhooks/intake/source');
test('reminder Monday ids come from the campaign config and match the deployed reminder query',()=>{
 assert.equal(reminderQuery('refi'),'query { boards(ids: 5106246268) { groups(ids: ["topics"]) { items_page(limit: 500) { cursor items { id name created_at column_values(ids: ["refi_stage", "refi_first_reply", "refi_source", "refi_phone", "date_mm88hmw2", "long_text_mm88xzfe"]) { id text value } } } } } }');
 for(const f of ['pick-overdue.js','patch-reminder-export.js'])assert.doesNotMatch(fs.readFileSync(__dirname+'/../../src/webhooks/intake/'+f,'utf8'),/5106246268|refi_[a-z]|_mm88[a-z0-9]{4}\b/,f);
});
