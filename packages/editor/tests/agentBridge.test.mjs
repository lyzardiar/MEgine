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
  assert.match(rust, /WINDOW_UI_INTERACTION_SCRIPT/);
  assert.match(rust, /matches!\(action\.as_str\(\), "click" \| "setValue"\)/);
  assert.match(rust, /STANDARD\.encode\(payload\)/);
  assert.match(rust, /window_label:\s*Option<String>/);
  assert.match(rust, /background_safe:\s*true/);
  assert.doesNotMatch(rust, /\bSetForegroundWindow\b\s*\(/);
  assert.doesNotMatch(rust, /\bBitBlt\b\s*\(/);
  assert.match(rust, /sink\.close\(\)\.await/);
  assert.equal(tauriConfig.app.windows[0].visible, false);
  assert.equal(tauriConfig.app.windows[0].focus, false);
  assert.match(native, /MENGINE_EDITOR_BACKGROUND/);
  assert.match(native, /if starts_in_background\(\)/);
  assert.match(native, /main\.hide\(\)\?/);
  assert.match(native, /main\.set_focusable\(false\)\?/);
  assert.match(native, /main\.show\(\)\?/);
  assert.match(native, /main\.set_focus\(\)\?/);
  assert.match(native, /visible: window\.is_visible\(\)\.unwrap_or\(false\)/);
  assert.match(native, /async fn import_project_asset/);
  assert.match(native, /std::fs::hard_link\(&temporary, target\)/);
  assert.match(bridge, /captureWindow\(windowLabel = 'main'\)/);
  assert.match(bridge, /inspectWindow\(/);
  assert.match(bridge, /gameResolution: store\.gameResolution/);
  assert.match(bridge, /capture_editor_window', \{ windowLabel \}/);
  assert.match(mcp, /windowLabel: args\.windowLabel \|\| 'main'/);
  assert.match(mcp, /name: 'get_window_ui'/);
  assert.match(mcp, /name: 'list_open_documents'/);
  assert.match(mcp, /'click_window_ui'/);
  assert.match(mcp, /'set_window_ui_value'/);
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
  assert.match(mcp, /function execTool\(name, description, command, properties, required = \[\], mapArgs/);
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
  assert.match(mcp, /'set_build_scenes'/);
  assert.match(mcp, /'start_pc_build'/);
  assert.match(mcp, /'verify_pc_build'/);
  assert.match(mcp, /name: 'get_editor_events'/);
  assert.match(mcp, /name: 'get_scene_changes'/);
  assert.match(mcp, /name: 'get_project_state'/);
  assert.match(mcp, /name: 'get_project_settings'/);
  assert.match(mcp, /'set_sorting_layers'/);
  assert.match(mcp, /name: 'list_recent_projects'/);
  assert.match(mcp, /'open_project'/);
  assert.match(mcp, /'create_project'/);
  assert.match(mcp, /'forget_recent_project'/);
  assert.match(mcp, /mengine:\/\/project\/state/);
  assert.match(mcp, /'step'/);
  assert.match(mcp, /name: 'clear_console_logs'/);
  assert.match(mcp, /name: 'describe_command'/);
});

test('the main AgentBridge transport is available before a project is opened', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'src', 'DesktopProjectGate.tsx'), 'utf8');
  const transport = fs.readFileSync(path.join(root, 'src', 'agent', 'transport.ts'), 'utf8');
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
  assert.match(nativeBridge, /MAX_QUEUED_BRIDGE_REQUESTS: usize = 256/);
  assert.match(nativeBridge, /bridge_not_ready_response/);
  assert.match(nativeHost, /PageLoadEvent::Started/);
  assert.match(gate, /connectProjectLifecycle/);
  assert.match(gate, /attachDesktopProject\(\)/);
  assert.match(gate, /errorCode\(reason\) !== 'noProject'/);
  assert.match(projectSession, /catch \(error\) \{\s*currentProject = null;/);
  assert.match(bridge, /case 'project\.state'/);
  assert.match(bridge, /case 'project\.recent'/);
  assert.match(bridge, /commandId === 'project\.open'/);
  assert.match(bridge, /commandId === 'project\.create'/);
  assert.match(bridge, /commandId === 'project\.forget_recent'/);
  assert.match(bridge, /await this\.waitForEditorBootAfter\(editorBootGeneration\)/);
  assert.match(bridge, /this\.store != null && this\.editorBootReady/);
  assert.match(app, /markEditorBootReady\(store\)/);
  assert.match(bridge, /project switching is blocked to protect unsaved editor state/);
});

test('panel and menu agent surfaces use live providers and background activation', () => {
  const bridge = fs.readFileSync(path.join(root, 'src', 'agent', 'AgentBridge.ts'), 'utf8');
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
  assert.match(bridge, /activateWindow: false/);
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
  assert.match(bridge, /persistSortingLayersGuarded/);
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
  assert.match(bridge, /sceneCamera: store\.sceneCamera/);
  assert.match(bridge, /status: 'running'/);
  assert.match(bridge, /listenToPcBuildProgress/);
  assert.match(bridge, /case 'build\.status'/);
  assert.match(bridge, /'STALE_REVISION'/);
  assert.match(bridge, /result\.sceneRevision = this\.sceneChanges\.revision/);
  assert.match(bridge, /commandId === 'build\.settings\.set_scenes'/);
  assert.match(bridge, /availableScenes/);
  assert.match(bridge, /commandId === 'build\.verify'/);
  assert.match(bridge, /verifyPcPlayer\(executable, expectedContentHash\)/);
  assert.match(buildSettings, /PROJECT_BUILD_SETTINGS_CHANGED_EVENT/);
  assert.match(eventJournal, /'build\.settings'/);
  assert.match(eventJournal, /'project\.settings'/);
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
