"""Author: MiYu. Exercise metadata commit gates against real Git indexes, including sparse checkouts."""
import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('asset_meta', pathlib.Path(__file__).with_name('check-frost-asset-meta.py'))
meta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meta)


class AssetMetadataTests(unittest.TestCase):
    def test_guid_precedence_matches_native_parser(self):
        guid = 'e349afce-7f87-448b-87f9-920aa2ced165'
        meta.validate_metadata(json.dumps(dict(guid=guid, mengine='custom')).encode())
        meta.validate_metadata(json.dumps(dict(uuid=guid)).encode())
        meta.validate_metadata(json.dumps(dict(mengine=dict(guid=guid))).encode())
        with self.assertRaises((TypeError, ValueError)):
            meta.validate_metadata(json.dumps(dict(guid=None, uuid=guid)).encode())

    def test_supported_extensions_follow_native_project_scan(self):
        source = subprocess.check_output(['git', 'show', 'HEAD:packages/editor/src-tauri/src/lib.rs'], cwd=meta.ROOT).decode('utf-8')
        function = source.split('fn project_asset_kind(', 1)[1].split('\nfn ', 1)[0]
        extensions = set(re.findall(r'"\.([a-z0-9.]+)"', function)) - {'sprite.json'}
        self.assertEqual(set(meta.IMPORTERS), extensions)
        self.assertIsNone(meta.asset_kind('Assets/image.sprite.json'))
        self.assertIsNone(meta.asset_kind('Assets/.cache/a.png'))
        self.assertEqual(meta.asset_kind('Assets/Sprites/HERO.PNG'), 'texture')

    def test_git_index_requires_all_sidecars_and_preserves_existing_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            subprocess.run(['git', 'init', '-q', folder], check=True)
            subprocess.run(['git', 'config', 'core.autocrlf', 'false'], cwd=root, check=True)
            files = ['Art/a.png', 'Models/a.glb', 'Scripts/Main.js', 'Fonts/a.ttf', 'Shaders/a.mshader', 'Materials/a.mmat', 'Models/a.json', 'Art/a.sprite.json', 'license.txt']
            for name in files:
                target = root / meta.PREFIX / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text('{}')
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            report = meta.check(root)
            self.assertEqual(len(report['missing']), 7)
            sidecar = root / meta.PREFIX / 'Art/a.png.meta'
            original = b'{"schemaVersion":1,"guid":"e349afce-7f87-448b-87f9-920aa2ced165","importer":"texture","filter":"nearest"}\n'
            sidecar.write_bytes(original)
            report = meta.check(root, write=True)
            self.assertEqual(len(report['created']), 6)
            self.assertEqual(sidecar.read_bytes(), original)
            self.assertEqual(len(meta.check(root)['untracked']), 7)
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            clean = meta.check(root)
            self.assertFalse(clean['missing'] or clean['untracked'] or clean['errors'])
            # Disk absence in a sparse checkout does not hide staged metadata.
            sidecar.unlink()
            self.assertFalse(meta.check(root)['missing'])
            sidecar.write_text('{"guid":"bad"}')
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            self.assertEqual(len(meta.check(root)['errors']), 1)

    def test_fill_is_portable_and_does_not_rewrite_invalid_metadata(self):
        ids = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as folder:
                root = pathlib.Path(folder); subprocess.run(['git', 'init', '-q', folder], check=True)
                target = root / meta.PREFIX / 'Art/a.png'; target.parent.mkdir(parents=True); target.write_bytes(b'png')
                subprocess.run(['git', 'add', '.'], cwd=root, check=True)
                meta.check(root, write=True); sidecar = target.with_name(target.name + '.meta'); ids.append(json.loads(sidecar.read_text())['guid'])
                sidecar.write_bytes(b'bad-json'); report = meta.check(root, write=True)
                self.assertEqual(len(report['errors']), 1); self.assertEqual(sidecar.read_bytes(), b'bad-json')
        self.assertEqual(ids[0], ids[1])


if __name__ == '__main__':
    unittest.main()
