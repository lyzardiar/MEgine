// Author: MiYu. Render the shared asset preview in an isolated native editor project.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'asset-library/warcraft-iii/classic');
const project = path.join(root, 'tmp/warcraft-native-preview');
const config = path.join(root, 'tmp/warcraft-native-editor-config');
const scenePath = 'Assets/WarcraftIII/Scenes/Preview.mscene';
const scene = JSON.parse(fs.readFileSync(path.join(source, scenePath), 'utf8'));
const files = new Set([scenePath]);
for (const e of scene.world.entities) {
  const renderer = e.components.MeshRenderer;
  if (!renderer) continue;
  files.add(renderer.mesh);
  files.add(renderer.material);
  const material = JSON.parse(fs.readFileSync(path.join(source, renderer.material), 'utf8'));
  if (material.base_color_texture) files.add(material.base_color_texture);
}
for (const entry of JSON.parse(fs.readFileSync(path.join(source, 'Assets/WarcraftIII/model-catalog.json'), 'utf8')).models) files.add(entry.prefab);
for (const relative of files) {
  if (!relative.startsWith('Assets/') || relative.includes('..')) throw Error('Unsafe preview path');
  const target = path.join(project, relative);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.copyFileSync(path.join(source, relative), target);
  fs.copyFileSync(path.join(source, relative+'.meta'), target+'.meta');
}
fs.mkdirSync(config, {recursive:true});
fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({name:'Warcraft III asset preview',version:1,language:'javascript',mainScene:scenePath,buildScenes:[scenePath],assetMode:'all'}));
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
process.env.MENGINE_EDITOR_CONFIG_DIR = config;
process.env.MENGINE_AGENT_BRIDGE_FILE = path.join(config, 'agent-bridge-background.json');
process.env.MENGINE_EDITOR_EXECUTABLE ||= path.join(root, 'target/release/mengine-editor-tauri.exe');
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery,bridgeExecute,closeBridgeConnection} = await import('../packages/agent/mcp/server.mjs');
const execute = (command, args={}) => bridgeExecute(command, args, {requestId:crypto.randomUUID()});
const ready = async (requireWorkspace=false) => {
  const deadline = Date.now()+30000;
  while (Date.now() < deadline) {
    try {
      const state = await bridgeQuery('project.state');
      if (!requireWorkspace || state.ready && state.editorReady) return state;
    }
    catch (error) {
      if (error.code !== 'NOT_READY') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error('Native preview workspace did not become ready');
};
try {
  const initial = await ready();
  const discovery = JSON.parse(fs.readFileSync(process.env.MENGINE_AGENT_BRIDGE_FILE, 'utf8'));
  if (discovery.background !== true) throw Error('Preview requires its own background editor');
  if (initial.ready && initial.editorReady) await execute('playback.stop');
  await execute('project.open', {root:project});
  await ready(true);
  await execute('view.set_game_resolution', {resolution:{width:1280,height:720}});
  await execute('panel.focus', {kind:'game'});
  await execute('playback.play');
  await new Promise(resolve => setTimeout(resolve, 1200));
  const shot = await bridgeQuery('view.screenshot', {target:'game'});
  fs.writeFileSync(path.join(source, 'Validation/native-preview.png'), Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
  const snapshot = await bridgeQuery('scene.snapshot');
  console.log(JSON.stringify({preview:path.join(source,'Validation/native-preview.png'),project,entities:snapshot.entities.length}));
} finally {
  await closeBridgeConnection();
}
