"""Scoped CAPI release, without credential reads or n8n writes."""
import hashlib,json,os,pathlib,sqlite3,subprocess,sys
ROOT=pathlib.Path('/docker/lp')
BASE=pathlib.Path('/docker/meta-ui-closure-20261029')
EXPECTED='5d4b7efdc934ccc9ad8d12e50a2ea990d355ffc1'
CORE=['lp-lp-1','excelent-lock-lock-server-1','excelent-wa-intake','excelent-wa-isolated-20261028-resume','n8n-qhxa-n8n-1']
def cmd(args):return subprocess.check_output(args,cwd=ROOT,text=True,stderr=subprocess.STDOUT).strip()
def save(name,data):
 p=BASE/name
 with p.open('x') as f:json.dump(data,f,indent=2)
 p.chmod(0o600)
def snapshot():
 db=sqlite3.connect('file:/var/lib/docker/volumes/n8n-qhxa_n8n_data/_data/database.sqlite?mode=ro',uri=True)
 workflows={r[0]:hashlib.sha256(json.dumps(r[1:],separators=(',',':')).encode()).hexdigest() for r in db.execute('select id,active,nodes,connections,settings from workflow_entity order by id')}
 db.close()
 return {'containers':{n:cmd(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}',n]) for n in CORE},'workflows':workflows,'nginxSha256':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ['deploy/nginx.conf','deploy/lp1-site.inc','deploy/lp1-api.inc','docker-compose.yml']}}
def ledger():
 mount=cmd(['docker','volume','inspect','--format','{{.Name}}|{{.Mountpoint}}','excelent-capi_capi_data'])
 db=sqlite3.connect('file:'+mount.split('|')[1]+'/capi.sqlite?mode=ro',uri=True)
 state={'volume':mount,'dispatch':list(db.execute('select event_id,item_id,state,receipt from capi_dispatch order by key')),'activation':list(db.execute("select key,value from capi_meta where key like 'activated:%' order by key")),'binding':db.execute("select value from capi_meta where key='binding'").fetchone()[0]}
 db.close();return json.loads(json.dumps(state))
BASE.mkdir(mode=0o700,exist_ok=True)
if sys.argv[1]=='deploy':
 before={'core':snapshot(),'ledger':ledger(),'image':cmd(['docker','inspect','--format','{{.Image}}','excelent-capi-worker-1']),'sourceCommit':cmd(['git','rev-parse','HEAD'])}
 save('before.json',before)
 cmd(['git','pull','--ff-only','origin','codex/lock-service-20261025'])
 if cmd(['git','rev-parse','HEAD'])!=EXPECTED:raise RuntimeError('Unexpected source revision')
 save('nginx-test.json',{'status':'PASS','output':cmd(['docker','compose','-f','docker-compose.yml','run','--rm','--no-deps','--label','traefik.enable=false','lp','nginx','-t'])})
 env={**os.environ,'CAPI_MODE':'live'}
 for phase,args in [('build',['build','worker']),('restart',['up','-d','--no-deps','--pull','never','worker'])]:
  result=subprocess.run(['docker','compose','-f','deploy/capi/compose.json']+args,cwd=ROOT,env=env,capture_output=True,text=True)
  p=BASE/(phase+'.private.log');p.write_text(result.stdout+result.stderr);p.chmod(0o600)
  if result.returncode:raise RuntimeError('CAPI '+phase+' failed; inspect private log')
 print(json.dumps({'deployed':True,'sourceCommit':EXPECTED,'nginxTest':'PASS','awaitingHealth':True}))
elif sys.argv[1]=='verify':
 before=json.loads((BASE/'before.json').read_text())
 current=ledger();core=snapshot()
 if current!=before['ledger']:raise RuntimeError('Persistent dispatch ledger or activation changed')
 if core!=before['core']:raise RuntimeError('Core production state changed')
 health=cmd(['docker','inspect','--format','{{.State.Running}} {{.State.Health.Status}} {{.HostConfig.RestartPolicy.Name}}','excelent-capi-worker-1'])
 if health!='true healthy unless-stopped':raise RuntimeError('Worker health not ready: '+health)
 mode=cmd(['docker','exec','excelent-capi-worker-1','node','-e',"console.log(process.env.CAPI_MODE)"])
 if mode!='live':raise RuntimeError('Worker not live')
 result={'status':'PASS','sourceCommit':cmd(['git','rev-parse','HEAD']),'worker':health,'mode':mode,'coreUnchanged':True,'n8nWorkflowDefinitionsUnchanged':True,'nginxUnchanged':True,'ledgerUnchanged':True,'activationUnchanged':True,'states':{s:sum(r[2]==s for r in current['dispatch']) for s in ['ACKED','FAILED','UNKNOWN','SENDING']},'image':cmd(['docker','inspect','--format','{{.Image}}','excelent-capi-worker-1']),'whatsappMessagesSentByThisChange':0}
 if result['sourceCommit']!=EXPECTED:raise RuntimeError('Source revision mismatch')
 save('verified.json',result);print(json.dumps(result))
