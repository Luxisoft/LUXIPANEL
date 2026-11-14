import importlib.util,pathlib,tempfile,unittest,os
spec=importlib.util.spec_from_file_location('inventory',pathlib.Path(__file__).with_name('storage-inventory.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InventoryTest(unittest.TestCase):
 def test_allocated_deduplicates_links_and_does_not_follow_symlinks(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'data').write_bytes(b'x'*8192);os.link(root/'data',root/'link');(root/'outside').symlink_to('/etc')
   total,revision=m.allocated([root,root/'data']);expected=root.stat().st_blocks*512+(root/'data').stat().st_blocks*512+(root/'outside').lstat().st_blocks*512
   self.assertEqual(total,expected);self.assertEqual(len(revision),64)
 def test_inventory_keeps_project_identity_and_excludes_technical_caches(self):
  with tempfile.TemporaryDirectory() as d:
   home=pathlib.Path(d);key='a'*32;folder=home/'.luxisoft/deployments'/key;folder.mkdir(parents=True);(folder/'source').write_text('customer data');(home/'.cache').mkdir();(home/'.cache/technical').write_bytes(b'x'*8192)
   result=m.inventory(home);self.assertEqual(len(result),1);self.assertEqual(result[0]['id'],'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');self.assertLess(result[0]['bytes'],16384)
 def test_purge_refuses_active_projects_and_path_traversal(self):
  with tempfile.TemporaryDirectory() as d:
   home=pathlib.Path(d);key='b'*32;(home/'.luxisoft/deployments'/key).mkdir(parents=True)
   with self.assertRaisesRegex(RuntimeError,'deployment_not_retired'):m.purge(home,key)
   with self.assertRaisesRegex(RuntimeError,'invalid_project'):m.purge(home,'../escape')
if __name__=='__main__':unittest.main()
