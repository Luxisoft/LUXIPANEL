#!/usr/bin/python3
"""Operator-only split of a retained legacy Node HTTP publication.

Exports only fixed public roots and explicitly enumerated public GET pages.
The API gets an immutable derived image with a transport guard. Tenant source,
volumes, environment, ports and original images remain intact. Never API input.
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
import urllib.request
import uuid
import time
import urllib.error
import zipfile


BACKUPS = Path('/var/backups/luxipanel-http-splits')

def run(command, **kwargs):
    return subprocess.check_output(command, timeout=kwargs.pop('timeout', 60), stderr=subprocess.PIPE, **kwargs)


def context(request):
    for field in ('providerId', 'accountId', 'projectId'):
        if str(uuid.UUID(request[field])) != request[field]:
            raise ValueError('invalid_reference')
    project = request['projectId'].replace('-', '')
    container = request['container']
    if not re.fullmatch('luxi-' + project + r'-(production|preview)-[a-f0-9]{8}-[a-z][a-z0-9-]{0,29}', container):
        raise ValueError('foreign_container')
    username = 'hp' + hashlib.sha256((request['providerId'] + ':' + request['accountId']).encode()).hexdigest()[:20]
    user = pwd.getpwnam(username)
    if user.pw_dir != '/home/' + username:
        raise ValueError('invalid_home')
    env = ['/usr/bin/sudo', '-n', '-u', username, '/usr/bin/env', 'XDG_RUNTIME_DIR=/run/user/' + str(user.pw_uid), 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/' + str(user.pw_uid) + '/bus']
    podman = env + ['/usr/bin/podman']
    info = json.loads(run(podman + ['inspect', container]))[0]
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', request['expectedImage']) or info['Image'].removeprefix('sha256:') != request['expectedImage'].removeprefix('sha256:') or info.get('Mounts'):
        raise ValueError('container_changed_or_has_mounts')
    return user, env, podman, info


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def export(request, output):
    user, _, podman, info = context(request)
    source = request['publicRoot']
    if source not in ('/srv/public', '/app/web/dist', '/app/dist/client'):
        raise ValueError('invalid_public_root')
    output = Path(output)
    if output.exists() or output.is_symlink():
        raise ValueError('output_exists')
    with tempfile.TemporaryDirectory(prefix='lxp-public-export-') as folder:
        os.chown(folder, user.pw_uid, user.pw_gid)
        run(podman + ['cp', request['container'] + ':' + source + '/.', folder])
        root = Path(folder)
        pages = request.get('pages', [])
        if pages:
            host = request.get('hostname', '')
            if not re.fullmatch(r'[a-z0-9.-]+', host):
                raise ValueError('invalid_hostname')
            ports = info['NetworkSettings']['Ports']['8080/tcp']
            if len(ports) != 1 or ports[0]['HostIp'] != '127.0.0.1':
                raise ValueError('invalid_port')
            origin = 'http://127.0.0.1:' + str(int(ports[0]['HostPort']))
            opener = urllib.request.build_opener(NoRedirect())
            for page in pages:
                if not re.fullmatch(r'/(?:[a-z]{2}/|robots\.txt|sitemap\.xml)', page):
                    raise ValueError('invalid_public_page')
                response = opener.open(urllib.request.Request(origin + page, headers={'Host': host}), timeout=20)
                data = response.read(2 * 1024 * 1024 + 1)
                if response.status != 200 or len(data) > 2 * 1024 * 1024:
                    raise ValueError('invalid_public_response')
                target = root / (page[1:] + 'index.html' if page.endswith('/') else page[1:])
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            if not (root / 'index.html').exists():
                shutil.copyfile(root / 'es/index.html', root / 'index.html')
        if not (root / 'index.html').is_file():
            raise ValueError('static_index_missing')
        files = sorted(root.rglob('*'))
        if len(files) > 20000 or sum(p.stat().st_size for p in files if p.is_file()) > 128 * 1024 * 1024:
            raise ValueError('public_export_too_large')
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in files:
                if file.is_symlink():
                    raise ValueError('static_symlink')
                if file.is_file():
                    archive.write(file, str(file.relative_to(root)))
    output.chmod(0o644)
    return {'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size, 'image': info['Image']}


def api_only(request):
    user, env, podman, info = context(request)
    if any(value.startswith('NODE_OPTIONS=') and value != 'NODE_OPTIONS=' for value in info['Config'].get('Env', [])):
        raise ValueError('existing_node_options_requires_review')
    health_path = request.get('healthPath', '/health')
    if not re.fullmatch(r'/(?:health|healthz|api/[a-zA-Z0-9/_-]+)', health_path):
        raise ValueError('invalid_health_path')
    ports = info['NetworkSettings']['Ports']['8080/tcp']
    if len(ports) != 1 or ports[0]['HostIp'] != '127.0.0.1':
        raise ValueError('invalid_port')
    origin = 'http://127.0.0.1:' + str(int(ports[0]['HostPort']))
    def status(path):
        try:
            with urllib.request.build_opener(NoRedirect()).open(origin + path, timeout=5) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code
    before_status = status(health_path)
    guard = Path(__file__).with_name('backend-only.mjs')
    if not guard.is_file():
        raise ValueError('missing_backend_guard')
    unit = Path(user.pw_dir) / '.config/containers/systemd' / (request['container'] + '.container')
    if unit.is_symlink() or not unit.is_file():
        raise ValueError('missing_quadlet')
    original = unit.read_text()
    image_lines = re.findall(r'^Image=(.*)$', original, re.M)
    if len(image_lines) != 1 or image_lines[0].removeprefix('sha256:') != info['Image'].removeprefix('sha256:') or 'Environment=NODE_OPTIONS' in original:
        raise ValueError('quadlet_image_changed')
    backup = BACKUPS / (request['container'] + '-' + uuid.uuid4().hex)
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(unit, backup / 'original.container')
    with tempfile.TemporaryDirectory(prefix='lxp-backend-image-') as folder:
        os.chown(folder, user.pw_uid, user.pw_gid)
        root = Path(folder)
        shutil.copyfile(guard, root / 'backend-only.mjs')
        (root / 'Containerfile').write_text('FROM ' + info['Image'] + '\nCOPY backend-only.mjs /opt/luxipanel/backend-only.mjs\nENV NODE_OPTIONS=--import=/opt/luxipanel/backend-only.mjs\n')
        for file in root.iterdir():
            file.chmod(0o644)
        run(podman + ['build', '--network=none', '--pull=never', '--iidfile', str(root / 'image.id'), '-f', str(root / 'Containerfile'), folder], timeout=180)
        image = (root / 'image.id').read_text().strip()
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
            raise ValueError('invalid_derived_image')
    systemctl = env + ['/usr/bin/systemctl', '--user']
    service = request['container'] + '.service'
    staged = unit.with_suffix('.split-next')
    try:
        staged.write_text(original.replace('Image=' + image_lines[0] + '\n', 'Image=' + image + '\n', 1))
        os.chown(staged, user.pw_uid, user.pw_gid)
        staged.chmod(0o600)
        staged.replace(unit)
        run(systemctl + ['daemon-reload'])
        run(systemctl + ['restart', service], timeout=90)
        final = json.loads(run(podman + ['inspect', request['container']]))[0]
        if final['Image'].removeprefix('sha256:') != image.removeprefix('sha256:') or not final['State']['Running']:
            raise ValueError('backend_split_not_running')
        for attempt in range(20):
            try:
                if status('/') == 404 and status(health_path) == before_status:
                    break
            except OSError:
                pass
            time.sleep(0.5)
        else:
            raise ValueError('backend_split_health_failed')
    except BaseException:
        shutil.copy2(backup / 'original.container', unit)
        os.chown(unit, user.pw_uid, user.pw_gid)
        run(systemctl + ['daemon-reload'])
        run(systemctl + ['restart', service], timeout=90)
        raise
    result = {'container': request['container'], 'originalImage': info['Image'], 'image': image, 'backup': str(backup), 'apiStatus': before_status, 'uiStatus': 404}
    (backup / 'receipt.json').write_text(json.dumps(result))
    return result


def main():
    if os.geteuid() != 0 or len(sys.argv) not in (3, 4):
        raise ValueError('invalid_invocation')
    operation, file = sys.argv[1:3]
    request = json.loads(Path(file).read_text())
    if operation == 'export' and len(sys.argv) == 4:
        result = export(request, sys.argv[3])
    elif operation == 'api-only' and len(sys.argv) == 3:
        result = api_only(request)
    else:
        raise ValueError('invalid_operation')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
