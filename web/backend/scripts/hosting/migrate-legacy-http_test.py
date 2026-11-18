import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('split',Path(__file__).with_name('migrate-legacy-http.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class SplitTests(unittest.TestCase):
    def exercise(self, healthy):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);container='luxi-fixture-production-12345678-app';old='sha256:'+'a'*64;new='sha256:'+'b'*64
            unit=root/'.config/containers/systemd'/f'{container}.container';unit.parent.mkdir(parents=True)
            original=f'[Container]\nImage={old}\nEnvironmentFile=/private/env\nPublishPort=127.0.0.1:18080:8080\n'
            unit.write_text(original)
            info={'Image':old.removeprefix('sha256:'),'Config':{'Env':[]},'NetworkSettings':{'Ports':{'8080/tcp':[{'HostIp':'127.0.0.1','HostPort':'18080'}]}}}
            calls=[]
            def run(command,**kwargs):
                calls.append(command)
                if 'build' in command:
                    Path(command[command.index('--iidfile')+1]).write_text(new)
                if 'inspect' in command:
                    return json.dumps([{'Image':new.removeprefix('sha256:'),'State':{'Running':healthy}}]).encode()
                return b''
            response=SimpleNamespace(status=200,__enter__=lambda x:x,__exit__=lambda *args:None)
            class Response:
                def __init__(self,code):self.status=code
                def __enter__(self):return self
                def __exit__(self,*args):pass
            statuses=iter([200,404,200])
            opener=SimpleNamespace(open=lambda *a,**k:Response(next(statuses)))
            with patch.object(m,'context',return_value=(SimpleNamespace(pw_dir=str(root),pw_uid=os.getuid(),pw_gid=os.getgid()),['tenant'],['podman'],info)),patch.object(m,'BACKUPS',root/'backups'),patch.object(m,'run',side_effect=run),patch.object(m.urllib.request,'build_opener',return_value=opener):
                if healthy:
                    result=m.api_only({'container':container,'healthPath':'/health'})
                    self.assertEqual(result['apiStatus'],200);self.assertEqual(result['uiStatus'],404)
                    self.assertIn('Image='+new,unit.read_text())
                    self.assertEqual((Path(result['backup'])/'original.container').read_text(),original)
                else:
                    with self.assertRaisesRegex(ValueError,'not_running'):m.api_only({'container':container})
                    self.assertEqual(unit.read_text(),original)
                    self.assertEqual(sum('restart' in call for call in calls),2)
    def test_applies_guard_and_preserves_config(self):self.exercise(True)
    def test_restores_original_unit_on_start_failure(self):self.exercise(False)

if __name__=='__main__':unittest.main()
