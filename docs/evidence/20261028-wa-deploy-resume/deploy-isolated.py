import datetime, hashlib, json, os, pathlib, shutil, sqlite3, subprocess, time

BASE=pathlib.Path('/docker/excelent-wa-resume-20261028')
SOURCE=BASE/'source'
APP=SOURCE/'src/services/wa-assistant'
STATE=pathlib.Path('/docker/excelent-wa-isolated-20261028/state')
SECRETS=pathlib.Path('/docker/excelent-wa-isolated-20261028/secrets')
IMAGE='sha256:ffeb52485f78b1b06c9a832205853cf75da72a07a514c9a27724df85979d6c34'
COMMIT='b7d58be44d470457d6a190531e60324ba5358b55'
OLD='excelent-wa-isolated-20261028-v2'
NEW='excelent-wa-isolated-20261028-resume'
REPORT=BASE/'deployment-report.json'
ENV={**os.environ,'GIT_TERMINAL_PROMPT':'0'}
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'RUNNING',
 'mode':'ISOLATED_NO_SEND','sourceCommit':COMMIT,'liveProviderCalls':0,'liveModelCalls':0,'stages':[]}
changed=False

def checkpoint(stage,**details):
    report['phase']=stage
    report['stages'].append({'stage':stage,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),**details})
    REPORT.write_text(json.dumps(report,indent=2))
    REPORT.chmod(0o600)

def run(args,label,timeout=45,required=True):
    (BASE/('command-'+label+'.json')).write_text(json.dumps(args,indent=2))
    result=subprocess.run(args,capture_output=True,text=True,env=ENV,timeout=timeout)
    log=BASE/(label+'.private.log');log.write_text(result.stdout+result.stderr);log.chmod(0o600)
    if required and result.returncode!=0:
        raise RuntimeError(label+': exit '+str(result.returncode))
    return result

def inspect(name):
    return json.loads(subprocess.check_output(['docker','inspect',name]))[0]

def workflows():
    path='/var/lib/docker/volumes/n8n-qhxa_n8n_data/_data/database.sqlite'
    db=sqlite3.connect('file:'+path+'?mode=ro',uri=True)
    ids=['HNvsmdIDsvrHkZuw','StS89G1uHOBX2znO','AwCquhPHa4OgjkEo','0nesgH42OpyQdncL','90jZAb9ZFDOnEQ0e','wyMfdiAAyfhtDyrP','QEGe2prEvnA4i47J','8W7MymUCLpPnilJs']
    out={}
    for id in ids:
        row=db.execute('select name,active,nodes,connections,settings from workflow_entity where id=?',(id,)).fetchone()
        assert row,id
        out[id]={'name':row[0],'active':bool(row[1]),'configurationSha256':hashlib.sha256(json.dumps(list(row[1:]),sort_keys=True).encode()).hexdigest()}
    db.close()
    return out

def backup_database(source,dest):
    a=sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True)
    b=sqlite3.connect(dest);a.backup(b)
    assert b.execute('pragma integrity_check').fetchone()[0]=='ok'
    b.close();a.close();dest.chmod(0o600)

def wait_healthy():
    for _ in range(20):
        i=inspect(NEW)
        if i['State'].get('Health',{}).get('Status')=='healthy':return i
        if not i['State']['Running']:raise RuntimeError('candidate exited')
        time.sleep(1)
    raise RuntimeError('candidate health timeout')

