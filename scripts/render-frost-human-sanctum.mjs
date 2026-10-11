// Author: MiYu. Review original Sanctum actors at source scale using the native Game View renderer.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=process.env.MENGINE_FROST_SANCTUM_SAMPLE||path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms'),root=fs.mkdtempSync('D:/MEngineNativeQA/human-sanctum-preview-'),sample=path.join(root,'sample'),executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/construction-build/release/examples/render_asset_preview.exe';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),receipt=JSON.parse(fs.readFileSync(path.join(source,'human-sanctum-sources.json'))),models=JSON.parse(fs.readFileSync(path.join(source,'human-sanctum-models.json'))),rules=JSON.parse(fs.readFileSync(path.join(source,'human-sanctum.json')));
for(const r of receipt.files.filter(r=>r.path.startsWith('Assets/'))){assert.equal(sha(path.join(source,r.path)),r.sha256,r.path);const destination=path.join(sample,r.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(source,r.path),destination);}
const entities=[],selected=[],add=(name,components,parent=null)=>{const id=entities.length+1;entities.push({entity:id,name,parent,siblingIndex:entities.length,active:true,components});return id;},transform=(position=[0,0,0],scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation});
const units=[rules.building,...Object.values(rules.units)],positions=[[-5,0,0],[-.6,0,0],[1.8,0,0],[4.5,0,0]];
for(const [i,unit] of units.entries()){
 const m=models[unit.model],scale=1.28*unit.modelScale,clip=m.animations.findIndex(a=>a.name.toLowerCase()==='stand');const ci=clip<0?m.animations.findIndex(a=>a.name.toLowerCase().startsWith('stand')):clip,frame=2,yaw=i?.2:0,root=add(unit.model,{Transform:transform(positions[i],[scale,scale,scale],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)])});let drawn=0;
 assert.ok(ci>=0,unit.model);
 for(const [index,part] of m.parts.entries()){
  const state=part.states[ci].filter(r=>r[0]<=frame).at(-1);if(!state||state[4]<=.001)continue;
  const ref=part.textureMaterials[String(state[5])]||part.teamMaterials['0']||part.material,material=JSON.parse(fs.readFileSync(path.join(source,ref))),target=`Assets/Preview/${unit.model}-${index}.mmat`;
  material.base_color=material.base_color.slice(0,3).map((v,k)=>v*state[k+1]).concat([state[4]]);fs.mkdirSync(path.dirname(path.join(sample,target)),{recursive:true});fs.writeFileSync(path.join(sample,target),JSON.stringify(material));
  add(unit.model+'/'+index,{Transform:transform(),MeshRenderer:{mesh:part.mesh+`#pose=${ci}:${frame}`,material:target,cast_shadows:true,receive_shadows:true}},root);drawn++;
 }
 selected.push({key:unit.model,source:m.sourceModel,scale,clip:ci,frame,drawn,root,position:[positions[i][0],(m.bounds.min[1]+m.bounds.max[1])*scale/2,0],height:m.size[1]*scale});
}
add('Review sun',{Transform:transform([0,0,0],[1,1,1],[-.45,-.25,-.12,.84]),DirectionalLight:{color:[1,.91,.78,1],intensity:2,cast_shadows:true,shadow_distance:90,shadow_strength:.65,shadow_bias:.0004,shadow_normal_bias:.025}});
add('Review sky',{EnvironmentLight:{sky_color:[.12,.17,.22,1],equator_color:[.28,.32,.36,1],ground_color:[.17,.19,.2,1],diffuse_intensity:.85,specular_intensity:.4,background_enabled:true,tone_mapping:true,exposure:.1}});
add('Review ground',{Transform:transform([0,-.18,0],[15,.18,6]),MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:[.14,.19,.15,1],roughness:.95}});
const tilt=.5;add('Game camera',{Transform:transform([-.4,9,18],[1,1,1],[-Math.sin(tilt/2),0,0,Math.cos(tilt/2)]),Camera3D:{primary:true,projection:'orthographic',orthographic_size:6.5,near:.1,far:100}});
const canvas=add('Canvas',{Canvas:{reference_resolution:[1280,1024]},RectTransform:{size_delta:[1280,1024]}});
for(const [i,m] of selected.entries()){
 const yaw=i?.35:0,camera=add(m.key+' detail camera',{Transform:transform([m.position[0]+Math.sin(yaw)*8,m.position[1],Math.cos(yaw)*8],[1,1,1],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]),Camera3D:{primary:false,projection:'orthographic',orthographic_size:m.height*.7,near:.1,far:100,clear_flags:'solidcolor',background_color:[.035,.05,.065,1]}});
 add(m.key+' detail',{RectTransform:{anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[(i-1.5)*304,-350],size_delta:[288,280]},RawImage:{render_camera:String(camera),render_root:String(m.root),color:[1,1,1,1],raycast_target:false}},canvas);
}
for(const folder of ['Assets/Scenes','Assets/Scripts'])fs.mkdirSync(path.join(sample,folder),{recursive:true});fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick(){}');fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Original Arcane Sanctum source scale review',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',assetMode:'all'}));
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Arcane Sanctum, Priest, Sorceress and Spell Breaker',world:{entities,frame:0,sim_frame:0,clear_color:[.035,.05,.065,1]}}));
const target=path.join(out,'human-sanctum-native-models.png'),run=spawnSync(executable,[sample,target],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.error?.message);assert.ok(!/could not be loaded|sampled effect:|cannot load texture/i.test(run.stderr),run.stderr);
const profile=JSON.parse(fs.readFileSync(target.replace(/\.png$/,'.profile.json')));assert.equal(profile.counts.sceneViews,4);assert.equal(profile.counts.materialPipelinesRejected,0);
const resources=profile.resources.filter(r=>r.kind==='mesh'&&r.asset!=='cube');assert.ok(resources.length>0&&resources.every(r=>r.loaded&&r.sourceBytes>0&&r.resolvedPath.endsWith('.glb')));
const report={author:'MiYu',passed:true,sample,rendererSha256:sha(executable),imageSha256:sha(target),models:selected,counts:profile.counts,scope:'Original four models rendered at Warcraft source scale with four closer native camera views. Asset appearance validation; production, research and combat runtime are separate.'};
fs.writeFileSync(path.join(out,'human-sanctum-native-models.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS native Sanctum model appearance:',JSON.stringify(report));
