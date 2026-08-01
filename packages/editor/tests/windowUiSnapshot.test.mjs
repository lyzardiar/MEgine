import assert from 'node:assert/strict';
import test from 'node:test';
import { collectAllWindowUiSnapshots } from '../src/agent/windowUiSnapshot.ts';

const windowInfo = (label, overrides = {}) => ({
  label,
  title: label,
  kind: label === 'main' ? 'main' : 'panel',
  panelKind: label.startsWith('panel-') ? label.slice(6) : null,
  typeId: null,
  editorType: null,
  agentOwned: false,
  url: `tauri://localhost/?window=${label}`,
  visible: false,
  focused: false,
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  scaleFactor: 1,
  ...overrides,
});

const snapshot = (windowLabel, overrides = {}) => ({
  version: 32,
  snapshotRevision: `ui-v32-1-${windowLabel === 'main' ? '0' : '1'}123456789abcdef`,
  windowLabel,
  title: windowLabel,
  url: `tauri://localhost/?window=${windowLabel}`,
  capturedAt: 10,
  captureMethod: 'webview2-cdp-runtime-evaluate',
  backgroundSafe: true,
  viewport: { width: 800, height: 600, deviceScaleFactor: 1, scrollX: 0, scrollY: 0 },
  activeElementSelector: null,
  totalDomElements: 10,
  totalSemanticElements: 1,
  offset: 0,
  count: 1,
  nextOffset: null,
  hasMore: false,
  truncated: false,
  elements: [],
  ...overrides,
});

test('all-window UI snapshot is serial, complete, and totals every stable window', async () => {
  const inventory = [windowInfo('main'), windowInfo('panel-inspector')];
  let active = 0;
  let maximumActive = 0;
  const result = await collectAllWindowUiSnapshots({
    maxElementsPerWindow: 2000,
    readWindows: async () => [...inventory],
    inspectWindow: async (label) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return snapshot(label, {
        totalSemanticElements: label === 'main' ? 20 : 5,
        count: label === 'main' ? 20 : 5,
      });
    },
    now: () => 123,
  });

  assert.equal(maximumActive, 1);
  assert.equal(result.capturedAt, 123);
  assert.equal(result.backgroundSafe, true);
  assert.equal(result.inventoryStable, true);
  assert.equal(result.complete, true);
  assert.equal(result.initialWindowCount, 2);
  assert.equal(result.finalWindowCount, 2);
  assert.equal(result.capturedWindowCount, 2);
  assert.equal(result.failedWindowCount, 0);
  assert.equal(result.totalSemanticElements, 25);
  assert.equal(result.returnedSemanticElements, 25);
  assert.equal(result.hasMore, false);
  assert.deepEqual(result.windows.map((entry) => entry.window.label), [
    'main',
    'panel-inspector',
  ]);
});

test('all-window UI snapshot exposes drift, failures, and per-window continuation', async () => {
  let inventoryRead = 0;
  const result = await collectAllWindowUiSnapshots({
    maxElementsPerWindow: 50,
    readWindows: async () => {
      inventoryRead += 1;
      return inventoryRead === 1
        ? [windowInfo('main'), windowInfo('panel-project')]
        : [windowInfo('main'), windowInfo('editor-new', { kind: 'editor' })];
    },
    inspectWindow: async (label) => {
      if (label === 'panel-project') {
        throw Object.assign(new Error('window closed'), { code: 'NOT_READY' });
      }
      return snapshot(label, {
        totalSemanticElements: 80,
        count: 50,
        nextOffset: 50,
        hasMore: true,
        truncated: true,
      });
    },
  });

  assert.equal(result.inventoryStable, false);
  assert.equal(result.backgroundSafe, false);
  assert.equal(result.complete, false);
  assert.equal(result.capturedWindowCount, 1);
  assert.equal(result.failedWindowCount, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.windows[0].snapshot.nextOffset, 50);
  assert.deepEqual(result.windows[1].error, {
    code: 'NOT_READY',
    message: 'window closed',
  });
});

test('all-window UI snapshot bounds untrusted per-window error details', async () => {
  const inventory = [windowInfo('main')];
  const result = await collectAllWindowUiSnapshots({
    maxElementsPerWindow: 50,
    readWindows: async () => inventory,
    inspectWindow: async () => {
      throw Object.assign(new Error('x'.repeat(1_500)), { code: 'not valid' });
    },
  });

  assert.equal(result.complete, false);
  assert.equal(result.backgroundSafe, false);
  assert.equal(result.windows[0].error.code, 'INTERNAL');
  assert.equal(result.windows[0].error.message.length, 1_000);
});

test('all-window UI snapshot propagates an unsafe per-window attestation', async () => {
  const inventory = [windowInfo('main'), windowInfo('panel-game')];
  const result = await collectAllWindowUiSnapshots({
    maxElementsPerWindow: 50,
    readWindows: async () => inventory,
    inspectWindow: async (label) => snapshot(label, {
      backgroundSafe: label !== 'panel-game',
    }),
  });

  assert.equal(result.inventoryStable, true);
  assert.equal(result.failedWindowCount, 0);
  assert.equal(result.backgroundSafe, false);
  assert.equal(result.complete, false);
});
