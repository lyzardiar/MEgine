// Author: MiYu. Inspect converted particle and ribbon snapshots in the native Game View.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildPcPackage, verifyPcBuildDirectory} from '../packages/cli/dist/pcPackage.js';
const repo=fileURLToPath(new URL('../',import.meta.url)),library=path.join(repo,'asset-library/warcraft-iii/effects-ready'),root=path.join('D:/MEngineNativeQA','effect-preview-'+Date.now()),sample=path.join(root,'sample');
const executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/examples/render_asset_preview.exe';
const runtime=process.env.MENGINE_RUNTIME_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/mengine-runtime.exe';
const names=['BanishTarget','CloudOfFog','FlameStrikeTarget','ClarityTarget','HealingSalveTarget','PurificationTarget','RejuvenationTarget','BreathOfFireTarget','BreathOfFrostTarget','Tornado_Target','DeathandDecayTarget','UnsummonTarget','FrostWyrmMissile','WaterElementalMissile','SteamTankImpact','DemonStorm'];
const catalog=JSON.parse(fs.readFileSync(path.join(library,'Assets/WarcraftIII/effect-catalog.json'))),entities=[],selected=[];
const transform=(position,scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation});
const add=(name,components)=>entities.push({entity:entities.length+1,name,parent:null,siblingIndex:entities.length,active:true,components});
const copy=rel=>{const target=path.join(sample,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(library,rel),target);};
add('Camera',{Transform:transform([0,80,80],[1,1,1],[Math.sin(-Math.PI/8),0,0,Math.cos(-Math.PI/8)]),Camera3D:{primary:true,projection:'orthographic',orthographic_size:15,near:.1,far:240}});
for(const [i,name] of names.entries()) {
 const model=catalog.models.find(m=>path.win32.basename(m.source).replace(/\.mdx$/i,'')===name);assert.ok(model,name);
 const data=JSON.parse(fs.readFileSync(path.join(library,model.effect)));
 const candidates=data.clips.flatMap((clip,ci)=>clip.frames.filter(f=>f.seconds>0&&f.seconds<=Math.min(4,clip.duration)).map(frame=>({clip,ci,frame})));
 const {clip,ci,frame}=candidates.sort((a,b)=>(b.frame.particles.length+b.frame.quads.length)-(a.frame.particles.length+a.frame.quads.length))[0];assert.ok(frame,name);
 const points=frame.particles.flatMap(p=>[p.position.map(v=>v-p.size*.5),p.position.map(v=>v+p.size*.5)]).concat(frame.quads.flatMap(q=>q.corners||q.tail));assert.ok(points.length,name);
 const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))),scale=4.5/Math.max(...max.map((v,k)=>v-min[k]),.01),center=min.map((v,k)=>(v+max[k])*.5),x=(i%4-1.5)*7,z=(Math.floor(i/4)-1.5)*7;
 copy(model.effect);for(const m of data.materials)copy(m.texture);
 add(name,{Transform:transform([x-center[0]*scale,-center[1]*scale,z-center[2]*scale],[scale,scale,scale]),SampledEffect:{effect:model.effect,clip:ci,playing:false,looping:false,speed:1,time_seconds:frame.seconds}});
 selected.push({model:name,source:model.source,clip:clip.name,time:frame.seconds,row:Math.floor(i/4),column:i%4,particles:frame.particles.length,quads:frame.quads.length});
}
fs.mkdirSync(path.join(sample,'Assets/Scenes'),{recursive:true});fs.mkdirSync(path.join(sample,'Assets/Scripts'),{recursive:true});
fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick(dt) {}');fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Classic effect preview',storageId:'classic-effects-preview',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',assetMode:'referenced'}));
const scenes=[{name:'classic-effects-preview',factor:1},{name:'classic-effects-earlier',factor:.35}];
for(const scene of scenes) {
 for(const [i,record] of selected.entries())entities[i+1].components.SampledEffect.time_seconds=record.time*scene.factor;
 fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Classic effects',world:{entities,frame:0,sim_frame:0,clear_color:[.035,.045,.055,1]}}));
 const target=path.join(repo,'docs/designs/frostbound-realms',scene.name+'.png'),run=spawnSync(executable,[sample,target],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr||run.error?.message);assert.ok(!/sampled effect:|cannot load texture/i.test(run.stderr),run.stderr);
 const png=fs.readFileSync(target),profile=JSON.parse(fs.readFileSync(target.replace('.png','.profile.json')));assert.ok(profile.counts.uiPrimitives>0);assert.equal(profile.counts.materialPipelinesRejected,0);
 fs.writeFileSync(target.replace('.png','.json'),JSON.stringify({method:'Native editor Game View GPU renderer',imageSha256:crypto.createHash('sha256').update(png).digest('hex'),rendererSha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),project:sample,factor:scene.factor,models:selected,primitives:profile.counts.uiPrimitives},null,2)+'\n');
}
const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519'),keyPath=path.join(root,'preview-signing.pem');fs.writeFileSync(keyPath,privateKey.export({format:'pem',type:'pkcs8'}));
const build=buildPcPackage({projectDir:sample,outputDir:path.join(root,'Build'),runtimePath:runtime,engineVersion:'sampled-effects',signingPrivateKeyPath:keyPath});verifyPcBuildDirectory(path.join(root,'Build'),publicKey);
console.log('PASS native effect preview and package:',JSON.stringify({project:sample,files:build.files.length,models:selected.length}));
