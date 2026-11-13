#!/usr/bin/python3
"""Root-owned provider storage. No customer paths or arbitrary shell arguments accepted.

A separate sparse ext4 filesystem avoids altering the host root filesystem.
Receipts retain originals and make interrupted migrations fail closed/recoverable.
"""
import argparse, ctypes, fcntl, json, os, pathlib, pwd, re, shutil, struct, subprocess, sys, tempfile
ROOT=pathlib.Path('/var/lib/luxipanel-storage')
POOL=ROOT/'pool'
IMAGE=ROOT/'data.ext4'
CONFIG=pathlib.Path('/etc/luxipanel/hosting/accounts.json')
RESERVE=4*1024**3
class Dq(ctypes.Structure):
 _fields_=[(n,ctypes.c_uint64) for n in ['hard','soft','space','ihard','isoft','inodes','btime','itime']]+[('valid',ctypes.c_uint32)]
def run(args,**kw):
 return subprocess.run([str(a) for a in args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,**kw).stdout.strip()
def save(file,data):
 fd,name=tempfile.mkstemp(dir=file.parent)
 try:
  with os.fdopen(fd,'w') as f:json.dump(data,f);f.flush();os.fsync(f.fileno())
  os.chmod(name,0o600);os.replace(name,file)
 finally:
  if os.path.exists(name):os.unlink(name)
def quota(cmd,project,data):
 if os.uname().machine not in ['x86_64','aarch64']:raise RuntimeError('unsupported_quota_architecture')
 fd=os.open(POOL,os.O_RDONLY|os.O_DIRECTORY)
 try:
  lib=ctypes.CDLL(None,use_errno=True)
  if lib.syscall(ctypes.c_long(443),ctypes.c_int(fd),ctypes.c_int((cmd<<8)|2),ctypes.c_int(project),ctypes.byref(data)):
   raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
 finally:os.close(fd)
def project(directory,number):
 fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  attr=bytearray(28);fcntl.ioctl(fd,0x801c581f,attr,True);v=list(struct.unpack('=IIIII8s',attr));v[0]|=0x200;v[3]=number;fcntl.ioctl(fd,0x401c5820,struct.pack('=IIIII8s',*v))
 finally:os.close(fd)
def mounted(directory):return os.path.ismount(directory)
def ensure_pool(create=False):
 if not ROOT.exists():
  if not create:raise RuntimeError('storage_not_installed')
  ROOT.mkdir(mode=0o700)
 if ROOT.is_symlink() or ROOT.stat().st_uid!=0 or ROOT.stat().st_mode&0o077:raise RuntimeError('unsafe_storage_root')
 POOL.mkdir(mode=0o700,exist_ok=True)
 if not IMAGE.exists():
  if not create:raise RuntimeError('storage_not_installed')
  if shutil.disk_usage(ROOT).free<RESERVE+1024**3:raise RuntimeError('host_storage_low')
  with IMAGE.open('xb') as f:f.truncate(8*1024**3)
  os.chmod(IMAGE,0o600)
  run(['/usr/sbin/mkfs.ext4','-q','-F','-O','quota,project','-E','quotatype=prjquota',IMAGE])
 if not mounted(POOL):run(['/usr/bin/mount','-o','loop,prjquota,nodev,nosuid',IMAGE,POOL])
 # A successful kernel call, not merely a mount option, is the capability probe.
 quota(0x800007,1500000000,Dq())
 (ROOT/'accounts').mkdir(mode=0o700,exist_ok=True)
 (ROOT/'legacy').mkdir(mode=0o700,exist_ok=True)
def identity(number):
 if not re.fullmatch(r'[1-9][0-9]{0,8}',str(number)) or int(number)>647483647:raise RuntimeError('invalid_account')
 records=json.loads(CONFIG.read_text());records=records.values() if isinstance(records,dict) else records
 a=next((a for a in records if str(a.get('id'))==str(number)),None)
 if not a or not re.fullmatch(r'hp[a-f0-9]{20}',a.get('username','')) or a.get('homeRoot')!='/home/'+a['username']:raise RuntimeError('invalid_provider_identity')
 user=pwd.getpwnam(a['username'])
 if user.pw_dir!=a['homeRoot'] or user.pw_uid<1000:raise RuntimeError('invalid_linux_identity')
 return a,user

def receipt_project(receipt):return int(receipt.get('projectId',1500000000+int(receipt['accountId'])))
def project_id(a):
 file=ROOT/'accounts'/f"{int(a['id'])}.json"
 return receipt_project(json.loads(file.read_text())) if file.exists() else 1500000000+int(a['id'])
def same_owner(a,receipt):
 return receipt.get('username')==a['username'] and (not receipt.get('accountCreatedAt') or receipt['accountCreatedAt']==a.get('createdAt'))
def new_project():
 file=ROOT/'next-project.json';last=int(json.loads(file.read_text())) if file.exists() else 1500000000
 for receipt in (ROOT/'accounts').glob('*.json'):last=max(last,receipt_project(json.loads(receipt.read_text())))
 if last>=2147483647:raise RuntimeError('project_quota_identity_exhausted')
 save(file,last+1);return last+1

def archive_retired(a,file):
 receipt=json.loads(file.read_text())
 if receipt.get('phase')!='retired' or same_owner(a,receipt):raise RuntimeError('retired_storage_identity')
 stamp=str(__import__('time').time_ns());name=receipt['username']
 for source,parent in [(POOL/name,POOL/'.retired'),(ROOT/'legacy'/name,ROOT/'legacy-retired')]:
  if source.exists():parent.mkdir(mode=0o700,exist_ok=True);source.rename(parent/(name+'-'+stamp))
 file.rename(file.with_name('retired-'+str(receipt_project(receipt))+'-'+stamp+'.json'))

def bind(source,target):
 target.mkdir(parents=True,exist_ok=True)
 if not mounted(target):run(['/usr/bin/mount','--bind',source,target])
 if os.stat(source).st_dev!=os.stat(target).st_dev or os.stat(source).st_ino!=os.stat(target).st_ino:raise RuntimeError('bind_verification_failed')
def restore(a,receipt):
 home=pathlib.Path(a['homeRoot']);tenant=POOL/a['username'];legacy=ROOT/'legacy'/a['username']
 bind(tenant/'home',home)
 # Bind targets created by the root helper must retain the original hosting
 # ownership/mode of their managed parent directories, including fresh homes.
 for relative in ['.local','.local/share']:
  source=legacy/relative;target=home/relative
  if source.is_dir():
   target.mkdir(parents=True,exist_ok=True);info=source.stat();os.chown(target,info.st_uid,info.st_gid);os.chmod(target,info.st_mode&0o7777)
 if (legacy/'.cache').exists():bind(legacy/'.cache',home/'.cache')
 cache=legacy/'.local/share/containers'
 if cache.exists():
  bind(cache,home/'.local/share/containers')
  bind(tenant/'volumes',home/'.local/share/containers/storage/volumes')
 # Fail closed if any directory is not covered by the expected project quota.
 for directory in [home,tenant/'volumes']:
  fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:
   value=bytearray(28);fcntl.ioctl(fd,0x801c581f,value,True);flags,_,_,pid,_,_=struct.unpack('=IIIII8s',value)
   if pid!=project_id(a) or not flags&0x200:raise RuntimeError('quota_inheritance_missing')
  finally:os.close(fd)

def usercmd(user,args):
 return run(['/usr/sbin/runuser','-u',user.pw_name,'--','/usr/bin/env',f'HOME={user.pw_dir}',f'XDG_RUNTIME_DIR=/run/user/{user.pw_uid}',f'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{user.pw_uid}/bus',*args])
def harden_quadlets(home,caddy_images,active_units=None):
 directory=home/'.config/containers/systemd'
 for file in directory.glob('luxi-*.container'):
  if file.is_symlink():raise RuntimeError('quadlet_symlink')
  text=file.read_text()
  if 'Description=Luxisoft isolated deployment' not in text:raise RuntimeError('unmanaged_quadlet')
  text=text.replace('ReadOnly=false','ReadOnly=true')
  if active_units is not None and file.stem+'.service' not in active_units:text=text.replace('WantedBy=default.target','# Inactive before quota migration')
  if 'SeccompProfile=' not in text:text=text.replace('[Container]','[Container]\nSeccompProfile=/usr/lib/luxipanel/storage-seccomp.json\nTmpfs=/root/.npm:rw,size=32m')
  if any(('Image='+image+'\n') in text for image in caddy_images) and 'Tmpfs=/config:' not in text:text=text.replace('[Container]','[Container]\nTmpfs=/config:rw,size=16m\nTmpfs=/data:rw,size=16m')
  file.write_text(text)

def status(a):
 number=int(a['id']);file=ROOT/'accounts'/f'{number}.json'
 if not file.exists():return {'ready':False,'available':True}
 receipt=json.loads(file.read_text())
 if receipt.get('phase')=='retired':return {'ready':False,'available':not same_owner(a,receipt)}
 if not same_owner(a,receipt):raise RuntimeError('storage_identity_changed')
 if not receipt.get('accountCreatedAt'):
  receipt['accountCreatedAt']=a.get('createdAt');save(file,receipt)
 if receipt.get('phase')!='ready':raise RuntimeError('storage_migration_incomplete')
 restore(a,receipt)
 d=Dq();quota(0x800007,project_id(a),d)
 return {'ready':True,'available':True,'usedBytes':d.space,'capacityBytes':d.hard*1024,'project':project_id(a)}

def prepare(a,user,capacity):
 number=int(a['id']);file=ROOT/'accounts'/f'{number}.json';home=pathlib.Path(a['homeRoot']);tenant=POOL/a['username'];legacy=ROOT/'legacy'/a['username']
 if file.exists() and json.loads(file.read_text()).get('phase')=='retired':archive_retired(a,file)
 if file.exists():
  receipt=json.loads(file.read_text())
  if not same_owner(a,receipt):raise RuntimeError('storage_identity_changed')
  if receipt.get('phase')!='ready':raise RuntimeError('storage_migration_incomplete')
  restore(a,receipt)
  admit_capacity(a,capacity)
 else:
  if home.is_symlink() or mounted(home) or not home.is_dir() or legacy.exists() or tenant.exists():raise RuntimeError('unsafe_migration_source')
  used=int(run(['/usr/bin/du','-s','-B1','--exclude='+str(home/'.local/share/containers'),'--exclude='+str(home/'.cache'),home]).split()[0])
  volumes=home/'.local/share/containers/storage/volumes'
  if volumes.exists():used+=int(run(['/usr/bin/du','-s','-B1',volumes]).split()[0])
  if shutil.disk_usage(ROOT).free<used+RESERVE or shutil.disk_usage(POOL).free<used+256*1024**2:raise RuntimeError('host_storage_low')
  # Managed deployment identities never execute customer code on the host.
  # A direct shell would bypass the mandatory container ioctl filter.
  cron=pathlib.Path('/var/spool/cron/crontabs')/a['username']
  if cron.exists() and cron.stat().st_size:raise RuntimeError('unmanaged_tenant_cron_requires_review')
  receipt={'accountId':number,'username':a['username'],'accountCreatedAt':a.get('createdAt'),'projectId':new_project(),'phase':'copying','capacityBytes':capacity,'units':[],'originalShell':user.pw_shell}
  # Retain exact Quadlets and every original byte for recovery. Stop only this
  # hosting user's manager; no shared platform service or other tenant is killed.
  active=subprocess.run(['/usr/bin/systemctl','is-active',f'user@{user.pw_uid}.service'],capture_output=True,text=True).returncode==0
  if active:
   receipt['units']=usercmd(user,['/usr/bin/systemctl','--user','list-units','--state=active','--type=service','--plain','--full','--no-pager','--no-legend','luxi-*']).splitlines()
  receipt['caddyImages']=[]
  if active:
   images=json.loads(usercmd(user,['/usr/bin/podman','images','--format','json']) or '[]')
   for image in images:
    config=json.loads(usercmd(user,['/usr/bin/podman','image','inspect','--format','{{json .Config}}',image['Id']]))
    if any(pathlib.Path(token).name=='caddy' for token in (config.get('Entrypoint') or [])+(config.get('Cmd') or [])):
     receipt['caddyImages'].append(image['Id'] if image['Id'].startswith('sha256:') else 'sha256:'+image['Id'])
  receipt['managerWasActive']=active;save(file,receipt)
  admit_capacity(a,capacity)
  if active:run(['/usr/bin/systemctl','stop',f'user@{user.pw_uid}.service'])
  # Abort rather than copy a live writer (including a persistent Podman pause).
  processes=subprocess.run(['/usr/bin/pgrep','-u',str(user.pw_uid)],capture_output=True,text=True)
  if processes.returncode==0:raise RuntimeError('tenant_processes_still_running')
  tenant.mkdir(mode=0o700);(tenant/'home').mkdir();(tenant/'volumes').mkdir()
  project(tenant/'home',project_id(a));project(tenant/'volumes',project_id(a))
  os.chown(tenant/'volumes',user.pw_uid,user.pw_gid)
  run(['/usr/bin/rsync','-aHAX','--numeric-ids','--exclude=/.local/share/containers/','--exclude=/.cache/',str(home)+'/',str(tenant/'home')+'/'])
  if volumes.exists():run(['/usr/bin/rsync','-aHAX','--numeric-ids',str(volumes)+'/',str(tenant/'volumes')+'/'])
  verify=run(['/usr/bin/rsync','-aHAXnc','--numeric-ids','--delete','--itemize-changes','--exclude=/.local/share/containers/','--exclude=/.cache/',str(home)+'/',str(tenant/'home')+'/'])
  if verify:raise RuntimeError('home_copy_verification_failed')
  if volumes.exists() and run(['/usr/bin/rsync','-aHAXnc','--numeric-ids','--delete','--itemize-changes',str(volumes)+'/',str(tenant/'volumes')+'/']):raise RuntimeError('volume_copy_verification_failed')
  receipt['phase']='copied';save(file,receipt)
  home.rename(legacy);home.mkdir(mode=0o755)
  # Always separate the future Podman image cache, even for a fresh account.
  cache=legacy/'.local/share/containers'
  for directory in [legacy/'.cache',legacy/'.local',legacy/'.local/share',cache,cache/'storage',cache/'storage/volumes']:
   if not directory.exists():directory.mkdir(mode=0o700);os.chown(directory,user.pw_uid,user.pw_gid)
  restore(a,receipt)
  run(['/usr/sbin/usermod','--shell','/usr/sbin/nologin',a['username']])
  harden_quadlets(home,receipt.get('caddyImages',[]),{line.split()[0] for line in receipt.get('units',[])})
  drop=pathlib.Path(f'/etc/systemd/system/user@{user.pw_uid}.service.d');drop.mkdir(exist_ok=True)
  (drop/'luxipanel-storage.conf').write_text('[Unit]\nRequires=luxipanel-storage.service\nAfter=luxipanel-storage.service\n')
  run(['/usr/bin/systemctl','daemon-reload'])
  receipt['phase']='ready';save(file,receipt)
 d=Dq();d.hard=capacity//1024;d.valid=1;quota(0x800008,project_id(a),d)
 receipt=json.loads(file.read_text());receipt['capacityBytes']=capacity;save(file,receipt)
 if receipt.get('managerWasActive'):
  run(['/usr/bin/systemctl','start',f'user@{user.pw_uid}.service'])
  for line in receipt.get('units',[]):
   unit=line.split()[0]
   if re.fullmatch(r'luxi-[a-zA-Z0-9-]+\.service',unit):usercmd(user,['/usr/bin/systemctl','--user','start',unit])
  receipt['managerWasActive']=False;save(file,receipt)
 return status(a)

def rollback_incomplete(number):
 a,user=identity(number);file=ROOT/'accounts'/f'{int(number)}.json'
 if not file.exists():return
 receipt=json.loads(file.read_text())
 if receipt.get('phase')=='ready':return
 home=pathlib.Path(a['homeRoot']);legacy=ROOT/'legacy'/a['username'];tenant=POOL/a['username']
 if legacy.exists():
  for target in [home/'.local/share/containers/storage/volumes',home/'.local/share/containers',home/'.cache',home]:
   if mounted(target):run(['/usr/bin/umount',target])
  if home.exists():home.rmdir()
  legacy.rename(home)
 if receipt.get('originalShell'):
  run(['/usr/sbin/usermod','--shell',receipt['originalShell'],a['username']])
 stamp=str(__import__('time').time_ns())
 if tenant.exists():tenant.rename(POOL/(a['username']+'.aborted-'+stamp))
 file.rename(file.with_name(file.name+'.aborted-'+stamp))
 if receipt.get('managerWasActive'):
  run(['/usr/bin/systemctl','start',f'user@{user.pw_uid}.service'])
  for line in receipt.get('units',[]):
   unit=line.split()[0]
   if re.fullmatch(r'luxi-[a-zA-Z0-9-]+\.service',unit):usercmd(user,['/usr/bin/systemctl','--user','start',unit])

def admit_capacity(a,capacity):
 own=project_id(a);current=Dq();quota(0x800007,own,current)
 if capacity<=current.hard*1024:return
 held=max(capacity,current.space);used=current.space;seen={own}
 for file in (ROOT/'accounts').glob('*.json'):
  pid=receipt_project(json.loads(file.read_text()))
  if pid in seen:continue
  seen.add(pid);data=Dq();quota(0x800007,pid,data)
  held+=max(data.hard*1024,data.space);used+=data.space
 if held-used>shutil.disk_usage(ROOT).free-RESERVE:raise RuntimeError('host_storage_capacity')
 if held+512*1024**2>shutil.disk_usage(POOL).total:
  size=((held+1024**3-1)//1024**3+1)*1024**3
  with IMAGE.open('r+b') as image:image.truncate(size)
  device=run(['/usr/bin/findmnt','-n','-o','SOURCE','--target',POOL])
  if not re.fullmatch(r'/dev/loop[0-9]+',device):raise RuntimeError('invalid_storage_device')
  run(['/usr/sbin/losetup','-c',device]);run(['/usr/sbin/resize2fs',device])

def main():
 if os.geteuid()!=0:raise RuntimeError('root_required')
 parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['init','restore','status','prepare','limit','detach']);parser.add_argument('account',nargs='?');parser.add_argument('capacity',nargs='?',type=int);args=parser.parse_args()
 lock=os.open('/run/lock/luxipanel-storage.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 shared=args.operation in ['status','limit']
 if args.operation=='prepare' and args.account:
  receipt=ROOT/'accounts'/f'{int(args.account)}.json'
  shared=receipt.exists() and json.loads(receipt.read_text()).get('phase')=='ready'
 fcntl.flock(lock,fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
 ensure_pool(args.operation=='init')
 if args.operation=='init':return {'available':True}
 if args.operation=='restore':
  for file in sorted((ROOT/'accounts').glob('*.json')):
   receipt=json.loads(file.read_text())
   if receipt.get('phase')=='retired':continue
   a,_=identity(file.stem)
   if receipt.get('phase')!='ready':
    rollback_incomplete(file.stem);continue
   restore(a,receipt)
   d=Dq();d.hard=receipt['capacityBytes']//1024;d.valid=1;quota(0x800008,project_id(a),d)
  return {'restored':True}
 a,user=identity(args.account)
 if args.operation=='status':return status(a)
 if args.operation=='detach':
  file=ROOT/'accounts'/f"{int(a['id'])}.json"
  if not file.exists():return {'detached':True}
  receipt=json.loads(file.read_text());home=pathlib.Path(a['homeRoot'])
  run(['/usr/bin/systemctl','stop',f'user@{user.pw_uid}.service'])
  for target in [home/'.local/share/containers/storage/volumes',home/'.local/share/containers',home/'.cache',home]:
   if mounted(target):run(['/usr/bin/umount',target])
  data=Dq();quota(0x800007,project_id(a),data);data.hard=max(1,(data.space+1023)//1024);data.valid=1;quota(0x800008,project_id(a),data)
  receipt['capacityBytes']=data.hard*1024;receipt['phase']='retired';save(file,receipt)
  return {'detached':True}
 if args.capacity is None or args.capacity<1024 or args.capacity%1024:raise RuntimeError('invalid_capacity')
 capacity_lock=os.open('/run/lock/luxipanel-storage-capacity.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(capacity_lock,fcntl.LOCK_EX)
 if args.operation=='prepare':
  try:return prepare(a,user,args.capacity)
  except Exception:
   rollback_incomplete(args.account)
   raise
 current=status(a)
 admit_capacity(a,args.capacity)
 if not current['ready']:raise RuntimeError('storage_not_prepared')
 file=ROOT/'accounts'/f"{int(a['id'])}.json";receipt=json.loads(file.read_text());receipt['capacityBytes']=args.capacity;save(file,receipt)
 d=Dq();d.hard=args.capacity//1024;d.valid=1;quota(0x800008,project_id(a),d)
 return status(a)
if __name__=='__main__':
 try:print(json.dumps(main()))
 except Exception as error:
  # No paths, command stderr, or customer content in API diagnostics.
  print(json.dumps({'error':type(error).__name__,'code':str(error) if isinstance(error,RuntimeError) else 'storage_operation_failed'}));sys.exit(1)
