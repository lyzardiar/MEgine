// REA / MEngine MCP integration smoke test. Author: MiYu.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reaDir = path.join(root, 'third_party', 'rea');
const require = createRequire(path.join(reaDir, 'package.json'));
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'packages/agent/mcp/rea-source.json'), 'utf8'));

async function withServer(entry, args, run) {
  const client = new Client({ name: 'mengine-rea-smoke', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, entry), ...args], cwd: root, stderr: 'pipe' });
  let stderr = '';
  transport.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192); });
  try {
    await client.connect(transport);
    await run(client);
  } catch (error) {
    if (stderr) console.error(stderr);
    throw error;
  } finally {
    await client.close();
  }
}

test('pinned REA source, runtime, lockfile and maintenance metadata agree', async () => {
  const readJson = async (file) => JSON.parse(await fs.readFile(path.join(reaDir, file), 'utf8'));
  const source = await readJson('source/package.json');
  const runtime = await readJson('node_modules/rea-agents/package.json');
  const lock = await readJson('package-lock.json');
  assert.equal(source.version, metadata.version);
  assert.equal(runtime.version, metadata.version);
  assert.equal(lock.packages['node_modules/rea-agents'].version, metadata.version);
  assert.equal(lock.packages['node_modules/rea-agents'].integrity, metadata.npmIntegrity);
  assert.equal(metadata.upstream, 'https://github.com/morluto/rea');
  assert.ok(metadata.sourceArchive.endsWith(metadata.commit));
  assert.deepEqual(await fs.readFile(path.join(reaDir, 'source/LICENSE')), await fs.readFile(path.join(reaDir, 'node_modules/rea-agents/LICENSE')));
});

test('REA MCP discovers tools and analyzes JavaScript without executing the target', { timeout: 90_000 }, async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'mengine-rea-smoke-'));
  const marker = path.join(fixture, 'executed.txt');
  try {
    await fs.writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'mengine-rea-fixture', type: 'module', main: 'main.js' }));
    await fs.writeFile(path.join(fixture, 'search.js'), 'export function search(items, term) { return items.filter(item => item.includes(term)); }\n');
    await fs.writeFile(path.join(fixture, 'main.js'), `import fs from 'node:fs';\nimport { search } from './search.js';\nfs.writeFileSync(${JSON.stringify(marker)}, 'executed');\nexport const matches = search(['MEngine'], 'Engine');\n`);
    await withServer('third_party/rea/node_modules/rea-agents/scripts/rea.mjs', ['mcp'], async (client) => {
      assert.equal(client.getServerVersion().version, metadata.version);
      const { tools } = await client.listTools();
      for (const name of ['analyze_javascript_application', 'inspect_managed_artifact', 'inspect_managed_members']) assert.ok(tools.some((tool) => tool.name === name), name);
      const result = await client.callTool({ name: 'analyze_javascript_application', arguments: { input_path: fixture } });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      const evidence = result.structuredContent;
      assert.ok(evidence.evidence_id);
      assert.ok(evidence.normalized_result);
      assert.match(JSON.stringify(evidence.normalized_result), /search\.js/);
      assert.match(JSON.stringify(evidence.normalized_result), /main\.js/);
      await assert.rejects(fs.access(marker), { code: 'ENOENT' });
      console.log(JSON.stringify({ server: 'rea', version: metadata.version, tools: tools.length, evidenceId: evidence.evidence_id, operation: evidence.operation, targetExecuted: false }));
    });
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test('MEngine MCP publishes the REA workflow and upstream maintenance information', { timeout: 30_000 }, async () => {
  await withServer('packages/agent/mcp/server.mjs', [], async (client) => {
    const { prompts } = await client.listPrompts();
    assert.ok(prompts.some((prompt) => prompt.name === 'reverse_engineer_feature'));
    const prompt = await client.getPrompt({ name: 'reverse_engineer_feature', arguments: { targetPath: 'D:/apps/example', feature: 'Understand search' } });
    const text = prompt.messages[0].content.text;
    for (const value of [metadata.upstream, metadata.version, metadata.commit, metadata.maintenanceGuide, 'expectedSceneRevision', 'get_scene_changes']) assert.ok(text.includes(value), value);
    console.log(JSON.stringify({ server: 'mengine', prompts: prompts.length, workflow: 'reverse_engineer_feature', upstream: metadata.upstream }));
  });
});
