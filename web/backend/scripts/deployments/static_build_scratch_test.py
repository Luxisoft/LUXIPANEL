import importlib.util
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('scratch', Path(__file__).with_name('static-build-scratch.py'))
scratch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scratch)
tenant = ['/usr/sbin/runuser', '-u', 'hp' + 'a'*20, '--', '/usr/bin/env', '-i',
          '/usr/bin/node', '/usr/lib/luxipanel/deployment-tenant.mjs']


class BuildStorageTest(unittest.TestCase):
    def run_job(self, root, free, run):
        with (patch.object(scratch, 'DISK_ROOT', root),
              patch.object(scratch.os, 'geteuid', return_value=0),
              patch.object(scratch.os, 'readlink', side_effect=['mnt:2','mnt:1']),
              patch.object(scratch.os, 'chown'),
              patch.object(scratch.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1010,pw_gid=1010)),
              patch.object(scratch.shutil, 'disk_usage', return_value=SimpleNamespace(free=free)),
              patch.object(scratch.subprocess, 'run', side_effect=run)):
            return scratch.main(tenant)

    def test_disk_pressure_before_creation(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(RuntimeError, 'host_build_disk_capacity'):
                self.run_job(root, scratch.SIZE, lambda *args, **kwargs: self.fail('unexpected execution'))
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_build_failure_preserves_exit_code_and_releases_space(self):
        calls = []
        def run(argv, **kwargs):
            calls.append(argv[0])
            if argv[0].endswith('mkfs.ext4'):
                self.assertEqual(Path(argv[-1]).stat().st_size, scratch.SIZE)
            if argv[0].endswith('runuser'):
                work = Path(argv[-3].split('=',1)[1])
                self.assertTrue(work.is_dir())
                self.assertFalse((work.parent.parent/'scratch.img').exists())
                return SimpleNamespace(returncode=17)
            if argv[0].endswith('umount'):
                (Path(argv[-1])/'work').rmdir()  # simulate detaching the test filesystem
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(self.run_job(root, scratch.SIZE+scratch.HOST_RESERVE, run), 17)
            self.assertEqual(list(Path(root).iterdir()), [])
        self.assertEqual(calls, ['/usr/sbin/mkfs.ext4','/usr/bin/mount','/usr/sbin/runuser','/usr/bin/umount'])


if __name__ == '__main__':
    unittest.main()
