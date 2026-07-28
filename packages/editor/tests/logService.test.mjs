import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatConsoleLog,
  INITIAL_EDITOR_LOGS,
  LogService,
} from '../src/agent/LogService.ts';

test('visible Console and Agent logs share structured startup entries', () => {
  const service = new LogService(INITIAL_EDITOR_LOGS);
  const entries = service.getEntries();

  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(formatConsoleLog), [
    'MEngine Editor',
    '场景落盘：packages/editor/project/Assets/Scenes/*.mscene',
    '新建会弹出命名；双击 .mscene 打开；Ctrl+S 保存',
  ]);
  assert.ok(entries.every((entry) => entry.source === 'editor'));
});

test('structured logs filter, cap, clone, and notify deterministically', () => {
  const service = new LogService();
  const changes = [];
  const unsubscribe = service.subscribe((change) => changes.push(change));

  service.log('first', 'info', 'test');
  service.log('warning', 'warn');
  const warning = service.getEntries({ level: 'warn' });
  assert.deepEqual(warning.map(formatConsoleLog), ['[Warn] warning']);
  warning[0].message = 'mutated clone';
  assert.equal(service.getEntries({ level: 'warn' })[0].message, 'warning');

  for (let index = 0; index < 305; index += 1) service.log(`entry ${index}`);
  const entries = service.getEntries();
  assert.equal(entries.length, 300);
  assert.equal(entries[0].message, 'entry 5');
  assert.equal(service.getEntries({ limit: 2 })[0].message, 'entry 303');

  service.clear();
  unsubscribe();
  assert.deepEqual(service.getEntries(), []);
  assert.equal(changes.at(-1).type, 'cleared');
});

test('cross-window Console snapshots preserve overlap and publish only new entries', () => {
  const service = new LogService([
    { level: 'info', message: 'first', time: 1 },
    { level: 'warn', message: 'second', time: 2 },
    { level: 'error', message: 'third', time: 3 },
  ]);
  const changes = [];
  service.subscribe((change) => changes.push(change));

  service.syncConsoleLines([
    '[Warn] second',
    '[Error] third',
    'fourth',
  ], 'detached-window');

  const entries = service.getEntries();
  assert.deepEqual(entries.map(formatConsoleLog), [
    '[Warn] second',
    '[Error] third',
    'fourth',
  ]);
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.time), [2, 3]);
  assert.equal(entries[2].source, 'detached-window');
  assert.deepEqual(changes.map((change) => change.type), ['added']);

  service.syncConsoleLines(['replacement']);
  assert.deepEqual(service.getEntries().map(formatConsoleLog), ['replacement']);
  assert.deepEqual(changes.slice(-2).map((change) => change.type), ['cleared', 'added']);
});
