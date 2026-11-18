import importlib.util,json,os,pathlib,tempfile,time,unittest
spec=importlib.util.spec_from_file_location('gc',pathlib.Path(__file__).with_name('frontend-temporary-gc.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Recovery(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.base=pathlib.Path(self.temp.name)
 def job(self):
  root=self.base/'job';root.mkdir();(root/'output.zip').write_bytes(b'temporary');os.utime(root,(0,0));return root
 def test_expired_abandoned_files_are_removed(self):
  root=self.job();self.assertTrue(m.collect(root));self.assertFalse(root.exists())
 def test_live_owner_survives_even_with_old_mtime(self):
  root=self.job();ticks=pathlib.Path('/proc/self/stat').read_text().rsplit(')',1)[1].strip().split()[19]
  (root/'lease.json').write_text(json.dumps({'pid':os.getpid(),'startTicks':ticks}));os.utime(root,(0,0))
  self.assertFalse(m.collect(root));self.assertTrue(root.exists())
 def test_reused_pid_cannot_protect_orphan(self):
  root=self.job();(root/'lease.json').write_text(json.dumps({'pid':os.getpid(),'startTicks':'invalid'}));os.utime(root,(0,0));self.assertTrue(m.collect(root))
 def test_recent_and_symlinked_paths_are_protected(self):
  root=self.job();os.utime(root,None);self.assertFalse(m.collect(root));link=self.base/'link';link.symlink_to(root);self.assertFalse(m.collect(link));self.assertTrue(root.exists())
if __name__=='__main__':unittest.main()
