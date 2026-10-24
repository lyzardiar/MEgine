// Author: MiYu. Native Scene picking follows hot-reloaded mesh bounds and inherited transforms.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const label='spatial-picking-'+Date.now(),root=path.join(out,'native-qa',label),project=path.join(root,'sample');
const opacityCases=process.argv.includes('--opacity-cases');
const spineOnly=process.argv.includes('--spine-only');
const poseCases=process.argv.includes('--pose-cases');
configureNativeQa(root);
for(const folder of ['Assets/Scenes','Assets/Scripts','Assets/Models'])fs.mkdirSync(path.join(project,folder),{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(project,name),JSON.stringify(value));
write('project.json',{name:label,storageId:label,version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js'});
fs.writeFileSync(path.join(project,'Assets/Scripts/Main.js'),'function onTick() {}');
const transform=position=>({position,rotation:[0,0,0,1],scale:[1,1,1]});
const spine={skeleton:'Assets/Spine/spineboy/spineboy-pro.json',atlas:'Assets/Spine/spineboy/spineboy-pma.atlas',animation:'run',skin:'default',loop_animation:true,playing:true,time_scale:1,scale:.7,color:[1,1,1,1],premultiplied_alpha:true,sorting_layer:'default',sorting_order:0};
if(spineOnly){const folder='Assets/Spine/spineboy';fs.mkdirSync(path.join(project,folder),{recursive:true});for(const file of ['spineboy-pro.json','spineboy-pma.atlas','spineboy-pma.png','LICENSE.txt'])fs.copyFileSync(path.join(repo,'samples/spine-showcase',folder,file),path.join(project,folder,file));}
write('Assets/Scenes/Main.mscene',{version:1,name:'Main',world:{entities:[{entity:1,name:'Parent',components:{Transform:transform([10,0,0])}},{entity:2,name:'Pickable mesh',parent:1,components:{Transform:transform([0,0,0]),MeshRenderer:{mesh:poseCases?'Assets/Models/pick.gltf#pose=0:0@30':'Assets/Models/pick.gltf',material:'default'}}},...(poseCases?[{entity:5,name:'QA mesh behind',components:{Transform:transform([0,0,-2]),MeshRenderer:{mesh:'cube',material:'default'}}}]:[]),...(opacityCases?[{entity:3,name:'QA opacity environment',components:{EnvironmentLight:{background_enabled:false}}}]:[]),...(spineOnly?[{entity:4,name:'QA animated Spine',components:{Transform:transform([-1,-1,0]),SpineSkeleton:spine}}]:[])]}});
function mesh(offset,zOffset=0){
  const positions=Array.from({length:8},(_,i)=>[(i&1?.5:-.5)+offset,i&2?.5:-.5,(i&4?.5:-.5)+zOffset]).flat();
  const indices=[0,2,1,1,2,3,4,5,6,5,7,6,0,1,4,1,5,4,2,6,3,3,6,7,0,4,2,2,4,6,1,3,5,3,7,5];
  const vertex=Buffer.from(new Float32Array(positions).buffer),index=Buffer.from(new Uint16Array(indices).buffer),buffer=Buffer.concat([vertex,index]);
  const result={asset:{version:'2.0'},buffers:[{byteLength:buffer.length,uri:'data:application/octet-stream;base64,'+buffer.toString('base64')}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertex.length},{buffer:0,byteOffset:vertex.length,byteLength:index.length}],accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[offset-.5,-.5,zOffset-.5],max:[offset+.5,.5,zOffset+.5]},{bufferView:1,componentType:5123,count:indices.length,type:'SCALAR'}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  if(poseCases){
    const animation=Buffer.from(new Float32Array([0,1,0,0,0,2,0,0]).buffer);
    result.buffers.push({byteLength:animation.length,uri:'data:application/octet-stream;base64,'+animation.toString('base64')});
    result.bufferViews.push({buffer:1,byteOffset:0,byteLength:8},{buffer:1,byteOffset:8,byteLength:24});
    result.accessors.push({bufferView:2,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:3,componentType:5126,count:2,type:'VEC3'});
    result.nodes.push({children:[0]});result.scenes[0].nodes=[1];
    result.animations=[{samplers:[{input:2,output:3,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:1,path:'translation'}}]}];
  }
  return result;
}
write('Assets/Models/pick.gltf',mesh(0));
if(opacityCases){const scene=JSON.parse(fs.readFileSync(path.join(project,'Assets/Scenes/Main.mscene'),'utf8'));scene.world.entities.push({entity:6,name:'QA browser helper',components:{Transform:transform([-1.5,1,0])}});write('Assets/Scenes/Main.mscene',scene);}
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const result=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(result.ok,JSON.stringify(result));return result.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),hash=value=>createHash('sha256').update(value).digest('hex');
const report={label,passed:false,editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),checks:[]};
async function pixels(name){
  const deadline=Date.now()+20000;
  for(;;)try{const shot=await query('view.screenshot',{target:'scene',maxSize:1280});const bytes=Buffer.from(shot.dataUrl.split(',')[1],'base64');if(name)fs.writeFileSync(path.join(out,label+'-'+name+'.png'),bytes);return hash(bytes);}
  catch(error){if(Date.now()>deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(200);}
}
async function pickCenter(expected){
  const deadline=Date.now()+15000;
  for(;;){
    await execute('selection.set',{ids:[]});await pixels();
    const page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000}),canvas=page.elements.find(e=>e.name==='Scene viewport');assert.ok(canvas);
    const started=performance.now();await execute('window.ui_drag_by',{windowLabel:'main',selector:canvas.selector,deltaX:1,deltaY:0,button:'left',expectedSnapshotRevision:page.snapshotRevision});
    const selected=(await query('selection.get')).selectedIds;
    (report.pickingActions??=[]).push({elapsedMs:performance.now()-started,selected,expected});
    if(selected.includes(expected))return;
    assert.ok(Date.now()<deadline,'Scene center selects current mesh: '+JSON.stringify(selected));await sleep(200);
  }
}
async function checkOpacity(alpha){
  await execute('batch.apply',{commands:[{op:'setClearColor',r:.08,g:.12,b:.18,a:alpha}]});await execute('selection.set',{ids:[]});await execute('profiler.clear');
  const deadline=Date.now()+10000;let profile;
  for(;;){await pixels();await sleep(250);profile=await query('profiler.get_samples',{source:'scene',limit:24});const count=profile.summary.latest?.drawItems;if(profile.nativeProfileCount>0&&count!=null&&(alpha===1?count===0:count>0))break;assert.ok(Date.now()<deadline,'Scene opacity selects the expected browser path: '+JSON.stringify({alpha,drawItems:count,nativeFrames:profile.nativeProfileCount}));}
  (report.opacityProfiles??=[]).push({alpha,nativeFrames:profile.nativeProfileCount,drawItems:profile.summary.latest.drawItems});
  await pixels(alpha===1?'opaque':'transparent');
}
try{
  for(let i=0;;i++)try{await query('project.state');break;}catch(error){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:project});await execute('panel.focus',{kind:'scene'});
  const original=(await query('scene.snapshot')).entities,parent=original.find(e=>e.name==='Parent'),child=original.find(e=>e.name==='Pickable mesh');assert.ok(parent&&child);
  await execute('view.set_camera',{pivot:[0,0,0],yaw:0,pitch:0,distance:5});await sleep(600);const before=await pixels('before');
  if(spineOnly){
    const entity=original.find(e=>e.name==='QA animated Spine');assert.ok(entity);await sleep(2000);const hashes=[];
    for(let i=0;i<3;i++){hashes.push(await pixels('spine-running-'+i));await sleep(350);}assert.equal(new Set(hashes).size,3,'Spine Scene overlay advances on each wall-clock interval');
    await execute('component.set',{entity:entity.entity,type:'SpineSkeleton',value:{...spine,playing:false}});await sleep(500);const paused=await pixels('spine-paused');await sleep(500);assert.equal(await pixels(),paused,'Stopped Spine does not advance during paints');
    const page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000}),canvas=page.elements.find(e=>e.name==='Scene viewport');assert.ok(canvas);
    await execute('window.ui_drag_by',{windowLabel:'main',selector:canvas.selector,deltaX:1,deltaY:0,button:'left',expectedSnapshotRevision:page.snapshotRevision});await execute('selection.set',{ids:[]});assert.equal(await pixels('spine-after-pick'),paused,'Hit replay does not advance or paint over the stopped Spine');
    report.spineHashes=hashes;report.spineProfile=await query('profiler.get_samples',{source:'scene',limit:24});assert.equal(report.spineProfile.summary.latest.spineSkeletons,1);assert.equal(report.spineProfile.summary.latest.drawItems,0,'Spine exercised the opaque deferred path');report.checks.push('Opaque Scene Spine animates visibly, freezes when stopped, and remains frozen through deferred hit replay');
  }else{
  write('Assets/Models/pick.gltf',mesh(-10));await pickCenter(child.entity);await execute('selection.set',{ids:[]});assert.notEqual(await pixels('mesh-reloaded'),before);assert.deepEqual((await query('scene.snapshot')).entities,original);
  report.checks.push('Model hot reload moves geometry into the view without changing entity transforms; native pixels and canvas picking both follow new bounds');
  await execute('component.set',{entity:parent.entity,type:'Transform',value:transform([110,0,0])});
  await execute('view.set_camera',{pivot:[100,0,0],yaw:0,pitch:0,distance:5});await pickCenter(child.entity);await pixels('parent-moved');
  report.checks.push('Parent transform replacement moves child picking bounds into a distant viewport');
  await execute('component.set',{entity:parent.entity,type:'Transform',value:transform([10,0,10])});
  await execute('view.set_camera',{pivot:[0,0,0],yaw:0,pitch:0,distance:5});write('Assets/Models/pick.gltf',mesh(-10,-10));await pickCenter(child.entity);await pixels('origin-behind');
  report.checks.push('Visible mesh remains pickable when its transform origin is behind the camera');
  if(poseCases){
    const behind=original.find(e=>e.name==='QA mesh behind');assert.ok(behind);
    await execute('view.set_scene_pickability',{id:child.entity,pickable:false});await pickCenter(behind.entity);
    await execute('view.set_scene_pickability',{id:child.entity,pickable:true});await pickCenter(child.entity);
    await execute('component.set',{entity:child.entity,type:'MeshRenderer',value:{mesh:'Assets/Models/pick.gltf#pose=0:15@30',material:'default'}});
    await execute('view.set_camera',{pivot:[1,0,0],yaw:0,pitch:0,distance:5});await pickCenter(child.entity);await pixels('pose-advanced');
    report.checks.push('Posed references follow animated root geometry; locked front mesh permits selecting the mesh behind it');
  }
  if(opacityCases){await checkOpacity(1);await pickCenter(child.entity);await checkOpacity(0);await pickCenter(child.entity);await checkOpacity(1);await pickCenter(child.entity);report.checks.push('Opaque Scene frames defer world hits; transparent frames retain immediate drawing; both paths and their transitions pick the current native mesh');}
  }
  report.errors=(await query('console.get_logs',{limit:100})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));await execute('scene.save');report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);try{await pixels('failure');report.scene=await query('scene.snapshot');report.logs=await query('console.get_logs',{limit:100});report.ui=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});}catch(diagnosticError){report.diagnosticError=diagnosticError.message;}}
finally{closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;report.passed=false;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,passed:report.passed,checks:report.checks,normalExit:report.cleanup?.normalExit,error:report.error,cleanupError:report.cleanupError}));}
