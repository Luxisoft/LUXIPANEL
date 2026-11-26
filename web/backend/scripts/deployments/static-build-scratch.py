#!/usr/bin/python3
"""Give a static preview an ephemeral disk budget outside the tenant quota."""
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import tempfile

SIZE = 4 * 1024**3
HOST_RESERVE = 2 * 1024**3
DISK_ROOT = '/var/tmp'


def main(command):
    if (os.geteuid() != 0 or command[:2] != ['/usr/sbin/runuser', '-u']
            or command[3:6] != ['--', '/usr/bin/env', '-i']
            or command[-2:] != ['/usr/bin/node', '/usr/lib/luxipanel/deployment-tenant.mjs']
            or not re.fullmatch(r'hp[a-f0-9]{20}', command[2])):
        raise RuntimeError('invalid_build_supervisor')
    user = pwd.getpwnam(command[2])
    if user.pw_uid < 1000 or os.readlink('/proc/self/ns/mnt') == os.readlink('/proc/1/ns/mnt'):
        raise RuntimeError('invalid_build_namespace')
    if shutil.disk_usage(DISK_ROOT).free < SIZE + HOST_RESERVE:
        raise RuntimeError('host_build_disk_capacity')

    # procfs must expose the same PIDs as the builder. Rootless Podman asks
    # newuidmap to verify the owner of its child through /proc/<child>.
    subprocess.run(['/usr/bin/mount', '-t', 'proc', '-o', 'nosuid,nodev,noexec', 'proc', '/proc'], check=True)
    parent = Path(tempfile.mkdtemp(dir=DISK_ROOT, prefix='luxisoft-build-'))
    image = parent / 'scratch.img'
    mount = parent / 'volume'
    try:
        mount.mkdir()
        with image.open('xb') as backing:
            backing.truncate(SIZE)
        subprocess.run(['/usr/sbin/mkfs.ext4', '-q', '-m', '0', str(image)], check=True)
        subprocess.run(['/usr/bin/mount', '-o', 'loop,nodev,nosuid', str(image), str(mount)], check=True)
        try:
            image.unlink()
            parent.chmod(0o711)
            work = mount / 'work'
            work.mkdir(mode=0o700)
            os.chown(work, user.pw_uid, user.pw_gid)
            tenant = [*command[:-2], f'LUXISOFT_BUILD_SCRATCH={work}', *command[-2:]]
            return subprocess.run(tenant).returncode
        finally:
            subprocess.run(['/usr/bin/umount', '-l', str(mount)], check=True)
    finally:
        # Remove only supervisor-owned entries. Never walk tenant build output as root.
        image.unlink(missing_ok=True)
        if mount.exists():
            mount.rmdir()
        parent.rmdir()


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
