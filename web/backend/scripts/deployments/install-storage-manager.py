#!/usr/bin/python3
"""Add only the published inventory helper and its exact sudo command."""
import datetime,hashlib,json,os,pathlib,shutil,subprocess,tempfile
assert os.geteuid()==0
source=pathlib.Path(__file__).resolve().parent/'storage-inventory.py'
service=json.loads(pathlib.Path('/etc/luxipanel-deployment-runtime.json').read_text())['serviceUser']
assert service.isalnum() or all(c.isalnum() or c in '_-' for c in service)
backup=pathlib.Path('/var/backups/luxisoft-storage-manager-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
target=pathlib.Path('/usr/lib/luxipanel/storage-inventory');sudo=pathlib.Path('/etc/sudoers.d/luxipanel-storage-manager')
for file in [target,sudo]:
 if file.exists():shutil.copy2(file,backup/file.name)
rule=f'{service} ALL=(root) NOPASSWD: /usr/lib/luxipanel/storage-inventory\n'
fd,name=tempfile.mkstemp(dir=sudo.parent);os.close(fd)
try:
 pathlib.Path(name).write_text(rule);os.chmod(name,0o440);subprocess.run(['/usr/sbin/visudo','-cf',name],check=True)
 temporary=target.with_suffix('.manager-tmp');shutil.copyfile(source,temporary);os.chmod(temporary,0o755);os.chown(temporary,0,0);os.replace(temporary,target);os.replace(name,sudo)
finally:
 if os.path.exists(name):os.unlink(name)
(backup/'release.json').write_text(json.dumps({'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'helper':str(target)}))
print(json.dumps({'backup':str(backup),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}))
