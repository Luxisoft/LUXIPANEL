import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('publication', Path(__file__).with_name('frontend-publication.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.request = dict(providerId='212e003c-6c26-4419-8aee-dc2b9a6b9cb2', accountId='a24e871b-d9af-4113-ad82-19bbbc596fe1', projectId='f8207daa-42ab-4e13-9985-f48a7213350b', versionId='4419fffd-a519-4baf-bc90-c71f4e083714', targetId='frontend', sha256='a'*64, hosts=['site.example.com'])

    def archive(self, entries):
        result = self.root / 'site.zip'
        with zipfile.ZipFile(result, 'w') as z:
            for name, data in entries:
                z.writestr(name, data)
        return result

    def test_retains_artifact_outside_public_tree_and_detects_corruption(self):
        archive=self.archive([('index.html','ok')])
        request={**self.request,'component':'web','sha256':m.hashlib.sha256(archive.read_bytes()).hexdigest()}
        with patch.object(m,'ROOT',self.root/'published'), patch.dict(m.os.environ,{'SUDO_UID':str(m.os.getuid())}), patch.object(m.os,'chown'):
            result=m.store_artifact(request,archive)
            self.assertTrue(result['retained'])
            target=next((self.root/'published').glob('*/artifacts/*/*.zip'))
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
            self.assertFalse((target.parent/'public').exists())
            self.assertEqual(m.store_artifact(request,archive),result)
            target.write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError,'artifact_conflict'):m.store_artifact(request,archive)

    def test_rejects_paths_symlinks_and_duplicate_names(self):
        for entry in ['../secret', '/etc/secret', 'a\\b', 'a/./b']:
            with self.subTest(entry=entry):
                output = self.root / ('out-' + str(len(list(self.root.iterdir()))))
                output.mkdir()
                archive = self.archive([(entry, 'bad')])
                with self.assertRaises(ValueError):
                    m.extract(archive, output)
                archive.unlink()
        info = zipfile.ZipInfo('link')
        info.external_attr = 0o120777 << 16
        with self.assertRaises(ValueError):
            m.extract(self.archive([(info, '/etc/passwd')]), self.root)

    def test_validates_index_and_domain_syntax(self):
        with self.assertRaises(ValueError):
            m.extract(self.archive([('a.txt', 'ok')]), self.root / 'public')
        for host in ['x;include /etc/foo;', '*.example.com', 'x/evil.com']:
            with self.assertRaises(ValueError):
                m.validate({**self.request, 'hosts': [host]})

    def test_private_preview_uses_a_separate_identity_and_authorization(self):
        preview={**self.request,'environment':'preview','component':'web','hosts':['demo--v27.luxisoft.com'],'previewAuthorizationUrl':'http://141.193.23.85:3200/api/v1/deployment-frontend/authorize'}
        self.assertNotEqual(m.validate(preview),m.validate(self.request))
        with patch.object(m,'certificate',return_value=Path('/cert')):
            generated=m.config(preview,preview['hosts'][0],Path('/public'))
        self.assertIn('auth_request /__lxp_frontend_auth;',generated)
        self.assertIn('internal;',generated)
        self.assertIn('subscription-preview.js',generated)
        self.assertIn('location = /__luxisoft/subscription-notice',generated)
        self.assertIn('/api/v1/deployment-frontend/subscription-notice',generated)
        self.assertIn('sub_filter_once on',generated)
        self.assertIn('proxy_set_header X-Version-ID '+self.request['versionId'],generated)
        with self.assertRaises(ValueError):
            m.validate({**preview,'hosts':['public.example.com']})

    def test_locale_redirect_preserves_language_selection_and_api_paths(self):
        request = {**self.request, 'localeRouting': {'locales':['es','en'], 'defaultLocale':'es', 'cookie':'page-language'}, 'apiRoutes':['/api'], 'backendOrigin':'http://141.193.23.85:3460'}
        m.validate(request)
        with patch.object(m, 'certificate', return_value=Path('/cert')):
            generated = m.config(request, request['hosts'][0], Path('/public'))
        self.assertIn('location = / { return 302 /$lxp_locale/; }', generated)
        self.assertIn('location = /en/ { try_files /en/index.html =404; }', generated)
        self.assertIn('page-language=en', generated)
        self.assertIn('location /api/', generated)
        for value in ['en;include', '../../', 'EN']:
            with self.assertRaises(ValueError):
                m.validate({**request,'localeRouting':{'locales':[value], 'defaultLocale':value,'cookie':'page-language'}})

    def test_preserves_existing_config_on_nginx_failure(self):
        for key in ['ROOT', 'STATE', 'AVAILABLE', 'ENABLED', 'BACKUPS']:
            directory = self.root / key
            directory.mkdir()
            context = patch.object(m, key, directory)
            context.start()
            self.addCleanup(context.stop)
        host = self.request['hosts'][0]
        marker = '# LUXIPANEL_FRONTEND ' + ':'.join(self.request[k] for k in ['providerId', 'accountId', 'projectId'])
        old = marker + '\nold config\n'
        file = m.AVAILABLE / host
        file.write_text(old)
        (m.ENABLED / host).symlink_to(file)
        archive = self.archive([('index.html', '<main>ok</main>')])
        self.request['sha256'] = m.hashlib.sha256(archive.read_bytes()).hexdigest()
        with patch.object(m, 'certificate', return_value=Path('/cert')), patch.object(m, 'run', side_effect=[RuntimeError('nginx_failed'), None, None]):
            with self.assertRaises(RuntimeError):
                m.publication(self.request, archive)
        self.assertEqual(file.read_text(), old)
        self.assertTrue((m.ENABLED / host).is_symlink())
        self.assertFalse((m.STATE / (m.validate(self.request) + '.json')).exists())

    def test_stages_without_nginx_or_exposing_a_suspended_site(self):
        for key in ['ROOT', 'STATE', 'AVAILABLE', 'ENABLED', 'BACKUPS']:
            directory = self.root / key
            directory.mkdir()
            context = patch.object(m, key, directory)
            context.start()
            self.addCleanup(context.stop)
        archive = self.archive([('index.html', 'suspended')])
        self.request['sha256'] = m.hashlib.sha256(archive.read_bytes()).hexdigest()
        with patch.object(m, 'run') as run, patch.object(m, 'certificate', side_effect=AssertionError('no TLS activation')):
            result = m.publication(self.request, archive, stage_only=True)
        self.assertFalse(result['active'])
        run.assert_not_called()
        self.assertEqual(list(m.AVAILABLE.iterdir()), [])
        self.assertEqual(list(m.ENABLED.iterdir()), [])
        self.assertTrue(list(m.ROOT.rglob('index.html')))
        self.assertEqual(len(list(m.ROOT.rglob('artifact.zip'))), 1)
        self.assertFalse((m.ROOT / m.validate(self.request) / 'current').exists())
        record = m.STATE / (m.validate(self.request) + '.json')
        self.assertFalse(json.loads(record.read_text())['active'])
        record.write_text(json.dumps({**json.loads(record.read_text()), 'active': True}))
        with self.assertRaisesRegex(ValueError, 'already_active'):
            m.publication(self.request, archive, stage_only=True)

    def test_installs_retries_and_removes_only_owned_vhost(self):
        for key in ['ROOT', 'STATE', 'AVAILABLE', 'ENABLED', 'BACKUPS']:
            directory = self.root / key
            directory.mkdir()
            context = patch.object(m, key, directory)
            context.start()
            self.addCleanup(context.stop)
        archive = self.archive([('index.html', 'hello'), ('es/index.html', 'hola')])
        self.request['sha256'] = m.hashlib.sha256(archive.read_bytes()).hexdigest()
        with patch.object(m, 'certificate', return_value=Path('/cert')), patch.object(m, 'run'):
            m.publication(self.request, archive)
            m.publication(self.request, archive)
            retained = list(m.ROOT.rglob('artifact.zip'))
            self.assertEqual(retained[0].read_bytes(), archive.read_bytes())
            self.assertEqual(retained[0].stat().st_mode & 0o777, 0o600)
            record = m.STATE / (m.validate(self.request) + '.json')
            before = record.read_bytes()
            with patch.object(m, 'run') as check:
                m.publication(self.request, archive, retain_only=True)
                check.assert_not_called()
            self.assertEqual(record.read_bytes(), before)
            m.publication(self.request, remove=True)
            self.assertTrue(m.publication(self.request, remove=True)['alreadyRemoved'])
        self.assertFalse((m.ENABLED / 'site.example.com').exists())
        self.assertTrue(list(m.ROOT.rglob('es/index.html')))


if __name__ == '__main__':
    unittest.main()
