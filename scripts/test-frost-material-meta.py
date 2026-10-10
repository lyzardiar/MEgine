"""Author: MiYu. Verify generated material identity persists across imports and is recorded in provenance."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('frost_classic', pathlib.Path(__file__).with_name('import-frost-classic.py'))
classic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(classic)


class MaterialMetadataTests(unittest.TestCase):
    def test_material_copy_has_its_own_identity_and_preserves_importer_settings(self):
        source = dict(schemaVersion=1, guid='279696ba-d9cf-44b4-884b-a4b598b0f594', importer='material', customSetting=42)
        raw = json.dumps(source).encode('utf-8')
        first = json.loads(classic.remap_material_meta('Assets/Archmage/Hero.mmat.meta', raw))
        second = json.loads(classic.remap_material_meta('Assets/WarcraftIII/Hero.mmat.meta', raw))
        self.assertNotEqual(first['guid'], source['guid'])
        self.assertNotEqual(first['guid'], second['guid'])
        self.assertEqual({key: value for key, value in first.items() if key != 'guid'}, {key: value for key, value in source.items() if key != 'guid'})
        self.assertEqual(json.loads(raw), source)
        self.assertEqual(classic.remap_material_meta('Assets/Archmage/Hero.glb.meta', raw), raw)

    def test_reimport_preserves_existing_identity_and_records_actual_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            relative = 'Assets/Materials/Hero.mmat'
            sidecar = root / (relative + '.meta')
            sidecar.parent.mkdir(parents=True)
            original = b'{"schemaVersion":1,"guid":"279696ba-d9cf-44b4-884b-a4b598b0f594","customSetting":42}\n'
            sidecar.write_bytes(original)
            files = {}
            classic.material_meta(root, files, relative)
            self.assertEqual(sidecar.read_bytes(), original)
            self.assertEqual(files[relative + '.meta']['sha256'], classic.digest(original))
            self.assertEqual(files[relative + '.meta']['bytes'], len(original))

    def test_new_materials_have_distinct_portable_identities(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            identities = []
            for directory in (first, second):
                files = {}
                root = pathlib.Path(directory)
                for relative in ('Assets/Materials/First.mmat', 'Assets/Materials/Second.mat'):
                    classic.material_meta(root, files, relative)
                identities.append([json.loads((root / path).read_text())['guid'] for path in files])
            self.assertEqual(identities[0], identities[1])
            self.assertNotEqual(identities[0][0], identities[0][1])


if __name__ == '__main__':
    unittest.main()
