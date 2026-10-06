// Author: MiYu. Render one original animated card through the game and two independent UI cameras.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms'),sample=path.join('D:/MEngineNativeQA','billboard-views-'+Date.now(),'sample'),executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/examples/render_asset_preview.exe';
const art=JSON.parse(fs.readFileSync(path.join(source,'effect-catalog.json'))).effects.BloodLustTarget,clip=art.animations.findIndex(c=>c.name.toLowerCase()==='stand'),entities=[];
const transform=(position=[0,0,0],rotation=[0,0,0,1],scale=[1,1,1])=>({position,rotation,scale});
const add=(name,components,parent=null)=>{const entity=entities.length+1;entities.push({entity,name,parent,siblingIndex:entities.length,active:true,components});return entity;};
const copy=relative=>{const target=path.join(sample,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,relative),target);};
const root=add('Original Bloodlust card',{Transform:transform([0,0,0],[0,Math.sin(.3),0,Math.cos(.3)],[3,3,3])});
for(const part of art.parts){copy(part.mesh);copy(part.material);const material=JSON.parse(fs.readFileSync(path.join(source,part.material)));for(const key of ['base_color_texture','emissive_texture','normal_texture','occlusion_texture','metallic_roughness_texture'])if(material[key])copy(material[key]);add('Original camera-facing geoset',{Transform:transform(),MeshRenderer:{mesh:part.mesh+'#pose='+clip+':2',material:part.material,cast_shadows:false,receive_shadows:false}},root);}
add('Game camera',{Transform:transform([0,5,8],[Math.sin(-.55/2),0,0,Math.cos(-.55/2)]),Camera3D:{primary:true,projection:'orthographic',orthographic_size:4,near:.1,far:100}});
const canvas=add('Canvas',{Canvas:{reference_resolution:[1280,1024]},RectTransform:{size_delta:[1280,1024]}});
for(const [i,yaw] of [0,Math.PI/2].entries()){
 const camera=add('Independent camera '+i,{Transform:transform([Math.sin(yaw)*8,0,Math.cos(yaw)*8],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]),Camera3D:{primary:false,projection:'orthographic',orthographic_size:2,near:.1,far:100,clear_flags:'solidcolor',background_color:[.025,.04,.055,1]}});
 add('Original card UI view '+i,{RectTransform:{anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[440,i?200:-200],size_delta:[320,320]},RawImage:{render_camera:String(camera),render_root:String(root),color:[1,1,1,1],raycast_target:false}},canvas);
}
fs.mkdirSync(path.join(sample,'Assets/Scenes'),{recursive:true});fs.mkdirSync(path.join(sample,'Assets/Scripts'),{recursive:true});
fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick(){}');fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Original node billboard views',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',assetMode:'all'}));
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Three independent billboard cameras',world:{entities,frame:0,sim_frame:0,clear_color:[.025,.04,.055,1]}}));
const target=path.join(out,'classic-billboard-views.png'),run=spawnSync(executable,[sample,target],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.error?.message);assert.ok(!/could not be loaded|sampled effect:|cannot load texture/i.test(run.stderr),run.stderr);
const profile=JSON.parse(fs.readFileSync(target.replace(/\.png$/,'.profile.json')));assert.equal(profile.counts.sceneViews,2);assert.equal(profile.counts.billboardMeshes,3);assert.equal(profile.counts.materialPipelinesRejected,0);
const resources=profile.resources.filter(r=>r.kind==='mesh');assert.ok(resources.length>0&&resources.every(r=>r.loaded&&r.sourceBytes>0&&r.resolvedPath.endsWith('.glb')),'posed billboard diagnostics resolve original source files');
const report={passed:true,sample,method:'Shared native Game View renderer: one source geoset, three distinct camera-dependent GPU meshes, two rooted live UI views',counts:profile.counts};fs.writeFileSync(path.join(out,'billboard-views-validation.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS independent native billboard cameras:',JSON.stringify(report));
