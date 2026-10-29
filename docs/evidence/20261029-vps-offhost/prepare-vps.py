"""Install reviewed public files only; do not provision or start cloud pings."""
import hashlib,json,pathlib,sqlite3,subprocess,sys
ROOT=pathlib.Path('/docker/lp');BASE=pathlib.Path('/docker/vps-offhost-20261029')
CORE=['lp-lp-1','excelent-lock-lock-server-1','excelent-wa-intake','excelent-wa-isolated-20261028-resume','n8n-qhxa-n8n-1','excelent-capi-worker-1']
def cmd(args):return subprocess.check_output(args,cwd=ROOT,text=True,stderr=subprocess.STDOUT,timeout=45).strip()
def save(name,value):
 p=BASE/name
 with p.open('x') as f:json.dump(value,f,indent=2)
 p.chmod(0o600)
def snapshot():
 db=sqlite3.connect('file:/var/lib/docker/volumes/n8n-qhxa_n8n_data/_data/database.sqlite?mode=ro',uri=True)
 workflows={r[0]:hashlib.sha256(json.dumps(r[1:],separators=(',',':')).encode()).hexdigest() for r in db.execute('SELECT id,active,nodes,connections,settings FROM workflow_entity ORDER BY id')};db.close()
 db=sqlite3.connect('file:/var/lib/docker/volumes/excelent-capi_capi_data/_data/capi.sqlite?mode=ro',uri=True)
 ledger={'dispatch':list(db.execute('SELECT key,state,receipt FROM capi_dispatch ORDER BY key')),'activation':list(db.execute("SELECT key,value FROM capi_meta WHERE key LIKE 'activated:%' ORDER BY key"))};db.close()
 return {'containers':{n:cmd(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}',n]) for n in CORE},'workflows':workflows,'ledger':ledger,'nginx':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ['deploy/nginx.conf','deploy/lp1-site.inc','deploy/lp1-api.inc','docker-compose.yml']},'capiObserver':cmd(['systemctl','is-active','excelent-capi-monitor.timer'])}
expected=sys.argv[1];BASE.mkdir(mode=0o700,exist_ok=True)
if pathlib.Path('/docker/offhost-secrets').exists():raise RuntimeError('Existing external credentials require impact review')
before=snapshot();save('before.json',before)
cmd(['git','pull','--ff-only','origin','codex/lock-service-20261025'])
if cmd(['git','rev-parse','HEAD'])!=expected:raise RuntimeError('Unexpected source revision')
save('nginx-test.json',{'status':'PASS','output':cmd(['docker','compose','-f','docker-compose.yml','run','--rm','--no-deps','--label','traefik.enable=false','lp','nginx','-t'])})
result=subprocess.run(['python3','tests/deploy/offhost_heartbeat_test.py'],cwd=ROOT,capture_output=True,text=True,timeout=30)
p=BASE/'unit-tests.log';p.write_text(result.stdout+result.stderr);p.chmod(0o600)
if result.returncode:raise RuntimeError('VPS contracts failed')
for folder in ['/usr/local/lib/excelent-monitor','/etc/excelent-monitor']:cmd(['install','-d','-m','755',folder])
files={'src/services/monitoring/offhost-heartbeat.py':'/usr/local/lib/excelent-monitor/offhost-heartbeat.py','deploy/offhost/heartbeat.json':'/etc/excelent-monitor/heartbeat.json','deploy/offhost/excelent-vps-heartbeat.service':'/etc/systemd/system/excelent-vps-heartbeat.service','deploy/offhost/excelent-vps-heartbeat.timer':'/etc/systemd/system/excelent-vps-heartbeat.timer'}
for src,dst in files.items():
 if pathlib.Path(dst).exists():raise RuntimeError('Preserve existing installed target')
 cmd(['install','-m','644',str(ROOT/src),dst])
cmd(['systemctl','daemon-reload'])
cmd(['systemd-analyze','verify','/etc/systemd/system/excelent-vps-heartbeat.service','/etc/systemd/system/excelent-vps-heartbeat.timer'])
hashes={dst:hashlib.sha256(pathlib.Path(dst).read_bytes()).hexdigest() for dst in files.values()}
if any(hashlib.sha256((ROOT/src).read_bytes()).hexdigest()!=hashes[dst] for src,dst in files.items()):raise RuntimeError('Installed source mismatch')
active=subprocess.run(['systemctl','is-active','excelent-vps-heartbeat.timer'],capture_output=True,text=True).stdout.strip()
enabled=subprocess.run(['systemctl','is-enabled','excelent-vps-heartbeat.timer'],capture_output=True,text=True).stdout.strip()
if active!='inactive' or enabled!='disabled':raise RuntimeError('Cloud sender must remain disabled pending approval')
if snapshot()!=before:raise RuntimeError('Core, observer or dispatch state changed')
summary={'preparation':'PASS','productionMonitoring':'BLOCKED','blocker':'Owner approval of new provider/account terms and protected ping capability pending','sourceCommit':expected,'unitTests':10,'nginxTest':'PASS','systemdUnitValidation':'PASS','installedSourceMatches':True,'installedFileSha256':hashes,'timerActive':active,'timerEnabled':enabled,'credentialProvisioned':False,'pingsSent':0,'coreUnchanged':True,'n8nDefinitionsUnchanged':True,'capiLedgerUnchanged':True,'capiObserverUnchanged':True,'whatsappMessages':0,'systemdVersion':cmd(['systemctl','--version']).splitlines()[0]}
save('prepared.json',summary);print(json.dumps(summary))
