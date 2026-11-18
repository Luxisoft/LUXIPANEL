#!/usr/bin/python3
"""Read a published Caddy image's static files without changing the tenant.

Operator-only migration tool. Never exports volumes or environment variables.
"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile


def main():
    if os.geteuid() != 0 or len(sys.argv) != 6:
        raise ValueError('invalid_invocation')
    provider, account, project, container, output = sys.argv[1:]
    for ref in (provider, account, project):
        if str(uuid.UUID(ref)) != ref:
            raise ValueError('invalid_reference')
    if not re.fullmatch(r'luxi-' + project.replace('-', '') + r'-(?:production|preview)-[a-f0-9]{8}-[a-z][a-z0-9-]{0,29}', container):
        raise ValueError('foreign_container')
    username = 'hp' + hashlib.sha256((provider + ':' + account).encode()).hexdigest()[:20]
    user = pwd.getpwnam(username)
    command = ['/usr/bin/sudo', '-n', '-u', username, '/usr/bin/env', 'XDG_RUNTIME_DIR=/run/user/' + str(user.pw_uid), '/usr/bin/podman']
    info = json.loads(subprocess.check_output(command + ['inspect', container], timeout=30))[0]
    if info.get('Mounts'):
        raise ValueError('container_has_persistent_mounts_review_required')
    with tempfile.TemporaryDirectory(prefix='lxp-static-export-') as staging:
        os.chown(staging, user.pw_uid, user.pw_gid)
        subprocess.run(command + ['cp', container + ':/srv/public/.', staging], check=True, timeout=60)
        if not (Path(staging) / 'index.html').is_file():
            raise ValueError('static_index_missing')
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(Path(staging).rglob('*')):
                if file.is_symlink():
                    raise ValueError('static_symlink')
                if file.is_file():
                    archive.write(file, str(file.relative_to(staging)))
    result = Path(output)
    result.chmod(0o644)
    print(json.dumps({'bytes': result.stat().st_size, 'sha256': hashlib.sha256(result.read_bytes()).hexdigest(), 'image': info['Image']}))


if __name__ == '__main__':
    main()
