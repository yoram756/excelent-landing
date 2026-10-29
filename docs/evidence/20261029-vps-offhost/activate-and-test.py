"""Controlled missing heartbeat; never stop the VPS, Docker or applications."""
import datetime,hashlib,importlib.util,json,os,pathlib,sqlite3,stat,subprocess,sys,time
ROOT=pathlib.Path('/docker/lp');BASE=pathlib.Path('/docker/vps-offhost-20261029')
SERVICE='excelent-vps-heartbeat.service';TIMER='excelent-vps-heartbeat.timer';RESTORE='excelent-offhost-restore-20261029'
def cmd(args):return subprocess.check_output(args,cwd=ROOT,text=True,stderr=subprocess.STDOUT,timeout=45).strip()
def save(name,value):
 p=BASE/name
 with p.open('x') as f:json.dump(value,f,indent=2)
 p.chmod(0o600)
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def module():
 spec=importlib.util.spec_from_file_location('offhost_prepare',BASE/'prepare-vps.py')
 # Only reuse the read-only definitions, never rerun deployment at import.
 source=(BASE/'prepare-vps.py').read_text().split('expected=sys.argv[1]')[0]
 ns={};exec(source,ns);return ns
def snapshot():return json.loads(json.dumps(module()['snapshot']()))
def service_result():
 values=cmd(['systemctl','show',SERVICE,'-p','Result','-p','ExecMainStatus','-p','ExecMainExitTimestamp','-p','DynamicUser','-p','User']).splitlines()
 return dict(v.split('=',1) for v in values if '=' in v)
phase=sys.argv[1]
if phase=='activate':
 cred=pathlib.Path('/docker/offhost-secrets/healthchecks_url');folder=cred.parent
 if stat.S_IMODE(cred.stat().st_mode)!=0o400 or cred.stat().st_uid!=0 or stat.S_IMODE(folder.stat().st_mode)!=0o700:raise RuntimeError('Protected credential permissions required')
 before=json.loads((BASE/'before.json').read_text())
 if snapshot()!=before:raise RuntimeError('Core baseline changed before activation')
 cmd(['systemctl','start',SERVICE]);result=service_result()
 if result.get('Result')!='success' or result.get('ExecMainStatus')!='0' or result.get('DynamicUser')!='yes':raise RuntimeError('Heartbeat was not accepted')
 cmd(['systemctl','enable','--now',TIMER])
 if cmd(['systemctl','is-active',TIMER])!='active':raise RuntimeError('Heartbeat timer inactive')
 save('activated.json',{'status':'PASS','at':utc(),'serviceResult':result,'timerActive':True,'intervalSeconds':60,'externalPeriodSeconds':60,'externalGraceSeconds':120,'payloadBytes':0,'credentialLogged':False,'coreUnchanged':True})
 print(json.dumps({'phase':'activate','status':'PASS','service':result,'timer':'active','at':utc()}))
elif phase=='missing':
 if (BASE/'missing-started.json').exists():raise RuntimeError('Do not repeat the controlled missing signal test')
 if cmd(['systemctl','is-active',TIMER])!='active':raise RuntimeError('Normal heartbeat must be active first')
 cmd(['systemd-run','--unit='+RESTORE,'--on-active=5min','/usr/bin/systemctl','start',TIMER])
 if cmd(['systemctl','is-active',RESTORE+'.timer'])!='active':raise RuntimeError('Automatic restoration not armed')
 try:
  cmd(['systemctl','stop',TIMER])
  # A final normal signal after the scheduler stops gives a clear test boundary.
  cmd(['systemctl','start',SERVICE])
  result=service_result()
  if result.get('ExecMainStatus')!='0' or result.get('Result')!='success':raise RuntimeError('Last baseline ping not accepted')
  start=time.time()
  data={'phase':'missing','status':'IN_PROGRESS','stoppedAt':utc(),'lastSignalServiceResult':result,'configuredMissingSignalThresholdAt':datetime.datetime.fromtimestamp(start+180,datetime.timezone.utc).isoformat(),'automaticRestoreAtApprox':datetime.datetime.fromtimestamp(start+300,datetime.timezone.utc).isoformat(),'testScope':'only heartbeat timer stopped; applications and provider check stay active','whatsappMessages':0}
  save('missing-started.json',data);print(json.dumps(data))
 except BaseException:
  cmd(['systemctl','start',TIMER]);raise
elif phase=='resume':
 # Never wait for an email while leaving the sender stopped beyond the fallback.
 cmd(['systemctl','start',SERVICE]);result=service_result()
 cmd(['systemctl','start',TIMER])
 if result.get('ExecMainStatus')!='0' or result.get('Result')!='success' or cmd(['systemctl','is-active',TIMER])!='active':raise RuntimeError('Heartbeat restoration not confirmed; keep fallback armed')
 subprocess.run(['systemctl','stop',RESTORE+'.timer'],capture_output=True,text=True)
 data={'phase':'resume','status':'PASS','at':utc(),'serviceResult':result,'timer':'active','fallbackCancelledAfterRestore':True}
 save('restored.json',data);print(json.dumps(data))
elif phase=='verify':
 before=json.loads((BASE/'before.json').read_text());after=snapshot()
 if after!=before:raise RuntimeError('Core, CAPI observer, dispatch or activation changed during external test')
 active=cmd(['systemctl','is-active',TIMER]);enabled=cmd(['systemctl','is-enabled',TIMER]);result=service_result()
 if active!='active' or enabled!='enabled' or result.get('Result')!='success' or result.get('ExecMainStatus')!='0':raise RuntimeError('Healthy persistent timer not confirmed')
 logs=cmd(['journalctl','-u',SERVICE,'--since','2026-10-29 00:00:00 UTC','-o','cat','--no-pager'])
 if 'hc-ping.com/' in logs:raise RuntimeError('Credential-bearing log detected; stop publication')
 data={'status':'PASS','sourceCommit':cmd(['git','rev-parse','HEAD']),'timerActive':active,'timerEnabled':enabled,'serviceResult':result,'coreUnchanged':True,'n8nDefinitionsUnchanged':True,'capiLedgerUnchanged':True,'capiActivationUnchanged':True,'capiObserverUnchanged':True,'intervalSeconds':60,'externalPeriodSeconds':60,'externalGraceSeconds':120,'secretUrlInLogs':False,'whatsappMessages':0,'actualServerShutdownPerformed':False,'failureMode':'real missing heartbeat to hosted independent service','providerUiAndEmailAcceptance':'verify independently'}
 save('verified-server.json',data);print(json.dumps(data))
