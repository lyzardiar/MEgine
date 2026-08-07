import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_EDITOR_MODES = Object.freeze([
  'auto-background',
  'required-background',
  'discovery-only',
]);

export function normalizeAgentEditorMode(value) {
  const mode = String(value ?? '').trim().toLowerCase();
  return AGENT_EDITOR_MODES.includes(mode) ? mode : 'auto-background';
}

export function processIsAlive(pid, kill = process.kill) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function regularFile(candidate, stat = fs.statSync) {
  if (!path.isAbsolute(candidate)) return false;
  try {
    return stat(candidate).isFile();
  } catch {
    return false;
  }
}

export function backgroundEditorExecutableCandidates({
  env = process.env,
  moduleUrl = import.meta.url,
  platform = process.platform,
} = {}) {
  const filename = platform === 'win32' ? 'mengine-editor-tauri.exe' : 'mengine-editor-tauri';
  const packagedName = platform === 'win32' ? 'MEngine Editor.exe' : 'mengine-editor';
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const candidates = [];
  if (typeof env.MENGINE_EDITOR_EXECUTABLE === 'string' && env.MENGINE_EDITOR_EXECUTABLE.trim()) {
    candidates.push(env.MENGINE_EDITOR_EXECUTABLE.trim());
  }
  candidates.push(
    path.resolve(moduleDir, '..', '..', '..', 'target', 'debug', filename),
    path.resolve(moduleDir, '..', '..', '..', packagedName),
    path.resolve(moduleDir, '..', '..', '..', '..', packagedName),
  );
  return [...new Set(candidates)];
}

export function resolveBackgroundEditorExecutable(options = {}) {
  const candidates = backgroundEditorExecutableCandidates(options);
  const executable = candidates.find((candidate) => regularFile(candidate, options.stat));
  if (executable) return { executable, candidates };
  const error = new Error(
    `MEngine background editor executable was not found. Checked: ${candidates.join(', ')}. `
      + 'Set MENGINE_EDITOR_EXECUTABLE to an absolute file or build it with '
      + '`npm.cmd run build:editor:desktop:debug`.',
  );
  error.code = 'EDITOR_EXECUTABLE_NOT_FOUND';
  error.candidates = candidates;
  throw error;
}

function readLock(lockFile) {
  try {
    const value = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    return Number.isSafeInteger(value.pid) && value.pid > 0 ? value : null;
  } catch {
    return null;
  }
}

function acquireLaunchLock(lockFile) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  try {
    const handle = fs.openSync(lockFile, 'wx');
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
    fs.closeSync(handle);
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const owner = readLock(lockFile);
    if (owner && processIsAlive(owner.pid)) return false;
    try {
      fs.unlinkSync(lockFile);
    } catch (unlinkError) {
      if (unlinkError?.code !== 'ENOENT') return false;
    }
    return acquireLaunchLock(lockFile);
  }
}

function releaseLaunchLock(lockFile) {
  const owner = readLock(lockFile);
  if (owner?.pid !== process.pid) return;
  try {
    fs.unlinkSync(lockFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function transferLaunchLock(lockFile, pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  fs.writeFileSync(lockFile, JSON.stringify({ pid, createdAt: Date.now() }));
  return true;
}

export function launchBackgroundEditor({
  discoveryFile,
  env = process.env,
  moduleUrl = import.meta.url,
  platform = process.platform,
  spawnProcess = spawn,
  stat,
} = {}) {
  if (!path.isAbsolute(discoveryFile)) {
    throw new Error('Background AgentBridge discovery path must be absolute');
  }
  const lockFile = path.join(path.dirname(discoveryFile), 'agent-background-launch.lock');
  if (!acquireLaunchLock(lockFile)) return { launched: false, waitingForOwner: true };
  let keepLock = false;
  try {
    const { executable, candidates } = resolveBackgroundEditorExecutable({
      env,
      moduleUrl,
      platform,
      stat,
    });
    const child = spawnProcess(executable, [], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...env,
        MENGINE_EDITOR_BACKGROUND: '1',
        MENGINE_AGENT_BRIDGE_FILE: discoveryFile,
      },
    });
    child.unref?.();
    keepLock = transferLaunchLock(lockFile, child.pid);
    return {
      launched: true,
      waitingForOwner: false,
      pid: Number.isSafeInteger(child.pid) ? child.pid : null,
      executable,
      candidates,
    };
  } finally {
    if (!keepLock) releaseLaunchLock(lockFile);
  }
}
