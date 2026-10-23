"""Author: MiYu. Verify cached map integrity and path confinement without modifying user assets."""
import hashlib
import importlib
import json
from pathlib import Path
import tempfile
import unittest

validate = importlib.import_module('runtime-import-frost-map').validate_cached


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.project = Path(self.temp.name)
        self.package = self.project / 'Assets/Maps/user-v1-test'
        self.package.mkdir(parents=True)
        self.source_sha = hashlib.sha256(b'original').hexdigest()
        prefix = 'Assets/Maps/user-v1-test/'
        self.entry = dict(id='user-v1-test', scene=prefix+'main.mscene', script=prefix+'main.js', sourceSha256=self.source_sha)
        assets = []
        for name, data in [('main.mscene', b'{}'), ('main.js', b'generated'), ('original.w3x', b'original')]:
            (self.package/name).write_bytes(data)
            if name != 'original.w3x':
                assets.append(dict(path=prefix+name, sha256=hashlib.sha256(data).hexdigest()))
        (self.package/'manifest.json').write_text(json.dumps(dict(assets=assets, installedSource=prefix+'original.w3x')))

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_cache(self):
        self.assertEqual(validate(self.project, self.entry, self.source_sha), self.entry)

    def test_changed_original(self):
        (self.package/'original.w3x').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, '摘要'):
            validate(self.project, self.entry, self.source_sha)

    def test_changed_or_missing_asset(self):
        (self.package/'main.js').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            validate(self.project, self.entry, self.source_sha)
        (self.package/'main.js').unlink()
        with self.assertRaises(FileNotFoundError):
            validate(self.project, self.entry, self.source_sha)

    def test_path_confinement(self):
        for entry in [dict(self.entry, id='../outside'), dict(self.entry, script='Assets/outside.js')]:
            with self.assertRaises(ValueError):
                validate(self.project, entry, self.source_sha)

    def test_shared_assets_are_content_addressed_and_confined(self):
        data = b'shared-png'
        sha = hashlib.sha256(data).hexdigest()
        relative = 'Assets/WarcraftShared/v1/' + sha + '.png'
        shared = self.project / relative
        shared.parent.mkdir(parents=True)
        shared.write_bytes(data)
        file = self.package/'manifest.json'
        manifest = json.loads(file.read_bytes())
        record = dict(path=relative, storage='shared', sha256=sha)
        manifest['assets'].append(record)
        file.write_text(json.dumps(manifest))
        self.assertEqual(validate(self.project, self.entry, self.source_sha), self.entry)
        for path in ['Assets/WarcraftShared/v1/../../outside.png', 'Assets/WarcraftShared/v1/'+'0'*64+'.png']:
            record['path'] = path
            file.write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                validate(self.project, self.entry, self.source_sha)


if __name__ == '__main__':
    unittest.main()
