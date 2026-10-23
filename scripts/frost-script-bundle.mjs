// Author: MiYu. Compose the shared game and installed map runtimes without regenerating assets.
import fs from 'node:fs';
import path from 'node:path';
import {WARCRAFT_OPTION_BINDINGS} from './frost-warcraft-options.mjs';
export const gameModules=['warcraft-jass','warcraft-unit-initialization','warcraft-map-units','night-elf-ai-source','night-elf-ai','demon-hunter','keeper','priestess','warden','blood-mage','archmage','paladin','lich','dreadlord','crypt-lord','death-knight','mountain-king','blademaster','farseer','tauren','shadowhunter','moba-objectives','simulation','terrain','visuals','effects','effect-pool','hud','ui-manager','portrait-camera','warcraft-options','client','map-session'];
export function readMapPackages(project){
  const file=path.join(project,'Assets/Maps/catalog.json');
  if(!fs.existsSync(file))return [];
  const catalog=JSON.parse(fs.readFileSync(file,'utf8'));
  if(catalog.version!==1||!Array.isArray(catalog.maps))throw Error('Invalid map catalog');
  const ids=new Set();
  for(const entry of catalog.maps){
    if(!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)||ids.has(entry.id))throw Error('Invalid or duplicate map ID');
    ids.add(entry.id);
    for(const key of ['scene','script',...(entry.previewImage===undefined?[]:['previewImage'])])if(typeof entry[key]!=='string'||!entry[key].startsWith('Assets/Maps/'+entry.id+'/')||entry[key].includes('\\')||entry[key].split('/').includes('..')||!fs.statSync(path.join(project,entry[key])).isFile())throw Error('Invalid map '+key);
    if(typeof entry.title!=='string'||typeof entry.description!=='string'||entry.runtime!=='warcraft-scene'||entry.gameplay!==false||!Array.isArray(entry.preview)||entry.preview.length!==256||entry.preview.some(v=>![0,1,2].includes(v)))throw Error('Invalid map presentation');
  }
  return catalog.maps;
}
export function composeGameModules(source,project,entries=readMapPackages(project)){
  const packages=entries.map(entry=>'{...'+JSON.stringify(entry)+',create:function(){\n'+fs.readFileSync(path.join(project,entry.script),'utf8')+'\nreturn {tick:onTick,pathing:originalMapPathing,unitData:typeof originalUnitBindings==="undefined"?null:originalUnitBindings,initialization:typeof originalUnitInitializationSource==="undefined"?null:FrostWarcraftUnitInitialization.initialize(originalUnitInitializationSource),camera:typeof originalMapCamera==="undefined"?null:originalMapCamera};\n}}');
  const menu=JSON.parse(fs.readFileSync(path.join(source,'warcraft-menu-background.json'),'utf8'));
  const lobby=JSON.parse(fs.readFileSync(path.join(source,'warcraft-lobby-layout.json'),'utf8'));
  const {pages}=JSON.parse(fs.readFileSync(path.join(source,'warcraft-options-layout.json'),'utf8'));
  return 'var FrostMapPackages=['+packages.join(',\n')+'];\nvar FrostWarcraftLobby='+JSON.stringify({slot:lobby.slot,strings:lobby.strings})+';\nvar FrostWarcraftMenu='+JSON.stringify({models:menu.models,camera:menu.camera,playback:menu.playback})+';\nvar FrostWarcraftOptions='+JSON.stringify({pages,bindings:WARCRAFT_OPTION_BINDINGS})+';\n'+gameModules.map(name=>fs.readFileSync(path.join(source,'game',name+'.js'),'utf8').replace(/\r\n/g,'\n')).join('\n');
}
export function syncGameScript(source,project=source){
  const file=path.join(project,'Assets/Scripts/Main.js'),text=fs.readFileSync(file,'utf8');
  const script=gameScriptPrefix(source,text)+composeGameModules(source,project);
  fs.writeFileSync(file,script);
  return {bytes:Buffer.byteLength(script),maps:readMapPackages(project).length};
}
export function gameScriptPrefix(source,text){
  const marker='var FrostMapPackages=',legacy=fs.readFileSync(path.join(source,'game/night-elf-ai-source.js'),'utf8').split(/\r?\n/)[0];
  const start=text.indexOf(marker)>=0?text.indexOf(marker):text.indexOf(legacy);
  if(start<0)throw Error('Cannot locate generated game module boundary');
  return text.slice(0,start);
}
