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
    redirects = request.get('redirects', {})
    if not isinstance(redirects, dict) or any(source not in hosts or target not in hosts or source == target for source, target in redirects.items()):
        raise ValueError('invalid_redirect')
    if request.get('versionNumber') is not None and (type(request['versionNumber']) is not int or request['versionNumber'] < 1):
        raise ValueError('invalid_version_number')
    routes = request.get('apiRoutes', [])
    if not isinstance(routes, list) or len(routes) > 10 or any(not re.fullmatch(r'/[a-zA-Z0-9_/-]+', p) for p in routes):
        raise ValueError('invalid_api_routes')
    proxy_hosts = request.get('proxyHosts', [])
    if not isinstance(proxy_hosts, list) or any(h not in hosts for h in proxy_hosts):
        raise ValueError('invalid_proxy_hosts')
    if (routes or proxy_hosts) and not re.fullmatch(r'http://(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):[1-9]\d{0,4}', request.get('backendOrigin', '')):
        raise ValueError('backend_origin_required')
    if not isinstance(request.get('targetId'), str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,100}', request['targetId']):
        raise ValueError('invalid_target')
    routing = request.get('localeRouting')
    if routing is not None:
        if not isinstance(routing, dict) or set(routing) != {'locales', 'defaultLocale', 'cookie'}:
            raise ValueError('invalid_locale_routing')
        locales = routing['locales']
        if not isinstance(locales, list) or not 1 <= len(locales) <= 10 or any(not isinstance(x, str) or not re.fullmatch('[a-z]{2}', x) for x in locales) or len(set(locales)) != len(locales) or routing['defaultLocale'] not in locales or not re.fullmatch('[a-z][a-z0-9-]{0,39}', routing['cookie']):
            raise ValueError('invalid_locale_routing')
    environment = request.get('environment', 'production')
    if environment not in ('preview', 'production'):
        raise ValueError('invalid_environment')
    identity = ':'.join(request[k] for k in ('providerId', 'accountId', 'projectId'))
    if environment == 'preview':
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,29}', request.get('component', '')) or any(not re.fullmatch(r'[a-z0-9-]+--v[0-9]+\.luxisoft\.com', host) for host in hosts):
            raise ValueError('invalid_preview')
        if not re.fullmatch(r'https?://[a-zA-Z0-9.:-]+/api/v1/deployment-frontend/authorize', request.get('previewAuthorizationUrl', '')):
            raise ValueError('preview_authorization_required')
        identity += ':preview:' + request['versionId']
    return hashlib.sha256(identity.encode()).hexdigest()


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
    if host in request.get('redirects', {}):
        redirect = f"    return 307 https://{request['redirects'][host]}$request_uri;"
    version_header = f"    add_header X-Luxi-Version {request['versionNumber']} always;" if request.get('versionNumber') else ''
    api_locations = ''.join(f'''    location {prefix.rstrip('/')}/ {{
        proxy_pass {request['backendOrigin']};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_hide_header X-Luxi-Project-Type;
        proxy_hide_header X-Luxi-Version;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }}
    location = {prefix.rstrip('/')} {{
        proxy_pass {request['backendOrigin']};
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header X-Luxi-Project-Type;
        proxy_hide_header X-Luxi-Version;
    }}
''' for prefix in request.get('apiRoutes', []))
    main_location = f'''    location / {{
        proxy_pass {request['backendOrigin']};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_hide_header X-Luxi-Project-Type;
        proxy_hide_header X-Luxi-Version;
        proxy_buffering off;
    }}''' if host in request.get('proxyHosts', []) else '    location / { try_files $uri $uri/ /index.html; }'
    if request.get('localeRouting') and host not in request.get('proxyHosts', []):
        routing = request['localeRouting']
        declarations = f"    set $lxp_locale {routing['defaultLocale']};\n"
        # Request values are tested against fixed validated literals, never interpolated.
        for locale in routing['locales']:
            declarations += f'    if ($http_accept_language ~* "^{locale}(?:[-,;]|$)") {{ set $lxp_locale {locale}; }}\n'
        for locale in routing['locales']:
            declarations += f'    if ($http_cookie ~* "(?:^|; *){routing["cookie"]}={locale}(?:;|$)") {{ set $lxp_locale {locale}; }}\n'
        for locale in routing['locales']:
            declarations += f'    if ($uri ~ "^/{locale}(?:/|$)") {{ set $lxp_locale {locale}; }}\n'
        exact = ''.join(f'    location = /{locale}/ {{ try_files /{locale}/index.html =404; }}\n' for locale in routing['locales'])
        main_location = declarations + '    location = / { return 302 /$lxp_locale/; }\n' + exact + '    location / {\n        if ($uri !~ "\\.[^/]+$") { return 301 /$lxp_locale/; }\n        try_files $uri =404;\n    }'
    preview_auth = ''
    if request.get('environment') == 'preview':
        notice_url = request['previewAuthorizationUrl'].removesuffix('/authorize') + '/subscription-notice'
        preview_auth = f'''    gzip off;
    sub_filter_once on;
    sub_filter '</head>' '<link rel="stylesheet" href="/__luxisoft/subscription-preview.css"><script defer src="/__luxisoft/subscription-preview.js"></script></head>';
    error_page 403 /__luxisoft/subscription-suspended.html;
    location ~ ^/__luxisoft/(subscription-preview\\.(js|css)|subscription-suspended\\.html)$ {{
        auth_request off;
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
    }}
    location = /__luxisoft/subscription-notice {{
        auth_request off;
        proxy_pass {notice_url};
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-Host $host;
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header X-Project-ID {request['projectId']};
        proxy_set_header X-Version-ID {request['versionId']};
        proxy_set_header X-Component {request['component']};
    }}
    auth_request /__lxp_frontend_auth;
    auth_request_set $lxp_preview_cookie $upstream_http_set_cookie;
    add_header Set-Cookie $lxp_preview_cookie always;
    add_header Cache-Control no-store always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location = /__lxp_frontend_auth {{
        internal;
        auth_request off;
        proxy_pass {request['previewAuthorizationUrl']};
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-Host $host;
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header X-Project-ID {request['projectId']};
        proxy_set_header X-Version-ID {request['versionId']};
        proxy_set_header X-Component {request['component']};
    }}'''
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
    add_header X-Luxi-Project-Type repository always;
{version_header}
    add_header X-Content-Type-Options nosniff always;
{redirect}
{api_locations}
{preview_auth}
    location ~ ^/(sw|registerSW)\\.js$ {{
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate, no-transform" always;
        add_header CDN-Cache-Control no-store always;
    }}
{main_location}
}}
'''


def run(*argv):
    subprocess.run(argv, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)


def atomic_json(file, value):
    staged = file.with_suffix('.next')
    staged.write_text(json.dumps(value, sort_keys=True))
    staged.chmod(0o600)
    staged.replace(file)


def retain_archive(request, archive, release):
    if not archive or archive.is_symlink() or not archive.is_file() or archive.stat().st_size > 32 * 1024**2:
        raise ValueError('invalid_archive')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != request['sha256']:
        raise ValueError('archive_hash_mismatch')
    uid = int(os.environ.get('SUDO_UID', os.getuid()))
    if uid < 1000:
        raise ValueError('administrative_transport_user_required')
    target = release / 'artifact.zip'
    if target.is_symlink():
        raise ValueError('unsafe_retained_archive')
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != request['sha256']:
            raise ValueError('retained_archive_conflict')
    else:
        stage = release / ('.archive-' + uuid.uuid4().hex)
        try:
            shutil.copyfile(archive, stage)
            stage.chmod(0o600)
            stage.replace(target)
        finally:
            stage.unlink(missing_ok=True)
    # Only the authenticated administrative transport user may read private
    # preview archives. They are outside public/, never reachable by nginx.
    os.chown(target, uid, -1)
    target.chmod(0o600)


def publication(request, archive=None, remove=False, stage_only=False, retain_only=False):
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
        if stage_only and previous and previous.get('active', True):
            raise ValueError('publication_already_active')
        if retain_only:
            if not previous or previous['versionId'] != request['versionId'] or previous['sha256'] != request['sha256']:
                raise ValueError('retained_publication_conflict')
            release = ROOT / identity / (request['versionId'] + '-' + request['sha256'])
            if release.is_symlink() or not (release / 'public').is_dir():
                raise ValueError('release_missing')
            retain_archive(request, archive, release)
            return {'retained': True, 'versionId': request['versionId'], 'sha256': request['sha256']}
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
            retain_archive(request, archive, release)
            headers = release / 'headers.conf'
            if not headers.exists():
                headers.write_text(f"add_header X-Luxi-Frontend-Release {request['versionId']} always;\nadd_header X-Luxi-Static-Sha256 {request['sha256']} always;\nadd_header X-Luxi-Project-Type repository always;\n")
            if stage_only:
                atomic_json(record, {**{k: v for k, v in request.items() if k != 'adoptionHashes'}, 'release': str(release), 'active': False})
                return {'staged': True, 'active': False, 'targetId': request['targetId'], 'versionId': request['versionId'], 'sha256': request['sha256']}
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
        active = ROOT / identity / 'current'
        active_before = os.readlink(active) if active.is_symlink() else None
        if active.exists() and not active.is_symlink():
            raise ValueError('foreign_active_release')
        try:
            if not remove:
                next_link = active.with_name('.active-' + uuid.uuid4().hex)
                next_link.symlink_to(release.name)
                next_link.replace(active)
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
                atomic_json(record, {**{k: v for k, v in request.items() if k != 'adoptionHashes'}, 'release': str(release), 'backup': str(backup), 'active': True})
        except BaseException:
            if not remove:
                active.unlink(missing_ok=True)
                if active_before is not None:
                    active.symlink_to(active_before)
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


def store_artifact(request, archive):
    for key in ('providerId', 'accountId', 'projectId', 'versionId'):
        if str(uuid.UUID(request[key])) != request[key]:
            raise ValueError('invalid_reference')
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,29}', request['component']) or not SHA.fullmatch(request['sha256']):
        raise ValueError('invalid_artifact')
    if not archive or archive.is_symlink() or not archive.is_file() or not 0 < archive.stat().st_size <= 32 * 1024**2 or hashlib.sha256(archive.read_bytes()).hexdigest() != request['sha256']:
        raise ValueError('invalid_archive')
    identity = hashlib.sha256(':'.join(request[k] for k in ('providerId','accountId','projectId')).encode()).hexdigest()
    destination = ROOT / identity / 'artifacts' / request['versionId']
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.resolve() != destination:
        raise ValueError('unsafe_artifact_path')
    uid = int(os.environ.get('SUDO_UID', os.getuid()))
    if uid < 1000:
        raise ValueError('administrative_transport_user_required')
    os.chown(destination, uid, -1)
    destination.chmod(0o700)
    target = destination / (request['component'] + '-' + request['sha256'] + '.zip')
    if target.is_symlink():
        raise ValueError('unsafe_artifact_path')
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != request['sha256']:
            raise ValueError('artifact_conflict')
    else:
        stage = destination / ('.next-' + uuid.uuid4().hex)
        try:
            shutil.copyfile(archive, stage)
            stage.chmod(0o600)
            os.chown(stage, uid, -1)
            stage.replace(target)
        finally:
            stage.unlink(missing_ok=True)
    return {'retained': True, 'sha256': request['sha256'], 'bytes': archive.stat().st_size}


def main():
    if os.geteuid() != 0 or len(sys.argv) not in (3, 4):
        raise ValueError('invalid_invocation')
    operation, request_path = sys.argv[1:3]
    request_file = Path(request_path)
    if request_file.is_symlink() or not request_file.is_file() or request_file.stat().st_size > 32768:
        raise ValueError('invalid_request')
    request = json.loads(request_file.read_text())
    if operation == 'artifact' and len(sys.argv) == 4:
        print(json.dumps(store_artifact(request, Path(sys.argv[3]))))
        return
    if operation not in ('publish', 'remove', 'stage', 'retain'):
        raise ValueError('invalid_operation')
    result = publication(request, Path(sys.argv[3]) if len(sys.argv) == 4 else None, operation == 'remove', operation == 'stage', operation == 'retain')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
