"""Author: MiYu. Verify machine-local Warcraft configuration and the Windows setup flow."""
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

runtime = importlib.import_module('runtime-import-frost-map')
read_user_game_directory = runtime.user_game_directory
ROOT = Path(__file__).resolve().parents[1]


class GameDirectoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.game = self.root / '魔兽 资源 [test]'
        self.game.mkdir()
        for name in runtime.ARCHIVES:
            (self.game / name).write_bytes(b'fixture')
        for mock in [patch.dict(os.environ, {runtime.GAME_DIRECTORY_ENV: ''}), patch.object(runtime, 'user_game_directory', return_value=None)]:
            mock.start(); self.addCleanup(mock.stop)

    def test_process_environment_and_explicit_override(self):
        os.environ[runtime.GAME_DIRECTORY_ENV] = str(self.game)
        self.assertEqual(runtime.resolve_game_directory(), self.game.resolve())
        os.environ[runtime.GAME_DIRECTORY_ENV] = 'missing-directory'
        self.assertEqual(runtime.resolve_game_directory(self.game), self.game.resolve())

    def test_user_setting_is_available_to_editor_without_inherited_variable(self):
        with patch.object(runtime, 'user_game_directory', return_value=str(self.game)):
            self.assertEqual(runtime.resolve_game_directory(), self.game.resolve())
            os.environ[runtime.GAME_DIRECTORY_ENV] = str(self.root)
            with self.assertRaises(FileNotFoundError):
                runtime.resolve_game_directory()

    @unittest.skipUnless(os.name == 'nt', 'Windows user environment registry')
    def test_windows_user_environment_reader(self):
        # Exercise the real reader with an isolated registry response.
        registry = MagicMock(REG_SZ=1, REG_EXPAND_SZ=2)
        registry.QueryValueEx.return_value = (str(self.game), 1)
        with patch.dict(sys.modules, winreg=registry):
            self.assertEqual(read_user_game_directory(), str(self.game))
            registry.QueryValueEx.side_effect = FileNotFoundError()
            self.assertIsNone(read_user_game_directory())

    def test_unset_configuration_points_to_setup(self):
        with self.assertRaisesRegex(ValueError, 'setup.cmd.*MENGINE_WARCRAFT_ROOT'):
            runtime.resolve_game_directory()

    def test_missing_archives_are_reported_together(self):
        (self.game / 'War3Patch.mpq').unlink()
        (self.game / 'War3x.mpq').unlink()
        with self.assertRaisesRegex(FileNotFoundError, 'War3Patch.mpq, War3x.mpq'):
            runtime.resolve_game_directory(self.game)

    def test_configuration_is_checked_before_tool_preparation(self):
        source = self.root / 'test.w3x'
        source.write_bytes(b'fixture')
        args = SimpleNamespace(source=source, project=self.root, result=self.root / 'result.json', game=None)
        prepare = importlib.import_module('prepare-frost-map-import')
        with patch.object(prepare, 'ensure_tools', side_effect=AssertionError('Prepared before configuration')) as build:
            with self.assertRaisesRegex(ValueError, 'MENGINE_WARCRAFT_ROOT'):
                runtime.run(args)
            build.assert_not_called()

    def test_real_cli_writes_configuration_error_receipt(self):
        source = self.root / 'test.w3x'
        source.write_bytes(b'fixture')
        result = self.root / 'result.json'
        environment = dict(os.environ, MENGINE_WARCRAFT_ROOT=str(self.root), PYTHONUTF8='1')
        run = subprocess.run([sys.executable, '-S', str(ROOT / 'scripts/runtime-import-frost-map.py'), '--source', str(source), '--project', str(self.root), '--result', str(result)], env=environment, capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        message = json.loads(result.read_bytes())['error']
        self.assertIn('setup.cmd', message)
        for name in runtime.ARCHIVES:
            self.assertIn(name, message)

    @unittest.skipUnless(os.name == 'nt' and shutil.which('powershell.exe'), 'Windows setup requires PowerShell')
    def test_setup_process_scope_and_python_child_inheritance(self):
        config = ROOT / 'samples/frostbound-realms/project.json'
        before = config.read_bytes()
        runner = self.root / 'verify.ps1'
        child = self.root / 'verify.py'
        child.write_text('import importlib,os,sys; sys.path.insert(0,os.environ["MENGINE_TEST_SCRIPTS"]); p=importlib.import_module("runtime-import-frost-map").resolve_game_directory(); assert str(p)==os.environ["MENGINE_TEST_GAME"]', encoding='utf-8')
        runner.write_text('''$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$oldUser = [Environment]::GetEnvironmentVariable('MENGINE_WARCRAFT_ROOT', 'User')
& $env:MENGINE_TEST_SETUP -GameDirectory $env:MENGINE_TEST_GAME -SessionOnly
if ($env:MENGINE_WARCRAFT_ROOT -cne $env:MENGINE_TEST_GAME) { throw 'Process setting was not updated' }
if ([Environment]::GetEnvironmentVariable('MENGINE_WARCRAFT_ROOT', 'User') -cne $oldUser) { throw 'SessionOnly changed user settings' }
& $env:MENGINE_TEST_PYTHON -S $env:MENGINE_TEST_CHILD
if ($LASTEXITCODE) { throw 'Python child did not resolve the configured directory' }
''', encoding='utf-8-sig')
        environment = dict(os.environ, MENGINE_TEST_SETUP=str(ROOT / 'samples/frostbound-realms/setup.ps1'), MENGINE_TEST_GAME=str(self.game.resolve()), MENGINE_TEST_PYTHON=sys.executable, MENGINE_TEST_CHILD=str(child), MENGINE_TEST_SCRIPTS=str(ROOT / 'scripts'), PYTHONUTF8='1')
        run = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(runner)], env=environment, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stdout.decode('utf-8', errors='replace') + run.stderr.decode('utf-8', errors='replace'))
        self.assertEqual(config.read_bytes(), before)

    @unittest.skipUnless(os.name == 'nt' and shutil.which('powershell.exe'), 'Windows setup requires PowerShell')
    def test_setup_rejects_incomplete_directory(self):
        run = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'samples/frostbound-realms/setup.ps1'), '-GameDirectory', str(self.root), '-SessionOnly'], capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn(b'War3Patch.mpq', run.stdout + run.stderr)

    @unittest.skipUnless(os.name == 'nt' and shutil.which('powershell.exe'), 'Windows setup requires PowerShell')
    def test_setup_interactive_retry_with_quoted_directory(self):
        runner = self.root / 'interactive.ps1'
        runner.write_text("[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n& $env:MENGINE_TEST_SETUP -SessionOnly\n", encoding='utf-8-sig')
        environment = dict(os.environ, MENGINE_TEST_SETUP=str(ROOT / 'samples/frostbound-realms/setup.ps1'))
        run = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(runner)], env=environment, input=(str(self.root) + '\n"' + str(self.game) + '"\n').encode('utf-8'), capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr.decode('utf-8', errors='replace'))
        self.assertIn(b'MENGINE_WARCRAFT_ROOT=', run.stdout)


if __name__ == '__main__':
    unittest.main()
