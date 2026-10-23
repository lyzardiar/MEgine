// Author: MiYu. Upgrade installed original-map unit bindings and selection assets with source hashes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {attachUnitInitialization,replaceManifestProperty} from './frost-unit-initialization-package.mjs';
import {readMapPackages,syncGameScript} from './frost-script-bundle.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),project=path.resolve(process.argv[2]||path.join(repo,'samples/frostbound-realms')),id=process.argv[3]||'amazonia';
if(!readMapPackages(project).some(m=>m.id===id))throw Error('Unknown installed map');
const relative='Assets/Maps/'+id,file=path.join(project,relative,'manifest.json'),raw=fs.readFileSync(file,'utf8'),manifest=JSON.parse(raw),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const scenePath=relative+'/Scenes/Main.mscene',sceneBytes=fs.readFileSync(path.join(project,scenePath)),scene=JSON.parse(sceneBytes),sceneRecord=manifest.assets.find(r=>r.path===scenePath);
if(!sceneRecord||sceneRecord.sha256!==hash(sceneBytes))throw Error('Changed installed map scene');
const out=path.join(repo,'tmp/docs-artifacts/frost-original-maps');fs.mkdirSync(out,{recursive:true});const work=fs.mkdtempSync(path.join(out,'unit-binding-upgrade-'));
const receipt=JSON.parse(execFileSync('python',[path.join(repo,'scripts/export-frost-unit-bindings.py'),project,id,work,...(process.argv[4]?['--game',process.argv[4]]:[])],{encoding:'utf8',windowsHide:true}));
const dataFile=path.join(work,'Assets/Data/OriginalUnitBindings.json'),bindings=JSON.parse(fs.readFileSync(dataFile,'utf8'));
const names=new Set(scene.world.entities.map(e=>e.name));for(const p of bindings.placements)if(!names.has(p.name))throw Error('Missing visual root '+p.name);
const selection=scene.world.entities.filter(e=>e.name==='Map unit selection');if(selection.length>1)throw Error('Duplicate selection entity');
let updatedScene=sceneBytes;
if(!selection.length){
  const entity={entity:Math.max(...scene.world.entities.map(e=>e.entity))+1,name:'Map unit selection',active:false,components:{Transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},MeshRenderer:{mesh:bindings.selection.mesh,material:bindings.selection.sizes[0].material},MaterialPropertyBlock:{override_base_color:true,base_color:[1,1,1,1]}}};
  const text=sceneBytes.toString('utf8'),start=text.indexOf('"entities": [');if(start<0)throw Error('Expected formatted scene entities');let depth=0,quoted=false,escaped=false,end=-1;
  for(let i=text.indexOf('[',start);i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}'){if(--depth===0){end=i;break;}}}
  if(end<0)throw Error('Unterminated scene entities');const before=text.slice(0,end).trimEnd(),indent=' '.repeat(start-text.lastIndexOf('\n',start)-1+2);
  updatedScene=Buffer.from(before+',\n'+indent+JSON.stringify(entity,null,2).replaceAll('\n','\n'+indent)+text.slice(before.length));
}
function publish(relative,bytes){const target=path.join(project,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);const record=manifest.assets.find(r=>r.path===relative);if(record)Object.assign(record,{sha256:hash(bytes),bytes:bytes.length});else manifest.assets.push({path:relative,storage:'local',sha256:hash(bytes),bytes:bytes.length});}
const assetFolder=path.join(work,relative,'OriginalUnits/Selection');for(const name of fs.readdirSync(assetFolder))publish(relative+'/OriginalUnits/Selection/'+name,fs.readFileSync(path.join(assetFolder,name)));
publish(relative+'/Data/OriginalUnitBindings.json',fs.readFileSync(dataFile));publish(scenePath,updatedScene);
manifest.unitBindings={sourceSha256:receipt.sourceSha256,placements:receipt.placements,definitions:receipt.definitions,data:relative+'/Data/OriginalUnitBindings.json',generator:'scripts/warcraft_unit_bindings.py',generatorSha256:hash(fs.readFileSync(path.join(repo,'scripts/warcraft_unit_bindings.py')))};
manifest.unitInitialization=attachUnitInitialization(project,relative,manifest.assets,manifest.source.members['war3map.j'].sha256);
let text=raw;for(const key of ['assets','unitBindings','unitInitialization'])text=replaceManifestProperty(text,key,manifest[key]);fs.writeFileSync(file,text);syncGameScript(project);
console.log(JSON.stringify({map:id,...receipt}));
