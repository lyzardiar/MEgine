// Author: MiYu. Render source-scale Entangled Mine construction and five original worker states with native GPU cameras.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms'),sample=path.join(process.env.MENGINE_QA_ROOT||'D:/MEngineNativeQA','entangled-mine-views-'+Date.now(),'sample'),executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/construction-build/release/examples/render_asset_preview.exe';
globalThis.Frost=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');globalThis.FrostArt=JSON.parse(fs.readFileSync(path.join(source,'model-catalog.json')));
const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js'),art=FrostArt.ClassicEntangledMine,scales=JSON.parse(fs.readFileSync(path.join(source,'building-scale-catalog.json'))),scale=scales.worldScale*scales.models.ClassicEntangledMine.modelScale,entities=[],models=[];
const transform=(position=[0,0,0],rotation=[0,0,0,1],size=[1,1,1])=>({position,rotation,scale:size}),add=(name,components,parent=null)=>{const id=entities.length+1;entities.push({entity:id,name,parent,siblingIndex:id-1,active:true,components});return id;},copy=relative=>{const target=path.join(sample,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,relative),target);};
const main=JSON.parse(fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene')));
for(const name of ['Winter sun','Northern sky'])add(name,structuredClone(main.world.entities.find(e=>e.name===name).components));entities.at(-1).components.EnvironmentLight.background_enabled=false;
add('Game camera',{Transform:transform([0,20,20],[Math.sin(-Math.PI/8),0,0,Math.cos(-Math.PI/8)]),Camera3D:{primary:true,projection:'orthographic',orthographic_size:10,near:.1,far:200}});
const canvas=add('Canvas',{Canvas:{reference_resolution:[1280,1024]},RectTransform:{size_delta:[1280,1024]}}),rect=(x,y,w,h)=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
add('Background',{RectTransform:rect(0,0,1280,1024),Image:{color:[.02,.03,.04,1],raycast_target:false}},canvas);copy('Assets/Fonts/NotoSansSC.ttf');
function label(name,value,x,y,w,h,size=19){add(name,{RectTransform:rect(x,y,w,h),Text:{text:value,font:'Assets/Fonts/NotoSansSC.ttf',font_size:size,color:[.88,.83,.65,1],alignment:'Center',vertical_align:'Middle',raycast_target:false}},canvas);}
label('Title','原版缠绕金矿 · 建造与模型工作序列',0,-452,1100,50,30);
label('Source scale','原版比例  × '+scale+'     /     9 个原始材质层     /     原始动画与几何',0,-409,1100,35,18);
for(const [i,action] of ['Birth','Stand','Stand Work First','Stand Work Second','Stand Work Third','Stand Work Fourth','Stand Work Fifth'].entries()){
 const seconds=action==='Birth'?30:.7,samplePose=V.classicSample({kind:'hauntedmine',team:0,built:1,cd:0},art,false,seconds,action,30),root=add(action,{Transform:transform([i*12,0,0],[0,Math.sin(.35/2),0,Math.cos(.35/2)],[scale,scale,scale])});
 assert.equal(art.animations[samplePose.clip].name,action);let drawn=0;
 for(const [j,part] of V.parts(art,art.parts[0].mesh+'#pose='+samplePose.clip+':'+samplePose.frame+'@30',0).entries()){
  if(!part.visible)continue;copy(part.mesh.split('#')[0]);const material=JSON.parse(fs.readFileSync(path.join(source,part.material)));material.base_color=material.base_color.slice(0,3).map((v,k)=>v*part.color[k]).concat([part.color[3]]);
  for(const slot of ['base_color_texture','emissive_texture','normal_texture','occlusion_texture','metallic_roughness_texture'])if(material[slot])copy(material[slot]);
  const mat='Assets/Preview/'+i+'-'+j+'.mmat';fs.mkdirSync(path.dirname(path.join(sample,mat)),{recursive:true});fs.writeFileSync(path.join(sample,mat),JSON.stringify(material));add(action+'/'+j,{Transform:transform(),MeshRenderer:{mesh:part.mesh,material:mat,cast_shadows:false,receive_shadows:false}},root);drawn++;
 }
 const center=(art.bounds.min[1]+art.bounds.max[1])*scale/2,camera=add(action+' camera',{Transform:transform([i*12,center,12]),Camera3D:{primary:false,projection:'orthographic',orthographic_size:3.2,near:.1,far:60,clear_flags:'solidcolor',background_color:[.055,.065,.075,1]}}),x=-462+(i%4)*308,y=i<4?-190:185;
 add(action+' view',{RectTransform:rect(x,y,288,300),RawImage:{render_camera:String(camera),render_root:String(root),color:[1,1,1,1],raycast_target:false}},canvas);
 label(action+' caption',action==='Birth'?'建造 30 / 60 秒':action==='Stand'?'待机':'工作序列 · '+(i-1),x,y+175,290,35);models.push({action,seconds,clip:samplePose.clip,frame:samplePose.frame,drawn,sourceScale:scale});
}
copy('Assets/Art/classic-entangle-mine.png');copy('Assets/Art/classic-entangle-mine-disabled.png');
for(const [i,name] of ['classic-entangle-mine','classic-entangle-mine-disabled'].entries())add(name,{RectTransform:rect(390+i*100,185,64,64),Image:{sprite:'Assets/Art/'+name+'.png',color:[1,1,1,1],raycast_target:false}},canvas);
label('Icons','原版按钮 / 禁用按钮',462,285,290,40,18);
fs.mkdirSync(path.join(sample,'Assets/Scenes'),{recursive:true});fs.mkdirSync(path.join(sample,'Assets/Scripts'),{recursive:true});fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick(){}');
fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Original Entangled Mine asset views',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',assetMode:'all'}));
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Original Entangled Mine asset views',world:{entities,frame:0,sim_frame:0,clear_color:[.02,.03,.04,1]}}));
const target=path.join(out,'entangled-mine-native-views.png'),run=spawnSync(executable,[sample,target],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.error?.message);assert.ok(!/could not be loaded|cannot load texture/i.test(run.stderr),run.stderr);
const profile=JSON.parse(fs.readFileSync(target.replace(/\.png$/,'.profile.json')));assert.equal(profile.counts.sceneViews,7);assert.equal(profile.counts.materialPipelinesRejected,0);assert.ok(profile.resources.filter(r=>r.kind==='mesh').every(r=>r.loaded&&r.sourceBytes>0));
const report={author:'MiYu',passed:true,sample,rendererSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),imageSha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),models,counts:profile.counts,scope:'Original model and icons through native GPU renderer; asset preview does not establish Entangle gameplay or income rules.'};fs.writeFileSync(path.join(out,'entangled-mine-native-views.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS native Entangled Mine asset views: 7 original animation states, source scale, original icons and zero rejected materials');
