// Lumen Shoal native render QA: open the sample in the packaged editor, play the staged
// reveal, capture screenshots, and assert that no custom Surface Shader pipeline was
// rejected (materialPipelinesRejected === 0). Requires a prebuilt editor executable.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const sample = path.join(repo, 'samples', 'lumen-shoal');
const out = path.join(repo, 'docs', 'designs', 'lumen-shoal');
fs.mkdirSync(out, {recursive: true});

process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
process.env.MENGINE_EDITOR_CONFIG_DIR = path.join(repo, 'tmp', 'lumen-qa-config');
process.env.MENGINE_EDITOR_EXECUTABLE = process.env.MENGINE_EDITOR_EXECUTABLE
  || path.join(repo, 'target/release/mengine-editor-tauri.exe');
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS =
  '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR, {recursive: true});

const {bridgeQuery, bridgeExecute, closeBridgeConnection} = await import('../packages/agent/mcp/server.mjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const execute = async (name, args = {}) => {
  const r = await bridgeExecute(name, args, {requestId: crypto.randomUUID()});
  assert.ok(r.ok, r.error?.message);
  return r.data;
};
const until = async (check, label, timeoutMs = 120000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const v = await check(); if (v) return v; }
    catch (e) { if (e.name !== 'BridgeConnectionError' && !/loading|NOT_READY/i.test(e.message + ' ' + (e.code || ''))) throw e; }
    await sleep(400);
  }
  throw new Error('Timed out: ' + label);
};
const press = async key => {
  await execute('playback.input', {keys: [key], viewport: [1920, 1080]});
  await sleep(160);
  await execute('playback.input', {keys: [], viewport: [1920, 1080]});
  await sleep(160);
};
const capture = async name => {
  await sleep(700);
  const shot = await bridgeQuery('view.screenshot', {target: 'game'});
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
  console.log('  captured', path.relative(repo, file));
};

const report = {passed: false, executable: process.env.MENGINE_EDITOR_EXECUTABLE, shots: [], measuredAt: new Date().toISOString()};
try {
  const boot = await until(() => bridgeQuery('project.state'), 'bridge ready');
  if (!boot.ready || path.resolve(boot.project?.root || '') !== path.resolve(sample)) {
    try { await execute('project.open', {root: sample}); }
    catch (e) { if (e.name !== 'BridgeConnectionError' && !/already open|loading/i.test(e.message)) throw e; }
  }
  await until(async () => {
    const p = await bridgeQuery('project.state');
    return p.ready && p.editorReady && path.resolve(p.project.root) === path.resolve(sample) && (await bridgeQuery('scene.snapshot'));
  }, 'scene ready');

  await execute('view.set_game_resolution', {resolution: {width: 1920, height: 1080}});
  await execute('panel.focus', {kind: 'game'});
  await execute('playback.play');
  await sleep(2500);
  await press('Tab');            // stop auto-play so Space stepping is deterministic
  await sleep(400);
  await capture('stage-01-3d-stage');

  for (let i = 2; i <= 6; i += 1) { await press('Space'); await sleep(2600); await capture('stage-0' + i); }

  // Stylised variants on the finished scene.
  await press('Digit2'); await sleep(2200); await capture('style-low-poly');
  await press('Digit3'); await sleep(2200); await capture('style-pixel');
  await press('Digit1'); await sleep(1500);

  const profile = await bridgeQuery('profiler.get_samples', {source: 'game', limit: 80});
  const rejected = profile?.nativeLatest?.counts?.materialPipelinesRejected;
  report.materialPipelinesRejected = rejected;
  report.profiler = profile?.nativeSummary ?? null;
  assert.equal(rejected, 0, `material pipelines rejected: ${rejected}`);
  report.passed = true;
  console.log('PASS Lumen Shoal native render, 6 stages + 3 styles, zero rejected pipelines');
} catch (e) {
  report.error = e.stack;
  console.error('FAIL', e.message);
} finally {
  fs.writeFileSync(path.join(out, 'native-lumen-qa.json'), JSON.stringify(report, null, 2) + '\n');
  try { await execute('playback.stop'); } catch {}
  closeBridgeConnection();
}
process.exit(report.passed ? 0 : 1);
