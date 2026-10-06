// Author: MiYu. Preview original actor and building node animation in independent game and portrait cameras.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms'),sample=path.join('D:/MEngineNativeQA','classic-node-views-'+Date.now(),'sample'),executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/examples/render_asset_preview.exe',catalog=JSON.parse(fs.readFileSync(path.join(source,'model-catalog.json'))),entities=[],selected=[];
globalThis.Frost={ancient:u=>u.ancient};globalThis.FrostArt={};const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
const transform=(position=[0,0,0],rotation=[0,0,0,1],scale=[1,1,1])=>({position,rotation,scale});
const add=(name,components,parent=null)=>{const entity=entities.length+1;entities.push({entity,name,parent,siblingIndex:entities.length,active:true,components});return entity;};
const copy=relative=>{const target=path.join(sample,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,relative),target);};
for(const [i,key] of ['ClassicWisp','RealTreant','RevenantWorkshop'].entries()){
 const art=catalog[key];assert.ok(art?.classic,key);const clip=V.classicClip(art,'Stand',{}),frame=2,yaw=.35,scale=4/Math.max(...art.size),root=add(key,{Transform:transform([(i-1)*6,0,0],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],[scale,scale,scale])});let drawn=0;
 for(const [j,part] of art.parts.entries()){
  const runs=part.states[clip]||[],state=runs.filter(r=>r[0]<=frame).at(-1)||[0,1,1,1,part.defaultVisible?1:0,-1];if(state[4]<=.001)continue;
  const reference=part.textureMaterials[String(state[5])]||part.teamMaterials['0']||part.material,material=JSON.parse(fs.readFileSync(path.join(source,reference)));material.base_color=material.base_color.slice(0,3).map((v,k)=>v*state[k+1]).concat([state[4]]);
  copy(part.mesh);for(const slot of ['base_color_texture','emissive_texture','normal_texture','occlusion_texture','metallic_roughness_texture'])if(material[slot])copy(material[slot]);
  const mat=`Assets/Preview/${key}-${j}.mmat`;fs.mkdirSync(path.dirname(path.join(sample,mat)),{recursive:true});fs.writeFileSync(path.join(sample,mat),JSON.stringify(material));
  add(key+'/'+j,{Transform:transform(),MeshRenderer:{mesh:part.mesh+'#pose='+clip+':'+frame,material:mat,cast_shadows:false,receive_shadows:false}},root);drawn++;
 }
 selected.push({key,source:art.sourceModel,clip,frame,drawn,root,position:[(i-1)*6,(art.bounds.min[1]+art.bounds.max[1])*scale/2,0]});
}
const main=JSON.parse(fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene')));
for(const name of ['Winter sun','Northern sky'])add(name,structuredClone(main.world.entities.find(e=>e.name===name).components));entities.at(-1).components.EnvironmentLight.background_enabled=false;
add('Game camera',{Transform:transform([0,14,22],[Math.sin(-.56/2),0,0,Math.cos(-.56/2)]),Camera3D:{primary:true,projection:'orthographic',orthographic_size:7.5,near:.1,far:100}});
const canvas=add('Canvas',{Canvas:{reference_resolution:[1280,1024]},RectTransform:{size_delta:[1280,1024]}});
for(const [row,yaw] of [0,Math.PI/2].entries())for(const [i,actor] of selected.entries()){
 const camera=add(actor.key+' portrait camera '+row,{Transform:transform([actor.position[0]+Math.sin(yaw)*8,actor.position[1],Math.cos(yaw)*8],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]),Camera3D:{primary:false,projection:'orthographic',orthographic_size:2.6,near:.1,far:100,clear_flags:'solidcolor',background_color:[.035,.05,.065,1]}});
 add(actor.key+' portrait '+row,{RectTransform:{anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[(i-1)*370,row?350:-350],size_delta:[340,260]},RawImage:{render_camera:String(camera),render_root:String(actor.root),color:[1,1,1,1],raycast_target:false}},canvas);
}
fs.mkdirSync(path.join(sample,'Assets/Scenes'),{recursive:true});fs.mkdirSync(path.join(sample,'Assets/Scripts'),{recursive:true});fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick(){}');
fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Original Warcraft node animation cameras',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',assetMode:'all'}));
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Original actors and building camera views',world:{entities,frame:0,sim_frame:0,clear_color:[.025,.04,.055,1]}}));
const target=path.join(out,'classic-node-views.png'),run=spawnSync(executable,[sample,target],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.error?.message);assert.ok(!/could not be loaded|sampled effect:|cannot load texture/i.test(run.stderr),run.stderr);
const profile=JSON.parse(fs.readFileSync(target.replace(/\.png$/,'.profile.json')));assert.equal(profile.counts.sceneViews,6);assert.ok(profile.counts.billboardMeshes>=3);assert.equal(profile.counts.materialPipelinesRejected,0);
const resources=profile.resources.filter(r=>r.kind==='mesh');assert.ok(resources.length>0&&resources.every(r=>r.loaded&&r.sourceBytes>0&&r.resolvedPath.endsWith('.glb')));
const report={passed:true,sample,rendererSha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),imageSha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),models:selected,method:'Shared native Game View renderer with original Wisp, Treant and Slaughterhouse assets, full and lock-Z node billboards, six rooted live UI views and main camera',counts:profile.counts};fs.writeFileSync(path.join(out,'classic-node-views-validation.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS original actor and building GPU views:',JSON.stringify(report));
