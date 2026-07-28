import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { TYPED_ENTITY_KINDS } from '../src/agent/typedEntityKinds.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('whole-window agent capture is background-safe and addressable by window label', () => {
  const rust = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'agent_bridge.rs'),
    'utf8',
  );
  const native = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const tauriConfig = JSON.parse(fs.readFileSync(
    path.join(root, 'src-tauri', 'tauri.conf.json'),
    'utf8',
  ));
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(rust, /Page\.captureScreenshot/);
  assert.match(rust, /Runtime\.evaluate/);
  assert.match(rust, /WINDOW_UI_SNAPSHOT_SCRIPT/);
  assert.match(rust, /state\.checked = element\.indeterminate \? 'mixed' : element\.checked/);
  assert.match(rust, /WINDOW_UI_CONTENT_SCRIPT/);
  assert.match(rust, /Password values cannot be read/);
  assert.match(rust, /content\.slice\(start, start \+ Number\(maxChars\)\)/);
  assert.match(rust, /const offset = __MENGINE_OFFSET__/);
  assert.match(rust, /candidates\.slice\(offset, offset \+ limit\)/);
  assert.match(rust, /new Map\(candidates\.map/);
  assert.match(rust, /nextOffset:/);
  assert.match(rust, /hasMore:/);
  assert.match(rust, /WINDOW_UI_INTERACTION_SCRIPT/);
  assert.match(rust, /setCheckableInput/);
  assert.match(rust, /HTMLInputElement\.prototype,\s*'checked'/);
  assert.match(rust, /typeof reactProps\.onChange === 'function'/);
  assert.match(rust, /\['checkbox', 'radio'\]\.includes\(element\.type\)/);
  assert.match(rust, /MENGINE_EDITOR_CONFIG_DIR/);
  assert.match(rust, /"click" \| "doubleClick" \| "contextClick" \| "setValue" \| "scroll"/);
  assert.match(rust, /key\.startsWith\('__reactProps\$'\)/);
  assert.match(rust, /actions\.push\('doubleClick'\)/);
  assert.match(rust, /actions\.push\('contextClick'\)/);
  assert.match(rust, /dispatchPointer\('pointerdown'/);
  assert.match(rust, /dispatchPointer\('dblclick'/);
  assert.match(rust, /dispatchPointer\('contextmenu'/);
  assert.match(rust, /element\.scrollBy/);
  assert.match(rust, /actions\.push\('scroll'\)/);
  assert.match(rust, /scrollableOverflow/);
  assert.match(rust, /scrollContextName/);
  assert.match(rust, /meaningfulContentName/);
  assert.match(rust, /interactionName/);
  assert.match(rust, /role: roleForName\(element\) \|\| null/);
  assert.doesNotMatch(rust, /typeof element\.onclick === 'function'/);
  assert.match(rust, /height: element\.scrollHeight/);
  assert.match(rust, /clientHeight: element\.clientHeight/);
  assert.match(rust, /'level',\s*'haspopup',/);
  assert.match(rust, /getAttribute\('data-agent-interaction'\) === 'blocked'/);
  assert.match(rust, /data-agent-blocked-actions/);
  assert.match(rust, /agentInteraction/);
  assert.match(rust, /blockedActions: null/);
  assert.match(rust, /agentPolicy\.blockedActions\.includes\(action\)/);
  assert.match(rust, /agentBlocked: true/);
  assert.match(rust, /agentAlternative: alternative/);
  assert.match(rust, /STANDARD\.encode\(payload\)/);
  assert.match(rust, /window_label:\s*Option<String>/);
  assert.match(rust, /background_safe:\s*true/);
  assert.doesNotMatch(rust, /\bSetForegroundWindow\b\s*\(/);
  assert.doesNotMatch(rust, /\bBitBlt\b\s*\(/);
  assert.match(rust, /sink\.close\(\)\.await/);
  assert.equal(tauriConfig.app.windows[0].visible, false);
  assert.equal(tauriConfig.app.windows[0].focus, false);
  assert.match(native, /MENGINE_EDITOR_BACKGROUND/);
  assert.match(native, /MENGINE_EDITOR_CONFIG_DIR must be an absolute path/);
  assert.match(native, /fn get_editor_instance_id\(state: State<'_, AppState>\)/);
  assert.match(native, /editor_instance_id: uuid::Uuid::new_v4\(\)\.to_string\(\)/);
  assert.match(native, /if starts_in_background\(\)/);
  assert.match(native, /main\.hide\(\)\?/);
  assert.match(native, /main\.set_focusable\(false\)\?/);
  assert.match(native, /main\.show\(\)\?/);
  assert.match(native, /main\.set_focus\(\)\?/);
  assert.match(native, /visible: window\.is_visible\(\)\.unwrap_or\(false\)/);
  assert.match(native, /fn close_editor_window\(/);
  assert.match(native, /validate_agent_editor_window_label/);
  assert.match(native, /window\s*\.destroy\(\)/);
  assert.match(native, /async fn import_project_asset/);
  assert.match(native, /std::fs::hard_link\(&temporary, target\)/);
  assert.match(bridge, /captureWindow\(windowLabel = 'main'\)/);
  assert.match(bridge, /inspectWindow\(/);
  assert.match(bridge, /readWindowContent\(/);
  assert.match(bridge, /offset: boundedOffset/);
  assert.match(bridge, /gameResolution: store\.gameResolution/);
  assert.match(bridge, /capture_editor_window', \{ windowLabel \}/);
  assert.match(mcp, /windowLabel: args\.windowLabel \|\| 'main'/);
  assert.match(mcp, /name: 'get_window_ui'/);
  assert.match(mcp, /name: 'read_window_ui_content'/);
  assert.match(mcp, /Continue with nextOffset until null/);
  assert.match(mcp, /name: 'list_open_documents'/);
  assert.match(mcp, /name: 'get_active_dialog'/);
  assert.match(mcp, /'click_window_ui'/);
  assert.match(mcp, /'double_click_window_ui'/);
  assert.match(mcp, /'open_window_ui_context_menu'/);
  assert.match(mcp, /'set_window_ui_value'/);
  assert.match(mcp, /'scroll_window_ui'/);
  assert.match(mcp, /'respond_to_dialog'/);
  assert.match(mcp, /'close_editor_window'/);
  assert.match(mcp, /name: 'get_panel_layout'/);
  assert.match(mcp, /name: 'list_menu_items'/);
  assert.match(mcp, /'invoke_menu_item'/);
  assert.match(mcp, /name: 'list_scenes'/);
  assert.match(mcp, /name: 'preview_scene_delete'/);
  assert.match(mcp, /'rename_scene'/);
  assert.match(mcp, /'delete_scene'/);
  assert.match(mcp, /name: 'find_entities'/);
  assert.match(mcp, /name: 'get_entity_component'/);
  assert.match(mcp, /name: 'list_assets'/);
  assert.match(mcp, /name: 'read_asset_text'/);
  assert.match(mcp, /'write_asset_text'/);
  assert.match(mcp, /'import_asset_file'/);
  assert.match(mcp, /'create_asset'/);
  assert.match(mcp, /'open_asset'/);
  assert.match(mcp, /'instantiate_asset'/);
  assert.match(mcp, /name: 'get_prefab_instance'/);
  assert.match(mcp, /'create_prefab'/);
  assert.match(mcp, /'apply_prefab'/);
  assert.match(mcp, /'revert_prefab'/);
  assert.match(mcp, /'unpack_prefab'/);
  assert.match(
    mcp,
    /function execTool\(\s*name,\s*description,\s*command,\s*properties,\s*required,\s*mapArgs/,
  );
  assert.match(mcp, /ensureBridgeConnected/);
  assert.match(mcp, /sameEditorProcess/);
  assert.match(mcp, /retryAcrossEditorRestart: true/);
  assert.match(mcp, /its outcome is unknown/);
  assert.match(mcp, /class BridgeRpcError/);
  assert.match(mcp, /class BridgeOutcomeUnknownError/);
  assert.match(mcp, /BUILD_ARTIFACT_REQUEST_TIMEOUT_MS/);
  assert.match(mcp, /const longRunning = command === 'build\.verify'/);
  assert.match(mcp, /toolErrorContent/);
  assert.match(mcp, /data: error\.data/);
  assert.match(mcp, /code: 'UNKNOWN_OUTCOME'/);
  assert.match(mcp, /code: 'BRIDGE_CONNECTION'/);
  assert.match(mcp, /class ToolInputValidationError/);
  assert.match(mcp, /validateToolArguments\(tool, args\)/);
  assert.match(mcp, /additionalProperties: false/);
  assert.match(mcp, /bridgeCommand: command/);
  assert.match(mcp, /BridgeOutcomeUnknownError,\s*RESOURCES,\s*SERVER_INSTRUCTIONS/);
  assert.match(mcp, /instructions: SERVER_INSTRUCTIONS/);
  assert.match(mcp, /protocolVersion: negotiateProtocolVersion\(params\.protocolVersion\)/);
  assert.match(mcp, /SUPPORTED_PROTOCOL_VERSIONS/);
  assert.match(mcp, /case 'resources\/templates\/list'/);
  assert.match(mcp, /respondError\(null, -32700, 'Parse error'\)/);
  assert.match(mcp, /RESOURCES\.map/);
  assert.match(mcp, /editor bridge connects on first read or write/);
  assert.doesNotMatch(mcp, /async function main\(\) \{\s*const connection = await ensureBridgeConnected/);
  assert.match(mcp, /if \(!Array\.isArray\(required\)\)/);
  assert.doesNotMatch(mcp, /required = \[\]/);
  assert.match(mcp, /\.\.\.\(required\.length \? \{ required \} : \{\}\)/);
  assert.match(mcp, /'detach_panel'/);
  assert.match(mcp, /'dock_panel'/);
  assert.match(mcp, /'invoke_component_method'/);
  assert.match(mcp, /'apply_batch'/);
  assert.match(mcp, /'load_scene_json'/);
  assert.match(mcp, /'reorder_entity'/);
  assert.match(mcp, /'translate_entity'/);
  assert.match(mcp, /'set_scene_camera'/);
  for (const kind of TYPED_ENTITY_KINDS) {
    assert.match(mcp, new RegExp(`'${kind}'`));
  }
  assert.match(mcp, /expectedSceneRevision/);
  assert.match(mcp, /key !== 'screenshot'/);
  assert.match(mcp, /textContent\(response\)/);
  assert.match(mcp, /name: 'preview_asset_rename'/);
  assert.match(mcp, /'rename_asset'/);
  assert.match(mcp, /name: 'preview_asset_trash'/);
  assert.match(mcp, /'restore_asset'/);
  assert.match(mcp, /name: 'get_build_status'/);
  assert.match(mcp, /name: 'get_build_artifact_status'/);
  assert.match(mcp, /name: 'get_build_patches'/);
  assert.match(mcp, /name: 'compare_build_history'/);
  assert.match(mcp, /'set_build_scenes'/);
  assert.match(mcp, /'set_build_asset_policy'/);
  assert.match(mcp, /'set_game_resolution'/);
  assert.match(mcp, /'project\.settings'/);
  assert.match(mcp, /'view\.changed'/);
  assert.match(mcp, /'start_pc_build'/);
  assert.match(mcp, /'verify_pc_build'/);
  assert.match(mcp, /'create_build_history_patch'/);
  assert.match(mcp, /'restore_build_history'/);
  assert.match(mcp, /'verify_build_patch'/);
  assert.match(mcp, /name: 'get_editor_events'/);
  assert.match(mcp, /name: 'get_scene_changes'/);
  assert.match(mcp, /name: 'get_project_state'/);
  assert.match(mcp, /name: 'get_project_settings'/);
  assert.match(mcp, /'set_sorting_layers'/);
  assert.match(mcp, /'set_tags_and_layers'/);
  assert.match(mcp, /'set_entity_tag'/);
  assert.match(mcp, /'set_entity_tags'/);
  assert.match(mcp, /'set_entity_layer'/);
  assert.match(mcp, /'set_entity_layers'/);
  assert.match(mcp, /'set_entities_active'/);
  assert.match(mcp, /'add_component_to_entities'/);
  assert.match(mcp, /'remove_component_from_entities'/);
  assert.match(mcp, /'set_component_on_entities'/);
  assert.match(mcp, /'patch_component_on_entities'/);
  assert.match(mcp, /name: 'list_recent_projects'/);
  assert.match(mcp, /'open_project'/);
  assert.match(mcp, /'create_project'/);
  assert.match(mcp, /'close_project'/);
  assert.match(mcp, /'forget_recent_project'/);
  assert.match(mcp, /mengine:\/\/project\/state/);
  assert.match(mcp, /'step'/);
  assert.match(mcp, /'clear_console_logs'/);
  assert.match(mcp, /name: 'get_profiler_samples'/);
  assert.match(mcp, /'clear_profiler_samples'/);
  assert.match(mcp, /name: 'describe_command'/);
});

test('the main AgentBridge transport is available before a project is opened', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'src', 'DesktopProjectGate.tsx'), 'utf8');
  const transport = fs.readFileSync(path.join(root, 'src', 'agent', 'transport.ts'), 'utf8');
  const idempotency = fs.readFileSync(
    path.join(root, 'src', 'agent', 'idempotency.ts'),
    'utf8',
  );
  const serialQueue = fs.readFileSync(
    path.join(root, 'src', 'agent', 'serialQueue.ts'),
    'utf8',
  );
  const nativeBridge = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'agent_bridge.rs'),
    'utf8',
  );
  const nativeHost = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const projectSession = fs.readFileSync(
    path.join(root, 'src', 'transport', 'desktopProjectSession.ts'),
    'utf8',
  );
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');

  assert.match(main, /attachBridgeTransport\(\)/);
  assert.match(main, /if \(detachedPanel == null && detachedEditorWindow == null\)/);
  assert.doesNotMatch(main, /useEffect/);
  assert.doesNotMatch(app, /attachBridgeTransport/);
  assert.match(transport, /agent_bridge_set_transport_ready/);
  assert.match(transport, /activation\.queuedRequests\.map\(respondToRequest\)/);
  assert.match(transport, /executeRequests\.run/);
  assert.match(transport, /executeQueue\.run/);
  assert.match(transport, /requireRequestId\(params\.requestId\)/);
  assert.match(idempotency, /class IdempotentRequestCache/);
  assert.match(idempotency, /class IdempotencyConflictError/);
  assert.match(serialQueue, /class SerialTaskQueue/);
  assert.match(nativeBridge, /MAX_QUEUED_BRIDGE_REQUESTS: usize = 256/);
  assert.match(nativeBridge, /bridge_not_ready_response/);
  assert.match(nativeBridge, /cleanup_bridge_discovery/);
  assert.match(nativeBridge, /discovery_file_is_owned/);
  assert.match(nativeHost, /PageLoadEvent::Started/);
  assert.match(nativeHost, /tauri::RunEvent::Exit/);
  assert.match(nativeHost, /cleanup_bridge_discovery\(app_handle, &bridge_token_for_exit\)/);
  assert.match(gate, /connectProjectLifecycle/);
  assert.match(gate, /attachDesktopProject\(\)/);
  assert.match(gate, /errorCode\(reason\) !== 'noProject'/);
  assert.match(projectSession, /catch \(error\) \{\s*currentProject = null;/);
  assert.match(bridge, /case 'project\.state'/);
  assert.match(bridge, /case 'project\.recent'/);
  assert.match(bridge, /commandId === 'project\.open'/);
  assert.match(bridge, /commandId === 'project\.create'/);
  assert.match(bridge, /commandId === 'project\.forget_recent'/);
  assert.equal(
    [...bridge.matchAll(
      /commandId === 'project\.(?:open|create)'\) \{\s*const provider = this\.requireAvailableProjectLifecycle\(\);/g,
    )].length,
    2,
  );
  assert.match(bridge, /await this\.waitForEditorBootAfter\(editorBootGeneration\)/);
  assert.match(bridge, /this\.store != null && this\.editorBootReady/);
  assert.match(app, /markEditorBootReady\(store\)/);
  assert.match(bridge, /call close_project before opening another project/);
});

test('project close is loss-aware, native-atomic, and reconnects the background bridge', () => {
  const native = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const transport = fs.readFileSync(
    path.join(root, 'src', 'transport', 'editorTransport.ts'),
    'utf8',
  );
  const projectSession = fs.readFileSync(
    path.join(root, 'src', 'transport', 'desktopProjectSession.ts'),
    'utf8',
  );
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'src', 'panels', 'MenuBar.tsx'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(native, /fn close_project\(\s*discard_dirty: bool,/);
  assert.match(native, /let _lifecycle = state\.project_lifecycle\.lock\(\)/);
  assert.match(native, /session\.snapshot\(\)\.dirty && !discard_dirty/);
  assert.match(native, /\.filter\(\|\(label, _\)\| label != "main"\)/);
  assert.match(native, /window\s*\.destroy\(\)/);
  assert.match(native, /session\s*\.discard_scene_recovery\(\)/);
  assert.match(native, /let session = project\.take\(\)/);
  assert.match(native, /create_project,\s*open_project,\s*close_project,/);
  assert.match(native, /fn reserve_project_build\(/);
  assert.match(native, /\*active = Some\(build\)/);
  assert.match(transport, /invoke<CloseProjectResult>\('close_project', \{ discardDirty \}\)/);
  assert.match(
    projectSession,
    /const result = await closeProject\(discardDirty\);\s*currentProject = null;\s*resetProjectAssetState\(\)/,
  );
  assert.match(app, /if \(store\.mode !== 'edit'\)/);
  assert.match(app, /dirtyPanels\.length > 0 && !discardDirty/);
  assert.doesNotMatch(
    app,
    /await discardDesktopSceneRecovery\(\);\s*const result = await closeDesktopProject/,
  );
  assert.match(app, /const result = await closeDesktopProject\(discardDirty\)/);
  assert.match(menu, /Close Project/);
  assert.match(bridge, /commandId === 'project\.close'/);
  assert.match(
    bridge,
    /const response = await this\.finishAsyncCommand\([\s\S]*?window\.setTimeout\(\(\) => window\.location\.reload\(\), 250\);\s*return response;/,
  );
  assert.match(mcp, /'close_project'/);
  assert.match(mcp, /'project\.close'/);
  assert.match(mcp, /discardDirty=true/);
});

test('editor dialogs are non-blocking, semantic, and Agent-addressable', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const host = fs.readFileSync(path.join(root, 'src', 'EditorDialogHost.tsx'), 'utf8');
  const dialog = fs.readFileSync(path.join(root, 'src', 'editorDialog.ts'), 'utf8');
  const instance = fs.readFileSync(path.join(root, 'src', 'editorInstance.ts'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const project = fs.readFileSync(path.join(root, 'src', 'panels', 'Project.tsx'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'src', 'panels', 'BuildSettings.tsx'), 'utf8');
  const mcp = fs.readFileSync(
    path.join(root, '..', 'agent', 'mcp', 'server.mjs'),
    'utf8',
  );

  assert.match(main, /<EditorDialogHost \/>/);
  assert.match(host, /role="dialog"/);
  assert.match(host, /aria-modal="true"/);
  assert.match(host, /data-editor-dialog-id=\{dialog\.id\}/);
  assert.match(host, /confirmButton\.current\?\.focus\(\)/);
  assert.match(dialog, /const MAX_QUEUED_DIALOGS = 64/);
  assert.match(dialog, /export function getActiveEditorDialog/);
  assert.match(dialog, /export function respondToEditorDialog/);
  assert.match(dialog, /createEditorBroadcastChannel\(DIALOG_CHANNEL_NAME\)/);
  assert.match(main, /initializeEditorInstance\(await getEditorInstanceId\(\)\)/);
  assert.match(instance, /new BroadcastChannel\(editorBroadcastChannelName\(baseName\)\)/);
  assert.match(dialog, /respondToEditorDialogInWindow/);
  assert.match(app, /type: 'scene-library-changed'/);
  assert.match(app, /refreshSceneLibrary\(\)/);
  assert.match(app, /postSceneLibraryChanged\(\)/);
  assert.match(bridge, /commandId === 'dialog\.respond'/);
  assert.match(bridge, /case 'dialog\.state'/);
  assert.match(mcp, /name: 'get_active_dialog'/);
  assert.match(mcp, /'respond_to_dialog'/);
  assert.match(mcp, /windowLabel: args\.windowLabel \|\| 'main'/);
  for (const source of [app, project, build]) {
    assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\(/);
  }
});

test('every cross-window editor channel is isolated by native editor instance', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const files = [
    'App.tsx',
    'assetEditorEvents.ts',
    'buildEditorEvents.ts',
    'editorDialog.ts',
    'editorProfiler.ts',
    'sortingLayers.ts',
    path.join('panels', 'detachedPanelWindow.ts'),
  ].map((file) => fs.readFileSync(path.join(root, 'src', file), 'utf8'));

  for (const source of files) {
    assert.match(source, /createEditorBroadcastChannel/);
    assert.doesNotMatch(source, /new BroadcastChannel/);
  }
  assert.match(main, /initializeBuildEditorEvents\(\)/);
});

test('panel and menu agent surfaces use live providers and background activation', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const registry = fs.readFileSync(path.join(root, 'src', 'editorWindow', 'registry.ts'), 'utf8');
  const importer = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'assetImportMenuItem.ts'),
    'utf8',
  );
  const nativeWindow = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'nativeEditorWindow.ts'),
    'utf8',
  );
  const decorator = fs.readFileSync(
    path.join(root, 'src', 'editorWindow', 'windows', 'DecoratorGalleryWindow.tsx'),
    'utf8',
  );
  const popup = fs.readFileSync(path.join(root, 'src', 'panels', 'PopupMenu.tsx'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'src', 'DesktopProjectGate.tsx'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'src', 'panels', 'BuildSettings.tsx'), 'utf8');
  const project = fs.readFileSync(path.join(root, 'src', 'panels', 'Project.tsx'), 'utf8');
  const dock = fs.readFileSync(path.join(root, 'src', 'panels', 'DockWorkspace.tsx'), 'utf8');
  const detached = fs.readFileSync(
    path.join(root, 'src', 'panels', 'detachedPanelWindow.ts'),
    'utf8',
  );
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');

  assert.match(bridge, /case 'panel\.get_layout'/);
  assert.match(bridge, /case 'workspace\.documents'/);
  assert.match(bridge, /commandId === 'asset\.open'/);
  assert.match(bridge, /commandId === 'panel\.detach'/);
  assert.match(bridge, /detachPanelWindow\(panel, undefined, false\)/);
  assert.match(bridge, /case 'menu\.list'/);
  assert.match(bridge, /commandId === 'menu\.invoke'/);
  assert.match(bridge, /if \(!entry\.agentInvokable\)/);
  assert.match(bridge, /source: 'agent'/);
  assert.match(bridge, /activateWindow: false/);
  assert.match(registry, /agentInvokable: options\.agentInvokable/);
  assert.match(importer, /agentInvokable: false/);
  assert.match(importer, /agentAlternative: 'import_asset_file'/);
  assert.match(nativeWindow, /visible: activateWindow/);
  assert.match(nativeWindow, /focus: activateWindow/);
  assert.match(decorator, /context\.source !== 'agent'/);
  assert.match(popup, /data-agent-interaction=/);
  assert.match(gate, /data-agent-alternative="open_project"/);
  assert.match(gate, /data-agent-alternative="create_project"/);
  assert.equal(
    [...build.matchAll(/data-agent-interaction="blocked"/g)].length,
    4,
  );
  assert.match(build, /data-agent-alternative="verify_pc_build"/);
  assert.match(build, /data-agent-alternative="start_pc_build"/);
  assert.match(project, /data-agent-blocked-actions=\{a\.kind === 'script' \? 'doubleClick'/);
  assert.match(project, /data-agent-alternative=\{a\.kind === 'script' \? 'read_asset_text'/);
  assert.match(project, /role="tree" aria-label="Project folders"/);
  assert.match(project, /role="treeitem"/);
  assert.match(project, /aria-label=\{f\}/);
  assert.match(project, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(dock, /describePanelLayout\(tree\)/);
  assert.match(dock, /rawDetail\?\.activateWindow !== false/);
  assert.match(detached, /visible: activateWindow/);
  assert.match(detached, /focus: activateWindow/);
  assert.match(app, /\.\.\.resourceDocumentPathsRef\.current/);
  assert.match(app, /setMaterialPath\(message\.materialPath \?\? null\)/);
  assert.match(app, /openAsset: async \(target: AgentResourceEditorTarget\)/);
  assert.match(app, /createAsset: async \(request: AgentCreateAssetRequest\)/);
  assert.match(app, /instantiateAsset: async \(target: AgentInstantiableAssetTarget\)/);
  assert.match(app, /type: 'request-save-resources'/);
  assert.match(app, /type: 'save-resources-result'/);
  assert.match(app, /await saveRemoteResources\(\)/);
  assert.match(app, /Workspace remains dirty after its Save All participants completed/);
});

test('authored resource factories can create without opening or activating their editor', () => {
  const factories = [
    ['Material.tsx', /if \(open\) openMaterialAsset\(path\)/],
    ['MaterialInstance.tsx', /if \(open\) openMaterialAsset\(path\)/],
    ['SurfaceShader.tsx', /if \(open\) openSurfaceShaderAsset\(path\)/],
    ['Timeline.tsx', /if \(open\) openAnimationClipAsset\(path\)/],
    ['Animator.tsx', /if \(open\) openAnimatorAsset\(controllerPath\)/],
    ['SpriteAtlasEditor.tsx', /if \(open\) openSpriteAtlasAsset\(path\)/],
    ['AvatarMask.tsx', /if \(open\) openAnimatorAsset\(path\)/],
    ['Sequencer.tsx', /if \(open\) openTimelineAsset\(path\)/],
  ];
  for (const [file, openGuard] of factories) {
    const source = fs.readFileSync(path.join(root, 'src', 'panels', file), 'utf8');
    assert.match(source, /open = true/);
    assert.match(source, openGuard);
  }
  const animator = fs.readFileSync(path.join(root, 'src', 'panels', 'Animator.tsx'), 'utf8');
  const materialInstance = fs.readFileSync(
    path.join(root, 'src', 'panels', 'MaterialInstance.tsx'),
    'utf8',
  );
  assert.match(animator, /createdPaths: \[clipPath, controllerPath\]/);
  assert.match(materialInstance, /createdPaths\.push\(parent\)/);
  assert.match(materialInstance, /createdPaths\.push\(path\)/);
});

test('scene, asset, and asynchronous build tools share guarded editor services', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
  const commands = fs.readFileSync(path.join(root, 'src', 'agent', 'commands.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const assets = fs.readFileSync(path.join(root, 'src', 'projectAssets.ts'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'src', 'store.ts'), 'utf8');
  const viewport = fs.readFileSync(path.join(root, 'src', 'panels', 'Viewport.tsx'), 'utf8');
  const buildSettings = fs.readFileSync(
    path.join(root, 'src', 'panels', 'BuildSettings.tsx'),
    'utf8',
  );
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
  const prefabWorkflow = fs.readFileSync(
    path.join(root, 'src', 'prefabWorkflow.ts'),
    'utf8',
  );
  const native = fs.readFileSync(
    path.join(root, 'src-tauri', 'src', 'lib.rs'),
    'utf8',
  );

  assert.match(bridge, /case 'scene\.list'/);
  assert.match(bridge, /case 'commands\.describe'/);
  assert.match(bridge, /case 'scene\.delete_preview'/);
  assert.match(bridge, /case 'entity\.find'/);
  assert.match(bridge, /case 'entity\.get_component'/);
  assert.match(commands, /'batch\.apply'/);
  assert.match(commands, /worldCommandBatch/);
  assert.match(store, /cmd\.op === 'removeComponent'/);
  assert.match(bridge, /commandId === 'scene\.new'/);
  assert.match(bridge, /commandId === 'asset\.create'/);
  assert.match(bridge, /commandId === 'scene\.rename'/);
  assert.match(bridge, /commandId === 'scene\.delete'/);
  assert.match(bridge, /Scene deletion preview is stale/);
  assert.match(bridge, /case 'asset\.read_text'/);
  assert.match(bridge, /commandId === 'asset\.write_text'/);
  assert.match(bridge, /commandId === 'asset\.import_file'/);
  assert.match(bridge, /case 'project\.settings'/);
  assert.match(bridge, /commandId === 'project\.settings\.set_sorting_layers'/);
  assert.match(bridge, /commandId === 'project\.settings\.set_tags_and_layers'/);
  assert.match(bridge, /persistSortingLayersGuarded/);
  assert.match(bridge, /persistTagsAndLayersGuarded/);
  assert.match(bridge, /staleSortingLayerRevision/);
  assert.match(bridge, /case 'prefab\.instance'/);
  assert.match(bridge, /commandId === 'prefab\.create'/);
  assert.match(bridge, /commandId === 'prefab\.apply'/);
  assert.match(bridge, /commandId === 'prefab\.revert'/);
  assert.match(bridge, /commandId === 'prefab\.unpack'/);
  assert.match(bridge, /allowSceneDirty: true/);
  assert.match(bridge, /stalePrefabRevision/);
  assert.match(prefabWorkflow, /writeProjectAssetText\(path, serializePrefabAsset\(captured\.asset\), null\)/);
  assert.match(prefabWorkflow, /expectedRevision\?: string/);
  assert.match(prefabWorkflow, /readProjectAssetBytesWithRevision\(instance\.source\)/);
  assert.match(bridge, /importExternalProjectAsset\(sourcePath, normalized\)/);
  assert.match(bridge, /assertDiskMutationAllowed/);
  assert.match(commands, /'component\.invoke'/);
  assert.match(commands, /'entity\.reorder'/);
  assert.match(commands, /'transform\.translate'/);
  assert.match(commands, /'view\.set_camera'/);
  assert.match(commands, /'view\.set_game_resolution'/);
  assert.match(bridge, /sceneCamera: store\.sceneCamera/);
  assert.match(bridge, /setEditorPrefs\(\{ gameResolution: resolution \}\)/);
  assert.match(bridge, /status: 'running'/);
  assert.match(bridge, /listenToPcBuildProgress/);
  assert.match(bridge, /case 'build\.status'/);
  assert.match(bridge, /case 'build\.artifact_status'/);
  assert.match(bridge, /'STALE_REVISION'/);
  assert.match(bridge, /result\.sceneRevision = this\.sceneChanges\.revision/);
  assert.match(bridge, /commandId === 'build\.settings\.set_scenes'/);
  assert.match(bridge, /commandId === 'build\.settings\.set_asset_policy'/);
  assert.match(bridge, /staleBuildSettingsRevision/);
  assert.match(bridge, /availableScenes/);
  assert.match(bridge, /commandId === 'build\.verify'/);
  assert.match(bridge, /verifyPcPlayer\(executable, expectedContentHash\)/);
  assert.match(bridge, /case 'build\.patches'/);
  assert.match(bridge, /case 'build\.history\.compare'/);
  assert.match(bridge, /commandId === 'build\.history\.create_patch'/);
  assert.match(bridge, /commandId === 'build\.history\.restore'/);
  assert.match(bridge, /commandId === 'build\.patch\.verify'/);
  assert.match(bridge, /requiredAbsolutePath\(args, 'publicKeyPath'\)/);
  assert.match(bridge, /private startBuildArtifactJob/);
  assert.match(bridge, /cancellable: false/);
  assert.match(buildSettings, /PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT/);
  assert.match(buildSettings, /PROJECT_BUILD_SETTINGS_CHANGED_EVENT/);
  assert.match(eventJournal, /'build\.settings'/);
  assert.match(eventJournal, /'project\.settings'/);
  assert.match(eventJournal, /'view\.changed'/);
  assert.match(app, /connectSceneCommands/);
  assert.match(app, /rename: async \(\{ oldName: rawOldName, newName: rawNewName \}\)/);
  assert.match(app, /delete: async \(\{ name: rawName, expectedRevision \}\)/);
  assert.match(app, /deleteScene\(name, expectedRevision\)/);
  assert.match(
    app,
    /\(!options\.allowSceneDirty && sceneDirtyRef\.current\) \|\| resourceDirtyRef\.current/,
  );
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
  assert.match(viteFs, /sorting-layers-snapshot/);
  assert.match(viteFs, /sorting-layers-guarded/);
  assert.match(native, /get_project_sorting_layers_snapshot/);
  assert.match(native, /save_project_sorting_layers_guarded/);
  assert.match(native, /write_sorting_layers_guarded/);
  assert.match(viteFs, /collectEffectiveManifestAssetReferences/);
});
