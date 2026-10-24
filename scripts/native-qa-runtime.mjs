// Author: MiYu. Isolate disposable native QA and await its owned editor's normal exit.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile), sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function configureNativeQa(root) {
  if (!path.isAbsolute(root)) throw new Error('Native QA root must be absolute');
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'qa-owner.json'), JSON.stringify({ pid: process.pid, root: path.resolve(root) }));
  for (const folder of ['temp', 'runtime', 'discovery']) fs.mkdirSync(path.join(root, folder));
  Object.assign(process.env, { MENGINE_AGENT_RUNTIME_ROOT: path.join(root, 'runtime'), MENGINE_AGENT_BRIDGE_FILE: path.join(root, 'discovery', 'agent-bridge.json'), TEMP: path.join(root, 'temp'), TMP: path.join(root, 'temp') });
}

export async function closeNativeQa(root) {
  const owner = JSON.parse(fs.readFileSync(path.join(root, 'qa-owner.json'), 'utf8'));
  if (owner.pid !== process.pid || owner.root !== path.resolve(root) || fs.lstatSync(root).isSymbolicLink()) throw new Error('Native QA fixture ownership mismatch');
  const discovery = path.join(root, 'discovery', 'agent-bridge.json');
  if (!fs.existsSync(discovery)) return { launched: false };
  const record = JSON.parse(fs.readFileSync(discovery, 'utf8'));
  if (!record.background || !Number.isSafeInteger(record.pid) || record.pid <= 0) throw new Error('Native QA editor ownership mismatch');
  const executable = process.env.MENGINE_EDITOR_EXECUTABLE;
  if (!executable || !path.isAbsolute(executable)) throw new Error('Native QA requires its exact editor executable');
  await exec(process.env.MENGINE_QA_POWERSHELL || 'pwsh.exe', ['-NoProfile', '-File', fileURLToPath(new URL('./close-native-qa.ps1', import.meta.url)), '-EditorPid', String(record.pid), '-DiscoveryFile', discovery, '-ExpectedExecutable', executable], { windowsHide: true });
  const alive = () => { try { process.kill(record.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && (alive() || fs.existsSync(discovery))) await sleep(200);
  if (alive() || fs.existsSync(discovery)) throw new Error(`Native QA editor remained after normal close: ${root}`);
  return { pid: record.pid, normalExit: true, discoveryRemoved: true };
}
