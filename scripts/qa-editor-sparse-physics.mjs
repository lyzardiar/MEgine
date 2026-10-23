// Author: MiYu. Native 2D/3D Play with sparse physics, transformless parents and unrelated entities.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'tmp/docs-artifacts/editor-performance-risk');
const label=process.env.MENGINE_PHYSICS_LABEL||'phase22-physics-after';assert.match(label,/^[a-z0-9-]+$/);
const root=path.join(nativeQaRoot,label+'-'+Date.now()),sample=path.join(root,'sample');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE);configureNativeQa(root);fs.mkdirSync(out,{recursive:true});
for(const name of ['Assets/Scenes','Assets/Scripts'])fs.mkdirSync(path.join(sample,name),{recursive:true});
const entities=[],add=(name,components,parent)=>{const entity=entities.length+1;entities.push({entity,name,active:true,components,...(parent?{parent}:{})});return entity;};
add('Camera',{Transform:{position:[0,2,18]},Camera3D:{fov:60,near:0.1,far:100}});
add('Light',{Transform:{rotation:[-0.35,0,0,0.93675]},DirectionalLight:{intensity:2,color:[1,1,1]}});
for(const [dimension,x,color] of [['2D',-3,[0.15,0.5,1,1]],['3D',3,[1,0.25,0.1,1]]]){
  const parent=add(dimension+' parent',{Transform:{position:[x,1,0],scale:[2,2,2]}}),group=add(dimension+' group',{},parent);
  add(dimension+' body',{Transform:{position:[0,2,0]},[dimension==='2D'?'Rigidbody2D':'RigidBody3D']:{},['BoxCollider'+dimension]:{},MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:color,roughness:1}},group);
  add(dimension+' ground',{Transform:{position:[x,-0.5,0],scale:[4,1,2]},['BoxCollider'+dimension]:{},MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:[0.3,0.3,0.3,1],roughness:1}});
}
for(let i=0;i<4096;i++)add('Unrelated '+i,{Transform:{position:[i,0,0]}});
const scene={version:1,name:'Sparse physics',world:{entities,clear_color:[0.03,0.04,0.06,1]}};
const source=JSON.stringify(scene),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),source);
fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick() {}\n');
fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify({name:'Sparse physics QA',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',startupScript:'Assets/Scripts/Main.js',buildScenes:['Assets/Scenes/Main.mscene']}));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const report={root,label,passed:false,sceneSha256:hash(source),editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),checks:[]};
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const snapshot=()=>query('scene.snapshot'),step=(steps=1)=>execute('playback.step',{steps,deltaTime:1/60});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function capture(){const deadline=Date.now()+30000;for(;;){try{return await query('view.screenshot',{target:'game',maxSize:960,includeNativeProfile:true});}catch(e){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(e.message))throw e;await sleep(500);}}}
try{
  console.log('START native sparse physics',label);
  for(let attempt=0;;attempt++){try{await query('project.state');break;}catch(e){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(e.message))throw e;await sleep(500);}}
  await execute('project.open',{root:sample});const authored=await snapshot();assert.equal(authored.entities.length,4106);
  const body=(s,dimension)=>s.entities.find(e=>e.name===dimension+' body');
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await step(30);
  const falling=await snapshot();for(const dimension of ['2D','3D']){const y=body(falling,dimension).components.Transform.position[1];assert.ok(y<1.9&&y>0.1,dimension+' falls in parent space');}
  await step(180);const settled=await snapshot();report.finalBodies={};
  for(const dimension of ['2D','3D']){const entity=body(settled,dimension),transform=entity.components.Transform;assert.ok(Math.abs(transform.position[1])<0.05,dimension+' settles at ground in parent space');assert.ok(Math.abs(transform.position[0])<0.05);assert.ok(Math.abs(transform.position[2])<0.001);report.finalBodies[dimension]=transform;}
  assert.deepEqual(settled.entities.filter(e=>e.name?.startsWith('Unrelated ')),authored.entities.filter(e=>e.name?.startsWith('Unrelated ')));
  report.checks.push('2D and 3D fall, contact and parent-space writeback; 4096 unrelated entities unchanged');
  report.physicsFrames=[];let shot;
  for(let frame=0;frame<8;frame++){await step();shot=await capture();const stage=shot.nativeProfile?.simulationStages?.find(stage=>stage.name==='Physics and collision callbacks');assert.ok(stage&&Number.isFinite(stage.totalMs),'native capture includes this step physics profile');assert.ok(Number.isSafeInteger(shot.nativeProfile.worldRevision));report.physicsFrames.push({physicsMs:stage.totalMs,simulationMs:shot.nativeProfile.simulationMs,worldRevision:shot.nativeProfile.worldRevision});}
  fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);
  await execute('playback.play',{paused:true});await step(30);const restarted=await snapshot();
  for(const dimension of ['2D','3D'])assert.deepEqual(body(restarted,dimension).components.Transform,body(falling,dimension).components.Transform);
  await execute('playback.stop');report.checks.push('Stop restores authored state and fresh Play reproduces falling transforms');
  const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
  console.log('PASS native sparse physics: 2D/3D contacts, hierarchy, unchanged decoration, Stop and restart');
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}finally{
  try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(e){report.cleanupError=e.message;}
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
}
