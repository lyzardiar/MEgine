import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseArgsObject,
  parseCliArguments,
} from '../../agent/cli/editor.mjs';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(editorRoot, '..', '..');
const cliPath = path.join(repositoryRoot, 'packages', 'agent', 'cli', 'editor.mjs');

test('Agent CLI parses strict query and revision-safe execute invocations', () => {
  assert.deepEqual(parseCliArguments(['query', 'window.list', '--compact']), {
    help: false,
    operation: 'query',
    id: 'window.list',
    argsSource: null,
    discoveryFile: null,
    requestId: null,
    expectedSceneRevision: undefined,
    screenshot: false,
    compact: true,
  });
  assert.deepEqual(parseCliArguments([
    'execute',
    'intent.apply',
    '--args',
    '{"intent":{"kind":"SetClearColor","color":[0,0,0,1]}}',
    '--request-id',
    'cli-test',
    '--expected-scene-revision',
    '12',
    '--screenshot',
  ]), {
    help: false,
    operation: 'execute',
    id: 'intent.apply',
    argsSource: '{"intent":{"kind":"SetClearColor","color":[0,0,0,1]}}',
    discoveryFile: null,
    requestId: 'cli-test',
    expectedSceneRevision: 12,
    screenshot: true,
    compact: false,
  });
});

test('Agent CLI rejects ambiguous flags and malformed safe-integer options', () => {
  for (const argv of [
    [],
    ['unknown', 'editor.state'],
    ['query'],
    ['query', 'editor.state', '--request-id', 'query-write-key'],
    ['query', 'editor.state', '--expected-scene-revision', '1'],
    ['query', 'editor.state', '--screenshot'],
    ['execute', 'history.undo', '--expected-scene-revision', '-1'],
    ['execute', 'history.undo', '--expected-scene-revision', '1.5'],
    ['execute', 'history.undo', '--args', '{}', '--args', '{}'],
    ['execute', 'history.undo', '--unknown'],
  ]) {
    if (argv.length === 0) {
      assert.deepEqual(parseCliArguments(argv), { help: true });
    } else {
      assert.throws(() => parseCliArguments(argv));
    }
  }
});

test('Agent CLI accepts bounded inline and file-backed JSON objects', async () => {
  assert.deepEqual(await parseArgsObject('{"windowLabel":"main"}'), {
    windowLabel: 'main',
  });
  assert.deepEqual(await parseArgsObject('\uFEFF{"windowLabel":"main"}'), {
    windowLabel: 'main',
  });
  await assert.rejects(() => parseArgsObject('[]'), /JSON object/);
  await assert.rejects(() => parseArgsObject('{'), /not valid JSON/);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-agent-cli-test-'));
  try {
    const file = path.join(temporary, 'args.json');
    fs.writeFileSync(file, '{"fromRevision":7}', 'utf8');
    assert.deepEqual(await parseArgsObject(`@${file}`), { fromRevision: 7 });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Agent CLI is a standalone JSON-producing executable before bridge connection', () => {
  const agentPackage = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'packages', 'agent', 'package.json'),
    'utf8',
  ));
  assert.equal(agentPackage.bin['mengine-agent'], './cli/editor.mjs');

  const help = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /mengine-agent query <query-id>/);

  const invalid = spawnSync(
    process.execPath,
    [cliPath, 'query', 'editor.state', '--args', '[]', '--compact'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, '');
  assert.deepEqual(JSON.parse(invalid.stderr), {
    ok: false,
    error: {
      code: 'INVALID_ARGS',
      message: '--args must contain a JSON object',
    },
  });

  const invalidOption = spawnSync(
    process.execPath,
    [cliPath, 'query', 'editor.state', '--request-id', 'not-valid-for-query', '--compact'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  assert.equal(invalidOption.status, 2);
  assert.equal(invalidOption.stdout, '');
  assert.deepEqual(JSON.parse(invalidOption.stderr), {
    ok: false,
    error: {
      code: 'INVALID_ARGS',
      message: '--request-id is valid only for execute',
    },
  });
});
