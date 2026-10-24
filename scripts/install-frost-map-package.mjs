// Author: MiYu. Install converted Warcraft map assets into one game's namespaced map catalog.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {composeGameModules,gameScriptPrefix,readMapPackages} from './frost-script-bundle.mjs';
import {attachUnitInitialization} from './frost-unit-initialization-package.mjs';
import {prepareSharedMapAssets,rewriteGlb} from './frost-shared-map-assets.mjs';
import {groupMapScene} from './frost-map-hierarchy.mjs';

const gameSource=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const walk=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{const file=path.join(folder,e.name);if(e.isSymbolicLink())throw Error('Linked package files are unsupported: '+file);return e.isDirectory()?walk(file):[file];});
const json=value=>JSON.stringify(value,null,2)+'\n';
function write(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
function addControls(scene,project,title){
  groupMapScene(scene);
  const base=read(path.join(project,'Assets/Scenes/Main.mscene')).world.entities,templates=new Map(base.map(e=>[e.name,e]));
  let next=Math.max(...scene.world.entities.map(e=>e.entity))+1;
  const clone=name=>structuredClone(templates.get(name)?.components||{}),entities=scene.world.entities;
  function entity(name,components,parent=null){delete components.__MEnginePrefab;const entry={entity:next++,name,parent,active:true,components};entities.push(entry);return entry.entity;}
  const canvas=clone('Interface');canvas.CanvasScaler.match_width_or_height=0;const root=entity('Map session UI',canvas);
  const rect=(x,y,w,h)=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
  for(const [name,text,x] of [['return','返回选图 [Esc]',-530],['restart','重新加载 [R]',-335]]){
    const box=clone('mapBack box'),label=clone('mapBack label');box.RectTransform=rect(x,-318,180,44);label.RectTransform=rect(x,-318,172,44);label.Text.text=text;
    entity('Map session '+name,box,root);entity('Map session '+name+' label',label,root);
  }
  const status=clone('mapBack label');status.RectTransform=rect(190,-318,830,60);status.Text={...status.Text,text:title+' · 场景运行',font_size:18};entity('Map session status',status,root);
}
export function installMapPackage(source,project,id,title,{register=true,sharedRoot}={}){
  source=path.resolve(source);project=path.resolve(project);
  if(!/^[a-z0-9][a-z0-9-]*$/.test(id))throw Error('Map ID must use lowercase letters, digits and hyphens');
  const catalog=readMapPackages(project),relative='Assets/Maps/'+id,output=path.join(project,relative);
  if(fs.existsSync(output)||catalog.some(entry=>entry.id===id))throw Error('Map package already exists; choose a new version ID');
  const terrain=read(path.join(source,'terrain-sources.json')),pathing=read(path.join(source,'Assets/Data/OriginalPathing.json')),receipt=read(path.join(source,'pathing-sources.json'));
  const grid=createRequire(import.meta.url)(path.join(gameSource,'game/warcraft-pathing.js')).create(pathing);
  const exported=path.resolve(terrain.sourceExport),map=read(path.join(exported,'map.json')),archive=fs.readFileSync(path.join(exported,map.source.preservedArchive));
  if(hash(archive)!==terrain.mapSha256||map.source.sha256!==terrain.mapSha256||pathing.sourceSha256!==terrain.mapSha256||receipt.mapSha256!==undefined&&receipt.mapSha256!==terrain.mapSha256)throw Error('Map source SHA mismatch');
  const originalScript=fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'),'utf8');
  if(!originalScript.includes('var originalMapPathing=')||!originalScript.includes('originalDoodadActors')||!originalScript.includes('Assets/OriginalUnits/'))throw Error('Expected combined terrain/doodad/unit/pathing runtime');
  const config=read(path.join(project,'project.json')),mainFile=path.join(project,config.startupScript);
  if(config.mainScene!=='Assets/Scenes/Main.mscene'||config.startupScript!=='Assets/Scripts/Main.js')throw Error('Expected Frostbound game project');
  const prefix=gameScriptPrefix(gameSource,fs.readFileSync(mainFile,'utf8')),rewrite=text=>text.replaceAll('Assets/',relative+'/');
  const records=[];
  const shared=sharedRoot?prepareSharedMapAssets(source,relative,path.resolve(sharedRoot)):null;
  if(shared){
    shared.publish();
    for(const asset of shared.assets){
      let bytes=asset.bytes;
      if(asset.record.sourcePath==='Assets/Scenes/Main.mscene'){const scene=JSON.parse(bytes);scene.name=title;addControls(scene,project,title);bytes=Buffer.from(json(scene));}
      if(asset.record.storage==='local')write(path.join(project,asset.path),bytes);
      records.push({...asset.record,sha256:hash(bytes),bytes:bytes.length});
    }
  }else{
  // Editor metadata is regenerated for the map namespace.
  for(const file of walk(path.join(source,'Assets'))){
    if(file.endsWith('.meta'))continue;
    const suffix=path.relative(path.join(source,'Assets'),file).replaceAll('\\','/'),target=path.join(output,suffix),before=fs.readFileSync(file),extension=path.extname(file).toLowerCase();
    let bytes=extension==='.glb'?rewriteGlb(before,rewrite):['.json','.mscene','.mmat','.mshader','.js','.gltf','.prefab'].includes(extension)?Buffer.from(rewrite(before.toString('utf8'))):before;
    if(suffix==='Scenes/Main.mscene'){const scene=JSON.parse(bytes);scene.name=title;addControls(scene,project,title);bytes=Buffer.from(json(scene));}
    write(target,bytes);records.push({path:relative+'/'+suffix,storage:'local',sourcePath:'Assets/'+suffix,sourceSha256:hash(before),sha256:hash(bytes),bytes:bytes.length});
  }
  }
  write(path.join(output,'Source/original'+path.extname(map.source.preservedArchive)),archive);
  for(const file of walk(path.join(exported,'source'))){if(path.basename(file).startsWith('original.'))continue;write(path.join(output,'Source',path.basename(file)),fs.readFileSync(file));}
  for(const file of fs.readdirSync(source).filter(name=>name.endsWith('-sources.json')))write(path.join(output,'Provenance',file),fs.readFileSync(path.join(source,file)));
  const previewSource=JSON.parse(execFileSync('python',[fileURLToPath(new URL('./export-frost-map-preview.py',import.meta.url)),path.join(exported,map.source.preservedArchive),path.join(output,'Textures/MapPreview.png')],{encoding:'utf8',windowsHide:true}));
  if(previewSource)for(const name of ['MapPreview.png',previewSource.member]){const bytes=fs.readFileSync(path.join(output,'Textures',name));records.push({path:relative+'/Textures/'+name,storage:'local',sourcePath:previewSource.member,sourceSha256:previewSource.sourceSha256,sha256:hash(bytes),bytes:bytes.length});}
  const preview=Array.from({length:256},(_,i)=>{const x=Math.min(grid.size[0]-1,Math.floor((i%16+.5)*grid.size[0]/16)),y=Math.min(grid.size[1]-1,Math.floor((15-Math.floor(i/16)+.5)*grid.size[1]/16));return grid.getCell(x,y)&2?1:0;});
  const entry={id,title,description:'Warcraft III 原地图\n地形、水面、装饰与单位动画\n场景运行；对局规则接入中',runtime:'warcraft-scene',gameplay:false,scene:relative+'/Scenes/Main.mscene',script:relative+'/Scripts/Main.js',sourceSha256:map.source.sha256,preview};
  if(previewSource)entry.previewImage=relative+'/Textures/MapPreview.png';
  const unitInitialization=attachUnitInitialization(project,relative,records,map.source.members['war3map.j']?.sha256);
  const bindingsFile=path.join(output,'Data/OriginalUnitBindings.json'),bindings=fs.existsSync(bindingsFile)?read(bindingsFile):null;
  const maps=[...catalog,entry],script=register?prefix+composeGameModules(gameSource,project,maps):null;if(script)new vm.Script(script,{filename:mainFile});
  const installer={path:'scripts/install-frost-map-package.mjs',sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),previewExporterSha256:hash(fs.readFileSync(fileURLToPath(new URL('./export-frost-map-preview.py',import.meta.url))))};
  const provenance={version:1,id,unitInitialization,source:map.source,installedSource:relative+'/Source/original'+path.extname(map.source.preservedArchive),sourceInfo:map.info,installer,previewSource,conversion:{coordinateScale:terrain.coordinateScale,axes:terrain.axes},capabilities:{terrain:true,doodads:true,units:true,animation:true,basePathing:true,gameplay:false,jass:false},assets:records};
  if(bindings)provenance.unitBindings={sourceSha256:bindings.sourceSha256,placements:bindings.placements.length,definitions:Object.keys(bindings.definitions).length,data:relative+'/Data/OriginalUnitBindings.json',generator:'scripts/warcraft_unit_bindings.py',generatorSha256:hash(fs.readFileSync(fileURLToPath(new URL('./warcraft_unit_bindings.py',import.meta.url))))};
  if(shared){provenance.sharedAssetsVersion=1;installer.sharedAssetsSha256=hash(fs.readFileSync(fileURLToPath(new URL('./frost-shared-map-assets.mjs',import.meta.url))));}
  write(path.join(output,'manifest.json'),json(provenance));
  write(path.join(output,'entry.json'),json(entry));
  if(register){config.buildScenes=[...new Set([...(config.buildScenes||[config.mainScene]),entry.scene])];write(path.join(project,'Assets/Maps/catalog.json'),json({version:1,maps}));write(path.join(project,'project.json'),json(config));write(mainFile,script);}
  return {...entry,files:records.length,bytes:records.reduce((n,r)=>n+r.bytes,0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const positional=[];let register=true,sharedRoot;
  for(let index=2;index<process.argv.length;index++){const arg=process.argv[index];if(arg==='--runtime')register=false;else if(arg==='--shared-root'){sharedRoot=process.argv[++index];if(!sharedRoot||sharedRoot.startsWith('--'))throw Error('--shared-root requires a project path');}else if(arg.startsWith('--'))throw Error('Unknown option: '+arg);else positional.push(arg);}
  const [source,id,title,project=gameSource]=positional;
  if(!source||!id||!title||positional.length>4)throw Error('Usage: node scripts/install-frost-map-package.mjs <converted-project> <id> <title> [game-project] [--runtime] [--shared-root <project>]');
  console.log(JSON.stringify(installMapPackage(source,project,id,title,{register,sharedRoot})));
}
