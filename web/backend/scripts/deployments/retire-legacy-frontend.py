#!/usr/bin/python3
"""Admin migration: export a manifest-owned static image, then retire verified caches.
The caller must transfer and hash-verify every exported archive on FRONTEND before
calling retire. This tool is deliberately not registered in customer sudoers.
"""
import base64,hashlib,io,json,os,pathlib,pwd,re,subprocess,sys,tarfile,uuid,zipfile

def checked_uuid(value):
 if str(uuid.UUID(value))!=value:raise ValueError('invalid_reference')
 return value

def main():
 if os.geteuid()!=0 or len(sys.argv)!=8:raise ValueError('administrative_invocation_required')
 action,provider,account,project,version,component,username=sys.argv[1:]
 for value in (provider,account,project,version):checked_uuid(value)
 if not re.fullmatch(r'[a-z][a-z0-9-]{0,29}',component) or not re.fullmatch(r'hp[a-f0-9]{20}',username):raise ValueError('invalid_identity')
 if username!='hp'+hashlib.sha256((provider+':'+account).encode()).hexdigest()[:20]:raise ValueError('foreign_account')
 user=pwd.getpwnam(username)
 identity=hashlib.sha256((provider+':'+account+':'+project).encode()).hexdigest()
 manifest=pathlib.Path('/etc/luxipanel/hosting/deployments')/identity/'versions'/version/'manifest.json'
 if manifest.resolve()!=manifest:raise ValueError('unsafe_manifest')
 contents=json.loads(manifest.read_text())['manifest']['components']
 part=next((p for p in contents if p['name']==component),None)
 if not part or not (part['surface']=='static' or part['surface']=='http' and part.get('stack')=='static' and part.get('role')!='backend'):raise ValueError('not_a_static_component')
 root=pathlib.Path(user.pw_dir)/'.luxisoft/deployments'/project.replace('-','')/'versions'/version
 if root.resolve()!=root:raise ValueError('unsafe_version')
 images_file=root/'images.json';images=json.loads(images_file.read_text());image=images.get(component)
 if image and not re.fullmatch(r'sha256:[a-f0-9]{64}',image):raise ValueError('invalid_image')
 command=['/usr/sbin/runuser','-u',username,'--','/usr/bin/env','HOME='+user.pw_dir,'XDG_RUNTIME_DIR=/run/user/'+str(user.pw_uid),'/usr/bin/podman']
 def podman(args,**kw):return subprocess.run(command+args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120,**kw).stdout
 exists=bool(image) and subprocess.run(command+['image','exists',image],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 if action=='export':
  if not exists:
   print(json.dumps({'imageMissing':True}));return
  container='luxi-frontend-archive-'+uuid.uuid4().hex
  try:
   podman(['create','--network=none','--name',container,image])
   packed=podman(['cp',container+':/srv/public/.','-'])
   if len(packed)>140*1024*1024:raise ValueError('archive_too_large')
   archive=io.BytesIO();count=total=0;names=set()
   with tarfile.open(fileobj=io.BytesIO(packed)) as source,zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as target:
    for item in source:
     if item.isdir():continue
     name=item.name.removeprefix('./')
     if not item.isfile() or name.startswith('/') or '\\' in name or any(p in ('','.','..') for p in name.split('/')) or name in names:raise ValueError('unsafe_static_entry')
     total+=item.size;count+=1
     if total>134217728 or item.size>16777216 or count>10000:raise ValueError('static_limits')
     names.add(name);target.writestr(name,source.extractfile(item).read())
   if 'index.html' not in names:raise ValueError('index_missing')
   data=archive.getvalue()
   if len(data)>33554432:raise ValueError('archive_limit')
   print(json.dumps({'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'data':base64.b64encode(data).decode()}))
  finally:
   podman(['rm','--force',container])
 elif action=='retire':
  receipts=json.load(sys.stdin);allowed=set(receipts['verifiedRemoteDigests'])
  files=list(root.glob('static-'+component+'-*.zip'))
  if (not allowed and (files or exists)) or any(not re.fullmatch(r'[a-f0-9]{64}',sha) for sha in allowed):raise ValueError('remote_receipts_required')
  for file in files:
   if file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() not in allowed:raise ValueError('unverified_archive')
  if image:
   if image in [value for name,value in images.items() if name!=component]:raise ValueError('shared_backend_image')
   # Without force, Podman refuses an image still used by another container.
   if exists:podman(['rmi',image])
  for file in files:file.unlink()
  images.pop(component,None)
  temporary=images_file.with_suffix('.frontend-next');temporary.write_text(json.dumps(images));os.chmod(temporary,0o600);os.chown(temporary,user.pw_uid,user.pw_gid);temporary.replace(images_file)
  print(json.dumps({'retired':True,'archivesRemoved':len(files),'image':image}))
 else:raise ValueError('invalid_action')

if __name__=='__main__':main()
