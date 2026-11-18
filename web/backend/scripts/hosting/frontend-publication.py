#!/usr/bin/python3
"""Install immutable static publications on a HOSTING frontend target.

Invoked by the authenticated provider service, as root. Paths and nginx syntax
are derived here; API clients cannot submit commands, certificates or paths.
Old releases and unique backups are retained for recovery.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid
import zipfile

ROOT = Path('/var/www/luxisoft/published')
STATE = Path('/etc/luxipanel/hosting/frontend-publications')
AVAILABLE = Path('/etc/nginx/sites-available')
ENABLED = Path('/etc/nginx/sites-enabled')
BACKUPS = Path('/var/backups/luxipanel-frontend-publications')
HOST = re.compile(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')
SHA = re.compile(r'[a-f0-9]{64}$')


def validate(request):
    for key in ('providerId', 'accountId', 'projectId', 'versionId'):
        if str(uuid.UUID(request[key])) != request[key]:
            raise ValueError('invalid_reference')
    if not SHA.fullmatch(request['sha256']):
        raise ValueError('invalid_digest')
    hosts = request['hosts']
    if not isinstance(hosts, list) or not 1 <= len(hosts) <= 30:
        raise ValueError('invalid_hosts')
    if len(set(hosts)) != len(hosts) or any(not isinstance(h, str) or not HOST.fullmatch(h) for h in hosts):
        raise ValueError('invalid_hosts')
    if request.get('canonicalHost') and request['canonicalHost'] not in hosts:
        raise ValueError('invalid_canonical_host')
    if not isinstance(request.get('targetId'), str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,100}', request['targetId']):
        raise ValueError('invalid_target')
    return hashlib.sha256((':'.join(request[k] for k in ('providerId', 'accountId', 'projectId'))).encode()).hexdigest()


def extract(archive, destination):
    count = total = 0
    seen = set()
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            name = entry.filename.rstrip('/')
            if not name:
                continue
            parts = name.split('/')
            mode = entry.external_attr >> 16
            if entry.flag_bits & 1 or '\\' in name or any(p in ('', '.', '..') for p in parts):
                raise ValueError('unsafe_archive_path')
            if name in seen:
                raise ValueError('duplicate_archive_path')
            seen.add(name)
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) and not (stat.S_ISREG(mode) or stat.S_ISDIR(mode))):
                raise ValueError('unsafe_archive_type')
            if entry.is_dir():
                continue
            count += 1
            total += entry.file_size
            if count > 10000 or entry.file_size > 16 * 1024**2 or total > 128 * 1024**2:
                raise ValueError('archive_limit')
            target = destination.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with source.open(entry) as src, target.open('xb') as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
            target.chmod(0o644)
    if not (destination / 'index.html').is_file():
        raise ValueError('index_missing')


def certificate(host):
    # Reuse certificates already provisioned by the SSL module. No ACME request
    # or DNS mutation is hidden inside publication.
    name = 'store-wildcard.luxisoft.com' if host.endswith('.luxisoft.com') else host.removeprefix('www.')
    root = Path('/etc/letsencrypt/live') / name
    for file in ('fullchain.pem', 'privkey.pem'):
        if not (root / file).is_file():
            raise ValueError('frontend_certificate_missing:' + host)
    return root


def config(request, host, public):
    cert = certificate(host)
    marker = f"# LUXIPANEL_FRONTEND {request['providerId']}:{request['accountId']}:{request['projectId']}"
    redirect = f"    return 301 https://{request['canonicalHost']}$request_uri;" if request.get('canonicalHost') and host.startswith('www.') and host != request['canonicalHost'] else ''
    return f'''{marker}
server {{
    listen 80;
    listen [::]:80;
    server_name {host};
    location ^~ /.well-known/acme-challenge/ {{ root /var/www/certbot; }}
    location / {{ return 301 https://$host$request_uri; }}
}}
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name {host};
    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    root {public};
    index index.html;
    add_header X-Luxi-Frontend-Release "{request['versionId']}" always;
    add_header X-Luxi-Static-Sha256 "{request['sha256']}" always;
    add_header X-Content-Type-Options nosniff always;
{redirect}
    location ~ ^/(sw|registerSW)\\.js$ {{
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate, no-transform" always;
        add_header CDN-Cache-Control no-store always;
    }}
    location / {{ try_files $uri $uri/ /index.html; }}
}}
'''


def run(*argv):
    subprocess.run(argv, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)


def atomic_json(file, value):
    staged = file.with_suffix('.next')
    staged.write_text(json.dumps(value, sort_keys=True))
    staged.chmod(0o600)
    staged.replace(file)


def publication(request, archive=None, remove=False):
    identity = validate(request)
    for directory in (ROOT, STATE, BACKUPS):
        directory.mkdir(parents=True, exist_ok=True)
        if directory.is_symlink():
            raise ValueError('unsafe_publication_root')
    with (STATE / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        record = STATE / (identity + '.json')
        previous = json.loads(record.read_text()) if record.exists() else None
        if previous and previous['targetId'] != request['targetId']:
            raise ValueError('publication_target_conflict')
        if remove and not previous:
            return {'removed': True, 'alreadyRemoved': True}
        marker = f"# LUXIPANEL_FRONTEND {request['providerId']}:{request['accountId']}:{request['projectId']}"
        hosts = sorted(set(request['hosts']) | set(previous['hosts'] if previous else []))
        # Existing configs may only be adopted explicitly by a local migration
        # operator. A bearer API request never sets adoptionHashes.
        adoption = request.get('adoptionHashes', {})
        files = []
        for host in hosts:
            file = AVAILABLE / host
            if file.exists():
                content = file.read_text()
                if not content.startswith(marker + '\n') and hashlib.sha256(content.encode()).hexdigest() != adoption.get(host):
                    raise ValueError('foreign_nginx_configuration:' + host)
            enabled = ENABLED / host
            if enabled.exists() and (not enabled.is_symlink() or enabled.resolve() != file.resolve()):
                raise ValueError('foreign_enabled_configuration:' + host)
            files.append((file, enabled))
        if not remove:
            if not archive or archive.is_symlink() or not archive.is_file() or archive.stat().st_size > 32 * 1024**2:
                raise ValueError('invalid_archive')
            if hashlib.sha256(archive.read_bytes()).hexdigest() != request['sha256']:
                raise ValueError('archive_hash_mismatch')
            release = ROOT / identity / (request['versionId'] + '-' + request['sha256'])
            if release.exists():
                if not (release / 'manifest.json').is_file() or json.loads((release / 'manifest.json').read_text())['sha256'] != request['sha256']:
                    raise ValueError('release_conflict')
            else:
                release.parent.mkdir(parents=True, exist_ok=True)
                stage = Path(tempfile.mkdtemp(prefix='.stage-', dir=release.parent))
                try:
                    public = stage / 'public'
                    public.mkdir(mode=0o755)
                    extract(archive, public)
                    (stage / 'manifest.json').write_text(json.dumps(request, sort_keys=True))
                    stage.chmod(0o755)
                    stage.rename(release)
                finally:
                    if stage.exists():
                        shutil.rmtree(stage)
            generated = {host: config(request, host, release / 'public') for host in request['hosts']}
        else:
            generated = {}
        backup = Path(tempfile.mkdtemp(prefix=identity[:16] + '-', dir=BACKUPS))
        saved = []
        for file, enabled in files:
            saved.append((file, enabled, file.exists(), enabled.is_symlink()))
            if file.exists():
                shutil.copy2(file, backup / file.name)
        if record.exists():
            shutil.copy2(record, backup / 'publication.json')
        try:
            for file, enabled in files:
                if file.name in generated:
                    temp = file.with_suffix('.frontend-next')
                    temp.write_text(generated[file.name])
                    temp.chmod(0o644)
                    temp.replace(file)
                    if not enabled.is_symlink():
                        enabled.symlink_to(file)
                else:
                    enabled.unlink(missing_ok=True)
                    file.unlink(missing_ok=True)
            run('/usr/sbin/nginx', '-t')
            run('/usr/bin/systemctl', 'reload', 'nginx')
            if remove:
                record.unlink(missing_ok=True)
            else:
                atomic_json(record, {**{k: v for k, v in request.items() if k != 'adoptionHashes'}, 'release': str(release), 'backup': str(backup)})
        except BaseException:
            for file, enabled, existed, was_enabled in saved:
                enabled.unlink(missing_ok=True)
                if existed:
                    shutil.copy2(backup / file.name, file)
                else:
                    file.unlink(missing_ok=True)
                if was_enabled:
                    enabled.symlink_to(file)
            run('/usr/sbin/nginx', '-t')
            run('/usr/bin/systemctl', 'reload', 'nginx')
            raise
        return {'removed': remove, 'targetId': request['targetId'], 'versionId': request['versionId'], 'sha256': request['sha256'], 'backup': str(backup)}


def main():
    if os.geteuid() != 0 or len(sys.argv) not in (3, 4):
        raise ValueError('invalid_invocation')
    operation, request_path = sys.argv[1:3]
    request_file = Path(request_path)
    if request_file.is_symlink() or not request_file.is_file() or request_file.stat().st_size > 32768:
        raise ValueError('invalid_request')
    request = json.loads(request_file.read_text())
    if operation not in ('publish', 'remove'):
        raise ValueError('invalid_operation')
    result = publication(request, Path(sys.argv[3]) if len(sys.argv) == 4 else None, operation == 'remove')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