def sidecar(phase):
    name=NEW+'-e2e-'+phase
    cmd=['docker','run','-d','--name',name,'--network','container:'+NEW,
      '--label','traefik.enable=false','--read-only','--cap-drop','ALL',
      '--security-opt','no-new-privileges:true','--user','1000:1000',
      '--memory','1g','--cpus','1','--pids-limit','256',
      '--tmpfs','/tmp:rw,noexec,nosuid,size=512m',
      '--mount',f'type=bind,source={APP},target=/app,readonly',
      '--mount',f'type=bind,source={STATE},target=/state',
      '--mount',f'type=bind,source={SECRETS},target=/run/secrets,readonly',
      '--mount',f'type=bind,source={BASE}/evidence,target=/evidence',
      '-e','EXCELENT_SYNTHETIC_CONTAINER=1','--workdir','/app','--entrypoint','node',
      IMAGE,'/app/scripts/deployed-e2e.mjs',phase,'/evidence/'+phase+'.json']
    run(cmd,'start-e2e-'+phase)
    waited=run(['docker','wait',name],'wait-e2e-'+phase,timeout=300)
    code=int(waited.stdout.strip())
    assert code==0,'e2e-'+phase+' container exit '+str(code)
    data=json.loads((BASE/'evidence'/f'{phase}.json').read_text())
    assert data['status']=='PASS' and data['failed']==0,data.get('failure')
    checkpoint('e2e-'+phase,passed=data['passed'],workflowIds=data['workflowIds'],n8nExecutions=data['n8nExecutions'])
    return data

