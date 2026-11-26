#!/usr/bin/python3
"""Install the static build delta on a guarded host and verify a real disposable mount."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pwd
import runpy
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
LIB = Path('/usr/lib/luxipanel')
GUARD = Path('/etc/luxisoft-development-runtime/policy.json')


def apply_delta(previous, current, installed, output):
    patch = subprocess.run(['diff', '-u', str(previous), str(current)], capture_output=True)
    if patch.returncode != 1:
        raise RuntimeError('release_delta_missing')
    shutil.copyfile(installed, output)
    subprocess.run(['patch', '--batch', '--forward', '--fuzz=0', str(output)],
                   input=patch.stdout, check=True)


def main(previous):
    guard = runpy.run_path(str(HERE / 'install-metered-helper.py'))
    read = guard['safe_root_file']
    write = guard['atomic_write']
    digest = guard['digest']
    if os.geteuid() or digest(read(guard['WRAPPER'])) != guard['WRAPPER_SHA256']:
        raise RuntimeError('guarded_host_required')
    with open('/run/lock/luxipanel-assistant-build.lock', 'r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        old_policy = read(GUARD)
        config = json.loads(old_policy)
        old = Path(config['originalHelper'])
        if old.parent != guard['RUNTIME'] or digest(read(old)) != config['originalHash']:
            raise RuntimeError('supervisor_policy_mismatch')
        tenant = LIB / 'deployment-tenant.mjs'
        scratch = LIB / 'static-build-scratch.py'
        old_tenant = read(tenant)
        old_scratch = read(scratch) if scratch.exists() else None
        backup = Path(tempfile.mkdtemp(prefix='luxisoft-static-build-', dir='/var/backups'))
        (backup / 'policy.json').write_bytes(old_policy)
        (backup / tenant.name).write_bytes(old_tenant)
        if old_scratch is not None:
            (backup / scratch.name).write_bytes(old_scratch)
        with tempfile.TemporaryDirectory() as temporary:
            stage = Path(temporary)
            for target, source in [(old, 'deployment-helper.py'), (tenant, tenant.name)]:
                if b'frontendScratchVersion' in read(target):
                    # Idempotent only if the installed file contains the source delta.
                    # Reverse against a temporary copy to verify the exact patched hunks.
                    apply_delta(HERE/source, previous/source, target, stage/(source+'.prior'))
                    shutil.copyfile(target, stage/source)
                else:
                    apply_delta(previous/source, HERE/source, target, stage/source)
            subprocess.run(['/usr/bin/node','--check',stage/tenant.name],check=True)
            compile((stage/'deployment-helper.py').read_bytes(), 'deployment-helper.py', 'exec')
            supervisor = (stage/'deployment-helper.py').read_bytes()
            installed = old.parent / ('provider-helper-' + digest(supervisor)[:12])
            if installed.exists() and read(installed) != supervisor:
                raise RuntimeError('supervisor_hash_collision')
            write(installed, supervisor, 0o755)
            try:
                write(tenant, (stage/tenant.name).read_bytes(), 0o755)
                write(scratch, (HERE/scratch.name).read_bytes(), 0o755)
                account = next(u for u in pwd.getpwall() if u.pw_name.startswith('hp')
                               and len(u.pw_name) == 22 and u.pw_uid >= 1000)
                # Mount a fixed test runner only inside this private namespace. This
                # exercises the installed scratch supervisor with no project or network.
                fixture = stage/'verify.mjs'
                fixture.write_text("""import fs from 'node:fs';
const dir=process.env.LUXISOFT_BUILD_SCRATCH, volume=fs.statfsSync(dir);
if(fs.readlinkSync('/proc/self')!==String(process.pid) || fs.statSync('/proc/self').uid!==process.getuid())throw Error('wrong_build_procfs');
if(process.getuid()===0 || volume.type!==0xef53 || volume.bsize*volume.blocks>4*1024**3 ||
  fs.statSync(dir).uid!==process.getuid())throw Error('wrong_build_volume');
fs.writeFileSync(dir+'/probe','ok',{flag:'wx'});console.log('static-build-volume-ok');""")
                subprocess.run(['/usr/bin/unshare','--mount','--propagation','private','--pid','--fork','--kill-child=KILL','--',
                                '/bin/sh','-ec','mount --bind "$1" "$2"; exec /usr/bin/python3 -I "$3" /usr/sbin/runuser -u "$4" -- /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/node "$2"',
                                'probe',fixture,tenant,scratch,account.pw_name],check=True,timeout=90)
                config.update(originalHelper=str(installed),originalHash=digest(supervisor))
                write(GUARD,json.dumps(config).encode(),0o600)
            except BaseException:
                write(GUARD,old_policy,0o600)
                write(tenant,old_tenant,0o755)
                if old_scratch is None:
                    scratch.unlink(missing_ok=True)
                else:
                    write(scratch,old_scratch,0o755)
                raise
        print(json.dumps({'backup':str(backup),'supervisor':digest(supervisor),'verifiedVolume':True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('previous', type=Path, help='Deployment scripts from the unmodified base release')
    main(parser.parse_args().previous.resolve())
