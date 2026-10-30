import json,sqlite3,importlib.util,pathlib,hashlib,sys,datetime
old=pathlib.Path('/tmp/replay-publication-guard-20261030.py')
assert hashlib.sha256(old.read_bytes()).hexdigest()=='2c51c8c253aa8fd4b5a18236556b530123a833b526244e244e509f7f185a1814'
spec=importlib.util.spec_from_file_location('g',str(old));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
OUT=pathlib.Path('/docker/dispatch-latency-20261030')
def save(n,v):
 with open(OUT/n,'x') as f:json.dump(v,f,indent=2)
 (OUT/n).chmod(0o600)
def guard():
 c=g.read();g.compare(c['publishedNodes'],c['publishedConnections'],c['settings'],json.loads((g.OUT/'before.private.json').read_text()),json.loads(g.REVIEW.read_text()))
 assert c['activeVersionId']=='ca4089e7-049c-471d-9dca-6901cbc33144' and c['active']==1
 return {'version':c['activeVersionId'],'nodes':41,'graphHash':g.digest(c['publishedNodes']),'connectionsHash':g.digest(c['publishedConnections']),'settingsHash':g.digest(c['settings']),'othersHash':g.digest(c['otherWorkflows']),'services':g.services(),'whatsappDisabled':True}
def decode(text):
 a=json.loads(text)
 if isinstance(a,dict):return a
 cache={}
 def at(i):
  if i in cache:return cache[i]
  v=a[i]
  if isinstance(v,dict):
   x={};cache[i]=x;x.update({k:ref(z) for k,z in v.items()});return x
  if isinstance(v,list):
   x=[];cache[i]=x;x.extend(ref(z) for z in v);return x
  return v
 def ref(v):
  return at(int(v)) if isinstance(v,str) else v
 return at(0)
def row(execution_id):
 c=sqlite3.connect(g.DB,uri=True)
 e=c.execute('SELECT id,status,startedAt,stoppedAt FROM execution_entity WHERE id=?',(execution_id,)).fetchone()
 raw=c.execute('SELECT data FROM execution_data WHERE executionId=?',(execution_id,)).fetchone()[0];c.close()
 d=decode(raw);runs=d['resultData']['runData'];hook=runs['Lead webhook'][0];body=hook['data']['main'][0][0]['json']['body']
 assert body['first_name'].startswith('TEST '),'NOT_OWN_TEST'
 return {'executionId':e[0],'status':e[1],'startedAtUtc':e[2],'stoppedAtUtc':e[3],'eventId':body['event_id'],'phone':body['phone'],'clientPayloadAt':body.get('service_request_at'),'webhookStartMs':hook['startTime'],'webhookDurationMs':hook.get('executionTime'),'steps':{n:{'startTime':v[0]['startTime'],'executionTime':v[0].get('executionTime')} for n,v in runs.items()}}
phase=sys.argv[1]
if phase=='before':
 proof=guard();example=row(75341);assert example['eventId']=='55efb7f3-e93f-4231-9ea4-6ec44fe212bc'
 OUT.mkdir(mode=0o700);save('before.private.json',proof)
 public={k:v for k,v in proof.items() if k!='services'};public.update({'status':'PASS','checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ownedTimestampExample':{k:example[k] for k in ['executionId','startedAtUtc','webhookStartMs','webhookDurationMs']}})
 save('preflight.json',public);print(json.dumps(public))
elif phase=='after':
 intent=json.loads(pathlib.Path(sys.argv[2]).read_text());c=sqlite3.connect(g.DB,uri=True);results=[]
 for p in intent['cases']:
  ids=c.execute('SELECT e.id FROM execution_entity e JOIN execution_data d ON d.executionId=e.id WHERE e.workflowId=? AND d.data LIKE ? ORDER BY e.id',(g.W,'%'+p['event_id']+'%')).fetchall()
  matched=[]
  for x in ids:
   r=row(x[0])
   if r['eventId']==p['event_id']:matched.append(r)
  assert len(matched)==1 and matched[0]['status']=='success','AMBIGUOUS_OR_FAILED_TEST'
  results.extend(matched)
 current=guard();before=json.loads((OUT/'before.private.json').read_text());assert current==before,'RUNTIME_CHANGED'
 v={'status':'PASS','protectedRuntimeUnchanged':True,'version':current['version'],'results':results};save('server-result.json',v);print(json.dumps(v))
else:raise ValueError('phase')

