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
            m.publication(self.request, remove=True)
            self.assertTrue(m.publication(self.request, remove=True)['alreadyRemoved'])
        self.assertFalse((m.ENABLED / 'site.example.com').exists())
        self.assertTrue(list(m.ROOT.rglob('es/index.html')))


if __name__ == '__main__':
    unittest.main()
