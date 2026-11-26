#!/usr/bin/python3
"""Remove only managed frontend workspaces after their owning process exits."""
import json, os, pathlib, pwd, re, shutil, stat, time

def alive(root):
    try:
        lease=json.loads((root/'lease.json').read_text())
        info=pathlib.Path('/proc')/str(int(lease['pid']))/'stat'
        fields=info.read_text().rsplit(')',1)[1].strip().split()
        return fields[19]==str(lease['startTicks'])
    except (OSError,ValueError,KeyError,TypeError): return False

def collect(root, now=None):
    now=time.time() if now is None else now
    if root.resolve() != root or root.is_symlink() or not root.is_dir() or now-root.stat().st_mtime<180 or alive(root): return False
    shutil.rmtree(root)
    return True

def main():
    for user in pwd.getpwall():
        if not re.fullmatch(r'hp[a-f0-9]{20}',user.pw_name): continue
        base=pathlib.Path(user.pw_dir)/'.luxisoft/deployments'
        if not base.is_dir() or base.is_symlink(): continue
        for project in base.iterdir():
            if not re.fullmatch(r'[a-f0-9]{32}',project.name) or project.is_symlink(): continue
            scratch=project/'scratch'
            if scratch.is_dir() and not scratch.is_symlink():
                for job in scratch.iterdir():
                    if re.fullmatch(r'[a-f0-9-]{36}',job.name): collect(job)
    platform=pathlib.Path('/var/www/luxisoft/.cache/frontend-builds')
    if platform.is_dir() and not platform.is_symlink():
        for job in platform.iterdir():
            if re.fullmatch(r'job-[a-zA-Z0-9]+',job.name): collect(job)
    # ZIPs awaiting the trusted bridge are transient, never a release cache.
    config=pathlib.Path('/etc/luxipanel/hosting/deployments')
    if config.is_dir():
        for project in config.iterdir():
            if not re.fullmatch(r'[a-f0-9]{64}',project.name) or project.is_symlink(): continue
            jobs=project/'jobs'
            if not jobs.is_dir() or jobs.is_symlink(): continue
            for job in jobs.iterdir():
                if not re.fullmatch(r'[a-f0-9-]{36}',job.name) or job.is_symlink(): continue
                try:
                    state=json.loads((job/'state.json').read_text())
                    pid=int(state.get('supervisorPid',0))
                    if pid>0 and pathlib.Path('/proc',str(pid)).exists(): continue
                    collect(job/'static')
                    task=json.loads((job/'input.json').read_text())
                    username=task['username'];project_id=task['projectId'];version=task['versionId'];request=task['requestId']
                    if not re.fullmatch(r'hp[a-f0-9]{20}',username): continue
                    if not all(re.fullmatch(r'[a-f0-9-]{36}',value) for value in (project_id,version,request)): continue
                    if time.time()-(job/'input.json').stat().st_mtime<180: continue
                    user=pwd.getpwnam(username)
                    root=pathlib.Path(user.pw_dir)/'.luxisoft/deployments'/project_id.replace('-','')
                    if alive(root/'scratch'/request): continue
                    for part in task['snapshot']['manifest']['components']:
                        name=part['name']
                        if re.fullmatch(r'[a-z][a-z0-9-]{0,29}',name):
                            (root/'versions'/version/('static-'+name+'-'+request+'.zip')).unlink(missing_ok=True)
                except (OSError,ValueError,KeyError,TypeError): continue

if __name__=='__main__': main()
