// Author: MiYu. Native Web geometry, material animation and particle preview from signed converted originals.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'tmp/docs-artifacts/frost-crypt-web'),root=path.join(nativeQaRoot,'crypt-web-models-'+Date.now()),sample=path.join(root,'sample'),read=p=>JSON.parse(fs.readFileSync(path.join(source,p))),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const models=read('crypt-web-models.json'),receipt=read('crypt-web-model-sources.json'),V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
for(const r of receipt.files){assert.equal(hash(path.join(source,r.path)),r.sha256,r.path);assert.equal(fs.statSync(path.join(source,r.path)).size,r.bytes,r.path);}
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE to the native editor under test');
configureNativeQa(root);fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(source,'Assets/CryptWeb'),path.join(sample,'Assets/CryptWeb'),{recursive:true});
for(const folder of ['Assets/Scenes','Assets/Scripts','Assets/Fonts'])fs.mkdirSync(path.join(sample,folder),{recursive:true});
for(const name of ['NotoSansSC.ttf','NotoSansSC-OFL.txt'])fs.copyFileSync(path.join(source,'Assets/Fonts',name),path.join(sample,'Assets/Fonts',name));
const entities=[],specimens=[],T=(position=[0,0,0],scale=1)=>({position,scale:[scale,scale,scale],rotation:[0,0,0,1]}),add=(name,components,parent=null,active=true)=>{const entity=entities.length+1;entities.push({entity,name,parent,siblingIndex:entities.length,active,components});return entity;};
const tilt=Math.atan2(18,26),ortho=6.5;
add('Web preview camera',{Transform:{...T([0,18,26]),rotation:[-Math.sin(tilt/2),0,0,Math.cos(tilt/2)]},Camera3D:{primary:true,projection:'orthographic',orthographic_size:ortho,near:.1,far:100}});
add('Web preview background',{EnvironmentLight:{sky_color:[.025,.04,.055,1],equator_color:[.3,.34,.4,1],ground_color:[.15,.17,.2,1],diffuse_intensity:1,specular_intensity:.3,background_enabled:true,tone_mapping:true,exposure:0}});
add('Web preview sun',{Transform:{...T(),rotation:[-.45,-.25,-.12,.84]},DirectionalLight:{color:[1,.95,.9,1],intensity:2,cast_shadows:false}});
const canvas=add('Web preview labels',{Canvas:{render_mode:'ScreenSpaceOverlay',reference_resolution:[1280,960],match_width_or_height:.5},RectTransform:{anchor_min:[0,0],anchor_max:[1,1],pivot:[.5,.5],size_delta:[0,0],anchored_position:[0,0],rotation:0,scale:[1,1]}});
for(const [row,[key,offset]] of [['ClassicCryptWebMissile',0],['ClassicCryptWebTarget',0],['ClassicCryptWebAirTarget',0],['ClassicCryptWebAirTarget',3],['ClassicCryptWebAirTarget',6]].entries()){
 const art=models[key],effect=read(art.effect);
 for(let col=0;col<3;col++){
  const clip=offset+col,a=art.animations[clip],name=key+' '+a.name,position=[(col-1)*5,0,(row-2)*3.8],scale=1.28,frames=effect.clips[clip].frames;
  // Use a visible particle sample where possible; geometry and MFX always share the selected source time.
  let sampleFrame=0;for(let i=1;i<frames.length;i++)if(frames[i].particles.length+frames[i].quads.length>frames[sampleFrame].particles.length+frames[sampleFrame].quads.length)sampleFrame=i;
  const time=sampleFrame?sampleFrame/12:Math.min(a.duration*.5,1/12),pose=Math.min(a.frames-1,Math.floor(time*12+1e-7)),parent=add(name,{Transform:T(position,scale),SampledEffect:{effect:art.effect,clip,playing:false,looping:false,speed:1,time_seconds:time}});
  const parts=V.parts(art,art.parts[0].mesh+'#pose='+clip+':'+pose,0);
  for(const [i,p] of parts.entries())add(name+' mesh '+i,{Transform:T(),MeshRenderer:{mesh:p.mesh,material:p.material,cast_shadows:false,receive_shadows:false},MaterialPropertyBlock:{override_base_color:true,base_color:p.color||[1,1,1,1]}},parent,p.visible!==false);
  const anchor=[.5+position[0]/(2*ortho*4/3),.5+position[2]*Math.sin(tilt)/(2*ortho)+.065];
  add(name+' label',{RectTransform:{anchor_min:anchor,anchor_max:anchor,pivot:[.5,.5],size_delta:[300,35],anchored_position:[0,0],rotation:0,scale:[1,1]},Text:{text:key.replace('ClassicCryptWeb','Web ')+' / '+a.name,font:'Assets/Fonts/NotoSansSC.ttf',font_size:16,color:[.85,.8,.6,1],alignment:'Center',horizontal_overflow:'Wrap',vertical_overflow:'Truncate'}},canvas);
  specimens.push({name,key,clip,time,pose,scale,parts:parts.length});
 }
}
const scene={version:1,name:'Original Web source specimens',world:{entities,frame:0,sim_frame:0,clear_color:[.025,.04,.055,1]}};
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify(scene));fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'// Author: MiYu. Static source animation and particle specimens.\nfunction onTick(){}\n');
fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Original Web models',storageId:path.basename(root),version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js',assetMode:'all'}));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config')});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR);
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs'),execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:60000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(path.basename(root)))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);
const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0')),report={author:'MiYu',passed:false,modelReceiptSha256:hash(path.join(source,'crypt-web-model-sources.json')),editorExecutable:process.env.MENGINE_EDITOR_EXECUTABLE,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),specimens,runtimeGameplayIntegrated:false,originalRuntimeVerified:false};
try{
 console.log('START native Web model preview');
 try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('view.set_game_resolution',{resolution:{width:1280,height:960}});await execute('playback.play',{paused:true});await execute('playback.step',{deltaTime:.001,steps:1});
 const snapshot=await query('scene.snapshot');
 for(const s of specimens){
  const actual=snapshot.entities.find(e=>e.name===s.name);assert.ok(actual);
  assert.equal(actual.components.SampledEffect.effect,models[s.key].effect);assert.equal(actual.components.SampledEffect.clip,s.clip);assert.deepEqual(actual.components.Transform.scale,Array(3).fill(Math.fround(s.scale)));
  for(let i=0;i<s.parts;i++){const part=snapshot.entities.find(e=>e.name===s.name+' mesh '+i);assert.ok(part);assert.match(part.components.MeshRenderer.mesh,new RegExp('#pose='+s.clip+':'+s.pose+'$'));}
 }
 await execute('panel.focus',{kind:'game'});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'web-models-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
 const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;console.log('PASS native Web: 15 source clip specimens, paired geometry/MFX, source scale and zero console errors');
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}finally{
 try{await execute('playback.stop');}catch{}
 closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}
 fs.writeFileSync(path.join(out,'native-web-models.json'),JSON.stringify(report,null,2)+'\n');
}
