// Author: MiYu. Exercise the real desktop importer and preview in a disposable hidden editor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { configureNativeQa, closeNativeQa } from './frost-native-qa-runtime.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const executable = path.resolve(process.argv[2] ?? 'target/debug/mengine-editor-tauri.exe');
const packagePath = process.argv[3] && path.resolve(process.argv[3]);
assert.ok(packagePath && fs.existsSync(packagePath), 'Usage: node scripts/qa-unity-package-import.mjs EDITOR_EXE SOURCE.unitypackage');
const root = path.join(repo, 'tmp/docs-artifacts/unity-import', `native-${Date.now()}`);
configureNativeQa(root);
const sample = path.join(root, 'sample');
fs.mkdirSync(sample);
fs.cpSync(path.join(repo, 'samples/unity-package-preview/Assets'), path.join(sample, 'Assets'), { recursive: true });
fs.copyFileSync(path.join(repo, 'samples/unity-package-preview/project.json'), path.join(sample, 'project.json'));
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const debugPort = server.address().port;
await new Promise(resolve => server.close(resolve));
Object.assign(process.env, {
  MENGINE_EDITOR_EXECUTABLE: executable,
  MENGINE_AGENT_EDITOR_MODE: 'auto-background',
  MENGINE_EDITOR_CONFIG_DIR: path.join(root, 'config'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --remote-debugging-port=${debugPort}`,
});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR);
const { bridgeQuery, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const report = { passed: false, root, executable, packagePath, checks: [], picker: 'The package path input supplies the explicitly selected source; analysis, conversion, commit and refresh use real native commands. OS file picker is not exercised.' };
const save = () => fs.writeFileSync(path.join(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const query = (id, args = {}) => bridgeQuery(id, args, { timeoutMs: 60000 });
const execute = async (id, args = {}) => { const result = await bridgeExecute(id, args, { requestId: randomUUID(), timeoutMs: 120000 }); assert.ok(result.ok, JSON.stringify(result.error)); return result; };
const waitUntil = async (fn, message, timeout = 60000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 300)); }
  throw new Error(message);
};
let socket;
let cdp;
async function connectDebug() {
  const target = await waitUntil(async () => {
    try { return (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page' && /^https?:\/\/tauri.localhost\//.test(item.url)); } catch { return null; }
  }, 'The owned desktop WebView debugger did not become ready');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let sequence = 0;
  socket.addEventListener('message', event => { const result = JSON.parse(event.data), item = pending.get(result.id); if (!item) return; pending.delete(result.id); clearTimeout(item.timer); result.error ? item.reject(new Error(result.error.message)) : item.resolve(result.result); });
  cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
const native = (command, args) => evaluate(`globalThis.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`);
const click = text => evaluate(`(() => { const scope = document.querySelector('.unity-package-dialog') ?? document; const b = [...scope.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw Error('Button unavailable: '+${JSON.stringify(text)}); b.click(); return true; })()`);
const capture = async name => {
  const shot = await waitUntil(async () => { try { return await query('view.screenshot', { target: 'game', maxSize: 1280 }); } catch (error) { if (/canvas is not available yet/.test(error.message)) return null; throw error; } }, 'Game viewport did not mount');
  fs.writeFileSync(path.join(root, `${name}.png`), Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
};
try {
  await query('project.state');
  await execute('project.open', { root: sample });
  await waitUntil(async () => { const state = await query('project.state'); return state.ready && state.editorReady && path.resolve(state.project.root) === sample; }, 'Sample project did not become ready');
  const windows = await query('window.list');
  assert.ok(windows.every(window => !window.visible && !window.focused), 'QA must never operate a visible editor');
  await connectDebug();
  const schema = await query('schema.component', { type: 'ParticleEmitter3D' });
  report.schemaHasDefinition = schema.fields.some(field => field.name === 'definition' && field.assetKinds?.includes('particle'));
  assert.ok(report.schemaHasDefinition, 'Particle definition must expose a typed asset reference');
  await click('Assets');
  await click('Import Unity Package...');
  await waitUntil(() => evaluate(`!!document.querySelector('.unity-package-dialog')`), 'Import dialog did not mount');
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Unity package path"]'); if (!input) throw Error('Package path input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(packagePath)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click('Analyze path');
  await waitUntil(() => evaluate(`!![...document.querySelectorAll('.unity-package-dialog button')].find(b => b.textContent.trim() === 'Import' && !b.disabled)`), 'Package analysis did not enable import');
  report.analysisUi = await evaluate(`document.querySelector('.unity-package-dialog').innerText`);
  assert.ok(report.analysisUi.includes(packagePath), 'Analysis must use the exact requested source');
  await click('Import');
  await waitUntil(() => evaluate(`document.querySelector('.unity-package-dialog')?.innerText.includes('Import complete')`), 'Native import did not complete', 120000);
  report.importUi = await evaluate(`document.querySelector('.unity-package-dialog').innerText`);
  const uiShot = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(root, 'import-dialog.png'), Buffer.from(uiShot.data, 'base64'));
  await click('Close');
  report.checks.push('Dialog path analyze/import completed through real native commands');
  const project = await native('get_project_snapshot', {});
  const analysis = await native('analyze_unity_package', { projectId: project.projectId, projectRoot: project.projectRoot, sourcePath: packagePath });
  const args = { projectId: project.projectId, projectRoot: project.projectRoot, sourcePath: packagePath, fingerprint: analysis.fingerprint, converterPath: null };
  const imported = await native('import_unity_package', args);
  report.import = { destination: imported.destination, prefabPaths: imported.prefab_paths, fingerprint: analysis.fingerprint, particleCount: analysis.particle_count };
  await assert.rejects(() => native('import_unity_package', { ...args, fingerprint: '0'.repeat(64) }), /fingerprint|changed/i);
  await assert.rejects(() => native('import_unity_package', { ...args, projectId: randomUUID() }), /project changed/i);
  report.checks.push('Idempotent reimport, fingerprint rejection, and stale-project rejection');
  await execute('asset.instantiate', { path: imported.prefab_paths[0] });
  const authored = await query('scene.snapshot');
  assert.equal(authored.entities.filter(entity => entity.components.ParticleEmitter3D?.definition).length, analysis.particle_count);
  const firstParticle = authored.entities.find(entity => entity.components.ParticleEmitter3D?.definition);
  const definitionPath = firstParticle.components.ParticleEmitter3D.definition;
  await evaluate(`(() => { const input = document.querySelector('[aria-label="Search all project assets"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(definitionPath)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitUntil(() => evaluate(`!!document.querySelector('.asset-card[aria-label$="(particle)"]')`), 'Particle asset card not indexed');
  await evaluate(`document.querySelector('.asset-card[aria-label$="(particle)"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitUntil(() => evaluate(`!!document.querySelector('[aria-label="Particle definition JSON"]')`), 'Particle JSON editor did not open');
  const originalDefinition = await evaluate(`document.querySelector('[aria-label="Particle definition JSON"]').value`);
  const setJson = value => evaluate(`(() => { const input = document.querySelector('[aria-label="Particle definition JSON"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await setJson('{'); await click('Save');
  await waitUntil(() => evaluate(`!!document.querySelector('.particle-definition-dialog [role="alert"]')`), 'Invalid JSON was not rejected');
  assert.equal(fs.readFileSync(path.join(sample, definitionPath), 'utf8'), originalDefinition);
  const changedDefinition = JSON.parse(originalDefinition); changedDefinition.duration += 0.125;
  await setJson(JSON.stringify(changedDefinition, null, 2)); await click('Save');
  await waitUntil(() => evaluate(`!document.querySelector('.particle-definition-dialog')`), 'Particle definition did not save');
  assert.equal(JSON.parse(fs.readFileSync(path.join(sample, definitionPath), 'utf8')).duration, changedDefinition.duration);
  report.checks.push('Particle definition has typed Inspector asset reference; Project double-click editor rejects invalid JSON and persists valid edits');
  await execute('scene.save');
  await execute('view.set_game_resolution', { resolution: { width: 1280, height: 720 } });
  await execute('panel.focus', { kind: 'game' });
  await execute('playback.play', { paused: true });
  await execute('playback.step', { steps: 12 });
  await capture('playing');
  const particles = snapshot => snapshot.entities.filter(entity => entity.components.ParticleEmitter3D?.definition);
  await execute('playback.input', { keys: ['KeyX'] });
  await execute('playback.step');
  assert.ok(particles(await query('scene.snapshot')).every(entity => !entity.components.ParticleEmitter3D.playing));
  await execute('playback.input', { keys: ['KeyR'] });
  await execute('playback.step', { steps: 4 });
  assert.ok(particles(await query('scene.snapshot')).every(entity => entity.components.ParticleEmitter3D.playing));
  await execute('playback.input', { keys: ['ArrowRight', 'KeyB'] });
  await execute('playback.step', { steps: 4 });
  await execute('playback.input', { keys: [] });
  await capture('replayed-camera');
  const replayed = await query('scene.snapshot');
  report.status = replayed.entities.find(entity => entity.name === 'Preview Status')?.components.Text.text;
  assert.match(report.status ?? '', /11 imported emitters|imported emitters/);
  report.checks.push('Particle preview scripts stop/replay emitters, update camera/background and HUD in the native player');
  await execute('playback.stop');
  await execute('project.close');
  await execute('project.open', { root: sample });
  await waitUntil(async () => (await query('project.state')).editorReady, 'Reopened project did not mount');
  assert.equal(particles(await query('scene.snapshot')).length, analysis.particle_count);
  report.checks.push('Saved imported prefab hierarchy survives project close/reopen');
  report.errors = await query('console.get_logs', { level: 'error', limit: 40 });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.ok((await query('window.list')).every(window => !window.visible && !window.focused), 'QA editor must remain hidden and unfocused');
  report.passed = true;
} catch (error) {
  report.error = error.stack;
  if (cdp) { try { report.failureUi = await evaluate('document.body.innerText.slice(0, 12000)'); } catch {} }
  try { report.failureLogs = await query('console.get_logs', { limit: 20 }); } catch {}
  process.exitCode = 1;
} finally {
  socket?.close();
  try { await execute('playback.stop'); } catch {}
  try { report.shutdown = await closeNativeQa(root); } catch (error) { report.shutdownError = error.message; report.passed = false; process.exitCode = 1; }
  closeBridgeConnection(); save();
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, error: report.error, report: path.join(root, 'report.json') }));
}
