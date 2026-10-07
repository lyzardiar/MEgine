import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  backgroundEditorExecutableCandidates,
  launchBackgroundEditor,
  normalizeAgentEditorMode,
  processIsAlive,
  resolveBackgroundEditorExecutable,
} from '../../agent/mcp/backgroundEditor.mjs';

test('Agent background mode defaults safely and accepts only documented values', () => {
  assert.equal(normalizeAgentEditorMode(undefined), 'auto-background');
  assert.equal(normalizeAgentEditorMode('AUTO-BACKGROUND'), 'auto-background');
  assert.equal(normalizeAgentEditorMode('required-background'), 'required-background');
  assert.equal(normalizeAgentEditorMode('foreground'), 'auto-background');
});

test('Agent background discovery treats only live positive pids as healthy', () => {
  assert.equal(processIsAlive(42, (pid, signal) => {
    assert.equal(pid, 42);
    assert.equal(signal, 0);
  }), true);
  assert.equal(processIsAlive(0), false);
  assert.equal(processIsAlive(42, () => {
    const error = new Error('missing');
    error.code = 'ESRCH';
    throw error;
  }), false);
});

test('Agent background executable resolution is deterministic and never searches PATH', () => {
  const moduleUrl = pathToFileURL(path.join('C:\\repo', 'packages', 'agent', 'mcp', 'server.mjs')).href;
  const explicit = path.resolve('C:\\tools\\MEngine Editor.exe');
  const candidates = backgroundEditorExecutableCandidates({
    env: { MENGINE_EDITOR_EXECUTABLE: explicit },
    moduleUrl,
    platform: 'win32',
  });
  assert.equal(candidates[0], explicit);
  assert.ok(candidates.length <= 4);
  assert.equal(resolveBackgroundEditorExecutable({
    env: { MENGINE_EDITOR_EXECUTABLE: explicit },
    moduleUrl,
    platform: 'win32',
    stat: (candidate) => ({ isFile: () => candidate === explicit }),
  }).executable, explicit);
  assert.throws(() => resolveBackgroundEditorExecutable({
    env: { MENGINE_EDITOR_EXECUTABLE: 'relative/editor.exe' },
    moduleUrl,
    platform: 'win32',
    stat: (candidate) => ({ isFile: () => candidate === 'relative/editor.exe' }),
  }), /build:editor:desktop:debug/);
});

test('Agent background launch is hidden, isolated, and single-owner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-agent-background-'));
  const discoveryFile = path.join(root, 'agent-bridge-background.json');
  const executable = path.join(root, 'mengine-editor-tauri.exe');
  fs.writeFileSync(executable, 'test');
  const calls = [];
  const result = launchBackgroundEditor({
    discoveryFile,
    env: { MENGINE_EDITOR_EXECUTABLE: executable, KEEP: 'yes' },
    platform: 'win32',
    spawnProcess: (file, args, options) => {
      calls.push({ file, args, options });
      return { pid: process.pid, unref() {} };
    },
  });
  assert.equal(result.launched, true);
  assert.equal(calls[0].file, executable);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.env.MENGINE_EDITOR_BACKGROUND, '1');
  assert.equal(calls[0].options.env.MENGINE_AGENT_BRIDGE_FILE, discoveryFile);
  assert.equal(calls[0].options.env.WEBVIEW2_USER_DATA_FOLDER, undefined);
  assert.equal(calls[0].options.env.MENGINE_EDITOR_CONFIG_DIR, undefined);
  assert.equal(fs.existsSync(path.join(root, 'agent-background-launch.lock')), true);
  assert.deepEqual(launchBackgroundEditor({
    discoveryFile,
    env: { MENGINE_EDITOR_EXECUTABLE: executable },
    platform: 'win32',
    spawnProcess: () => { throw new Error('must not spawn'); },
  }), { launched: false, waitingForOwner: true });
  fs.rmSync(root, { recursive: true, force: true });
});

