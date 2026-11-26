import importlib.util,json,pathlib,tempfile,types,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('storage_helper',pathlib.Path(__file__).with_name('storage-helper.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Storage(unittest.TestCase):
 def test_identity_never_accepts_paths_or_changed_home(self):
  with self.assertRaisesRegex(RuntimeError,'invalid_account'):m.identity('../../etc')
  with tempfile.TemporaryDirectory() as d:
   config=pathlib.Path(d)/'accounts.json';config.write_text(json.dumps({'1':{'id':1,'username':'hp'+'a'*20,'homeRoot':'/etc'}}))
   with patch.object(m,'CONFIG',config):
    with self.assertRaisesRegex(RuntimeError,'invalid_provider_identity'):m.identity('1')
 def test_failed_copy_restores_original_and_retains_partial_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);pool=root/'pool';pool.mkdir();accounts=root/'accounts';accounts.mkdir();(root/'legacy').mkdir();name='hp'+'a'*20
   home=root/'home';home.mkdir();(home/'original').write_text('original bytes');tenant=pool/name;tenant.mkdir();(tenant/'partial').write_text('partial copy')
   file=accounts/'1.json';file.write_text(json.dumps({'phase':'copying','managerWasActive':False}))
   with patch.object(m,'ROOT',root),patch.object(m,'POOL',pool),patch.object(m,'identity',return_value=({'username':name,'homeRoot':str(home)},None)):
    m.rollback_incomplete('1')
   self.assertEqual((home/'original').read_text(),'original bytes');self.assertFalse(file.exists());self.assertFalse(tenant.exists())
   self.assertEqual(len(list(pool.glob(name+'.aborted-*'))),1)
 def test_failed_swap_restores_original_mountpoint(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);pool=root/'pool';pool.mkdir();accounts=root/'accounts';accounts.mkdir();legacy=root/'legacy';legacy.mkdir();name='hp'+'a'*20
   home=root/'home';home.mkdir();original=legacy/name;original.mkdir();(original/'original').write_text('source')
   (pool/name).mkdir();file=accounts/'1.json';file.write_text(json.dumps({'phase':'copied','managerWasActive':False}))
   with patch.object(m,'ROOT',root),patch.object(m,'POOL',pool),patch.object(m,'identity',return_value=({'username':name,'homeRoot':str(home)},None)),patch.object(m,'mounted',return_value=False):m.rollback_incomplete('1')
   self.assertEqual((home/'original').read_text(),'source')
 def test_ready_storage_is_never_rolled_back_over_new_customer_writes(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'accounts').mkdir();file=root/'accounts/1.json';file.write_text(json.dumps({'phase':'ready'}))
   with patch.object(m,'ROOT',root),patch.object(m,'identity',return_value=({},None)):m.rollback_incomplete('1')
   self.assertTrue(file.exists())
 def test_reused_hosting_id_gets_a_new_quota_identity_without_old_data(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);pool=root/'pool';pool.mkdir();accounts=root/'accounts';accounts.mkdir();legacy=root/'legacy';legacy.mkdir();name='hp'+'a'*20
   (pool/name).mkdir();(pool/name/'old-data').write_text('retained original');(legacy/name).mkdir()
   file=accounts/'19.json';file.write_text(json.dumps({'phase':'retired','accountId':19,'username':name,'accountCreatedAt':'old','projectId':1500000019}))
   with patch.object(m,'ROOT',root),patch.object(m,'POOL',pool):
    m.archive_retired({'id':19,'username':name,'createdAt':'new'},file)
    first=m.new_project();second=m.new_project()
   self.assertEqual(first,1500000020);self.assertEqual(second,1500000021);self.assertFalse(file.exists())
   self.assertEqual(next((pool/'.retired').glob('*/old-data')).read_text(),'retained original')
 def test_active_identity_cannot_be_replaced_by_another_owner(self):
  self.assertFalse(m.same_owner({'username':'other','createdAt':'new'},{'username':'original','accountCreatedAt':'old'}))
 def test_existing_ports_are_preserved_and_root_is_read_only(self):
  with tempfile.TemporaryDirectory() as d:
   home=pathlib.Path(d);q=home/'.config/containers/systemd';q.mkdir(parents=True)
   f=q/'luxi-test.container';f.write_text('[Container]\nDescription=Luxisoft isolated deployment\nImage=sha256:abc\nReadOnly=false\nPublishPort=127.0.0.1:12345:8080\n')
   m.harden_quadlets(home,['sha256:abc']);text=f.read_text()
   self.assertIn('ReadOnly=true',text);self.assertIn('PublishPort=127.0.0.1:12345:8080',text);self.assertIn('Tmpfs=/config:',text);self.assertIn('SeccompProfile=',text)
   m.harden_quadlets(home,['sha256:abc']);self.assertEqual(f.read_text(),text)
if __name__=='__main__':unittest.main()
