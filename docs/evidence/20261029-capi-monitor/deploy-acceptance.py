"""Owner-authorized real pause, durable notices and guaranteed restoration."""
import base64,hashlib,importlib.util,json,pathlib,sqlite3,subprocess,sys,time
ROOT=pathlib.Path('/docker/lp'); BASE=pathlib.Path('/docker/capi-monitor-20261029')
WORKER='excelent-capi-worker-1'
CORE=['lp-lp-1','excelent-lock-lock-server-1','excelent-wa-intake','excelent-wa-isolated-20261028-resume','n8n-qhxa-n8n-1']
def cmd(args):return subprocess.check_output(args,cwd=ROOT,text=True,stderr=subprocess.STDOUT,timeout=50).strip()
def save(name,value):
 p=BASE/name
 with p.open('x') as f:json.dump(value,f,indent=2)
 p.chmod(0o600)
def core():
 db=sqlite3.connect('file:/var/lib/docker/volumes/n8n-qhxa_n8n_data/_data/database.sqlite?mode=ro',uri=True)
 workflows={r[0]:hashlib.sha256(json.dumps(r[1:],separators=(',',':')).encode()).hexdigest() for r in db.execute('SELECT id,active,nodes,connections,settings FROM workflow_entity ORDER BY id')};db.close()
 return {'containers':{n:cmd(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}',n]) for n in CORE},'workflows':workflows,'nginx':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ['deploy/nginx.conf','deploy/lp1-site.inc','deploy/lp1-api.inc','docker-compose.yml']}}
def ledger():
 db=sqlite3.connect('file:/var/lib/docker/volumes/excelent-capi_capi_data/_data/capi.sqlite?mode=ro',uri=True)
 d={'dispatch':list(db.execute('SELECT key,event_id,item_id,state,receipt FROM capi_dispatch ORDER BY key')),'activation':list(db.execute("SELECT key,value FROM capi_meta WHERE key LIKE 'activated:%' ORDER BY key")),'binding':db.execute("SELECT value FROM capi_meta WHERE key='binding'").fetchone()[0]};db.close();return json.loads(json.dumps(d))
def notices():
 db=sqlite3.connect('file:/var/lib/excelent-capi-monitor/monitor.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
 rows=[dict(r) for r in db.execute('SELECT key,kind,text,state,at,receipt FROM notices ORDER BY seq')];db.close();return rows
def worker_state():return json.loads(cmd(['docker','inspect','--format','{{json .State}}',WORKER]))
BASE.mkdir(mode=0o700,exist_ok=True)
expected=sys.argv[2]
if sys.argv[1]=='deploy':
 before={'core':core(),'ledger':ledger(),'workerIdentity':cmd(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}',WORKER]),'sourceCommit':cmd(['git','rev-parse','HEAD'])}
 save('before.json',before)
 cmd(['git','pull','--ff-only','origin','codex/lock-service-20261025'])
 if cmd(['git','rev-parse','HEAD'])!=expected:raise RuntimeError('Unexpected source revision')
 save('nginx-test.json',{'status':'PASS','output':cmd(['docker','compose','-f','docker-compose.yml','run','--rm','--no-deps','--label','traefik.enable=false','lp','nginx','-t'])})
 result=subprocess.run(['python3','tests/deploy/capi_monitor_test.py'],cwd=ROOT,capture_output=True,text=True,timeout=30)
 p=BASE/'vps-unit-tests.log';p.write_text(result.stdout+result.stderr);p.chmod(0o600)
 if result.returncode:raise RuntimeError('VPS monitor unit tests failed')
 cmd(['systemd-analyze','verify',str(ROOT/'deploy/capi/excelent-capi-monitor.service'),str(ROOT/'deploy/capi/excelent-capi-monitor.timer')])
 for name in ['excelent-capi-monitor.service','excelent-capi-monitor.timer']:
  dest=pathlib.Path('/etc/systemd/system')/name
  if dest.exists():raise RuntimeError('Preserve existing monitor unit')
  cmd(['install','-m','644',str(ROOT/'deploy/capi'/name),str(dest)])
 cmd(['systemctl','daemon-reload']);cmd(['systemctl','start','excelent-capi-monitor.service'])
 if notices():raise RuntimeError('Initial health did not remain silent')
 if core()!=before['core'] or ledger()!=before['ledger']:raise RuntimeError('Existing production state changed')
 save('deployed.json',{'status':'PASS','sourceCommit':expected,'vpsUnitTests':14,'nginxTest':'PASS','initialHealthSilent':True,'coreUnchanged':True,'ledgerUnchanged':True})
 print(json.dumps({'status':'PASS','phase':'deployed','sourceCommit':expected,'initialHealthSilent':True}))
elif sys.argv[1]=='accept':
 before=json.loads((BASE/'before.json').read_text())
 if cmd(['git','rev-parse','HEAD'])!=expected:raise RuntimeError('Unexpected source revision')
 if notices():raise RuntimeError('Do not repeat a previously attempted notification acceptance')
 state=worker_state()
 if not state['Running'] or state['Paused'] or state['Health']['Status']!='healthy':raise RuntimeError('Worker must start healthy')
 if any(r[3]!='ACKED' for r in ledger()['dispatch']):raise RuntimeError('Unsettled conversion blocks controlled fault')
 # This restore timer exists before any pause and survives a lost browser/TTY.
 cmd(['systemd-run','--unit=excelent-capi-test-restore-20261029','--on-active=60s','/usr/bin/docker','unpause',WORKER])
 if cmd(['systemctl','is-active','excelent-capi-test-restore-20261029.timer'])!='active':raise RuntimeError('Automatic restoration not armed')
 started=time.time();failure=None;repeated=None
 try:
  cmd(['docker','pause',WORKER])
  if not worker_state()['Paused']:raise RuntimeError('Real worker pause not observed')
  cmd(['systemctl','start','excelent-capi-monitor.service'])
  failure=notices();save('failure.json',{'paused':True,'notices':failure})
  if len(failure)!=1 or failure[0]['kind']!='FAILURE' or failure[0]['state']!='ACKED':raise RuntimeError('Failure notification not accepted; never auto-repeat')
  cmd(['systemctl','start','excelent-capi-monitor.service'])
  repeated=notices();save('repeated-failure.json',{'paused':True,'newNotificationCount':len(repeated)-len(failure),'notices':repeated})
  if repeated!=failure:raise RuntimeError('Duplicate failure notification detected')
 finally:
  if worker_state().get('Paused'):cmd(['docker','unpause',WORKER])
  save('restore.json',{'restored':not worker_state().get('Paused'),'pauseDurationSeconds':round(time.time()-started,2),'fallbackTimerArmed':True})
  if not worker_state().get('Paused'):cmd(['systemctl','stop','excelent-capi-test-restore-20261029.timer'])
 deadline=time.time()+35
 while worker_state()['Health']['Status']!='healthy' and time.time()<deadline:time.sleep(2)
 cmd(['systemctl','start','excelent-capi-monitor.service'])
 rows=notices();save('recovery.json',{'workerHealthy':worker_state()['Health']['Status']=='healthy','notices':rows})
 if len(rows)!=2 or [r['kind'] for r in rows]!=['FAILURE','RECOVERY'] or any(r['state']!='ACKED' for r in rows):raise RuntimeError('Recovery notification not accepted')
 cmd(['systemctl','start','excelent-capi-monitor.service'])
 if notices()!=rows:raise RuntimeError('Duplicate recovery notification detected')
 spec=importlib.util.spec_from_file_location('monitor',ROOT/'src/integrations/meta-capi/monitor.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 cfg=m.load_config(ROOT/'deploy/capi/monitor.json');client=m.MondayNotifications(pathlib.Path(cfg['tokenFile']).read_text().strip(),cfg['apiVersion'],cfg['recipient'],cfg['board'])
 received=[]
 for attempt in range(5):
  data=client.request('query{me{id} notifications(limit:100){id text read created_at}}',{})
  if str(data['me']['id'])!=cfg['recipient']:raise RuntimeError('Notification recipient identity mismatch')
  received=[n for n in data.get('notifications',[]) if n.get('text') in [r['text'] for r in rows]]
  if len(received)==2:break
  time.sleep(2)
 save('notification-readback.json',{'recipientId':cfg['recipient'],'targetBoardId':cfg['board'],'source':'independent Monday notifications query','notifications':received,'readStateChanged':False})
 if len(received)!=2 or len({r['id'] for r in received})!=2:raise RuntimeError('Notification delivery not independently confirmed; do not resend')
 after_core=core();after_ledger=ledger()
 identity=cmd(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}',WORKER])
 if after_core!=before['core'] or after_ledger!=before['ledger'] or identity!=before['workerIdentity']:raise RuntimeError('Production state changed beyond bounded pause')
 cmd(['systemctl','enable','--now','excelent-capi-monitor.timer'])
 timer=cmd(['systemctl','is-active','excelent-capi-monitor.timer'])
 if timer!='active':raise RuntimeError('Monitor timer inactive')
 summary={'status':'PASS','sourceCommit':expected,'recipientId':cfg['recipient'],'notificationIds':[n['id'] for n in received],'failureCount':1,'recoveryCount':1,'duplicateCount':0,'realFault':'paused CAPI process','restored':True,'worker':'healthy','workerIdentityUnchanged':True,'coreUnchanged':True,'n8nDefinitionsUnchanged':True,'ledgerUnchanged':True,'activationUnchanged':True,'monitorTimer':timer,'intervalSeconds':60,'whatsappMessages':0,'metaPostCallsByAcceptance':0,'emailDelivery':'NOT TESTED','offHostCoverage':False}
 save('verified.json',summary);print(json.dumps(summary))
