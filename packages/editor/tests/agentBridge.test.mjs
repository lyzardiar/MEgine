import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('whole-window agent capture is background-safe and addressable by window label', () => {
  const rust = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'agent_bridge.rs'),
    'utf8',
  );
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(rust, /Page\.captureScreenshot/);
  assert.match(rust, /Runtime\.evaluate/);
  assert.match(rust, /WINDOW_UI_SNAPSHOT_SCRIPT/);
  assert.match(rust, /WINDOW_UI_INTERACTION_SCRIPT/);
  assert.match(rust, /matches!\(action\.as_str\(\), "click" \| "setValue"\)/);
  assert.match(rust, /STANDARD\.encode\(payload\)/);
  assert.match(rust, /window_label:\s*Option<String>/);
  assert.match(rust, /background_safe:\s*true/);
  assert.doesNotMatch(rust, /\bSetForegroundWindow\b\s*\(/);
  assert.doesNotMatch(rust, /\bBitBlt\b\s*\(/);
  assert.match(rust, /sink\.close\(\)\.await/);
  assert.match(bridge, /captureWindow\(windowLabel = 'main'\)/);
  assert.match(bridge, /inspectWindow\(/);
  assert.match(bridge, /capture_editor_window', \{ windowLabel \}/);
  assert.match(mcp, /windowLabel: args\.windowLabel \|\| 'main'/);
  assert.match(mcp, /name: 'get_window_ui'/);
  assert.match(mcp, /'click_window_ui'/);
  assert.match(mcp, /'set_window_ui_value'/);
  assert.match(mcp, /name: 'get_panel_layout'/);
  assert.match(mcp, /name: 'list_menu_items'/);
  assert.match(mcp, /'invoke_menu_item'/);
  assert.match(mcp, /name: 'list_scenes'/);
  assert.match(mcp, /name: 'list_assets'/);
  assert.match(mcp, /name: 'read_asset_text'/);
  assert.match(mcp, /'write_asset_text'/);
  assert.match(mcp, /name: 'get_build_status'/);
  assert.match(mcp, /'start_pc_build'/);
});

test('the main AgentBridge transport is available before a project is opened', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');

  assert.match(main, /function AgentBridgeTransportHost/);
  assert.match(main, /attachBridgeTransport\(\)/);
  assert.match(main, /enabled=\{detachedPanel == null && detachedEditorWindow == null\}/);
  assert.doesNotMatch(app, /attachBridgeTransport/);
});

test('panel and menu agent surfaces use live providers and background activation', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const dock = fs.readFileSync(path.join(root, 'src', 'panels', 'DockWorkspace.tsx'), 'utf8');

  assert.match(bridge, /case 'panel\.get_layout'/);
  assert.match(bridge, /case 'menu\.list'/);
  assert.match(bridge, /commandId === 'menu\.invoke'/);
  assert.match(bridge, /activateWindow: false/);
  assert.match(dock, /describePanelLayout\(tree\)/);
  assert.match(dock, /rawDetail\?\.activateWindow !== false/);
});

test('scene, asset, and asynchronous build tools share guarded editor services', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const assets = fs.readFileSync(path.join(root, 'src', 'projectAssets.ts'), 'utf8');

  assert.match(bridge, /case 'scene\.list'/);
  assert.match(bridge, /commandId === 'scene\.new'/);
  assert.match(bridge, /case 'asset\.read_text'/);
  assert.match(bridge, /commandId === 'asset\.write_text'/);
  assert.match(bridge, /assertDiskMutationAllowed/);
  assert.match(bridge, /status: 'running'/);
  assert.match(bridge, /listenToPcBuildProgress/);
  assert.match(bridge, /case 'build\.status'/);
  assert.match(app, /connectSceneCommands/);
  assert.match(app, /sceneDirtyRef\.current \|\| resourceDirtyRef\.current/);
  assert.match(app, /pass discardDirty=true/);
  assert.match(assets, /expectedRevision === undefined/);
});
