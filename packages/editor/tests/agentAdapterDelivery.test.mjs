import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createMcpClientConfiguration,
  formatAgentAdapterCommand,
} from '../src/agentAdapterConfig.ts';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(editorRoot, '..', '..');

test('MCP client configuration preserves verified command and argument boundaries', () => {
  const info = {
    schemaVersion: 1,
    source: 'bundled',
    mcp: {
      command: 'C:\\Program Files\\MEngine\\build-sdk\\node.exe',
      args: ['C:\\Program Files\\MEngine\\build-sdk\\agent\\mcp\\server.mjs'],
      env: { MENGINE_AGENT_EDITOR_MODE: 'auto-background' },
    },
    cli: { command: 'node', args: ['agent/cli/editor.mjs'] },
    http: { command: 'node', args: ['agent/http/server.mjs'] },
    mcpLauncher: 'mengine-mcp.cmd',
    cliLauncher: 'mengine-agent.cmd',
    httpLauncher: 'mengine-agent-http.cmd',
  };

  assert.deepEqual(JSON.parse(createMcpClientConfiguration(info)), {
    mcpServers: {
      mengine: info.mcp,
    },
  });
  assert.equal(
    formatAgentAdapterCommand(info.mcp),
    '"C:\\Program Files\\MEngine\\build-sdk\\node.exe" '
      + '"C:\\Program Files\\MEngine\\build-sdk\\agent\\mcp\\server.mjs"',
  );
  assert.equal(
    formatAgentAdapterCommand({ command: 'node', args: ['path with "quote"/agent.mjs'] }),
    'node "path with \\"quote\\"/agent.mjs"',
  );
});

test('desktop package delivers all Agent adapters and exposes a background-readable setup window', () => {
  const prepare = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'prepare-editor-build-sdk.mjs'),
    'utf8',
  );
  const native = fs.readFileSync(
    path.join(editorRoot, 'src-tauri', 'src', 'lib.rs'),
    'utf8',
  );
  const transport = fs.readFileSync(
    path.join(editorRoot, 'src', 'transport', 'editorTransport.ts'),
    'utf8',
  );
  const window = fs.readFileSync(
    path.join(editorRoot, 'src', 'editorWindow', 'windows', 'AgentSetupWindow.tsx'),
    'utf8',
  );
  const registry = fs.readFileSync(
    path.join(editorRoot, 'src', 'editorWindow', 'index.ts'),
    'utf8',
  );
  const bridge = fs.readFileSync(
    path.join(editorRoot, 'src', 'agent', 'AgentBridge.ts'),
    'utf8',
  );
  const gate = fs.readFileSync(
    path.join(editorRoot, 'src', 'DesktopProjectGate.tsx'),
    'utf8',
  );
  const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.tsx'), 'utf8');

  for (const entry of ['mcp/server.mjs', 'cli/editor.mjs', 'http/server.mjs']) {
    assert.match(prepare, new RegExp(entry.replace('.', '\\.')));
  }
  for (const launcher of ['mengine-mcp', 'mengine-agent', 'mengine-agent-http']) {
    assert.match(prepare, new RegExp(launcher));
  }
  assert.match(prepare, /agent: \{/);
  assert.match(native, /fn get_agent_adapter_info\(/);
  assert.match(native, /load_bundled_agent_adapters/);
  assert.match(native, /get_agent_adapter_info,/);
  assert.match(transport, /invoke<AgentAdapterInfo>\('get_agent_adapter_info'\)/);
  assert.match(registry, /import '\.\/windows\/AgentSetupWindow'/);
  assert.match(window, /registerEditorWindowType\('EditorWindow\.AgentSetupWindow'/);
  assert.match(window, /requiresProject: false/);
  assert.match(window, /registerMenuItem\('Help\/AI Agent Setup'/);
  assert.match(window, /context\.source !== 'agent'/);
  assert.match(window, /data-agent-interaction="blocked"/);
  assert.match(window, /aria-label="MCP client configuration JSON"/);
  assert.match(bridge, /definition\.requiresProject !== false/);
  assert.match(bridge, /requires an active project/);
  assert.match(gate, /AI Agent Setup/);
  assert.match(gate, /data-agent-alternative="open_editor_window"/);
  assert.match(main, /detachedEditorDefinition\?\.requiresProject !== false/);
});

test('editor and packaged Agent adapter versions stay compatible', () => {
  const agentPackage = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'packages', 'agent', 'package.json'),
    'utf8',
  ));
  const cargo = fs.readFileSync(
    path.join(editorRoot, 'src-tauri', 'Cargo.toml'),
    'utf8',
  );
  assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], agentPackage.version);
});
