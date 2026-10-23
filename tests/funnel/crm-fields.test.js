// Contract: campaign column ids exist on the real board, and Lead_Temperature agrees with the intake heat bands.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {leadTemperature,crmFields}=require('../../src/services/funnel/crm-fields');
const board=require('./board-columns.json');
const campaign=id=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../campaigns',id+'.json'),'utf8'));
const IDS=['refi','consolidation'];
const band=new Function(fs.readFileSync(path.resolve(__dirname,'../../src/webhooks/intake/validate.js'),'utf8').split(/\r?\n/).find(l=>/^const band\s*=/.test(l))+';return band;')();

test('every Monday column a campaign uses exists on the board with the right type',()=>{
  for(const id of IDS){const c=campaign(id);assert.equal(c.board,board.boardId,id);
    for(const [k,col] of Object.entries(c.columns))assert.ok(board.columns[col],id+' columns.'+k+' = '+col+' is not on the board');
    assert.equal(board.columns[c.columns.heat],'numbers',id+' heat');
    for(const [k,f] of Object.entries(c.crmFields))if(f.column)assert.ok(board.columns[f.column],id+' crmFields.'+k+' = '+f.column+' is not on the board');
    assert.equal(board.columns[c.crmFields.churnReason.column],'text',id+' churnReason');}
});

test('Lead_Temperature follows the intake heat bands and the handoff threshold',()=>{
  const tier={'רותח':'HOT','חם מאוד':'HOT','חם':'WARM','מתעניין':'COLD'};
  for(const id of IDS){const c=campaign(id);
    assert.equal(c.crmFields.leadTemperature.bands[0].atLeast,c.handoff.heatAtLeast,id+' HOT must start at the handoff threshold');
    for(let n=0;n<=120;n++)assert.equal(leadTemperature(n,c),tier[band(n)],id+' heat '+n);}
});

test('missing or broken heat gives no temperature',()=>{
  const c=campaign('refi');for(const h of ['',null,undefined,'abc',-5])assert.equal(leadTemperature(h,c),null,String(h));
  assert.equal(leadTemperature('75',c),'HOT');
});

test('fields without a configured column are computed but never written',()=>{
  for(const id of IDS){const c=campaign(id);const r=crmFields({heat:72,churnReason:'  בחר בנק אחר '},c);
    assert.deepEqual(r.values,{Lead_Temperature:'HOT',Niche_Segment:id,Churn_Reason:'בחר בנק אחר'});
    assert.deepEqual(r.columns,{refi_close_reason:'בחר בנק אחר'});
    assert.deepEqual(crmFields({heat:''},c).columns,{});}
});
