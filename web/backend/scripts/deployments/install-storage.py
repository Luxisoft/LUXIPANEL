#!/usr/bin/python3
"""Install from a published release. Never change deployment/network wrappers."""
import hashlib,json,os,pathlib,shutil,subprocess
assert os.geteuid()==0
source=pathlib.Path(__file__).resolve().parent
lib=pathlib.Path('/usr/lib/luxipanel')
helper=lib/'storage-helper'
# Extend the host's existing container policy; preserve every default denial.
policy=json.loads(pathlib.Path('/usr/share/containers/seccomp.json').read_text())
for entry in policy['syscalls']:
 if entry.get('action')=='SCMP_ACT_ALLOW' and 'ioctl' in entry['names']:entry['names'].remove('ioctl')
policy['syscalls']=[e for e in policy['syscalls'] if e['names']]
# Errno rules take precedence over allow rules in libseccomp.
policy['syscalls'].append({'names':['ioctl'],'action':'SCMP_ACT_ALLOW'})
for request in [0x5820,0x6602]:policy['syscalls'].append({'names':['ioctl'],'action':'SCMP_ACT_ERRNO','errnoRet':1,'args':[{'index':1,'value':65535,'valueTwo':request,'op':'SCMP_CMP_MASKED_EQ'}]})
(lib/'storage-seccomp.json').write_text(json.dumps(policy));os.chmod(lib/'storage-seccomp.json',0o644)
# Preserve the installed network/egress wrapper and atomically update only its
# trusted original helper and digest. A source mismatch fails before replacing it.
guard=pathlib.Path('/etc/luxisoft-development-runtime/policy.json')
if guard.exists():
 config=json.loads(guard.read_text());original=pathlib.Path(config['originalHelper'])
 if hashlib.sha256(original.read_bytes()).hexdigest()!=config['originalHash']:raise RuntimeError('deployment_helper_integrity_failed')
 digest=hashlib.sha256((source/'deployment-helper.py').read_bytes()).hexdigest()
 destination=original.parent/('provider-helper-'+digest[:12]);shutil.copyfile(source/'deployment-helper.py',destination);os.chmod(destination,0o755);os.chown(destination,0,0)
 config['originalHelper']=str(destination);config['originalHash']=digest
 temporary=guard.with_suffix('.storage-tmp');temporary.write_text(json.dumps(config));os.chmod(temporary,0o600);os.chown(temporary,0,0);os.replace(temporary,guard)
else:
 shutil.copyfile(source/'deployment-helper.py',lib/'deployment-helper');os.chmod(lib/'deployment-helper',0o755)
shutil.copyfile(source/'deployment-tenant.mjs',lib/'deployment-tenant.mjs');os.chmod(lib/'deployment-tenant.mjs',0o755);os.chown(lib/'deployment-tenant.mjs',0,0)
shutil.copyfile(source/'storage-helper.py',helper);os.chmod(helper,0o755);os.chown(helper,0,0)
subprocess.run([helper,'init'],check=True)
unit=pathlib.Path('/etc/systemd/system/luxipanel-storage.service')
unit.write_text('''[Unit]
Description=Luxisoft quota-backed hosting storage
After=local-fs.target
Before=user@.service

[Service]
Type=oneshot
ExecStart=/usr/lib/luxipanel/storage-helper restore
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
''')
# Only the fixed helper, with its own identity and argument validation.
service=json.loads(pathlib.Path('/etc/luxipanel-deployment-runtime.json').read_text())['serviceUser']
sudo=pathlib.Path('/etc/sudoers.d/luxipanel-storage');sudo.write_text(f'{service} ALL=(root) NOPASSWD: /usr/lib/luxipanel/storage-helper\n');os.chmod(sudo,0o440)
subprocess.run(['/usr/sbin/visudo','-cf',str(sudo)],check=True)
subprocess.run(['/usr/bin/systemctl','daemon-reload'],check=True)
subprocess.run(['/usr/bin/systemctl','enable','--now','luxipanel-storage.service'],check=True)
print(json.dumps({'installed':True,'helperSha256':hashlib.sha256(helper.read_bytes()).hexdigest()}))
