#!/usr/bin/python3
"""Owned deployment inventory and confirmed purge. No arbitrary client paths."""
import hashlib,json,os,pathlib,pwd,re,shutil,stat,subprocess,sys

def allocated(paths):
 seen=set();total=0;newest=0
 def count(s):
  nonlocal total,newest
  key=(s.st_dev,s.st_ino)
  if key not in seen:seen.add(key);total+=s.st_blocks*512;newest=max(newest,s.st_mtime_ns)
 for root in paths:
  if not root.exists() and not root.is_symlink():continue
  first=root.lstat();count(first)
  if not stat.S_ISDIR(first.st_mode):continue
  for base,dirs,files,fd in os.fwalk(root,follow_symlinks=False):
   count(os.fstat(fd))
   for name in dirs+files:
    try:count(os.stat(name,dir_fd=fd,follow_symlinks=False))
    except FileNotFoundError:raise RuntimeError('storage_item_changed')
 return total,hashlib.sha256(f'{total}:{newest}:{len(seen)}'.encode()).hexdigest()

def deployment_paths(home,key):
 paths=[home/'.luxisoft/deployments'/key]
 units=home/'.config/containers/systemd'
 if units.is_dir() and not units.is_symlink():paths+=list(units.glob('luxi-'+key+'-*.container'))
 volumes=home/'.local/share/containers/storage/volumes'
 if volumes.is_dir() and not volumes.is_symlink():paths += [p for p in volumes.iterdir() if re.fullmatch('luxi-'+key+r'-[a-z0-9-]+',p.name)]
 return paths

def inventory(home):
 root=home/'.luxisoft/deployments';items=[]
 if root.is_symlink():raise RuntimeError('unsafe_storage_root')
 if root.is_dir():
  for folder in sorted(root.iterdir()):
   key=folder.name
   if not re.fullmatch(r'[a-f0-9]{32}',key) or folder.is_symlink():continue
   paths=deployment_paths(home,key);value,_=allocated(paths);revision=hashlib.sha256(json.dumps(sorted(str(p.relative_to(home)) for p in paths)).encode()).hexdigest();project=f'{key[:8]}-{key[8:12]}-{key[12:16]}-{key[16:20]}-{key[20:]}'
   items.append({'id':project,'projectId':project,'bytes':value,'revision':revision,'kind':'runtime'})
 return items

def purge(home,key):
 if not re.fullmatch(r'[a-f0-9]{32}',key):raise RuntimeError('invalid_project')
 root=home/'.luxisoft/deployments'/key
 if root.is_symlink():raise RuntimeError('unsafe_storage_root')
 if root.exists() and not (root/'retired').is_file():raise RuntimeError('deployment_not_retired')
 output=subprocess.run(['/usr/bin/podman','ps','-a','--format','{{.Names}} {{.State}}'],check=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=30).stdout
 for line in output.splitlines():
  parts=line.split()
  if len(parts)==2 and re.fullmatch('luxi-'+key+r'-[a-z0-9-]+',parts[0]):
   if parts[1] not in ['exited','created','configured','stopped']:raise RuntimeError('deployment_still_running')
   subprocess.run(['/usr/bin/podman','rm',parts[0]],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
 # Podman refuses removal while a volume is referenced. No --force is used.
 volumes=home/'.local/share/containers/storage/volumes'
 if volumes.is_dir():
  for p in list(volumes.iterdir()):
   if re.fullmatch('luxi-'+key+r'-[a-z0-9-]+',p.name):
    subprocess.run(['/usr/bin/podman','volume','rm',p.name],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
 units=home/'.config/containers/systemd'
 if units.is_dir():
  for p in units.glob('luxi-'+key+'-*.container'):p.unlink()
 if root.exists():shutil.rmtree(root)
 subprocess.run(['/usr/bin/systemctl','--user','daemon-reload'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
 return {'deleted':True}

def main():
 if os.geteuid()!=0 or len(sys.argv) not in [3,4]:raise RuntimeError('invalid_invocation')
 operation,number=sys.argv[1:3]
 if operation not in ['list','purge'] or not re.fullmatch(r'[1-9][0-9]{0,8}',number):raise RuntimeError('invalid_request')
 records=json.loads(pathlib.Path('/etc/luxipanel/hosting/accounts.json').read_text());records=records.values() if isinstance(records,dict) else records
 account=next((a for a in records if str(a.get('id'))==number),None)
 if not account or not re.fullmatch(r'hp[a-f0-9]{20}',account.get('username','')) or account.get('homeRoot')!='/home/'+account['username']:raise RuntimeError('invalid_identity')
 user=pwd.getpwnam(account['username']);home=pathlib.Path(user.pw_dir)
 if str(home)!=account['homeRoot'] or user.pw_uid<1000:raise RuntimeError('invalid_identity')
 if any((home/p).is_symlink() for p in ['.luxisoft','.luxisoft/deployments','.local','.local/share','.local/share/containers','.local/share/containers/storage','.local/share/containers/storage/volumes','.config','.config/containers','.config/containers/systemd']):raise RuntimeError('unsafe_storage_path')
 if operation=='list':return {'version':1,'items':inventory(home)}
 os.environ.update(HOME=str(home),PATH='/usr/local/bin:/usr/bin:/bin',XDG_RUNTIME_DIR='/run/user/'+str(user.pw_uid),DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/'+str(user.pw_uid)+'/bus')
 os.initgroups(user.pw_name,user.pw_gid);os.setgid(user.pw_gid);os.setuid(user.pw_uid)
 return purge(home,sys.argv[3].replace('-',''))
if __name__=='__main__':
 try:print(json.dumps(main()))
 except Exception:print(json.dumps({'error':'storage_inventory_unavailable'}));sys.exit(1)
