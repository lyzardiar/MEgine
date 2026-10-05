// Author: MiYu. Render original cliff templates through the native editor's mesh-patch loader.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join('D:/MEngineNativeQA','classic-cliffs-'+Date.now()),out=path.join(repo,'docs/designs/frostbound-realms');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'classic-cliff-sources.json'))),catalog=JSON.parse(fs.readFileSync(path.join(source,'Assets/WarcraftIII/classic-cliff-catalog.json'))),entities=[];
const ramps=process.argv.includes('--ramps');
for(const file of manifest.files){const raw=fs.readFileSync(path.join(source,file.path));assert.equal(createHash('sha256').update(raw).digest('hex'),file.sha256);const target=path.join(root,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,raw);}
const add=(name,components)=>entities.push({entity:entities.length+1,name,parent:null,siblingIndex:entities.length,active:true,components}),transform=(position)=>({position,scale:[1,1,1],rotation:[0,0,0,1]});
add('Camera',{Transform:{...transform([0,60,60]),rotation:[Math.sin(-Math.PI/8),0,0,Math.cos(-Math.PI/8)]},Camera3D:{primary:true,projection:'orthographic',orthographic_size:ramps?9.5:14,near:.1,far:200}});
const main=JSON.parse(fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene')));
for(const name of ['Winter sun','Northern sky'])add(name,structuredClone(main.world.entities.find(e=>e.name===name).components));
entities.at(-1).components.EnvironmentLight.background_enabled=false;
const heights=[[0,0,0,0,0],[0,1,1,1,0],[0,1,2,1,0],[0,1,1,1,0],[0,0,0,0,0]],patches=[];
for(const [panel,name] of ['winter','forest','barrens','masonry'].entries()){
  const family=(name==='masonry'?'City':'')+(ramps?'CliffTrans':'Cliffs');let cells='';const selected=[];
  if(ramps){
    const grid=Array(16).fill('fff80');
    for(const [x,pattern] of [[1,'AAHL'],[2,'LHAA']]){
      const template=catalog.families[family][pattern][0],model=catalog.models[template];assert.deepEqual(model.footprint,[1,2]);
      grid[4+x]=template.toString(16).padStart(3,'0')+'80';selected.push({x,z:1,pattern,template,base:0,footprint:model.footprint,coveredCells:model.coveredCells,bounds:model.bounds});
    }
    cells=grid.join('');
  }else for(let z=0;z<4;z++)for(let x=0;x<4;x++){
    const corners=[heights[z+1][x],heights[z][x],heights[z][x+1],heights[z+1][x+1]],base=Math.min(...corners),pattern=corners.map(h=>String.fromCharCode(65+h-base)).join(''),variants=catalog.families[family][pattern];assert.ok(variants,pattern);const template=variants[(x+z*4)%variants.length];
    cells+=template.toString(16).padStart(3,'0')+(128+base*4).toString(16).padStart(2,'0');selected.push({x,z,pattern,template,base});
  }
  add('Original cliff patch '+name,{Transform:transform([panel%2?6:-6,0,panel<2?-6:6]),MeshRenderer:{mesh:'meshpatch:'+catalog.mesh+'#'+cells,material:catalog.skins[name]}});
  patches.push({name,family,cells,selected});
}
fs.mkdirSync(path.join(root,'Assets/Scenes'),{recursive:true});fs.mkdirSync(path.join(root,'Assets/Scripts'),{recursive:true});
fs.writeFileSync(path.join(root,'Assets/Scripts/Main.js'),'function onTick(dt) {}');fs.writeFileSync(path.join(root,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Original authored cliff patches',world:{entities,frame:0,sim_frame:0,clear_color:[.08,.12,.16,1]}}));
fs.writeFileSync(path.join(root,'project.json'),JSON.stringify({name:'Original cliff patches',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',assetMode:'all'}));
const packaged=[];
function inventory(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())inventory(file);else if(entry.name!=='mengine-build.json'){const raw=fs.readFileSync(file);packaged.push({path:path.relative(root,file).replaceAll('\\','/'),size:raw.length,sha256:createHash('sha256').update(raw).digest('hex')});}}}
inventory(root);fs.writeFileSync(path.join(root,'mengine-build.json'),JSON.stringify({schemaVersion:1,files:packaged}));
const executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/examples/render_asset_preview.exe',image=path.join(out,ramps?'classic-ramp-patches.png':'classic-cliff-patches.png');
const run=spawnSync(executable,[root,image],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.error?.message);
const raw=fs.readFileSync(image);assert.equal(raw.readUInt32BE(16),1280);assert.equal(raw.readUInt32BE(20),1024);
fs.writeFileSync(image.replace('.png','.json'),JSON.stringify({method:'Native editor GPU render using RuntimeMeshCache meshpatch loader',project:root,image,sha256:createHash('sha256').update(raw).digest('hex'),rendererSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),patches,scope:'Original grid composition; battlefield surface/navigation integration pending'},null,2)+'\n');
console.log('PASS original cliff patches:',image);
