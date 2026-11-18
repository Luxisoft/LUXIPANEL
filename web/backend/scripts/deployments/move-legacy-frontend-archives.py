#!/usr/bin/python3
"""Preserve obsolete frontend release/Expo caches on FRONTEND, then unlink verified copies.
Only immutable release ZIPs and finished Expo preview artifacts are eligible.
Source repositories, source ZIPs, configuration and active jobs are excluded.
"""
import hashlib,json,pathlib,re,shlex,subprocess,sys
BASE=pathlib.Path('/etc/luxipanel/hosting')
DEST='/var/www/luxisoft/retired-backend-assets-20261118/legacy-hosting-cache'
import os
config_file = pathlib.Path.home() / '.config/luxipanel/archive-ssh.json'
archive_host = os.environ.get('LUXIPANEL_ARCHIVE_SSH_HOST')
settings = {} if archive_host or not config_file.exists() else json.loads(config_file.read_text())
archive_host = archive_host or settings.get('host', '')
identity = os.environ.get('LUXIPANEL_ARCHIVE_SSH_IDENTITY') or settings.get('identity')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.@_-]*', archive_host): raise ValueError('invalid SSH destination')
SSH=['ssh','-o','BatchMode=yes']
if identity:
 if not pathlib.Path(identity).is_absolute(): raise ValueError('absolute SSH identity path required')
 SSH.extend(['-F','/dev/null','-i',identity])
SSH.append(archive_host)
RELEASE=re.compile(r'deployments/[a-f0-9]{64}/releases/[a-f0-9-]{36}/[a-z][a-z0-9-]{0,29}-([a-f0-9]{64})\.zip')
PREVIEW=re.compile(r'expo/[a-f0-9]{64}/jobs/[a-f0-9-]{36}/preview\.json')
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def main():
 rows=[]
 for folder in ('deployments','expo'):
  for file in (BASE/folder).rglob('*'):
   relative=str(file.relative_to(BASE));release=RELEASE.fullmatch(relative)
   if not release and not PREVIEW.fullmatch(relative):continue
   if file.resolve()!=file or not file.is_file():raise ValueError('unsafe_archive_path')
   if file.stat().st_size>40*1024*1024:raise ValueError('archive_limit')
   sha=digest(file)
   if release and sha!=release[1]:raise ValueError('release_hash_mismatch')
   if not release:
    state=json.loads((file.parent/'state.json').read_text())
    if state.get('status') not in ('finished','failed','cancelled'):raise ValueError('active_preview_job')
    if not isinstance(json.loads(file.read_text()),dict):raise ValueError('invalid_preview_archive')
   rows.append({'path':relative,'sha256':sha,'bytes':file.stat().st_size})
 if not rows:print(json.dumps({'moved':0,'archives':[]}));return
 subprocess.run(SSH+['mkdir -p '+shlex.quote(DEST)+' && chmod 700 '+shlex.quote(DEST)],check=True)
 transport=shlex.join(SSH[:-1])
 subprocess.run(['rsync','-a','--no-owner','--no-group','--files-from=-','-e',transport,str(BASE)+'/',SSH[-1]+':'+DEST+'/'],input='\n'.join(row['path'] for row in rows)+'\n',text=True,check=True)
 program="import hashlib,json,pathlib,sys; rows=json.load(sys.stdin); root=pathlib.Path("+repr(DEST)+"); assert all((root/r['path']).is_file() and hashlib.sha256((root/r['path']).read_bytes()).hexdigest()==r['sha256'] for r in rows); print('verified')"
 result=subprocess.run(SSH+['python3 -c '+shlex.quote(program)],input=json.dumps(rows),text=True,capture_output=True,check=True)
 if result.stdout.strip()!='verified':raise ValueError('remote_verification_failed')
 for row in rows:
  file=BASE/row['path']
  if file.resolve()!=file or digest(file)!=row['sha256']:raise ValueError('archive_changed')
  file.unlink()
 print(json.dumps({'moved':len(rows),'destination':DEST,'archives':rows}))
if __name__=='__main__':main()