try:
    assert BASE.exists() and not SOURCE.exists()
    old=inspect(OLD)
    assert old['State']['Running'] and old['HostConfig']['NetworkMode']=='none'
    assert not old['HostConfig'].get('PortBindings')
    assert old['Image']==IMAGE
    before_workflows=workflows()
    protected={name:{'id':inspect(name)['Id'],'startedAt':inspect(name)['State']['StartedAt']}
      for name in ['excelent-wa-intake','n8n-qhxa-n8n-1','lp-lp-1']}
    assert any(m['Destination']=='/state' and m['Source']==str(STATE) for m in old['Mounts'])
    db=sqlite3.connect('file:'+str(STATE/'synthetic.sqlite')+'?mode=ro',uri=True)
    ids=[x[0] for x in db.execute('select id from events')]
    assert all(i.startswith(('evt_deployed_','evt_n8n_synthetic_','evt_TEST_')) for i in ids),'unrecognized data in isolated volume'
    assert db.execute("select count(*) from messages where state='NEW'").fetchone()[0]==0,'pending pre-existing work requires review'
    db.close()
    checkpoint('baseline-verified',protectedContainers=protected,productionWorkflows=before_workflows,existingSyntheticEvents=len(ids))
    run(['git','-C','/docker/lp','worktree','add','--detach',str(SOURCE),'HEAD'],'worktree')
    run(['git','-C',str(SOURCE),'pull','--ff-only','origin','codex/lock-service-20261025'],'git-pull',timeout=60)
    actual=run(['git','-C',str(SOURCE),'rev-parse','HEAD'],'git-head').stdout.strip()
    assert actual==COMMIT,'unexpected branch head: review before deployment'
    manifest=json.loads((APP/'manifest.json').read_text())
    for file,expected in manifest['files'].items():
        path=(APP/file).resolve();assert path.is_relative_to(APP)
        assert hashlib.sha256(path.read_bytes()).hexdigest()==expected['sha256'],file
    binding=json.loads((APP/'config/provider.json').read_text())
    assert binding['provider']=='cosend' and binding['phoneNumberId']=='1138723472651617'
    assert not binding['runtimeOutboundEnabled'] and not binding['modelBudgetApproved'] and not binding['exclusiveResponderApproved']
    checkpoint('source-verified',actualCommit=actual,manifestFiles=len(manifest['files']),manifestSha256=hashlib.sha256((APP/'manifest.json').read_bytes()).hexdigest())
    testcmd=['docker','run','--rm','--network','none','--label','traefik.enable=false',
      '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
      '--user','1000:1000','--memory','512m','--pids-limit','128',
      '--tmpfs','/tmp:rw,nosuid,size=128m','--mount',f'type=bind,source={APP},target=/app,readonly',
      '--workdir','/app','--entrypoint','sh',IMAGE,'-c','node --test --test-reporter=tap test/*.test.mjs']
    unit=run(testcmd,'server-tests',timeout=60)
    summary=[x for x in unit.stdout.splitlines() if x.startswith(('# tests ','# pass ','# fail '))]
    assert '# pass 84' in summary and '# fail 0' in summary
    checkpoint('server-tests-passed',summary=summary)
    run(['docker','compose','-f','/docker/lp/docker-compose.yml','run','--rm','--no-deps',
      '--label','traefik.enable=false','lp','nginx','-t'],'nginx-existing-config-test',timeout=60)
    backup=BASE/'backup';backup.mkdir(mode=0o700)
    backup_database(STATE/'synthetic.sqlite',backup/'isolated.sqlite')
    backup_database(pathlib.Path('/docker/excelent-wa-intake-20261022/data/excelent-wa-intake.sqlite'),backup/'intake-readonly.sqlite')
    restore=backup/'restore-probe.sqlite';backup_database(backup/'isolated.sqlite',restore)
    (backup/'previous-container.json').write_text(json.dumps({'container':OLD,'image':old['Image'],'mounts':[{'source':m['Source'],'target':m['Destination']} for m in old['Mounts']]},indent=2))
    checkpoint('backups-and-restore-verified',backupPath=str(backup),productionRestored=False)
    marker=STATE/'.synthetic-only';marker.write_text('EXCELENT_SYNTHETIC_ONLY\n');os.chown(marker,1000,1000);marker.chmod(0o400)
    evidence=BASE/'evidence';evidence.mkdir(mode=0o700);os.chown(evidence,1000,1000)
    health="node -e \"fetch('http://127.0.0.1:8789/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
    start=['docker','run','-d','--name',NEW,'--network','none','--read-only','--cap-drop','ALL',
      '--security-opt','no-new-privileges:true','--user','1000:1000','--memory','256m','--cpus','0.5',
      '--pids-limit','64','--restart','on-failure:3','--label','traefik.enable=false',
      '--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--health-cmd',health,'--health-interval','5s',
      '--health-timeout','3s','--health-start-period','2s','--health-retries','3',
      '--mount',f'type=bind,source={APP},target=/app,readonly',
      '--mount',f'type=bind,source={STATE},target=/state',
      '--mount',f'type=bind,source={SECRETS},target=/run/secrets,readonly',
      '-e','EXCELENT_DB_PATH=/state/synthetic.sqlite','--workdir','/app','--entrypoint','node',IMAGE,'/app/src/server.mjs']
    (BASE/'commands-before-replacement.json').write_text(json.dumps([['docker','stop',OLD],start],indent=2))
    rollback=BASE/'rollback.sh';rollback.write_text('#!/bin/sh\nset -eu\ndocker stop '+NEW+'\ndocker start '+OLD+'\n# Preserve the shared synthetic state; do not restore an old database over new dedup facts.\n');rollback.chmod(0o700)
    run(['docker','stop',OLD],'stop-old-isolated');changed=True
    container=run(start,'start-new-isolated').stdout.strip()
    wait_healthy();checkpoint('candidate-healthy',container=NEW,containerId=container,rollback=str(rollback))
    sidecar('before')
    run(['docker','restart',NEW],'restart-candidate');wait_healthy();checkpoint('restart-healthy')
    sidecar('after')
    after=workflows();assert after==before_workflows,'production workflow configuration changed concurrently'
    for name,oldstate in protected.items():
        c=inspect(name);assert c['Id']==oldstate['id'] and c['State']['StartedAt']==oldstate['startedAt'] and c['State']['Running'],name
    candidate=inspect(NEW)
    report.update(status='PASS',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
      deployedVersion=manifest['version'],container=NEW,image=IMAGE,health=candidate['State']['Health']['Status'],
      network=candidate['HostConfig']['NetworkMode'],ports=candidate['HostConfig'].get('PortBindings'),
      productionWorkflowsUnchanged=True,protectedContainersUnchanged=True,rollback=str(rollback))
    checkpoint('complete')
except Exception as e:
    report.update(status='FAIL',failure=str(e))
    if changed:
        for name in [NEW+'-e2e-before',NEW+'-e2e-after',NEW]:
            subprocess.run(['docker','stop',name],capture_output=True,timeout=20)
        back=subprocess.run(['docker','start',OLD],capture_output=True,text=True,timeout=30)
        report['rollbackExecuted']=True;report['rollbackStartExit']=back.returncode
    checkpoint('failed')
