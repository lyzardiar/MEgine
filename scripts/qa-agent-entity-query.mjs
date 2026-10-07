// Author: MiYu. Verify and measure entity reads through the native Release editor bridge.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nativeQaRoot, configureNativeQa, closeNativeQa, removeNativeQaFixture } from './frost-native-qa-runtime.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url)), source = path.join(repo, 'samples/frostbound-realms');
const tag = Date.now(), root = path.join(nativeQaRoot, 'entity-query-' + tag), sample = path.join(root, 'sample');
const out = path.join(repo, 'docs/designs/frostbound-realms/native-agent-entity-query-qa.json');
configureNativeQa(root);
fs.cpSync(source, sample, { recursive: true, filter: p => !['SourceAssets', 'Builds'].includes(path.basename(p)) });
const project = JSON.parse(fs.readFileSync(path.join(sample, 'project.json')));
project.storageId = 'entity-query-' + tag;
fs.writeFileSync(path.join(sample, 'project.json'), JSON.stringify(project));
process.env.MENGINE_EDITOR_EXECUTABLE ??= 'D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
process.env.MENGINE_EDITOR_CONFIG_DIR = path.join(root, 'config');
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR, { recursive: true });
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (name, args = {}) => { const start = performance.now(); console.log('EXEC:', name); try { const r = await bridgeExecute(name, args, { requestId: crypto.randomUUID() }); assert.ok(r.ok, r.error?.message); return r.data; } finally { report.executions.push({ name, ms: performance.now() - start }); write(); } };
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report = { author: 'MiYu', passed: false, startedAt: new Date().toISOString(), sample, editorSha256: sha(process.env.MENGINE_EDITOR_EXECUTABLE), storeSha256: sha(path.join(repo, 'packages/editor/src/store.ts')), sceneSha256: sha(path.join(source, 'Assets/Scenes/Main.mscene')), mainSha256: sha(path.join(source, 'Assets/Scripts/Main.js')), entities: JSON.parse(fs.readFileSync(path.join(source, 'Assets/Scenes/Main.mscene'))).world.entities.length, scope: 'Native bridge scene.snapshot versus entity.get on the same paused world; excludes startup and full QA', steps: [], executions: [], modes: [], physicalInput: false };
const write = () => fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
const timed = async (name, fn) => { const start = performance.now(); report.runningStage = name; write(); console.log('START:', name); try { return await fn(); } finally { const ms = performance.now() - start; report.steps.push({ name, ms }); delete report.runningStage; write(); console.log('END:', name, Math.round(ms) + 'ms'); } };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const measure = async fn => { const start = performance.now(), value = await fn(); return { ms: performance.now() - start, value, resultJsonBytes: Buffer.byteLength(JSON.stringify(value)) }; };
let storageHash = 0xcbf29ce484222325n;
for (const byte of Buffer.from(project.storageId)) storageHash = BigInt.asUintN(64, (storageHash ^ BigInt(byte)) * 0x100000001b3n);
const storage = path.join(process.env.LOCALAPPDATA, 'MEngine/UserData', storageHash.toString(16).padStart(16, '0'));
try {
  await timed('project open and editor ready', async () => {
    const bridgeEnd = Date.now() + 180000;
    while (true) {
      try { await query('project.state'); break; } catch (e) {
        if (!/request timed out|workspace is still loading/.test(e.message) || Date.now() >= bridgeEnd) throw e;
        console.log('Waiting for initial bridge readiness:', e.message);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    try { await execute('project.open', { root: sample }); } catch (e) { if (!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(e.message)) throw e; }
    const end = Date.now() + 120000;
    while (true) {
      try { const p = await query('project.state'); if (p.ready && p.editorReady && path.resolve(p.project.root) === path.resolve(sample)) break; } catch (e) { if (!/request timed out|workspace is still loading/.test(e.message)) throw e; }
      assert.ok(Date.now() < end, 'project ready timeout'); await new Promise(r => setTimeout(r, 500));
    }
  });
  for (const mode of ['edit', 'play']) await timed(mode + ' query parity and RPC measurements', async () => {
    if (mode === 'play') { await execute('view.set_game_resolution', { resolution: { width: 1280, height: 720 } }); await execute('panel.focus', { kind: 'game' }); await execute('playback.play', { paused: true }); await execute('playback.step', { deltaTime: .0005, steps: 2 }); }
    const fullTimes = [], entityTimes = [], fullBytes = [], entityBytes = [];
    for (let i = 0; i < 4; i++) {
      const full = () => query('scene.snapshot'), entity = () => query('entity.get', { name: 'Frost telemetry' });
      const first = await measure(i % 2 ? entity : full), second = await measure(i % 2 ? full : entity);
      const a = i % 2 ? second : first, b = i % 2 ? first : second;
      assert.deepEqual(b.value, a.value.entities.find(e => e.name === 'Frost telemetry'));
      assert.equal(a.value.entities.length, report.entities);
      if (i) { fullTimes.push(a.ms); entityTimes.push(b.ms); fullBytes.push(a.resultJsonBytes); entityBytes.push(b.resultJsonBytes); }
    }
    report.modes.push({ mode, samples: 3, warmups: 1, identicalEntityResults: true, fullSnapshotMedianMs: median(fullTimes), entityQueryMedianMs: median(entityTimes), fullSnapshotResultJsonBytes: median(fullBytes), entityResultJsonBytes: median(entityBytes), fullSamplesMs: fullTimes, entitySamplesMs: entityTimes });
  });
  const logs = await query('console.get_logs', { limit: 100 });
  assert.ok(!logs.some(l => l.level === 'error'), JSON.stringify(logs));
  report.consoleErrors = 0; report.passed = true;
  console.log('PASS native entity query:', JSON.stringify(report.modes));
} catch (e) { report.error = e.stack; process.exitCode = 1; console.error(e.stack); }
finally {
  try { await execute('playback.stop'); } catch {}
  try { report.shutdown = await closeNativeQa(root); if (report.passed && report.shutdown.normalExit) report.cleanup = removeNativeQaFixture(root, storage); } catch (e) { report.shutdownError = e.message; report.passed = false; process.exitCode = 1; }
  closeBridgeConnection(); write();
}