test('Task-owned background config, WebView and temporary data are isolated and cleaned on exit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-agent-runtime-'));
  const runtimeRoot = path.join(root, 'runtime');
  const executable = path.join(root, 'mengine-editor-tauri.exe');
  fs.writeFileSync(executable, 'test');
  const children = [];
  const env = {
    MENGINE_EDITOR_EXECUTABLE: executable,
    MENGINE_AGENT_RUNTIME_ROOT: runtimeRoot,
    MENGINE_EDITOR_CONFIG_DIR: 'shared-config',
    APPDATA: 'shared-roaming', LOCALAPPDATA: 'shared-local', TEMP: 'shared-temp', TMP: 'shared-temp',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--disable-background-timer-throttling',
  };
  let childEnv;
  const launch = () => launchBackgroundEditor({
    discoveryFile: path.join(root, 'discovery-' + fs.readdirSync(runtimeRoot).length, 'agent.json'),
    env,
    spawnProcess: (_file, _args, options) => { childEnv = options.env; const child = Object.assign(new EventEmitter(), { pid: process.pid, unref() {} }); children.push(child); return child; },
  });
  fs.mkdirSync(runtimeRoot);
  const first = launch();
  assert.equal(path.dirname(first.runtimeDirectory), runtimeRoot);
  for (const [name, folder] of [['MENGINE_EDITOR_CONFIG_DIR', 'config'], ['WEBVIEW2_USER_DATA_FOLDER', 'webview'], ['TEMP', 'temp'], ['TMP', 'temp']]) {
    assert.equal(childEnv[name], path.join(first.runtimeDirectory, folder));
    assert.equal(fs.statSync(childEnv[name]).isDirectory(), true);
  }
  assert.equal(env.APPDATA, 'shared-roaming');
  assert.equal(childEnv.APPDATA, 'shared-roaming');
  assert.equal(childEnv.LOCALAPPDATA, 'shared-local');
  assert.equal(childEnv.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, '--disable-background-timer-throttling --disk-cache-size=67108864');
  const second = launch();
  assert.notEqual(first.runtimeDirectory, second.runtimeDirectory);
  children[0].emit('exit', 0, null);
  for (let i = 0; i < 100 && fs.existsSync(first.runtimeDirectory); i++) await delay(20);
  assert.equal(fs.existsSync(first.runtimeDirectory), false);
  assert.equal(fs.existsSync(second.runtimeDirectory), true);
  children[1].emit('exit', 0, null);
  for (let i = 0; i < 100 && fs.existsSync(second.runtimeDirectory); i++) await delay(20);
  assert.equal(fs.existsSync(second.runtimeDirectory), false);
  assert.equal(fs.existsSync(executable), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Task-owned runtime rejects relative roots and cleans a failed spawn', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-agent-runtime-failure-'));
  const discoveryFile = path.join(root, 'agent.json');
  const executable = path.join(root, 'mengine-editor-tauri.exe');
  fs.writeFileSync(executable, 'test');
  const env = { MENGINE_EDITOR_EXECUTABLE: executable, MENGINE_AGENT_RUNTIME_ROOT: 'relative' };
  assert.throws(() => launchBackgroundEditor({ discoveryFile, env }), /must be an absolute path/);
  const runtimeRoot = path.join(root, 'runtime');
  env.MENGINE_AGENT_RUNTIME_ROOT = runtimeRoot;
  assert.throws(() => launchBackgroundEditor({ discoveryFile, env, spawnProcess() { throw new Error('spawn failed'); } }), /spawn failed/);
  for (let i = 0; i < 100 && fs.readdirSync(runtimeRoot).length; i++) await delay(20);
  assert.deepEqual(fs.readdirSync(runtimeRoot), []);
  assert.equal(fs.existsSync(path.join(root, 'agent-background-launch.lock')), false);
  fs.rmSync(root, { recursive: true, force: true });
});
