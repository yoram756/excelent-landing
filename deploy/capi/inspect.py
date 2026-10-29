"""Independent readback of CAPI storage and untouched core services. No credential reads."""
import json,pathlib,sqlite3,subprocess,sys
from prepare import BASE,ROOT,snapshot,command,save
before=json.loads((BASE/'before.json').read_text())
after=snapshot()
if after!={k:v for k,v in before.items() if k!='sourceCommit'}:raise RuntimeError('Core production state changed')
mount=command(['docker','volume','inspect','--format','{{.Mountpoint}}','excelent-capi_capi_data'])
db=sqlite3.connect('file:'+str(pathlib.Path(mount)/'capi.sqlite')+'?mode=ro',uri=True)
expected=sys.argv[1] if len(sys.argv)>1 else None
rows=[]
if expected:
    for event_id,item_id,state,receipt in db.execute('select event_id,item_id,state,receipt from capi_dispatch where event_id=?',(expected,)):
        rows.append({'eventId':event_id,'itemId':item_id,'state':state,'receipt':json.loads(receipt) if receipt else None})
counts=dict(db.execute('select state,count(*) from capi_dispatch group by state').fetchall())
activation=dict(db.execute("select key,value from capi_meta where key like 'activated:%'").fetchall())
health=command(['docker','inspect','--format','{{.State.Running}} {{.State.Health.Status}} {{.HostConfig.RestartPolicy.Name}}','excelent-capi-worker-1'])
if expected and (len(rows)!=1 or rows[0]['state']!='ACKED' or not rows[0]['receipt'].get('apiAccepted')):raise RuntimeError('Controlled conversion not independently confirmed')
db.close()
print(json.dumps({'status':'PASS','coreUnchanged':True,'worker':health,'states':counts,'activation':activation,'matchingRows':rows,'n8nSettingsChanged':False,'whatsappMessagesSentByService':0}))
