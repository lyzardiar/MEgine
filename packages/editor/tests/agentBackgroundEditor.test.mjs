import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
  assert.equal(fs.existsSync(path.join(root, 'agent-background-launch.lock')), true);
  assert.deepEqual(launchBackgroundEditor({
    discoveryFile,
    env: { MENGINE_EDITOR_EXECUTABLE: executable },
    platform: 'win32',
    spawnProcess: () => { throw new Error('must not spawn'); },
  }), { launched: false, waitingForOwner: true });
  fs.rmSync(root, { recursive: true, force: true });
});
