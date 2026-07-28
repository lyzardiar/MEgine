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
  assert.match(mcp, /name: 'preview_asset_rename'/);
  assert.match(mcp, /'rename_asset'/);
  assert.match(mcp, /name: 'preview_asset_trash'/);
  assert.match(mcp, /'restore_asset'/);
  assert.match(mcp, /name: 'get_build_status'/);
  assert.match(mcp, /'start_pc_build'/);
  assert.match(mcp, /name: 'get_editor_events'/);
  assert.match(mcp, /name: 'get_scene_changes'/);
  assert.match(mcp, /name: 'get_project_state'/);
  assert.match(mcp, /name: 'list_recent_projects'/);
  assert.match(mcp, /'open_project'/);
  assert.match(mcp, /'create_project'/);
  assert.match(mcp, /'forget_recent_project'/);
  assert.match(mcp, /mengine:\/\/project\/state/);
  assert.match(mcp, /'step'/);
  assert.match(mcp, /name: 'clear_console_logs'/);
});

test('the main AgentBridge transport is available before a project is opened', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'src', 'DesktopProjectGate.tsx'), 'utf8');
  const projectSession = fs.readFileSync(
    path.join(root, 'src', 'transport', 'desktopProjectSession.ts'),
    'utf8',
  );
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');

  assert.match(main, /function AgentBridgeTransportHost/);
  assert.match(main, /attachBridgeTransport\(\)/);
  assert.match(main, /enabled=\{detachedPanel == null && detachedEditorWindow == null\}/);
  assert.doesNotMatch(app, /attachBridgeTransport/);
  assert.match(gate, /connectProjectLifecycle/);
  assert.match(gate, /attachDesktopProject\(\)/);
  assert.match(gate, /errorCode\(reason\) !== 'noProject'/);
  assert.match(projectSession, /catch \(error\) \{\s*currentProject = null;/);
  assert.match(bridge, /case 'project\.state'/);
  assert.match(bridge, /case 'project\.recent'/);
  assert.match(bridge, /commandId === 'project\.open'/);
  assert.match(bridge, /commandId === 'project\.create'/);
  assert.match(bridge, /commandId === 'project\.forget_recent'/);
  assert.match(bridge, /project switching is blocked to protect unsaved editor state/);
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
  const store = fs.readFileSync(path.join(root, 'src', 'store.ts'), 'utf8');
  const viewport = fs.readFileSync(path.join(root, 'src', 'panels', 'Viewport.tsx'), 'utf8');
  const eventJournal = fs.readFileSync(
    path.join(root, 'src', 'agent', 'eventJournal.ts'),
    'utf8',
  );
  const assetOperations = fs.readFileSync(
    path.join(root, 'src', 'agent', 'assetOperations.ts'),
    'utf8',
  );
  const viteFs = fs.readFileSync(
    path.join(root, 'vite', 'mengineFsPlugin.ts'),
    'utf8',
  );

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
  assert.match(store, /if \(mode === 'pause'\) \{\s*mode = 'play'/);
  assert.match(store, /step\(dt = 1 \/ 60\)/);
  assert.match(store, /simulationTime: playSpin/);
  assert.match(bridge, /simulationTime: snapshot\.simulationTime/);
  assert.match(viewport, /sampleViewportSimulationClock/);
  assert.match(viewport, /resolveAnimatedSpriteFrame\(animatedSprite, animationTime\)/);
  assert.match(viewport, /deltaSeconds: simulationDelta/);
  assert.match(bridge, /case 'scene\.diff'/);
  assert.match(bridge, /case 'events\.get'/);
  assert.match(bridge, /agent_bridge_broadcast/);
  assert.match(eventJournal, /truncated: afterSequence < oldestSequence - 1/);
  assert.match(assetOperations, /previewToken/);
  assert.match(assetOperations, /requireCurrentPreview/);
  assert.match(assetOperations, /allowManualReferences/);
  assert.match(assetOperations, /manifestReferences/);
  assert.match(assetOperations, /referenceScanTruncated/);
  assert.match(assetOperations, /PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT/);
  assert.match(viteFs, /implicitStartupScript/);
  assert.match(viteFs, /materializeImplicitStartupScript/);
  assert.match(viteFs, /collectEffectiveManifestAssetReferences/);
});
