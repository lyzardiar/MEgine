// Author: MiYu. Refresh linked UI instances while retaining existing scene entity IDs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyUiPrefabs} from './frost-ui-prefabs.mjs';
import {configureWarcraftButtons} from './frost-warcraft-ui.mjs';
import {syncGameScript} from './frost-script-bundle.mjs';

export function syncFrostUI(project){
  const scenePath=path.join(project,'Assets/Scenes/Main.mscene'),scriptPath=path.join(project,'Assets/Scripts/Main.js');
  const scene=JSON.parse(fs.readFileSync(scenePath,'utf8')),before=scene.world.entities;
  let script=fs.readFileSync(scriptPath,'utf8');
  const read=name=>JSON.parse(script.match(new RegExp('^var '+name+'=(.*);$','m'))[1]);
  const buttons=configureWarcraftButtons(read('FrostButtons')),originalIds=new Map(before.map(e=>[e.name,e.entity])),originalOrder=new Map(before.map((e,i)=>[e.name,i]));
  let nextId=Math.max(...before.map(e=>e.entity))+1;
  const manifest=applyUiPrefabs(before,buttons,project),ids=new Map();
  configureWarcraftButtons(buttons,manifest);
  for(const e of before)ids.set(e.entity,originalIds.get(e.name)??nextId++);
  for(const e of before){e.entity=ids.get(e.entity);if(e.parent!=null)e.parent=ids.get(e.parent);for(const c of Object.values(e.components))for(const key of ['render_camera','render_root'])if(c[key]&&ids.has(Number(c[key])))c[key]=String(ids.get(Number(c[key])));}
  for(const layer of manifest.layers)layer.entity=ids.get(layer.entity);
  for(const screen of manifest.screens)screen.root=ids.get(screen.root);
  before.sort((a,b)=>(originalOrder.get(a.name)??Infinity)-(originalOrder.get(b.name)??Infinity));
  const names=new Set(before.map(e=>e.name)),init=read('FrostSceneInitNames').filter(n=>names.has(n));
  for(const name of Object.keys(manifest.nodes))if(!init.includes(name))init.push(name);
  for(const [name,value] of Object.entries({FrostButtons:buttons,FrostUIManifest:manifest,FrostSceneInitNames:init,FrostSceneInactive:before.filter(e=>e.active===false).map(e=>e.name)}))script=script.replace(new RegExp('^var '+name+'=.*;$','m'),()=> 'var '+name+'='+JSON.stringify(value)+';');
  fs.writeFileSync(scenePath,JSON.stringify(scene,null,2)+'\n');fs.writeFileSync(scriptPath,script);syncGameScript(project);
  return {entities:before.length,controls:buttons.length,screens:manifest.screens.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(syncFrostUI(path.resolve(process.argv[2]??'samples/frostbound-realms')));
