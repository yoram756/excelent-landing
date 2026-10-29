"""Existing credentials enter only through masked TTY input, never arguments or history."""
import getpass,json,os,pathlib,re,sys
BASE=pathlib.Path('/docker/capi-secrets')
if not sys.stdin.isatty():raise RuntimeError('An authenticated TTY with masked input is required')
if BASE.exists():raise RuntimeError('Preserve existing secret directory; review before provisioning')
values={}
for key in ['monday_token','meta_token','test_code']:
    value=getpass.getpass(key+': ')
    if not value or re.search(r'\s',value):raise RuntimeError('Credential validation failed; no values logged')
    if key=='test_code' and not re.fullmatch(r'TEST[A-Z0-9]{1,80}',value):raise RuntimeError('Test code format invalid')
    values[key]=value
BASE.mkdir(mode=0o700)
for key,value in values.items():
    p=BASE/key
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o400)
    with os.fdopen(fd,'w') as f:f.write(value)
    os.chown(p,1000,1000)
print(json.dumps({'status':'PASS','secretFiles':3,'directoryMode':'0700','fileMode':'0400','fileOwnerUid':1000,'secretValuesLogged':False}))
