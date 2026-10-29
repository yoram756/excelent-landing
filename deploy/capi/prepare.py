"""Read-only baseline, disposable nginx validation and independent image build. No secrets."""
import hashlib,json,pathlib,sqlite3,subprocess,sys,os
ROOT=pathlib.Path('/docker/lp')
BASE=pathlib.Path('/docker/excelent-capi-20261029')
CORE=['lp-lp-1','excelent-lock-lock-server-1','excelent-wa-intake','excelent-wa-isolated-20261028-resume','n8n-qhxa-n8n-1']
def command(args):
    return subprocess.check_output(args,cwd=ROOT,text=True,stderr=subprocess.STDOUT).strip()
def snapshot():
    cfg=json.loads((ROOT/'config/error-handler.json').read_text())
    ids=list(cfg['bindings'].values())+[cfg['workflowId'],'StS89G1uHOBX2znO']
    db=sqlite3.connect('file:/var/lib/docker/volumes/n8n-qhxa_n8n_data/_data/database.sqlite?mode=ro',uri=True)
    workflows={}
    for wid in ids:
        row=db.execute('select active,nodes,connections,settings from workflow_entity where id=?',(wid,)).fetchone()
        if not row:raise RuntimeError('Required workflow missing')
        workflows[wid]=hashlib.sha256(json.dumps(row,separators=(',',':')).encode()).hexdigest()
    db.close()
    return {'containers':{n:command(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Running}}',n]) for n in CORE},'workflows':workflows,'nginxSha256':{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ['deploy/nginx.conf','deploy/lp1-site.inc','deploy/lp1-api.inc','docker-compose.yml']}}
def save(name,value):
    p=BASE/name
    if p.exists():raise RuntimeError('Preserve existing evidence: '+name)
    with p.open('x') as f:json.dump(value,f,indent=2)
    p.chmod(0o600)
if __name__=='__main__':
    expected=sys.argv[1]
    if command(['git','rev-parse','HEAD'])!=expected:raise RuntimeError('Unexpected source revision')
    BASE.mkdir(mode=0o700,exist_ok=True)
    baseline=snapshot()
    save('before.json',{'sourceCommit':expected,**baseline})
    nginx=command(['docker','compose','-f','docker-compose.yml','run','--rm','--no-deps','--label','traefik.enable=false','lp','nginx','-t'])
    save('nginx-test.json',{'status':'PASS','output':nginx})
    result=subprocess.run(['docker','compose','-f','deploy/capi/compose.json','build'],cwd=ROOT,env={**os.environ,'CAPI_MODE':'test'},capture_output=True,text=True)
    (BASE/'build.private.log').write_text(result.stdout+result.stderr);(BASE/'build.private.log').chmod(0o600)
    if result.returncode:raise RuntimeError('CAPI build failed; inspect private build log')
    if snapshot()!=baseline:raise RuntimeError('Existing production services changed during preparation')
    save('prepared.json',{'status':'PASS','sourceCommit':expected,'coreUnchanged':True,'newIngress':False,'newPublicPorts':False,'credentialsProvisioned':False})
    print(json.dumps({'status':'PASS','sourceCommit':expected,'nginxTest':'PASS','imageBuild':'PASS','coreUnchanged':True,'credentialsProvisioned':False}))
