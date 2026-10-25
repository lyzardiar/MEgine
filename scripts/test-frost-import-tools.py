"""Author: MiYu. Verify first-import preparation, complete dependencies and failed-build recovery."""
import importlib
import json
import os
from pathlib import Path
import subprocess
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

tools = importlib.import_module('prepare-frost-map-import')
ROOT = Path(__file__).resolve().parents[1]


class ImportToolsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)
        for mock in [patch.object(tools, 'ROOT', self.root), patch.object(tools, 'require_runtime'), patch.object(tools, 'fingerprint', return_value={'source': 'v1'}), patch.dict(os.environ)]:
            mock.start(); self.addCleanup(mock.stop)
        os.environ.pop('MENGINE_BLAST_EXECUTABLE', None)
        self.builds = 0

    def build(self, directory):
        self.builds += 1
        for name in tools.OUTPUTS:
            file = directory / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(name.encode())

    def test_first_import_prepares_all_tools_and_second_is_offline(self):
        messages = []
        with patch.object(tools, 'build', side_effect=self.build):
            first = tools.ensure_tools(messages.append)
            second = tools.ensure_tools()
        self.assertEqual(self.builds, 1)
        self.assertEqual(first, second)
        self.assertEqual(len(messages), 1)
        self.assertTrue(all(file.is_file() for file in first))
        self.assertEqual(Path(os.environ['MENGINE_BLAST_EXECUTABLE']), first[2])

    def test_missing_runtime_dependency_and_corrupt_tool_are_rebuilt(self):
        with patch.object(tools, 'build', side_effect=self.build):
            sampler, _, _ = tools.ensure_tools()
            sampler.with_suffix('.runtimeconfig.json').unlink()
            tools.ensure_tools()
            sampler.with_name('Wc3ModelViewer.Core.dll').write_bytes(b'corrupt')
            tools.ensure_tools()
        self.assertEqual(self.builds, 3)

    def test_source_update_gets_new_tools_without_replacing_old_ones(self):
        with patch.object(tools, 'build', side_effect=self.build):
            old = tools.ensure_tools()
            os.environ.pop('MENGINE_BLAST_EXECUTABLE')
            with patch.object(tools, 'fingerprint', return_value={'source': 'v2'}):
                new = tools.ensure_tools()
        self.assertNotEqual(old, new)
        self.assertTrue(all(file.is_file() for file in old + new))

    def test_failed_build_does_not_publish_success_and_can_retry(self):
        with patch.object(tools, 'build', side_effect=RuntimeError('build failed')):
            with self.assertRaisesRegex(RuntimeError, 'build failed'):
                tools.ensure_tools()
        self.assertEqual(list(self.root.rglob('ready.json')), [])
        with patch.object(tools, 'build', side_effect=self.build):
            tools.ensure_tools()
        self.assertEqual(self.builds, 1)

    def test_partial_build_does_not_publish_success(self):
        with patch.object(tools, 'build', return_value=None):
            with self.assertRaises(FileNotFoundError):
                tools.ensure_tools()
        self.assertEqual(list(self.root.rglob('ready.json')), [])

    def test_explicit_blast_override_is_preserved_and_validated(self):
        override = self.root / 'custom-blast.exe'
        override.write_bytes(b'custom')
        os.environ['MENGINE_BLAST_EXECUTABLE'] = str(override)
        with patch.object(tools, 'build', side_effect=self.build):
            self.assertEqual(tools.ensure_tools()[2], override)
            override.unlink()
            with self.assertRaisesRegex(FileNotFoundError, '解压工具'):
                tools.ensure_tools()

    def test_preparation_lock_is_released_when_process_exits(self):
        script = "import importlib,sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); m=importlib.import_module('prepare-frost-map-import');\nwith m.preparation_lock(Path(sys.argv[2])): print('locked',flush=True); sys.stdin.read()"
        child = subprocess.Popen([sys.executable, '-c', script, str(ROOT / 'scripts'), str(self.root)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'locked')
            with self.assertRaises(TimeoutError), tools.preparation_lock(self.root, timeout=.05):
                self.fail('Second process acquired the lock')
        finally:
            child.kill(); child.communicate(timeout=10)
        with tools.preparation_lock(self.root, timeout=.05):
            pass

    def test_missing_python_package_is_reported_in_job_receipt(self):
        source = self.root / '地图.w3x'
        source.write_bytes(b'fixture')
        result = self.root / 'result.json'
        for name in importlib.import_module('runtime-import-frost-map').ARCHIVES:
            (self.root / name).write_bytes(b'fixture')
        run = subprocess.run([sys.executable, '-S', str(ROOT / 'scripts/runtime-import-frost-map.py'), '--source', str(source), '--project', str(self.root), '--result', str(result), '--game', str(self.root)], capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        error = json.loads(result.read_bytes())['error']
        self.assertIn('NumPy', error)
        self.assertIn('pip install', error)

    def test_interrupted_download_and_existing_corrupt_archive_can_retry(self):
        converter = importlib.import_module('convert-warcraft-assets')
        archive = self.root / 'upstream.zip'
        def interrupted(url, target):
            target.write_bytes(b'partial')
            raise OSError('connection closed')
        def downloaded(url, target):
            with zipfile.ZipFile(target, 'w') as package:
                package.writestr('source/src/Wc3ModelViewer.Core/Wc3ModelViewer.Core.csproj', '<Project/>')
        with patch.object(converter.urllib.request, 'urlretrieve', side_effect=interrupted):
            with self.assertRaisesRegex(OSError, 'connection closed'):
                converter.upstream_archive(self.root)
        self.assertFalse(archive.exists())
        self.assertEqual(list(self.root.glob('download-*')), [])
        archive.write_bytes(b'old corrupt download')
        with patch.object(converter.urllib.request, 'urlretrieve', side_effect=downloaded) as download:
            self.assertEqual(converter.upstream_archive(self.root), archive)
            self.assertEqual(converter.upstream_archive(self.root), archive)
            self.assertEqual(download.call_count, 1)

    def test_corrupt_deflate_payload_is_downloaded_again(self):
        converter = importlib.import_module('convert-warcraft-assets')
        archive = self.root / 'upstream.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
            package.writestr('source/src/Wc3ModelViewer.Core/Wc3ModelViewer.Core.csproj', '<Project/>')
        original = archive.read_bytes()
        damaged = bytearray(original)
        name, extra = struct.unpack_from('<HH', damaged, 26)
        offset = 30 + name + extra
        damaged[offset] = damaged[offset] | 6  # Reserved DEFLATE block type, with a valid ZIP directory.
        archive.write_bytes(damaged)
        with patch.object(converter.urllib.request, 'urlretrieve', side_effect=lambda url, target: target.write_bytes(original)) as download:
            self.assertEqual(converter.upstream_archive(self.root).read_bytes(), original)
            self.assertEqual(download.call_count, 1)


if __name__ == '__main__':
    unittest.main()
