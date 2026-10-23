// Author: MiYu. Verify game-menu map switching in one native editor and one game project.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
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
const label='map-session-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:file=>!['SourceAssets','.mengine','Builds'].includes(path.basename(file))});
const config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));config.storageId=label;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
// The fixture adds one hidden observation entity per scene; runtime code and assets remain unchanged.
for(const file of config.buildScenes){const scene=JSON.parse(fs.readFileSync(path.join(sample,file),'utf8')),id=Math.max(...scene.world.entities.map(e=>e.entity))+1;scene.world.entities.push({entity:id,name:'QA map session',active:false,components:{Text:{text:'{}'}}});fs.writeFileSync(path.join(sample,file),JSON.stringify(scene));}
fs.appendFileSync(path.join(sample,config.startupScript),`\nvar qaMapTick=onTick;onTick=function(dt){qaMapTick(dt);const e=engine.findEntitiesByName(['QA map session'])[0];if(e)engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:'Text',value:{text:JSON.stringify(FrostMapSession.status())}}));};\n`);
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
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
async function checkViewportTransitions(){
  const before=await snapshot(),camera=before.entities.find(e=>e.name==='Camera'&&e.components.Camera3D),root=before.entities.find(e=>e.name.startsWith('Doodad-')&&e.components.Transform);assert.ok(camera&&root);
  await execute('panel.focus',{kind:'scene'});await execute('selection.set',{ids:[camera.entity]});
  await execute('view.set_camera',{pivot:root.components.Transform.position,yaw:25,pitch:45,distance:30});
  async function sceneShot(name){const shot=await query('view.screenshot',{target:'scene',maxSize:1280});const bytes=Buffer.from(shot.dataUrl.split(',')[1],'base64');fs.writeFileSync(path.join(out,label+'-'+name+'.png'),bytes);return hash(bytes);}
  const first=await sceneShot('scene-camera-preview');
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
  const before=await snapshot(),target=before.entities.find(e=>e.name.startsWith('Doodad-')&&e.parent==null&&e.components.Transform&&Math.abs(e.components.Transform.position[1]*10-Math.round(e.components.Transform.position[1]*10))<1e-6);assert.ok(target,'Static authored doodad root with an exact Inspector step value');
  const original=target.components.Transform.position[1],edited=original+3.2;
  await execute('selection.set',{ids:[target.entity]});await execute('panel.focus',{kind:'inspector'});
  async function setHeight(value){
    const deadline=Date.now()+20000;let page,item;
    for(;;){page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});item=page.elements.find(e=>e.name==='Transform Position Y');if(item)break;assert.ok(Date.now()<deadline,'Inspector Transform Position Y input');await sleep(150);}
    await execute('window.ui_set_value',{windowLabel:'main',selector:item.selector,expectedSnapshotRevision:page.snapshotRevision,value:String(value)});
    assert.ok(Math.abs((await snapshot()).entities.find(e=>e.entity===target.entity).components.Transform.position[1]-value)<1e-5,'Inspector writes the live editable world');
  }
  await setHeight(edited);await step(30);const changed=await snapshot();
  assert.ok(Math.abs(changed.entities.find(e=>e.entity===target.entity).components.Transform.position[1]-edited)<1e-5,'Native simulation retains the uploaded Inspector edit');
  const originals=new Map(before.entities.map(e=>[e.entity,JSON.stringify(e.components)])),layers={doodads:0,units:0,water:0};
  for(const entity of changed.entities)if(entity.entity!==target.entity&&JSON.stringify(entity.components)!==originals.get(entity.entity))for(const [key,prefix]of [['doodads','Doodad-'],['units','Unit-'],['water','Water-']])if(entity.name.startsWith(prefix))layers[key]++;
  for(const [layer,count]of Object.entries(layers))assert.ok(count>0,layer+' advances after explicit world upload');
  assert.ok(status(changed).elapsed>status(before).elapsed,'Map clock advances after the edit');
  await execute('panel.focus',{kind:'game'});await capture('runtime-edited');
  await setHeight(original);await step(2);const restored=await snapshot();assert.ok(Math.abs(restored.entities.find(e=>e.entity===target.entity).components.Transform.position[1]-original)<1e-5,'Restored Inspector value reaches native simulation');
  report.runtimeEdits={entity:target.entity,name:target.name,original,edited,layers,elapsedBefore:status(before).elapsed,elapsedAfter:status(changed).elapsed};
  report.checks.push('Actual paused Inspector edits persist through native steps, three animation layers and clock advance, and restored values survive subsequent steps');
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
  await execute('panel.focus',{kind:'hierarchy'});
  const ui=()=>query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});
  async function element(name){for(let attempt=0;attempt<20;attempt++){const snapshot=await ui(),item=snapshot.elements.find(e=>e.name===name);if(item)return {snapshot,item};await sleep(100);}throw Error('Hierarchy item missing: '+name);}
  async function button(name){const {snapshot,item}=await element(name);await execute('window.ui_click',{windowLabel:'main',selector:item.selector,expectedSnapshotRevision:snapshot.snapshotRevision});}
  const search=await element('Search hierarchy');await execute('window.ui_set_value',{windowLabel:'main',selector:search.item.selector,expectedSnapshotRevision:search.snapshot.snapshotRevision,value:''});
  await execute('selection.set',{ids:[root.entity]});await element(root.name);
  await button('Collapse all hierarchy nodes');await element('Expand '+root.name);
  await button('Expand all hierarchy nodes');await element('Collapse '+root.name);
  await button('Collapse all hierarchy nodes');await execute('selection.reveal',{id:child.entity});await element(child.name);await element('Collapse '+root.name);
  await execute('selection.set',{ids:[root.entity]});const item=await element(root.name);
  await execute('window.ui_press_key',{windowLabel:'main',selector:item.item.selector,expectedSnapshotRevision:item.snapshot.snapshotRevision,key:'ArrowLeft'});await element('Expand '+root.name);
  const folded=await element(root.name);await execute('window.ui_press_key',{windowLabel:'main',selector:folded.item.selector,expectedSnapshotRevision:folded.snapshot.snapshotRevision,key:'ArrowRight'});await element('Collapse '+root.name);
  report.checks.push('Native hierarchy collapse/expand, hidden descendant reveal, scrolling and left/right keys for runtime root '+root.entity);
}
try{
  for(let i=0;;i++)try{await query('project.state');break;}catch(e){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(e.message))throw e;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot();await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step(2);
  await click('solo box');await click('custom box');await click('map4 box');await click('map1 box');
  let s=await snapshot();assert.equal(telemetry(s).mode,'custom');assert.equal(s.entities.find(e=>e.name==='Map name').components.Text.text,'Amazonia');assert.equal(s.entities.find(e=>e.name==='Map preview backing').components.Image.sprite,'Assets/Maps/amazonia/Textures/MapPreview.png');for(const name of ['map2 box','map3 box','faction box','heroChoice box','Hero preview','Map tile 0'])assert.equal(clientWorldFixture(s).visible(name),false,name);await capture('selection');
  await click('mapStart box');s=await waitMap('amazonia');assert.deepEqual(status(s).pathing.size,[384,384]);assert.equal(status(s).pathing.revision,0);assert.ok(s.entities.some(e=>e.name.startsWith('Doodad-'))&&s.entities.some(e=>e.name.startsWith('Unit-')));report.map=status(s);report.entities=s.entities.length;
  if(editorFeedback)await checkHierarchyFocus(s);
  if(hierarchyOnly){
    await checkHierarchyPresentation(s);assert.deepEqual((await snapshot()).entities,s.entities,'folding does not mutate scene content');await checkHierarchyFocus(s);
    await click('Map session return');await click('mapStart box');s=await waitMap('amazonia');await checkHierarchyPresentation(s);
    await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);report.checks.push('Hierarchy interaction after map reload and Stop restoration');
  }else if(cameraOnly){
    const readCamera=world=>world.entities.find(e=>e.name==='Camera').components;
    const expectedFov=70/Math.sqrt(1+(16/9)**2),initial=readCamera(s);assert.ok(Math.abs(initial.Camera3D.fov_y_degrees-expectedFov)<1e-5);assert.equal(initial.Camera3D.projection,'perspective');
    await capture('camera-wide');await key('KeyD');s=await snapshot();assert.ok(readCamera(s).Transform.position[0]>initial.Transform.position[0]);
    await key('Equal');s=await snapshot();assert.ok(readCamera(s).Transform.rotation[0]>initial.Transform.rotation[0]);assert.ok(Math.abs(readCamera(s).Camera3D.fov_y_degrees-expectedFov)<1e-5);
    await execute('view.set_game_resolution',{resolution:{width:960,height:900}});await input({viewport:[960,900]});s=await snapshot();assert.ok(Math.abs(readCamera(s).Camera3D.fov_y_degrees-expectedFov)<1e-5);await capture('camera-tall');
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
      report.continuousProfile={elapsedMs,...profiles};await execute('playback.pause');await capture('profile-view');if(effectReload)await checkEffectReload();if(viewportTransitions)await checkViewportTransitions();if(runtimeEdits)await checkRuntimeEdits();await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities,'Stop restores the authored scene after profiling');
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
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);try{report.errors=await query('console.get_logs',{limit:80});const s=await snapshot();report.failureState=s.entities.filter(e=>['QA map session','Camera','Frost telemetry','Map loading status'].includes(e.name));}catch{} }
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
