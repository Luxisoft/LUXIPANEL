#!/usr/bin/env python3
"""Move the physical Luxisoft publication root on its frontend target."""
import argparse
import fcntl
import os
from pathlib import Path
import stat
import subprocess
import tempfile

OLD = Path('/var/www/luxisoft/published')
NEW = Path('/var/www/luxisoft/clients/published-sites')
STATE = Path('/etc/luxipanel/hosting/frontend-publications')
NGINX = Path('/etc/nginx')
HELPER = Path('/usr/lib/luxipanel/frontend-publication')


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def rewrite(path, data, reference):
    mode = reference.stat()
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.' + path.name + '.', delete=False) as handle:
        prepared = Path(handle.name)
        try:
            handle.write(data)
            handle.flush()
            os.fchown(handle.fileno(), mode.st_uid, mode.st_gid)
            os.fchmod(handle.fileno(), stat.S_IMODE(mode.st_mode))
            prepared.replace(path)
        finally:
            prepared.unlink(missing_ok=True)


def replacements():
    old = os.fsencode(OLD) + b'/'
    new = os.fsencode(NEW) + b'/'
    files = set(STATE.glob('*.json'))
    for folder in ('sites-available', 'sites-enabled'):
        for entry in (NGINX / folder).iterdir():
            if entry.is_file():
                physical = entry.resolve(strict=True)
                if physical.is_relative_to(NGINX):
                    files.add(physical)
    plan = []
    for path in sorted(files):
        if path.is_symlink():
            raise RuntimeError('Unexpected symlink in publication state')
        data = path.read_bytes()
        if old in data:
            plan.append((path, data, data.replace(old, new)))
    return plan


def migrate(helper, apply):
    if not OLD.is_dir() or OLD.is_symlink() or NEW.exists() or NEW.is_symlink():
        raise RuntimeError('Expected the original physical publication root')
    if not HELPER.is_file() or HELPER.is_symlink():
        raise RuntimeError('Expected a physical installed publication helper')
    candidate = helper.read_bytes()
    if candidate != HELPER.read_bytes().replace(os.fsencode(OLD), os.fsencode(NEW)):
        raise RuntimeError('The candidate must only change the installed physical root')
    with (STATE / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX if apply else fcntl.LOCK_SH)
        plan = replacements()
        if not apply:
            return {'config_count': len(plan), 'applied': False}
        NEW.parent.mkdir(parents=True, exist_ok=True)
        if NEW.parent.is_symlink() or not os.path.samefile(NEW.parent.resolve(), NEW.parent):
            raise RuntimeError('Unexpected publication parent')
        original = OLD.stat()
        installed = HELPER.read_bytes()
        if candidate != installed.replace(os.fsencode(OLD), os.fsencode(NEW)):
            raise RuntimeError('The published helper changed during cutover')
        changed, moved = [], False
        try:
            OLD.rename(NEW)
            moved = True
            now = NEW.stat()
            if (now.st_ino, now.st_dev, now.st_uid, now.st_gid, now.st_mode) != (
                    original.st_ino, original.st_dev, original.st_uid, original.st_gid, original.st_mode):
                raise RuntimeError('Publication directory identity changed')
            for path, before, after in plan:
                if path.read_bytes() != before:
                    raise RuntimeError('Publication configuration changed concurrently')
                rewrite(path, after, path)
                changed.append((path, before))
            rewrite(HELPER, candidate, HELPER)
            run('nginx', '-t')
            if str(OLD) + '/' in run('nginx', '-T'):
                raise RuntimeError('nginx still references the old publication root')
            run('systemctl', 'reload', 'nginx.service')
        except Exception:
            rewrite(HELPER, installed, HELPER)
            for path, before in reversed(changed):
                rewrite(path, before, path)
            if moved:
                NEW.rename(OLD)
            run('nginx', '-t')
            run('systemctl', 'reload', 'nginx.service')
            raise
    return {'config_count': len(plan), 'applied': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('helper', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(migrate(args.helper, args.apply))
