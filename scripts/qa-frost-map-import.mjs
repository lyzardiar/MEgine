// Author: MiYu. Native async import from a file outside the game project, with no catalog entry.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const sourceMap=process.argv[2];assert.ok(sourceMap,'Provide a .w3m/.w3x not installed in the catalog');
const cacheProject=process.argv.includes('--cache-project')?path.resolve(process.argv[process.argv.indexOf('--cache-project')+1]):null;
const profileMap=process.argv.includes('--profile-map');
const pickMap=process.argv.includes('--pick-map');
const projectReopen=process.argv.includes('--project-reopen');
const profilerUi=process.argv.includes('--profiler-ui');
const bundleUi=process.argv.includes('--bundle-ui');
assert.ok(!bundleUi||profilerUi,'--bundle-ui requires --profiler-ui');
let expectedMapTitle='任意岛屿';
const label='arbitrary-map-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:file=>!['SourceAssets','.mengine','Builds'].includes(path.basename(file))&&!path.basename(file).startsWith('user-v')&&!path.basename(file).startsWith('.import-')});
if(cacheProject){
  const sha=hash(fs.readFileSync(sourceMap)),directory=path.join(cacheProject,'Assets/Maps');
  const id=fs.readdirSync(directory).filter(name=>name.startsWith('user-v2-')&&JSON.parse(fs.readFileSync(path.join(directory,name,'entry.json'),'utf8')).sourceSha256===sha).sort((a,b)=>fs.statSync(path.join(directory,b,'entry.json')).mtimeMs-fs.statSync(path.join(directory,a,'entry.json')).mtimeMs)[0];assert.ok(id,'No matching completed map cache');
  expectedMapTitle=JSON.parse(fs.readFileSync(path.join(directory,id,'entry.json'),'utf8')).title;
  fs.cpSync(path.join(directory,id),path.join(sample,'Assets/Maps',id),{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,id,'manifest.json'),'utf8'));
  for(const record of manifest.assets.filter(r=>r.storage==='shared')){const input=path.resolve(cacheProject,record.path),target=path.resolve(sample,record.path);assert.ok(input.startsWith(path.join(cacheProject,'Assets','WarcraftShared')+path.sep)&&target.startsWith(path.join(sample,'Assets','WarcraftShared')+path.sep));assert.equal(hash(fs.readFileSync(input)),record.sha256);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(input,target);}
}
const chosen=path.join(root,'我的地图','任意岛屿'+path.extname(sourceMap));fs.mkdirSync(path.dirname(chosen),{recursive:true});fs.copyFileSync(sourceMap,chosen);
const jobs=path.join(root,'jobs'),config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));config.storageId=label;config.contentImporters['warcraft-map'].args[0]=path.join(repo,'scripts/runtime-import-frost-map.py');config.contentImporters['warcraft-map'].workDirectory=jobs;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
// F8 selects the fixture's external path through the same engine API; the first click exercises the real picker.
fs.appendFileSync(path.join(sample,config.startupScript),`\nvar qaUsePath=false,qaLastImport=null,qaProgress=[],qaTick=onTick,qaImport=engine.importContent,qaEvent=onContentImport;
engine.importContent=function(id,file){qaProgress=[];return qaImport(id,qaUsePath?${JSON.stringify(chosen)}:file);};
onContentImport=function(event){qaLastImport={status:event.status,message:event.message,cached:event.content?.cached};if(event.status==='progress'){qaProgress.push(event);if(qaProgress.length>256)qaProgress.shift();}qaEvent(event);};
onTick=function(dt){if(engine.input.pressedKeys.includes('F8'))qaUsePath=true;qaTick(dt);const e=engine.findEntitiesByName(['Frost telemetry'])[0];if(e){const value={...e.components.Text,text:JSON.stringify({qaMap:FrostMapSession.status(),qaImport:qaLastImport,qaProgress,qaLoading:FrostMapSession.importStatus()})};engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:'Text',value}));}};\n`);
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot'),step=(steps=1)=>execute('playback.step',{steps,deltaTime:1/60});
const report={label,sourceMap,passed:false,editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),scriptSha256:hash(fs.readFileSync(path.join(source,config.startupScript))),checks:[],progress:[],frames:[]};
const telemetry=s=>JSON.parse(s.entities.find(e=>e.name==='Frost telemetry').components.Text.text);
async function input(args){await execute('playback.input',{keys:[],buttons:[],viewport:[1280,720],...args});await step();}
async function key(key){await input({keys:[key]});await input({});await step(6);}
async function click(name){const pointer=clientWorldFixture(await snapshot()).canvasPoint(name,[1280,720],false);await input({pointer,buttons:[0]});await input({pointer});await step(6);}
async function until(predicate,seconds=120){const start=Date.now();for(;;){await step();const s=await snapshot();if(await predicate(s))return s;if(Date.now()-start>seconds*1000)throw Error('Native import timed out');await sleep(300);}}
async function capture(name){for(let i=0;;i++)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.frames.push({name,profile:shot.nativeProfile});return;}catch(error){if(i>20||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}}
async function profileImportedMap(){
  report.liveProfiles={};
  for(const source of ['game','scene']){
    await execute('panel.focus',{kind:source});
    if(source==='scene')await execute('view.set_camera',{pivot:[0,0,0],yaw:25,pitch:50,distance:150});
    await execute('playback.pause');await sleep(1000);await execute('profiler.clear');
    const started=performance.now();await sleep(5000);const elapsedMs=performance.now()-started;await execute('playback.pause');
    const profile=await query('profiler.get_samples',{source,limit:240,includeNativeTimings:true});
    assert.ok(profile.nativeProfileCount>=20,source+' must present fresh imported-map frames');
    report.liveProfiles[source]={elapsedMs,...profile};
    const shot=await query('view.screenshot',{target:source,maxSize:1280});fs.writeFileSync(path.join(out,label+'-live-'+source+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
  }
  if(profilerUi){
    await execute('panel.focus',{kind:'profiler'});await sleep(300);
    let page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});
    const source=page.elements.find(e=>e.selector?.includes('profiler-source-tab-scene'));assert.ok(source,'Profiler Scene source tab');
    await execute('window.ui_click',{windowLabel:'main',selector:source.selector,expectedSnapshotRevision:page.snapshotRevision});await sleep(300);
    page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});
    if(bundleUi){
      const overview=page.elements.find(e=>e.name==='Overview'&&e.role==='tab');assert.ok(overview,'Profiler Overview module tab');await execute('window.ui_click',{windowLabel:'main',selector:overview.selector,expectedSnapshotRevision:page.snapshotRevision});await sleep(300);
      page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});const labels=['World Bundle Builds','World Bundle Hits'];for(const label of labels)assert.ok(page.elements.some(e=>String(e.name).includes(label)),label+' is visible in the real Profiler');
      const shot=await query('view.window_screenshot',{windowLabel:'main',maxSize:1920});fs.writeFileSync(path.join(out,label+'-profiler-bundles.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.profilerBundleUi={elements:page.elements.filter(e=>labels.some(label=>String(e.name).includes(label)))};
    }
    const cpu=page.elements.find(e=>e.name==='CPU'&&e.role==='tab');assert.ok(cpu,'Profiler CPU module tab');
    await execute('window.ui_click',{windowLabel:'main',selector:cpu.selector,expectedSnapshotRevision:page.snapshotRevision});await sleep(300);
    const shot=await query('view.window_screenshot',{windowLabel:'main',maxSize:1920});fs.writeFileSync(path.join(out,label+'-profiler-cpu.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
    report.profilerCpuUi={source:'scene',snapshot:await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000})};
  }
  await execute('panel.focus',{kind:'game'});
  report.checks.push('Imported map advances continuously in Game and Scene with five-second profiler windows without Agent polling; native timing buffer is limited to the most recent 240 samples');
}
async function checkMapPicking(){
  await execute('panel.focus',{kind:'scene'});await execute('view.set_camera',{pivot:[0,0,0],yaw:25,pitch:50,distance:150});await query('view.screenshot',{target:'scene',maxSize:1280});await sleep(1000);
  const previous=(await query('selection.get')).selectedIds;report.mapPicking={note:'UI action and selection RPC round-trip; excludes fixture warmup and is not physical input latency',actions:[]};
  for(let i=0;i<3;i++){
    await execute('selection.set',{ids:[]});await sleep(100);
    const page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000}),canvas=page.elements.find(e=>e.name==='Scene viewport');assert.ok(canvas);
    const started=performance.now();await execute('window.ui_drag_by',{windowLabel:'main',selector:canvas.selector,deltaX:1,deltaY:0,button:'left',expectedSnapshotRevision:page.snapshotRevision});const selected=(await query('selection.get')).selectedIds;
    report.mapPicking.actions.push({elapsedMs:performance.now()-started,selected});assert.ok(selected.length>0,'A whole-map Scene center click selects an imported object');
  }
  await execute('selection.set',{ids:previous});await execute('panel.focus',{kind:'game'});report.checks.push('Three whole-map Scene clicks select imported objects; action and selection RPC timings retained');
}
async function checkProjectReopen(authored){
  const memory=stage=>{
    const owner=JSON.parse(fs.readFileSync(process.env.MENGINE_AGENT_BRIDGE_FILE,'utf8'));assert.equal(owner.background,true);assert.ok(Number.isSafeInteger(owner.pid));
    const sample=JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-File',path.join(repo,'scripts/sample-native-qa-memory.ps1'),'-EditorPid',String(owner.pid),'-ExpectedExecutable',process.env.MENGINE_EDITOR_EXECUTABLE],{encoding:'utf8',windowsHide:true,timeout:20000}));
    (report.projectMemory??=[]).push({stage,...sample});
  };
  memory('before-close');await execute('project.close',{discardDirty:true});await sleep(3000);assert.equal((await query('project.state')).phase,'welcome');memory('closed');
  await execute('project.open',{root:sample});assert.deepEqual((await snapshot()).entities,authored.entities);
  await execute('panel.focus',{kind:'game'});await capture('project-reopened');memory('reopened');
  report.checks.push('Project close returns to welcome; same project reopens with original entities and fresh native Game pixels; process-tree memory sampled');
}
function checkImportedScene(world,receipt){
  assert.equal(receipt.sourceSha256,hash(fs.readFileSync(sourceMap)));
  const manifest=JSON.parse(fs.readFileSync(path.join(sample,'Assets/Maps',receipt.id,'manifest.json'),'utf8'));
  assert.ok(world.entities.some(e=>e.components.Camera3D)&&world.entities.some(e=>e.components.MeshRenderer));
  if(manifest.capabilities.units)assert.ok(world.entities.some(e=>e.name.startsWith('Unit-')));
  else assert.equal(manifest.unitBindings?.placements,0,'maps without editor units retain an explicit empty placement receipt');
  report.sourceCapabilities=manifest.capabilities;report.sourceDiagnostics=manifest.diagnostics??[];report.map=receipt.id;
}
async function waitForMap(cached){
  const start=Date.now();let capturedProgress=false,capturedEntering=false;
  const loaded=await until(async s=>{
    if(!s.entities.some(e=>e.name==='Frost telemetry'))return s.entities.some(e=>e.name==='Map session status');
    const t=telemetry(s),world=clientWorldFixture(s);assert.notEqual(t.qaImport?.status,'failed',t.qaMap.importMessage);
    report.progress.push({cached,elapsedMs:Date.now()-start,status:t.qaImport,loading:t.qaLoading});
    if(t.qaMap.pending){
      assert.equal(world.visible('Map loading back'),true);assert.match(world.entity('Map loading status').components.Text.text,/正在进入地图/);
      assert.equal(world.entity('mapOpen label').components.Text.text,'正在加载地图…');assert.match(world.entity('Map description').components.Text.text,/正在加载.*地图/);
      assert.equal(world.entity('Map name').components.Text.text,expectedMapTitle);assert.equal(world.entity('mapStart label').components.Text.text,'加载地图');
      report[cached?'cacheEvents':'coldEvents']=t.qaProgress;await capture(cached?'cache-entering':'cold-entering');capturedEntering=true;
    }else if(t.qaLoading.progress?.value>0&&!capturedProgress){
      assert.equal(world.visible('Map loading fill'),true);assert.equal(world.entity('Map loading fill').components.RectTransform.size_delta[0],world.entity('Map loading back').components.RectTransform.size_delta[0]*t.qaLoading.progress.value);
      await capture(cached?'cache-progress':'cold-progress');capturedProgress=true;
    }
    return false;
  },cached?30:300);
  assert.ok(capturedEntering,'Loading UI must be presented before replacing the scene');
  const events=report[cached?'cacheEvents':'coldEvents'];if(!cached)assert.ok(events.some(e=>e.total>0),'Native converter must report measured work');
  report[cached?'cacheLoadMs':'coldLoadMs']=Date.now()-start;return loaded;
}
try{
  for(let i=0;;i++)try{await query('project.state');break;}catch(error){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot();await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step(2);
  await click('solo box');await click('custom box');await capture('selection');
  const receipts=()=>fs.readdirSync(jobs).map(name=>path.join(jobs,name,'result.json')).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
  if(!cacheProject){
  await click('mapOpen box');await until(s=>telemetry(s).qaImport?.status==='choosing',10);await sleep(1000);await click('mapOpen box');await until(s=>!telemetry(s).qaMap.importing,10);assert.equal(telemetry(await snapshot()).qaImport.status,'cancelled');report.checks.push('Native file-picker request and cancellation');
  await key('F8');await click('mapOpen box');await until(s=>['importing','progress'].includes(telemetry(s).qaImport?.status),15);await capture('importing');
  // Input remains live while the converter is processing the file.
  await click('map4 box');assert.equal((await snapshot()).entities.find(e=>e.name==='Map name').components.Text.text,'冬落围城');
  let s=await waitForMap(false);
  report.entities=s.entities.length;await capture('loaded');
  const cold=receipts().find(r=>r.cached===false);assert.ok(cold);checkImportedScene(s,cold);assert.ok(!JSON.parse(fs.readFileSync(path.join(sample,'Assets/Maps/catalog.json'),'utf8')).maps.some(m=>m.id===cold.id));
  await key('Escape');s=await snapshot();assert.equal(s.entities.find(e=>e.name==='Map name').components.Text.text,expectedMapTitle);assert.equal(telemetry(s).qaImport.cached,false);
  report.checks.push('Native file-picker cancellation, cold conversion and responsive menu');
  }else await key('F8');
  // One input tick keeps even a fast cache hit observable before the scene request is consumed.
  const pointer=clientWorldFixture(await snapshot()).canvasPoint('mapOpen box',[1280,720],false);await input({pointer,buttons:[0]});await execute('playback.input',{keys:[],buttons:[],viewport:[1280,720]});
  const cachedScene=await waitForMap(true);report.entities=cachedScene.entities.length;const cached=receipts().find(r=>r.cached===true);assert.ok(cached);checkImportedScene(cachedScene,cached);await capture('cache-loaded');if(profileMap)await profileImportedMap();if(pickMap)await checkMapPicking();await key('Escape');assert.equal(telemetry(await snapshot()).qaImport.cached,true);assert.equal(clientWorldFixture(await snapshot()).visible('Map loading back'),false);
  report.checks.push('Verified cache import without Play restart; loading bar and labels precede scene replacement; return clears the bar');
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));if(projectReopen)await checkProjectReopen(authored);report.passed=true;
  console.log(JSON.stringify({passed:true,label,entities:report.entities,checks:report.checks}));
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
