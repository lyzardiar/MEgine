// Author: MiYu. Verify game-menu map switching in one native editor and one game project.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
import {reserveNativeQaDebuggerPort,startNativeQaCpuProfile} from './frost-native-qa-cpu.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {createHierarchyActiveLookup} from '../packages/editor/src/hierarchyActivation.ts';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const logsOnly=process.argv.includes('--logs-only');
const continuousProfile=process.argv.includes('--continuous-profile');
const transportProfile=process.argv.includes('--transport-profile');
const simulationProfile=process.argv.includes('--simulation-profile');
assert.ok(!simulationProfile||transportProfile,'--simulation-profile requires --transport-profile');
const viewportTransitionsOnly=process.argv.includes('--viewport-transitions-only');
const viewportTransitions=process.argv.includes('--viewport-transitions')||viewportTransitionsOnly;
assert.ok(!viewportTransitions||continuousProfile||viewportTransitionsOnly,'--viewport-transitions requires --continuous-profile');
assert.ok(!transportProfile||continuousProfile,'--transport-profile requires --continuous-profile');
if(transportProfile)process.env.MENGINE_NATIVE_VIEWPORT_TRANSPORT_TRACE='1';
const effectReload=process.argv.includes('--effect-reload');
const runtimeEditsOnly=process.argv.includes('--runtime-edits-only');
const runtimeEdits=process.argv.includes('--runtime-edits')||runtimeEditsOnly;
assert.ok(!runtimeEdits||continuousProfile||runtimeEditsOnly,'--runtime-edits requires --continuous-profile');
const profileOnly=process.argv.includes('--profile-only')||continuousProfile;
const editorFeedback=process.argv.includes('--editor-feedback');
const returnOnly=process.argv.includes('--return-only');
const cameraOnly=process.argv.includes('--camera-only');
const hierarchyOnly=process.argv.includes('--hierarchy-only');
const unitInitializationOnly=process.argv.includes('--unit-initialization-only');
const unitSelectionOnly=process.argv.includes('--unit-selection-only');
const unitData=process.argv.includes('--unit-data');
assert.ok(!unitData||unitSelectionOnly,'--unit-data requires --unit-selection-only');
const detachedAuthoringOnly=process.argv.includes('--detached-authoring-only');
const detachedProfileOnly=process.argv.includes('--detached-profile-only');
const detachedSimulationTiming=process.argv.includes('--detached-simulation-timing');
const binaryPlayResponse=process.argv.includes('--binary-play-response');
const sceneObservation=process.argv.includes('--scene-observation');
assert.ok(!binaryPlayResponse||detachedSimulationTiming,'--binary-play-response requires --detached-simulation-timing');
assert.ok(!sceneObservation||detachedProfileOnly,'--scene-observation requires --detached-profile-only');
assert.ok(!detachedSimulationTiming||detachedProfileOnly,'--detached-simulation-timing requires --detached-profile-only');
const mainThreadCpuProfile=process.argv.includes('--main-thread-cpu-profile');
assert.ok(!mainThreadCpuProfile||detachedProfileOnly,'--main-thread-cpu-profile requires --detached-profile-only');
assert.ok(!mainThreadCpuProfile||process.platform==='win32','--main-thread-cpu-profile requires Windows WebView2');
const cpuDebuggerPort=mainThreadCpuProfile?await reserveNativeQaDebuggerPort():null;
const detachedOnly=process.argv.includes('--detached-only')||detachedAuthoringOnly||detachedProfileOnly;
const restartAfterStop=process.argv.includes('--restart-after-stop');
assert.ok(!restartAfterStop||detachedOnly,'--restart-after-stop requires a detached test');
const gpuMemoryDiagnostics=process.argv.includes('--gpu-memory-diagnostics');
assert.ok(!gpuMemoryDiagnostics||detachedProfileOnly,'--gpu-memory-diagnostics requires --detached-profile-only');
const residencyIndex=process.argv.indexOf('--residency-cycles'),residencyCycles=residencyIndex<0?0:Number(process.argv[residencyIndex+1]);
assert.ok(Number.isInteger(residencyCycles)&&residencyCycles>=0&&residencyCycles<=5,'--residency-cycles must be 0 through 5');
assert.ok(!residencyCycles||(detachedProfileOnly&&restartAfterStop),'--residency-cycles requires --detached-profile-only --restart-after-stop');
const restartOnly=process.argv.includes('--restart-only');
const hierarchyInteractions=process.argv.includes('--hierarchy-interactions');
const label='map-session-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:file=>!['SourceAssets','.mengine','Builds'].includes(path.basename(file))});
const config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));config.storageId=label;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
// The fixture adds one hidden observation entity per scene; runtime code and assets remain unchanged.
for(const file of config.buildScenes){const scene=JSON.parse(fs.readFileSync(path.join(sample,file),'utf8')),id=Math.max(...scene.world.entities.map(e=>e.entity))+1;scene.world.entities.push({entity:id,name:'QA map session',active:false,components:{Text:{text:'{}'}}});fs.writeFileSync(path.join(sample,file),JSON.stringify(scene));}
const unitObservation=unitData?`var qaObservedUnits=null,qaUnitData=null;function qaObserveUnits(){const current=FrostMapSession.unitInitialization();if(current===qaObservedUnits)return qaUnitData;qaObservedUnits=current;if(!current)return qaUnitData=null;const definitions={},profiles=new Map();let shared=true,frozen=true;for(const unit of current.units){if(profiles.has(unit.typeId)&&profiles.get(unit.typeId)!==unit.movement)shared=false;profiles.set(unit.typeId,unit.movement);definitions[unit.typeId]=unit.movement;frozen=frozen&&Object.isFrozen(unit.movement);}const library=FrostWarcraftJass.create(FrostWarcraftJass.link(['function Upcast takes unit u returns handle\\nreturn u\\nendfunction','function main takes nothing returns handle\\nreturn Upcast(GetUnit())\\nendfunction']),{natives:{GetUnit:{parameters:[],returns:'unit',call:function(){return current.units[0];}}}}).run('main');return qaUnitData={count:current.units.length,definitions,shared,frozen,library:{type:library.type,identity:library.value===current.units[0]}};}`:'';
fs.appendFileSync(path.join(sample,config.startupScript),`\n${unitObservation}\nvar qaMapTick=onTick;onTick=function(dt){qaMapTick(dt);const e=engine.findEntitiesByName(['QA map session'])[0];if(e)engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:'Text',value:{text:JSON.stringify({...FrostMapSession.status(),qaWheel:engine.input.wheelDelta${unitData?',qaUnitData:qaObserveUnits()':''}})}}));};\n`);
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'+(mainThreadCpuProfile?' --remote-debugging-port='+cpuDebuggerPort:'')});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot'),step=(steps=1)=>execute('playback.step',{steps,deltaTime:1/60});
const report={label,source,passed:false,editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),scriptSha256:hash(fs.readFileSync(path.join(source,config.startupScript))),checks:[],frames:[]};
const status=s=>JSON.parse(s.entities.find(e=>e.name==='QA map session').components.Text.text),telemetry=s=>JSON.parse(s.entities.find(e=>e.name==='Frost telemetry').components.Text.text);
async function input(args){await execute('playback.input',{keys:[],buttons:[],viewport:[1280,720],...args});await step();}
async function waitMap(map){let s=await snapshot();for(let i=0;status(s).map!==map&&i<5;i++){await step();s=await snapshot();}assert.equal(status(s).map,map);return s;}
async function key(key){await input({keys:[key]});await input({});await step();}
async function click(name){const s=await snapshot(),pointer=clientWorldFixture(s).canvasPoint(name,[1280,720],false);await input({pointer,buttons:[0]});await input({pointer});await step();}
async function capture(name){const deadline=Date.now()+30000;for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});if(name)fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.frames.push(shot.nativeProfile);return shot.dataUrl;}catch(e){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(e.message))throw e;await sleep(500);}}
async function sampleProcessMemory(stage,field='detachedMemory'){const owner=JSON.parse(fs.readFileSync(process.env.MENGINE_AGENT_BRIDGE_FILE,'utf8'));assert.equal(owner.background,true);assert.ok(Number.isSafeInteger(owner.pid));const sample=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',path.join(repo,'scripts/sample-native-qa-memory.ps1'),'-EditorPid',String(owner.pid),'-ExpectedExecutable',process.env.MENGINE_EDITOR_EXECUTABLE],{encoding:'utf8',windowsHide:true,timeout:20000}));(report[field]??=[]).push({stage,...sample});if(gpuMemoryDiagnostics){const entry={stage};for(const source of ['scene','game']){const result=await query('profiler.get_samples',{source,limit:1,includeGpuAllocator:true});entry[source]=result.gpuAllocator;}(report.gpuMemory??=[]).push(entry);}}
async function checkRestartAfterStop(authored,entityCount,sampleMemory,{name='restarted-map',liveMs=0}={}){
  await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step(2);
  assert.equal(clientWorldFixture(await snapshot()).visible('solo box'),true,'Restart opens a fresh main menu');
  await click('solo box');await click('custom box');await click('map4 box');await click('map1 box');
  assert.equal((await snapshot()).entities.find(e=>e.name==='Map name').components.Text.text,'Amazonia');await click('mapStart box');
  const restarted=await waitMap('amazonia');assert.equal(restarted.entities.length,entityCount);await capture(name);
  if(liveMs){await execute('playback.play');await sleep(liveMs);await execute('playback.pause');await capture(name+'-live');await sampleMemory('live');}
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);assert.equal((await query('editor.state')).dirty,false);
  await sleep(1000);await sampleMemory('after-second-stop');report.checks.push('Fresh Play after Stop enters Amazonia again, presents Game pixels, and a second Stop restores authored content');
}
async function checkViewportTransitions(){
  const before=await snapshot(),camera=before.entities.find(e=>e.name==='Camera'&&e.components.Camera3D),root=before.entities.find(e=>e.name.startsWith('Doodad-')&&e.components.Transform);assert.ok(camera&&root);
  await execute('panel.focus',{kind:'scene'});await execute('selection.set',{ids:[camera.entity]});
  await execute('view.set_camera',{pivot:root.components.Transform.position,yaw:25,pitch:45,distance:30});
  async function sceneShot(name){const shot=await query('view.screenshot',{target:'scene',maxSize:1280});const bytes=Buffer.from(shot.dataUrl.split(',')[1],'base64');fs.writeFileSync(path.join(out,label+'-'+name+'.png'),bytes);return hash(bytes);}
  const first=await sceneShot('scene-camera-preview');
  await execute('selection.set',{ids:[]});await execute('profiler.clear');
  for(let yaw=30;yaw<=120;yaw+=10){await execute('view.set_camera',{yaw});await sleep(20);}
  const motion=await query('profiler.get_samples',{source:'scene',limit:240,includeNativeTimings:true});assert.ok(motion.nativeProfileCount>=3,'Scene presents during continuous camera input');
  const page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000}),splitter=page.elements.find(e=>e.role==='separator'&&e.actions?.includes('dragBy'));
  if(splitter){await execute('window.ui_drag_by',{windowLabel:'main',selector:splitter.selector,expectedSnapshotRevision:page.snapshotRevision,deltaX:80,deltaY:0});await sleep(50);const shot=await query('view.window_screenshot',{windowLabel:'main',maxSize:1280});fs.writeFileSync(path.join(out,label+'-scene-resized.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}
  await execute('panel.focus',{kind:'game'});await sleep(500);await execute('profiler.clear');await sleep(900);
  const hidden=await query('profiler.get_samples',{source:'scene',limit:240,includeNativeTimings:true});assert.equal(hidden.nativeProfileCount,0,'inactive dock Scene submits no native frames');assert.equal(hidden.samples.length,0,'inactive dock Scene performs no browser paints');
  await execute('panel.focus',{kind:'scene'});await sleep(800);const resumed=await query('profiler.get_samples',{source:'scene',limit:240});assert.ok(resumed.nativeProfileCount>0,'Scene resumes when its tab is selected');
  report.sceneFeedback={motionFrames:motion.nativeProfileCount,hiddenFrames:hidden.nativeProfileCount,hiddenPaints:hidden.samples.length,resumedFrames:resumed.nativeProfileCount,resizeExercised:!!splitter};
  report.checks.push('Scene presents during repeated camera changes; inactive dock tab stops native and browser rendering, selecting it resumes');
  await execute('view.set_camera',{yaw:115});
  const moved=await sceneShot('scene-moved');assert.notEqual(moved,first,'Scene camera changes render new pixels');
  const profiles=await query('profiler.get_samples',{source:'scene',limit:1});assert.ok(profiles.nativeProfileCount>0,'Scene completion publishes native profiles');
  await execute('panel.focus',{kind:'game'});await execute('view.set_game_resolution',{resolution:{width:960,height:900}});
  const tall=Buffer.from((await capture('transition-tall')).split(',')[1],'base64');assert.deepEqual([tall.readUInt32BE(16),tall.readUInt32BE(20)],[960,900]);
  await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await capture('transition-wide');
  assert.deepEqual((await snapshot()).entities,before.entities,'Viewport navigation preserves paused map entities');
  report.viewportTransitions={sceneHashes:[first,moved],sceneProfiles:profiles.nativeProfileCount,gameSize:[960,900]};
  report.checks.push('Paused Amazonia Scene/Game transitions, selected camera preview, orbit changes, exact Game resize and unchanged entities');
}
async function checkRuntimeEdits(){
  const before=await snapshot(),target=before.entities.find(e=>e.name.startsWith('Doodad-')&&!e.components.MeshRenderer&&!e.components.SampledEffect&&e.components.Transform&&Math.abs(e.components.Transform.position[1]*10-Math.round(e.components.Transform.position[1]*10))<1e-6);assert.ok(target,'Static authored doodad root with an exact Inspector step value');
  const original=target.components.Transform.position[1],edited=original+3.2;
  await execute('selection.set',{ids:[target.entity]});await execute('panel.focus',{kind:'inspector'});
  async function setHeight(value){
    const deadline=Date.now()+20000;let page,item;
    for(;;){page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});item=page.elements.find(e=>e.name==='Transform Position Y');if(item)break;assert.ok(Date.now()<deadline,'Inspector Transform Position Y input');await sleep(150);}
    await execute('window.ui_set_value',{windowLabel:'main',selector:item.selector,expectedSnapshotRevision:page.snapshotRevision,value:String(value)});
    assert.ok(Math.abs((await snapshot()).entities.find(e=>e.entity===target.entity).components.Transform.position[1]-value)<1e-5,'Inspector writes the live editable world');
  }
  await execute('view.set_camera',{pivot:target.components.Transform.position,yaw:35,pitch:35,distance:8});
  async function pixels(name){
    await execute('selection.set',{ids:[]});await execute('panel.focus',{kind:'scene'});
    const shot=await query('view.screenshot',{target:'scene',maxSize:1280}),bytes=Buffer.from(shot.dataUrl.split(',')[1],'base64');
    fs.writeFileSync(path.join(out,label+'-'+name+'.png'),bytes);
    await execute('selection.set',{ids:[target.entity]});await execute('panel.focus',{kind:'inspector'});return hash(bytes);
  }
  const originalPixels=await pixels('runtime-transform-before');
  await setHeight(edited);const editedPixels=await pixels('runtime-transform-raised');assert.notEqual(editedPixels,originalPixels,'Paused native geometry responds to Inspector transform without selection overlays');
  await setHeight(original);const restoredPixels=await pixels('runtime-transform-restored');assert.equal(restoredPixels,originalPixels,'Restored transform restores exact paused native pixels');
  report.runtimeTransformPixels={original:originalPixels,edited:editedPixels,restored:restoredPixels};
  await setHeight(edited);await step(30);const changed=await snapshot();
  assert.ok(Math.abs(changed.entities.find(e=>e.entity===target.entity).components.Transform.position[1]-edited)<1e-5,'Native simulation retains the uploaded Inspector edit');
  const originals=new Map(before.entities.map(e=>[e.entity,JSON.stringify(e.components)])),layers={doodads:0,units:0,water:0};
  for(const entity of changed.entities)if(entity.entity!==target.entity&&JSON.stringify(entity.components)!==originals.get(entity.entity))for(const [key,prefix]of [['doodads','Doodad-'],['units','Unit-'],['water','Water-']])if(entity.name.startsWith(prefix))layers[key]++;
  for(const [layer,count]of Object.entries(layers))assert.ok(count>0,layer+' advances after explicit world upload');
  assert.ok(status(changed).elapsed>status(before).elapsed,'Map clock advances after the edit');
  await execute('panel.focus',{kind:'game'});await capture('runtime-edited');
  await setHeight(original);await step(2);const restored=await snapshot();assert.ok(Math.abs(restored.entities.find(e=>e.entity===target.entity).components.Transform.position[1]-original)<1e-5,'Restored Inspector value reaches native simulation');
  report.runtimeEdits={entity:target.entity,name:target.name,original,edited,layers,elapsedBefore:status(before).elapsed,elapsedAfter:status(changed).elapsed};
  report.checks.push('Paused Inspector transforms change native Scene pixels and restore exactly without selection overlays; edits persist through native steps, three animation layers and clock advance');
}
async function checkEffectReload(){
  // Move the original camera from the empty start clearing to the authored fire props.
  await input({keys:['KeyA']});await step(45);await input({});
  await input({keys:['KeyS']});await step(40);await input({});
  const world=await snapshot(),keys=[...new Set(world.entities.map(e=>e.components.SampledEffect?.effect).filter(Boolean))],saved=[];
  for(const key of keys){const file=path.resolve(sample,key),relative=path.relative(sample,file);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative));saved.push({file,bytes:fs.readFileSync(file)});}
  assert.ok(saved.length);const before=await capture('effects-before'),beforeCount=report.frames.at(-1).counts.uiPrimitives;
  async function waitFrame(name,predicate){
    const started=Date.now(),attempts=[];
    for(;;){
      const pixels=await capture(),count=report.frames.at(-1).counts.uiPrimitives;attempts.push({elapsedMs:Date.now()-started,count,pixelHash:hash(pixels)});
      if(predicate(pixels,count)){fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(pixels.split(',')[1],'base64'));return {count,attempts};}
      assert.ok(Date.now()-started<10000,name+' observable frame: '+JSON.stringify(attempts));await sleep(300);
    }
  }
  try{
    for(const {file,bytes} of saved){const asset=JSON.parse(bytes.toString('utf8'));for(const clip of asset.clips)for(const frame of clip.frames){frame.particles=[];frame.quads=[];frame.lights=[];}fs.writeFileSync(file,JSON.stringify(asset));}
    const changed=await waitFrame('effects-edited',(pixels,count)=>pixels!==before&&count<beforeCount);
    report.effectReload={files:saved.length,beforeCount,afterCount:changed.count,changedAttempts:changed.attempts};
  }finally{for(const {file,bytes} of saved)fs.writeFileSync(file,bytes);}
  report.effectReload.restoredAttempts=(await waitFrame('effects-restored',(pixels,count)=>pixels===before&&count===beforeCount)).attempts;
  assert.deepEqual((await snapshot()).entities,world.entities,'Asset reload does not edit scene entities');
  report.checks.push('Original effect files hot reload and restore exact paused pixels without changing scene data');
}
async function checkHierarchyFocus(s){
  const candidates=s.entities.filter(e=>e.name.startsWith('Doodad-')&&e.components.Transform&&!e.components.MeshRenderer);
  const first=candidates[0],second=candidates.find(e=>Math.hypot(...e.components.Transform.position.map((v,i)=>v-first.components.Transform.position[i]))>20);assert.ok(first&&second);
  async function ui(){const result=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});report.lastUi=result;return result;}
  async function row(target){await execute('panel.focus',{kind:'hierarchy'});let snapshot=await ui(),filter=snapshot.elements.find(e=>e.name==='Search hierarchy');assert.ok(filter);await execute('window.ui_set_value',{windowLabel:'main',selector:filter.selector,expectedSnapshotRevision:snapshot.snapshotRevision,value:target.name});await sleep(150);snapshot=await ui();const item=snapshot.elements.find(e=>e.role==='treeitem'&&e.name===target.name);assert.ok(item,target.name);return {snapshot,item};}
  let target=await row(first);await execute('window.ui_double_click',{windowLabel:'main',selector:target.item.selector,expectedSnapshotRevision:target.snapshot.snapshotRevision});await sleep(250);const a=(await query('editor.state')).sceneCamera;
  target=await row(second);await execute('window.ui_press_key',{windowLabel:'main',selector:target.item.selector,expectedSnapshotRevision:target.snapshot.snapshotRevision,key:'Space'});await sleep(250);const b=(await query('editor.state')).sceneCamera;
  assert.notDeepEqual(a.pivot,b.pivot);for(const [camera,entity] of [[a,first],[b,second]])assert.ok(Math.hypot(...camera.pivot.map((v,i)=>v-entity.components.Transform.position[i]))<10,entity.name+' frame target');
  report.focus={doubleClick:{entity:first.name,camera:a},space:{entity:second.name,camera:b}};report.checks.push('Hierarchy runtime search, native double click and Space frame distinct map roots');delete report.lastUi;await execute('panel.focus',{kind:'game'});
}
async function checkHierarchyPresentation(s){
  const root=s.entities.find(e=>e.name.startsWith('Doodad-')&&s.entities.some(child=>child.parent===e.entity)),child=s.entities.find(e=>e.parent===root?.entity);assert.ok(root&&child);
  const byId=new Map(s.entities.map(e=>[e.entity,e]));let topRoot=root;while(topRoot.parent!=null)topRoot=byId.get(topRoot.parent);assert.ok(topRoot);
  await execute('panel.focus',{kind:'hierarchy'});
  const ui=()=>query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});
  async function element(name){for(let attempt=0;attempt<20;attempt++){const snapshot=await ui(),item=snapshot.elements.find(e=>e.name===name);if(item)return {snapshot,item};await sleep(100);}report.lastHierarchyUi=await ui();throw Error('Hierarchy item missing: '+name);}
  async function button(name){const {snapshot,item}=await element(name);await execute('window.ui_click',{windowLabel:'main',selector:item.selector,expectedSnapshotRevision:snapshot.snapshotRevision});}
  const search=await element('Search hierarchy');await execute('window.ui_set_value',{windowLabel:'main',selector:search.item.selector,expectedSnapshotRevision:search.snapshot.snapshotRevision,value:''});
  await execute('selection.set',{ids:[root.entity]});await element(root.name);
  await button('Collapse all hierarchy nodes');await element('Expand '+topRoot.name);
  await button('Expand all hierarchy nodes');await execute('selection.set',{ids:[]});await execute('selection.reveal',{id:root.entity});await element('Collapse '+root.name);
  await button('Collapse all hierarchy nodes');await execute('selection.reveal',{id:child.entity});await element(child.name);await element('Collapse '+root.name);
  await execute('selection.set',{ids:[root.entity]});const item=await element(root.name);
  await execute('window.ui_press_key',{windowLabel:'main',selector:item.item.selector,expectedSnapshotRevision:item.snapshot.snapshotRevision,key:'ArrowLeft'});await element('Expand '+root.name);
  const folded=await element(root.name);await execute('window.ui_press_key',{windowLabel:'main',selector:folded.item.selector,expectedSnapshotRevision:folded.snapshot.snapshotRevision,key:'ArrowRight'});await element('Collapse '+root.name);
  const selected=async()=>new Set((await query('selection.get')).selectedIds);
  const roots=s.entities.filter(e=>e.parent==null).map(e=>e.entity);
  await button('Collapse all hierarchy nodes');await execute('selection.reveal',{id:topRoot.entity});
  const selectRow=await element(topRoot.name);
  await execute('window.ui_press_key',{windowLabel:'main',selector:selectRow.item.selector,expectedSnapshotRevision:selectRow.snapshot.snapshotRevision,key:'a',ctrlKey:true});
  assert.deepEqual(await selected(),new Set(roots),'Ctrl+A selects collapsed roots');
  await button('Expand all hierarchy nodes');await button('Edit');
  const menuPage=await ui(),selectAll=menuPage.elements.find(e=>e.name?.startsWith('Select All'));assert.ok(selectAll);
  await execute('window.ui_click',{windowLabel:'main',selector:selectAll.selector,expectedSnapshotRevision:menuPage.snapshotRevision});
  assert.deepEqual(await selected(),new Set(s.entities.map(e=>e.entity)),'Edit menu selects expanded hierarchy');
  await execute('selection.reveal',{id:child.entity});await execute('selection.set',{ids:[root.entity]});
  const rangeEnd=await element(child.name);
  await execute('window.ui_click',{windowLabel:'main',selector:rangeEnd.item.selector,expectedSnapshotRevision:rangeEnd.snapshot.snapshotRevision,shiftKey:true});
  const range=await selected();assert.ok(range.has(root.entity)&&range.has(child.entity),'Shift-click includes anchor and target');
  await execute('selection.set',{ids:[root.entity]});await execute('panel.focus',{kind:'game'});
  report.checks.push('Native Ctrl+A on collapsed roots, expanded Edit menu Select All and Shift-click range selection');
  report.checks.push('Native hierarchy collapse/expand, hidden descendant reveal, scrolling and left/right keys for runtime root '+root.entity);
}
async function checkDetachedRuntime(authored){
  const sampleMemory=stage=>sampleProcessMemory(stage);
  await sampleMemory('before-detach');
  const before=await snapshot(),target=before.entities.find(e=>e.name.startsWith('Doodad-')&&!e.components.MeshRenderer&&!e.components.SampledEffect&&e.components.Transform&&Math.abs(e.components.Transform.position[1]*10-Math.round(e.components.Transform.position[1]*10))<1e-6);assert.ok(target);
  const original=target.components.Transform.position[1],edited=original+3.2;
  await execute('selection.set',{ids:[target.entity]});await execute('view.set_camera',{pivot:target.components.Transform.position,yaw:35,pitch:35,distance:10});
  for(const kind of detachedAuthoringOnly?['inspector']:['inspector','scene','game'])await execute('panel.detach',{kind});
  const ui=()=>query('window.ui_snapshot',{windowLabel:'panel-inspector',maxElements:5000});
  async function field(expected){const deadline=Date.now()+30000;for(;;){const page=await ui(),item=page.elements.find(e=>e.name==='Transform Position Y');report.detachedLastUi={snapshotRevision:page.snapshotRevision,elements:page.elements.filter(e=>e.name==='GameObject name'||String(e.name??'').includes('Position')||String(e.name??'').includes('Inspector'))};if(item&&(expected===undefined||Math.abs(Number(item.value)-expected)<1e-5))return {page,item};if(Date.now()>=deadline){report.failedEditorState=await query('editor.state');report.failedSelection=await query('selection.get');assert.fail('Detached Inspector height '+expected);}await sleep(150);}}
  async function mainHeight(expected){const deadline=Date.now()+30000;for(;;){const entity=await query('entity.get',{id:target.entity});if(Math.abs(entity.components.Transform.position[1]-expected)<1e-5)return;assert.ok(Date.now()<deadline,'Main received detached height '+expected);await sleep(150);}}
  if(!detachedAuthoringOnly){
  if(!detachedProfileOnly){
  await field(original);const {page,item}=await field();
  const editStarted=performance.now();await execute('window.ui_set_value',{windowLabel:'panel-inspector',selector:item.selector,expectedSnapshotRevision:page.snapshotRevision,value:String(edited)});
  await mainHeight(edited);report.detachedEditObservedMs=performance.now()-editStarted;await step(3);await mainHeight(edited);await field(edited);
  report.checks.push('Detached Inspector edit reaches native simulation and persists after 3 steps');
  await execute('panel.dock',{kind:'inspector'});await execute('panel.focus',{kind:'inspector'});
  const mainPage=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000}),mainField=mainPage.elements.find(e=>e.name==='Transform Position Y');assert.ok(mainField);
  await execute('window.ui_set_value',{windowLabel:'main',selector:mainField.selector,expectedSnapshotRevision:mainPage.snapshotRevision,value:String(original)});await step(2);await mainHeight(original);
  await execute('panel.detach',{kind:'inspector'});await field(original);
  report.checks.push('Detached Inspector transform reaches main native simulation and persists after 3 steps; main component restore reaches detached Inspector');
  }
  await execute('playback.play');await execute('panel.dock',{kind:'game'});await execute('panel.detach',{kind:'game'});await sleep(2500);await sampleMemory('three-panels-live');
  {
    await execute('profiler.clear');const started=performance.now();report.nativeWarmup=[];
    for(;;){const profiles=await query('profiler.get_samples',{source:'game',limit:1});report.nativeWarmup.push({elapsedMs:performance.now()-started,count:profiles.nativeProfileCount,entities:profiles.nativeLatest?.counts.entities});if(profiles.nativeLatest?.counts.entities===before.entities.length&&profiles.nativeProfileCount>=2)break;assert.ok(performance.now()-started<30000,'Detached Game native warmup timeout');await sleep(300);}
  }
  const cpuProfile=mainThreadCpuProfile?await startNativeQaCpuProfile(root,cpuDebuggerPort):null;
  let profileElapsedMs;
  try{await execute('profiler.clear');const started=performance.now();await sleep(5000);profileElapsedMs=performance.now()-started;}finally{if(cpuProfile)report.mainThreadCpu=await cpuProfile.stop();}
  if(mainThreadCpuProfile){assert.ok(report.mainThreadCpu.samples>0&&report.mainThreadCpu.durationMs>0);report.checks.push('Owned main WebView JavaScript CPU samples captured during the live profile window');}
  report.detachedProfiles={elapsedMs:profileElapsedMs};
  const active=createHierarchyActiveLookup(before.entities),activeEntities=before.entities.filter(entity=>active(entity.entity)).length;
  for(const source of ['scene','game']){const profiles=await query('profiler.get_samples',{source,limit:240,includeNativeTimings:true}),request=profiles.nativeLatest?.worldRequest,filtered=source==='scene'&&(request?.source==='snapshot'||request?.fallback==='play-revision-expired');report.detachedProfiles[source]={frontendSummary:profiles.summary,frontendSamples:profiles.samples,nativeSummary:profiles.nativeSummary,counts:profiles.nativeLatest?.counts,worldRevision:profiles.nativeLatest?.worldRevision,worldRequest:request,expectedTotal:before.entities.length,initialActive:activeEntities,timings:profiles.nativeTimings};assert.ok(profiles.nativeSummary?.intervals>5,source+' detached native presents');assert.ok(profiles.samples?.length&&profiles.samples.every(frame=>frame.sampleCount>0&&Number.isFinite(frame.paintMs)&&frame.paintMs>=0),source+' browser paint samples');if(filtered)assert.ok(Number.isSafeInteger(request.snapshotEntityCount)&&request.snapshotEntityCount>0&&request.snapshotEntityCount<=before.entities.length);assert.equal(profiles.nativeLatest?.counts.entities,filtered?request.snapshotEntityCount:before.entities.length);assert.ok(profiles.nativeTimings?.length&&profiles.nativeTimings.every(frame=>frame.worldRequest&&frame.worldRequest.elapsedMs>=0),source+' request telemetry');for(const frame of profiles.nativeTimings)assert.equal(frame.entityCount,frame.worldRequest.snapshotEntityCount??before.entities.length,source+' native count matches each submitted world');}
  report.checks.push('Game window reopens during Play and catches up with revisioned native frames');
  for(const source of ['scene','game']){
    const native=(await query('profiler.get_samples',{source,limit:1})).nativeLatest;assert.ok(native);
    report.detachedProfiles[source].nativeState={gpuTimingSupported:native.gpuTimingSupported,gpuTimingEnabled:native.gpuTimingEnabled,gpu:native.gpu,memory:native.memory,residentMemoryEstimateBytes:native.residentMemoryEstimateBytes,resourcesTruncated:native.resourcesTruncated};
    if(process.env.MENGINE_GPU_TIMINGS==='1'){
      assert.equal(native.gpuTimingSupported,true,source+' hardware timestamps supported');assert.equal(native.gpuTimingEnabled,true,source+' GPU recording enabled');
      assert.ok(native.gpu?.timestampPeriodNs>0&&Number.isFinite(native.gpu.totalPassMs)&&native.gpu.totalPassMs>=0,source+' hardware timing sample');
      assert.ok(native.gpu.stages.some(stage=>stage.name==='Forward HDR')&&native.gpu.stages.some(stage=>stage.name==='Texture readback copy'),source+' independent render and copy timestamps');
      assert.ok(native.gpu.stages.every(stage=>Number.isFinite(stage.totalMs)&&stage.totalMs>=0),source+' finite GPU stages');
    }
  }
  if(detachedSimulationTiming){
    report.detachedSimulationTimings={};
    for(const source of ['scene','game']){
      const profile=report.detachedProfiles[source],timings=profile.timings.filter(frame=>frame.simulationTiming);
      const revisions=new Set(timings.map(frame=>frame.simulationTiming.sessionId+':'+frame.simulationTiming.revision));
      assert.ok(timings.length>=15&&revisions.size>=15,source+' owns multiple correlated simulation requests');
      for(const frame of timings){
        const timing=frame.simulationTiming;assert.equal(timing.sessionId,frame.worldRequest.sessionId);
        if(binaryPlayResponse)assert.equal(timing.responseTransport,'binary-json',source+' receives the binary Play response on the actual native owner');
        if(frame.worldRequest.revision!==undefined)assert.equal(timing.revision,frame.worldRequest.revision);
        assert.equal(frame.simulationRequestMs,timing.totalMs);
        for(const value of [timing.totalMs,timing.prepareMs,timing.invokeMs,timing.applyMs,timing.acceptMs,timing.native?.workerQueueMs,timing.native?.workerMs,timing.native?.simulationMs,timing.native?.commandMs])assert.ok(Number.isFinite(value)&&value>=0,source+' nonnegative owner duration');
      }
      assert.ok(profile.nativeSummary.averageSimulationRequestMs>0,source+' measured owner request average');
      report.detachedSimulationTimings[source]={samples:timings.length,distinctRevisions:revisions.size,averageRequestMs:profile.nativeSummary.averageSimulationRequestMs};
    }
    report.checks.push('Detached Scene and Game preserve accepted owner simulation durations and exact requested session/revision');
    if(binaryPlayResponse)report.checks.push('Accepted owner timings confirm binary JSON Play delivery in both detached viewports');
  }
  await execute('playback.pause');await sleep(300);const paused=await snapshot();await sleep(300);assert.deepEqual((await snapshot()).entities,paused.entities);await step(2);const advanced=await snapshot();assert.ok(advanced.simulationTime>paused.simulationTime);
  if(sceneObservation){
    const diff=await query('scene.diff',{fromRevision:paused.revision});assert.equal(diff.toRevision,advanced.revision);assert.equal(diff.resetRequired,false);assert.deepEqual(diff.added,[]);assert.deepEqual(diff.removed,[]);
    const changed=new Map(diff.entities.map(entity=>[entity.entity,entity]));assert.deepEqual(paused.entities.map(entity=>changed.get(entity.entity)??entity),advanced.entities);
    const empty=await query('scene.diff',{fromRevision:advanced.revision});assert.deepEqual([empty.added,empty.removed,empty.changed],[[],[],[]]);assert.equal(empty.toRevision,advanced.revision);
    assert.ok(advanced.revision>paused.revision);await assert.rejects(()=>bridgeExecute('playback.input',{keys:[]},{requestId:crypto.randomUUID(),expectedSceneRevision:paused.revision}),error=>error.code==='STALE_REVISION');
    const current=await bridgeExecute('playback.input',{keys:[]},{requestId:crypto.randomUUID(),expectedSceneRevision:advanced.revision});assert.equal(current.ok,true);
    report.sceneObservation={fromRevision:paused.revision,toRevision:advanced.revision,changed:diff.changed};report.checks.push('Native sparse scene.diff exactly reconstructs paused Step output, stays empty without edits, and enforces stale/current optimistic writes');
  }
  for(const windowLabel of ['panel-scene','panel-game']){const shot=await query('view.window_screenshot',{windowLabel,maxSize:1280});fs.writeFileSync(path.join(out,label+'-'+windowLabel+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}
  report.checks.push('Three detached panels sustain native Scene/Game frames, pause freezes main world, Step advances, and both view windows capture');
  for(const expected of ['play','pause']){const keyPage=await query('window.ui_snapshot',{windowLabel:'panel-game',maxElements:5000}),canvas=keyPage.elements.find(e=>e.name==='Game viewport');assert.ok(canvas);await execute('window.ui_press_key',{windowLabel:'panel-game',selector:canvas.selector,expectedSnapshotRevision:keyPage.snapshotRevision,key:'p',ctrlKey:true,shiftKey:true});const deadline=Date.now()+20000;while((await query('editor.state')).mode!==expected){assert.ok(Date.now()<deadline,'Detached playback request reaches main '+expected);await sleep(100);}await sleep(500);}
  report.checks.push('Detached Game Ctrl+Shift+P resumes and pauses the main native owner');
  await click('Map session restart');await waitMap('amazonia');await execute('panel.dock',{kind:'inspector'});await execute('panel.detach',{kind:'inspector'});
  const reloaded=await snapshot(),again=reloaded.entities.find(e=>e.name===target.name);assert.ok(again);await execute('selection.set',{ids:[again.entity]});await field(original);
  await sampleMemory('after-map-reload');
  }
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);assert.equal((await query('editor.state')).dirty,false,'Runtime changes do not dirty the authored scene');
  report.checks.push('Stop restores the complete authored entity set');
  const authorTarget=authored.entities.find(e=>e.components.Transform&&(e.components.Camera3D||e.components.Camera2D))??authored.entities.find(e=>e.components.Transform);assert.ok(authorTarget);report.authorTarget=authorTarget;await execute('selection.set',{ids:[authorTarget.entity]});
  const {page:editPage,item:editItem}=await field(authorTarget.components.Transform.position[1]);
  const authorEdited=authorTarget.components.Transform.position[1]+1;
  await execute('window.ui_set_value',{windowLabel:'panel-inspector',selector:editItem.selector,expectedSnapshotRevision:editPage.snapshotRevision,value:String(authorEdited)});
  const deadline=Date.now()+30000;for(;;){const e=await query('entity.get',{id:authorTarget.entity});if(Math.abs(e.components.Transform.position[1]-authorEdited)<1e-5)break;assert.ok(Date.now()<deadline,'Authoring remains editable after Stop');await sleep(150);}
  assert.equal((await query('editor.state')).dirty,true,'Detached authoring edit marks main scene dirty');
  await execute('component.set',{entity:authorTarget.entity,type:'Transform',value:authorTarget.components.Transform});await field(authorTarget.components.Transform.position[1]);assert.deepEqual((await snapshot()).entities,authored.entities);assert.equal((await query('editor.state')).dirty,false,'Restoring authored content clears dirty state');
  await execute('entity.create',{name:'QA author allocation after Stop'});const created=(await snapshot()).entities.find(e=>e.name==='QA author allocation after Stop');assert.ok(created);assert.ok(created.entity>Math.max(...authored.entities.map(e=>e.entity)));
  await execute('history.undo');assert.deepEqual((await snapshot()).entities,authored.entities);await execute('history.redo');assert.ok((await snapshot()).entities.some(e=>e.entity===created.entity));await execute('history.undo');assert.deepEqual((await snapshot()).entities,authored.entities);assert.equal((await query('editor.state')).dirty,false);
  report.checks.push('Stop authoring allocates a new entity ID and supports undo/redo without changing retained author content');
  report.windows=await query('window.list');for(const kind of ['game','scene','inspector'])await execute('panel.dock',{kind});
  await sampleMemory('after-stop-and-dock');
  report.checks.push('Detached authoring edit/restore after Stop; auxiliary panels dock normally');
  if(restartAfterStop)await checkRestartAfterStop(authored,before.entities.length,sampleMemory);
  if(residencyCycles){report.residencyCycles=[];for(let cycle=1;cycle<=residencyCycles;cycle++){
    const started=performance.now(),prefix='residency-cycle-'+cycle;
    await checkRestartAfterStop(authored,before.entities.length,stage=>sampleMemory(prefix+'-'+stage),{name:prefix+'-map',liveMs:15000});
    await sleep(20000);await sampleMemory(prefix+'-idle-20s');report.residencyCycles.push({cycle,liveMs:15000,idleMs:20000,elapsedMs:performance.now()-started});
  }}
}
try{
  for(let i=0;;i++)try{await query('project.state');break;}catch(e){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(e.message))throw e;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot();await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step(2);
  await click('solo box');await click('custom box');await click('map4 box');await click('map1 box');
  let s=await snapshot();assert.equal(telemetry(s).mode,'custom');assert.equal(s.entities.find(e=>e.name==='Map name').components.Text.text,'Amazonia');assert.equal(s.entities.find(e=>e.name==='Map preview backing').components.Image.sprite,'Assets/Maps/amazonia/Textures/MapPreview.png');for(const name of ['map2 box','map3 box','faction box','heroChoice box','Hero preview','Map tile 0'])assert.equal(clientWorldFixture(s).visible(name),false,name);await capture('selection');
  await click('mapStart box');s=await waitMap('amazonia');assert.deepEqual(status(s).pathing.size,[384,384]);assert.equal(status(s).pathing.revision,0);assert.ok(s.entities.some(e=>e.name.startsWith('Doodad-'))&&s.entities.some(e=>e.name.startsWith('Unit-')));report.map=status(s);report.entities=s.entities.length;
  if(editorFeedback)await checkHierarchyFocus(s);
  if(restartOnly){
    await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);await sampleProcessMemory('after-first-stop','restartMemory');
    await checkRestartAfterStop(authored,s.entities.length,stage=>sampleProcessMemory(stage,'restartMemory'));
  }else if(detachedOnly){
    await checkDetachedRuntime(authored);
  }else if(unitSelectionOnly){
    assert.deepEqual(status(s).unitBindings,{status:'ready',count:96,selected:null});
    const checkUnitData=world=>{
      if(!unitData)return;
      const observed=status(world).qaUnitData,expected=JSON.parse(fs.readFileSync(path.join(source,'Assets/Maps/amazonia/Data/OriginalUnitBindings.json'),'utf8'));
      assert.deepEqual(observed,{count:96,definitions:Object.fromEntries(Object.entries(expected.definitions).map(([id,definition])=>[id,definition.movement])),shared:true,frozen:true,library:{type:'handle',identity:true}});
      report.unitData={units:observed.count,types:Object.keys(observed.definitions).length,shared:observed.shared,frozen:observed.frozen,library:observed.library};
    };
    checkUnitData(s);
    await execute('playback.input',{keys:['KeyD','KeyW'],buttons:[],viewport:[1280,720]});await step(10);await input({});
    function projectUnit(world,viewport){
      const camera=world.entities.find(e=>e.name==='Camera').components,t=camera.Transform,unit=world.entities.find(e=>e.name==='Unit-45-ngol-3'),p=unit.components.Transform.position,[x,y,z,w]=t.rotation.map((v,i)=>i===3?v:-v),v=p.map((n,i)=>n-t.position[i]);
      const local=[(1-2*(y*y+z*z))*v[0]+2*(x*y-z*w)*v[1]+2*(x*z+y*w)*v[2],2*(x*y+z*w)*v[0]+(1-2*(x*x+z*z))*v[1]+2*(y*z-x*w)*v[2],2*(x*z-y*w)*v[0]+2*(y*z+x*w)*v[1]+(1-2*(x*x+y*y))*v[2]],tangent=Math.tan(camera.Camera3D.fov_y_degrees*Math.PI/360);
      assert.ok(local[2]<0);return {unit,pointer:[viewport[0]/2+local[0]/(-local[2]*tangent)*viewport[1]/2,viewport[1]/2-local[1]/(-local[2]*tangent)*viewport[1]/2]};
    }
    for(const viewport of [[1280,720],[960,900]]){
      await execute('view.set_game_resolution',{resolution:{width:viewport[0],height:viewport[1]}});s=await snapshot();const target=projectUnit(s,viewport);await input({pointer:target.pointer,buttons:[0],viewport});await input({pointer:target.pointer,viewport});s=await snapshot();
      const circle=s.entities.find(e=>e.name==='Map unit selection'),label=s.entities.find(e=>e.name==='Map session status').components.Text.text;assert.ok(status(s).unitBindings.selected);assert.equal(circle.active,true);assert.ok(Math.abs(circle.components.Transform.position[0]-target.unit.components.Transform.position[0])<1e-5);assert.ok(Math.abs(circle.components.Transform.position[2]-target.unit.components.Transform.position[2])<1e-5);assert.equal(circle.components.Transform.scale[0],360/128);assert.deepEqual(circle.components.MaterialPropertyBlock.base_color,[1,1,0,1]);assert.match(label,/\u91d1\u77ff/);assert.match(label,/12500/);await capture('unit-selection-'+viewport.join('x'));
      report.checks.push('Native source gold-mine picking and selection circle at '+viewport.join('x'));
    }
    await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await input({pointer:[20,680],buttons:[0]});await input({pointer:[20,680]});s=await snapshot();assert.equal(status(s).unitBindings.selected,null);assert.equal(s.entities.find(e=>e.name==='Map unit selection').active,false);
    await click('Map session restart');s=await waitMap('amazonia');assert.deepEqual(status(s).unitBindings,{status:'ready',count:96,selected:null});checkUnitData(s);await click('Map session return');const returned=status(await snapshot());assert.equal(returned.unitBindings,null);if(unitData)assert.equal(returned.qaUnitData,null);await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);report.checks.push('Empty-world selection clears; map reload/return/Stop release unit bindings');if(unitData)report.checks.push('Native source movement profiles, shared frozen type data and linked JASS handle upcasts match before and after reload, and clear on return');
  }else if(unitInitializationOnly){
    const expected={status:'ready',units:96,triggers:26};assert.deepEqual(status(s).initialization,expected);
    await step(3);assert.deepEqual(status(await snapshot()).initialization,expected);await click('Map session restart');s=await waitMap('amazonia');assert.deepEqual(status(s).initialization,expected);
    await click('Map session return');assert.equal(status(await snapshot()).initialization,null);await click('mapStart box');s=await waitMap('amazonia');assert.deepEqual(status(s).initialization,expected);
    await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);report.checks.push('Original CreateAllUnits: 96 units, 26 trigger registrations, reload/reentry, return clearing and Stop restoration');
  }else if(hierarchyOnly){
    await checkHierarchyPresentation(s);assert.deepEqual((await snapshot()).entities,s.entities,'folding does not mutate scene content');await checkHierarchyFocus(s);
    await click('Map session return');await click('mapStart box');s=await waitMap('amazonia');await checkHierarchyPresentation(s);
    await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);report.checks.push('Hierarchy interaction after map reload and Stop restoration');
  }else if(cameraOnly){
    const readCamera=world=>world.entities.find(e=>e.name==='Camera').components;
    const expectedFov=70/Math.sqrt(1+(16/9)**2),initial=readCamera(s);assert.ok(Math.abs(initial.Camera3D.fov_y_degrees-expectedFov)<1e-5);assert.equal(initial.Camera3D.projection,'perspective');
    await capture('camera-wide');await key('KeyD');s=await snapshot();assert.ok(readCamera(s).Transform.position[0]>initial.Transform.position[0]);
    await key('Equal');s=await snapshot();assert.ok(readCamera(s).Transform.rotation[0]>initial.Transform.rotation[0]);assert.ok(Math.abs(readCamera(s).Camera3D.fov_y_degrees-expectedFov)<1e-5);
    const wheelPage=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000}),gameCanvas=wheelPage.elements.find(e=>e.name==='Game viewport');assert.ok(gameCanvas);
    const beforeWheel=structuredClone(readCamera(s).Transform);
    await execute('window.ui_scroll',{windowLabel:'main',selector:gameCanvas.selector,expectedSnapshotRevision:wheelPage.snapshotRevision,deltaY:-100});await step();s=await snapshot();assert.equal(status(s).qaWheel,-1,'canvas wheel reaches frame input');assert.notDeepEqual(readCamera(s).Transform,beforeWheel,'physical Game canvas wheel reaches the camera');
    await input({wheelDelta:-100});const near=structuredClone(readCamera(await snapshot()).Transform);await input({wheelDelta:-100});assert.deepEqual(readCamera(await snapshot()).Transform,near,'minimum camera distance');
    await input({wheelDelta:100});const far=structuredClone(readCamera(await snapshot()).Transform);await input({wheelDelta:100});assert.deepEqual(readCamera(await snapshot()).Transform,far,'maximum camera distance');assert.notDeepEqual(near,far);
    report.checks.push('Game canvas wheel reaches native camera; source minimum/maximum distance and idle bounds hold');
    await execute('panel.detach',{kind:'game'});await sleep(300);
    const detachedPage=await query('window.ui_snapshot',{windowLabel:'panel-game',maxElements:5000}),detachedCanvas=detachedPage.elements.find(e=>e.name==='Game viewport');assert.ok(detachedCanvas);
    await execute('window.ui_scroll',{windowLabel:'panel-game',selector:detachedCanvas.selector,expectedSnapshotRevision:detachedPage.snapshotRevision,deltaY:-100});await sleep(150);await step();assert.notDeepEqual(readCamera(await snapshot()).Transform,far,'detached wheel reaches native owner');await execute('panel.dock',{kind:'game'});
    report.checks.push('Detached Game wheel input is forwarded to the native playback owner');
    await execute('view.set_game_resolution',{resolution:{width:960,height:900}});await input({viewport:[960,900]});s=await snapshot();assert.ok(Math.abs(readCamera(s).Camera3D.fov_y_degrees-expectedFov)<1e-5);await capture('camera-tall');
    if(hierarchyInteractions){await checkHierarchyPresentation(s);await checkHierarchyFocus(s);}
    report.camera={initial,afterMoveAndZoom:readCamera(s)};report.checks.push('Source logical camera projection, movement, zoom and 960x900 rendering');await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);
  }else if(runtimeEditsOnly){
    await checkRuntimeEdits();await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities,'Stop restores authored entities after runtime Inspector edits');
    report.checks.push('Stop restoration after runtime Inspector edits');
  }else if(viewportTransitionsOnly){
    await checkViewportTransitions();await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities,'Stop restores the authored scene after viewport transitions');
    report.checks.push('Stop restoration after Scene/Game and resolution transitions');
  }else if(profileOnly){
    await step(180);await execute('playback.pause');await sleep(1500);
    if(continuousProfile){
      await execute('profiler.clear');const started=performance.now();await sleep(10000);const elapsedMs=performance.now()-started;
      const profiles=await query('profiler.get_samples',{source:'game',limit:480,...(transportProfile?{includeNativeTimings:true}:{})});
      assert.ok(profiles.nativeProfileCount>=15,'Expected completed live viewport frames');assert.ok(profiles.returnedSamples>0,'Expected WebView paint samples');
      if(transportProfile)assert.ok(profiles.nativeTimings?.filter(p=>Number.isFinite(p.sharedTransport?.publicationReadyToEventMs)).length>=15,'Expected correlated native publication-to-WebView timings');
      if(transportProfile)assert.ok(profiles.nativeTimings?.filter(p=>Number.isFinite(p.frontendPrepareMs)&&p.frontendPrepareMs>=0&&Number.isFinite(p.frontendCompleteMs)&&p.frontendCompleteMs>=0).length>=15,'Expected split frontend preparation and completion timings');
      if(simulationProfile){
        const timings=profiles.nativeTimings?.map(p=>p.simulationTiming).filter(Boolean)??[];
        const unique=[...new Map(timings.map(t=>[`${t.sessionId}:${t.revision}`,t])).values()];
        assert.ok(unique.length>=15,'Expected at least 15 distinct completed simulation revisions');
        for(const timing of unique){
          for(const value of [timing.totalMs,timing.prepareMs,timing.invokeMs,timing.applyMs,timing.acceptMs,timing.native?.workerQueueMs,timing.native?.workerMs,timing.native?.simulationMs,timing.native?.commandMs])assert.ok(Number.isFinite(value)&&value>=0,'Expected complete nonnegative simulation timings');
          assert.ok(timing.native.workerMs+0.00001>=timing.native.simulationMs,'Worker contains simulation');
          assert.ok(timing.native.commandMs+0.00001>=timing.native.workerQueueMs+timing.native.workerMs,'Command contains queue and worker');
          assert.ok(timing.invokeMs+0.1>=timing.native.commandMs,'Invoke contains native command');
          assert.ok(timing.totalMs+0.1>=timing.prepareMs+timing.invokeMs+timing.applyMs+timing.acceptMs,'Request contains frontend scopes');
        }
        report.simulationProfile={distinctRevisions:unique.length,timings:unique};
        report.checks.push('Simulation timing scopes retain distinct session/revision ownership and nested wall times');
      }
      report.continuousProfile={elapsedMs,...profiles};await execute('playback.pause');await capture('profile-view');if(effectReload)await checkEffectReload();if(viewportTransitions)await checkViewportTransitions();if(runtimeEdits)await checkRuntimeEdits();if(hierarchyInteractions){await checkHierarchyFocus(await snapshot());await checkHierarchyPresentation(await snapshot());await click('Map session return');await click('mapStart box');s=await waitMap('amazonia');await checkHierarchyPresentation(s);report.checks.push('Hierarchy selection after map reload');}await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities,'Stop restores the authored scene after profiling');
      report.checks.push('10-second live Amazonia presentation and WebView sample window without Agent polling, followed by Stop restoration');
    }else{
    const native=[];
    for(let i=0;i<100;i++){
      const p=(await query('profiler.get_samples',{source:'game',limit:1})).nativeLatest;
      if(p&&native.at(-1)?.timestamp!==p.timestamp){const nodes=[];const visit=n=>{nodes.push({name:n.name,totalMs:n.totalMs,calls:n.calls});for(const c of n.children||[])visit(c);};visit(p.callTree);native.push({timestamp:p.timestamp,totalMs:p.totalMs,counts:p.counts,nodes});}
      await sleep(20);
    }
    assert.ok(native.length>=15,'Expected fresh live native samples');report.liveProfiles=native;await execute('playback.pause');await capture('profile-view');await execute('playback.stop');report.checks.push('Live Amazonia native samples after animation warmup');
    }
  }else if(!logsOnly){
  if(!returnOnly){
  const before=new Map(s.entities.map(e=>[e.name,JSON.stringify(e.components)]));await step(30);s=await snapshot();const changed=s.entities.filter(e=>JSON.stringify(e.components)!==before.get(e.name));
  report.changed={doodads:changed.filter(e=>e.name.startsWith('Doodad-')).length,units:changed.filter(e=>e.name.startsWith('Unit-')).length,water:changed.filter(e=>e.name.startsWith('Water-')).length};for(const [layer,count] of Object.entries(report.changed))assert.ok(count>0,layer+' advances');
  await capture('running');await key('Space');s=await snapshot();const paused=status(s);assert.ok(paused.paused);const pixels=await capture('paused');await step(5);assert.equal(status(await snapshot()).elapsed,paused.elapsed);assert.equal(await capture(),pixels);
  const camera=s.entities.find(e=>e.name==='Camera').components.Transform.position;await key('KeyD');assert.ok((await snapshot()).entities.find(e=>e.name==='Camera').components.Transform.position[0]>camera[0]);
  await click('Map session restart');s=await snapshot();assert.ok(status(s).elapsed<.1);assert.equal(status(s).paused,false);assert.equal(status(s).pathing.revision,0);
  }
  await click('Map session return');s=await snapshot();assert.equal(status(s).map,null);assert.equal(telemetry(s).mode,'custom');assert.equal(s.entities.find(e=>e.name==='Map name').components.Text.text,'Amazonia');
  await click('mapStart box');await waitMap('amazonia');await key('Escape');await click('map4 box');await click('map0 box');await click('mapStart box');s=await snapshot();assert.equal(telemetry(s).mode,'playing');await capture('skirmish');
  if(!returnOnly)report.checks.push('Native menu clicks, package scene and three animation layers','Pause pixels, camera input and fresh reload');
  report.checks.push('Click return, revisit Amazonia, keyboard return, skirmish start and Stop restoration');
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities,'Stop restores the main scene');
  await execute('playback.play',{paused:true});await step(2);assert.equal(telemetry(await snapshot()).mode,'title');await execute('playback.stop');
  }else {await step(2);report.checks.push('Native console after menu -> Amazonia load');await execute('playback.stop');}
  report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
  console.log(JSON.stringify({passed:true,label,entities:report.entities,changed:report.changed,checks:report.checks}));
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);try{report.errors=await query('console.get_logs',{limit:80});const s=await snapshot();report.failureState=s.entities.filter(e=>['QA map session','Camera','Frost telemetry','Map loading status'].includes(e.name));}catch{}if(detachedOnly)try{const ui=await query('window.ui_snapshot',{windowLabel:'panel-game',maxElements:5000});report.failureGameUi=ui.elements.filter(e=>e.name==='Game viewport');}catch{}if(detachedOnly)try{const shot=await query('view.window_screenshot',{windowLabel:'panel-game',maxSize:1280});fs.writeFileSync(path.join(out,label+'-failure-game.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}catch(diagnosticError){report.failureGameError=diagnosticError.message;} }
finally{if(detachedOnly)for(const kind of ['game','scene','inspector'])try{await execute('panel.dock',{kind});}catch{}try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
