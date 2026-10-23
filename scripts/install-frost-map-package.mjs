// Author: MiYu. Install converted Warcraft map assets into one game's namespaced map catalog.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {composeGameModules,gameScriptPrefix,readMapPackages} from './frost-script-bundle.mjs';

const gameSource=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const walk=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{const file=path.join(folder,e.name);if(e.isSymbolicLink())throw Error('Linked package files are unsupported: '+file);return e.isDirectory()?walk(file):[file];});
const json=value=>JSON.stringify(value,null,2)+'\n';
function write(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
function rewriteGlb(bytes,rewrite){
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
  const chunks=[];
  for(let offset=12;offset<bytes.length;){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);let data=bytes.subarray(offset+8,offset+8+size);if(data.length!==size)throw Error('Truncated GLB');if(type===0x4e4f534a){const text=rewrite(data.toString('utf8').trimEnd());JSON.parse(text);data=Buffer.from(text+' '.repeat((4-Buffer.byteLength(text)%4)%4));}const header=Buffer.alloc(8);header.writeUInt32LE(data.length);header.writeUInt32LE(type,4);chunks.push(header,data);offset+=8+size;}
  const header=Buffer.from(bytes.subarray(0,12));header.writeUInt32LE(12+chunks.reduce((n,c)=>n+c.length,0),8);return Buffer.concat([header,...chunks]);
}
function addControls(scene,project,title){
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
export function installMapPackage(source,project,id,title){
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
  // Every original asset gets its own path. Editor metadata is regenerated for the new namespace.
  for(const file of walk(path.join(source,'Assets'))){
    if(file.endsWith('.meta'))continue;
    const suffix=path.relative(path.join(source,'Assets'),file).replaceAll('\\','/'),target=path.join(output,suffix),before=fs.readFileSync(file),extension=path.extname(file).toLowerCase();
    let bytes=extension==='.glb'?rewriteGlb(before,rewrite):['.json','.mscene','.mmat','.mshader','.js','.gltf','.prefab'].includes(extension)?Buffer.from(rewrite(before.toString('utf8'))):before;
    if(suffix==='Scenes/Main.mscene'){const scene=JSON.parse(bytes);scene.name=title;addControls(scene,project,title);bytes=Buffer.from(json(scene));}
    write(target,bytes);records.push({path:relative+'/'+suffix,sourceSha256:hash(before),sha256:hash(bytes),bytes:bytes.length});
  }
  write(path.join(output,'Source/original'+path.extname(map.source.preservedArchive)),archive);
  for(const file of walk(path.join(exported,'source'))){if(path.basename(file).startsWith('original.'))continue;write(path.join(output,'Source',path.basename(file)),fs.readFileSync(file));}
  for(const file of fs.readdirSync(source).filter(name=>name.endsWith('-sources.json')))write(path.join(output,'Provenance',file),fs.readFileSync(path.join(source,file)));
  const previewSource=JSON.parse(execFileSync('python',[fileURLToPath(new URL('./export-frost-map-preview.py',import.meta.url)),path.join(exported,map.source.preservedArchive),path.join(output,'Textures/MapPreview.png')],{encoding:'utf8',windowsHide:true}));
  if(previewSource)for(const name of ['MapPreview.png',previewSource.member]){const bytes=fs.readFileSync(path.join(output,'Textures',name));records.push({path:relative+'/Textures/'+name,sourceSha256:previewSource.sourceSha256,sha256:hash(bytes),bytes:bytes.length});}
  const preview=Array.from({length:256},(_,i)=>{const x=Math.min(grid.size[0]-1,Math.floor((i%16+.5)*grid.size[0]/16)),y=Math.min(grid.size[1]-1,Math.floor((15-Math.floor(i/16)+.5)*grid.size[1]/16));return grid.getCell(x,y)&2?1:0;});
  const entry={id,title,description:'Warcraft III 原地图\n地形、水面、装饰与单位动画\n场景运行；对局规则接入中',runtime:'warcraft-scene',gameplay:false,scene:relative+'/Scenes/Main.mscene',script:relative+'/Scripts/Main.js',sourceSha256:map.source.sha256,preview};
  if(previewSource)entry.previewImage=relative+'/Textures/MapPreview.png';
  const maps=[...catalog,entry],script=prefix+composeGameModules(gameSource,project,maps);new vm.Script(script,{filename:mainFile});
  const installer={path:'scripts/install-frost-map-package.mjs',sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),previewExporterSha256:hash(fs.readFileSync(fileURLToPath(new URL('./export-frost-map-preview.py',import.meta.url))))};
  const provenance={version:1,id,source:map.source,installedSource:relative+'/Source/original'+path.extname(map.source.preservedArchive),sourceInfo:map.info,installer,previewSource,conversion:{coordinateScale:terrain.coordinateScale,axes:terrain.axes},capabilities:{terrain:true,doodads:true,units:true,animation:true,basePathing:true,gameplay:false,jass:false},assets:records};
  write(path.join(output,'manifest.json'),json(provenance));
  config.buildScenes=[...new Set([...(config.buildScenes||[config.mainScene]),entry.scene])];
  write(path.join(project,'Assets/Maps/catalog.json'),json({version:1,maps}));
  write(path.join(project,'project.json'),json(config));write(mainFile,script);
  return {id,scene:entry.scene,files:records.length,bytes:records.reduce((n,r)=>n+r.bytes,0),sourceSha256:entry.sourceSha256,gameplay:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [source,id,title,project=gameSource]=process.argv.slice(2);
  if(!source||!id||!title)throw Error('Usage: node scripts/install-frost-map-package.mjs <converted-project> <id> <title> [game-project]');
  console.log(JSON.stringify(installMapPackage(source,project,id,title)));
}
