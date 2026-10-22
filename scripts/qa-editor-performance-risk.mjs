// Author: MiYu. Exercise packaged editor history, recovery, asset watching and playback on an isolated Frostbound copy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(repo,'tmp/docs-artifacts/editor-performance-risk');
const root=path.join(out,'native-qa',String(Date.now())),sample=path.join(root,'sample');
const source=path.join(repo,'samples/frostbound-realms');
const label=process.env.MENGINE_PERFORMANCE_LABEL||'native-editor-qa';
assert.match(label,/^[a-z0-9-]+$/);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE to the freshly built packaged editor');
configureNativeQa(root);
// Binary payloads are read-only during QA; scene files, scripts and all metadata get independent copies.
function copyProject(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
    if(['SourceAssets','Builds','.mengine','Library','Imported'].includes(entry.name))continue;
    const input=path.join(from,entry.name),output=path.join(to,entry.name);
    if(entry.isDirectory())copyProject(input,output);
    else if(entry.isFile()){
      if(/\.(png|jpe?g|webp|dds|wav|ogg|mp3|glb|bin)$/i.test(entry.name))fs.linkSync(input,output);
      else fs.copyFileSync(input,output);
    }
  }
}
copyProject(source,sample);
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));
project.storageId='editor-performance-'+path.basename(root);
fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{
  const response=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});
  assert.ok(response.ok,JSON.stringify(response));return response.result;
};
const snapshot=()=>query('scene.snapshot');
const report={root,passed:false,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),allowSnapshotCaptures:process.env.MENGINE_ALLOW_SNAPSHOT_CAPTURES==='1',checks:[],profiles:{}};
const sourceScene=path.join(source,'Assets/Scenes/Main.mscene'),sourceHash=hash(sourceScene);
const recoveryFile=path.join(sample,'.mengine/Recovery/scene.recovery.json');
async function waitUntil(label,check,timeout=30000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await sleep(250);}
  throw new Error('Timed out: '+label);
}
async function waitRecovery(name){
  await waitUntil('durable recovery '+name,()=>{
    if(!fs.existsSync(recoveryFile))return false;
    return JSON.parse(fs.readFileSync(recoveryFile,'utf8')).world.entities.some(entity=>entity.name===name);
  });
}
try{
  console.log('START isolated native editor performance QA',root);
  for(let attempt=0;;attempt++){
    try{await query('project.state');break;}
    catch(error){if(attempt>=20||!/Workspace services are not ready|BridgeConnectionError|request timed out/.test(error.message))throw error;await sleep(500);}
  }
  await execute('project.open',{root:sample});
  const initial=await snapshot();
  assert.ok(initial.entities.length>=3800);
  const target=initial.entities.find(entity=>entity.name&&entity.name!=='Frost telemetry');
  const renamed=target.name+' [performance QA]';
  await execute('panel.focus',{kind:'scene'});
  await execute('view.set_scene_preferences',{mode2D:false});
  await execute('profiler.clear');
  await sleep(5000);
  report.profiles.scene=await query('profiler.get_samples',{source:'scene',limit:120});
  assert.ok(report.profiles.scene.totalSamples>0,'Scene profiler must collect real viewport samples');
  report.sceneNativeProfilesAvailable=report.profiles.scene.nativeProfileCount>0;
  report.editorState=await query('editor.state');
  try{const shot=await query('view.screenshot',{target:'scene'});fs.writeFileSync(path.join(out,'native-scene.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}catch(error){report.sceneCaptureError=error.message;}
  report.profiles.scene=await query('profiler.get_samples',{source:'scene',limit:120});
  report.sceneNativeProfilesAvailable=report.profiles.scene.nativeProfileCount>0;
  report.sceneWarmFrames=[];
  for(let frame=0;frame<12;frame++){
    const before=report.profiles.scene.nativeLatest?.timestamp;
    await execute('view.set_camera',{yaw:35+frame*0.1});
    await waitUntil('native scene camera frame',async()=>{
      report.profiles.scene=await query('profiler.get_samples',{source:'scene',limit:120});
      return report.profiles.scene.nativeLatest&&report.profiles.scene.nativeLatest.timestamp!==before;
    });
    report.sceneWarmFrames.push(report.profiles.scene.nativeLatest);
  }
  await execute('entity.rename',{id:target.entity,name:renamed});
  await waitRecovery(renamed);
  assert.equal((await snapshot()).entities.find(entity=>entity.entity===target.entity).name,renamed);
  await execute('history.undo');
  assert.equal((await snapshot()).entities.find(entity=>entity.entity===target.entity).name,target.name);
  await execute('history.redo');
  assert.equal((await snapshot()).entities.find(entity=>entity.entity===target.entity).name,renamed);
  await waitRecovery(renamed);
  report.checks.push({entities:initial.entities.length,renameUndoRedo:true,durableRecovery:true});
  console.log('PASS rename, undo/redo and durable scene recovery');

  // Observe automatic external-change events before any asset.list query can force a refresh.
  const assetPath='Assets/PerformanceQa.mmat',assetFile=path.join(sample,assetPath);
  let cursor=(await query('events.get',{limit:1})).currentSequence;
  async function externalChange(type,mutate){
    const started=performance.now();mutate();
    let detected;
    await waitUntil('automatic asset '+type,async()=>{
      const page=await query('events.get',{afterSequence:cursor,topics:['asset.changed'],limit:100});
      cursor=page.currentSequence;
      detected=page.events.find(event=>event.data?.source==='external'&&event.data.changes?.some(change=>change.relPath===assetPath&&change.type===type));
      return Boolean(detected);
    });
    report.checks.push({externalAsset:type,latencyMs:performance.now()-started});
  }
  await sleep(2500);
  await externalChange('added',()=>fs.writeFileSync(assetFile,'{}'));
  await externalChange('modified',()=>fs.writeFileSync(assetFile,'{"name":"QA changed"}'));
  await externalChange('deleted',()=>fs.unlinkSync(assetFile));
  console.log('PASS automatic external asset add/modify/delete via native watcher and UI polling');

  // The game looks up authored cameras by name; restore that name before starting its scripts.
  await execute('history.undo');
  assert.equal((await snapshot()).entities.find(entity=>entity.entity===target.entity).name,target.name);
  await execute('panel.focus',{kind:'game'});
  await execute('playback.play',{paused:true});
  await execute('playback.step',{deltaTime:0.016,steps:5});
  let game=await snapshot();
  const telemetry=game.entities.find(entity=>entity.name==='Frost telemetry');
  assert.ok(telemetry?.components.Text.text);
  assert.equal(JSON.parse(telemetry.components.Text.text).mode,'title');
  await execute('playback.input',{keys:['F1']});
  await execute('playback.step',{deltaTime:0.016,steps:1});
  await execute('playback.input',{keys:[]});
  await execute('playback.step',{deltaTime:0.016,steps:3});
  report.telemetry=JSON.parse((await snapshot()).entities.find(entity=>entity.name==='Frost telemetry').components.Text.text);
  assert.equal(report.telemetry.mode,'playing');
  // Preserve an identical simulation state before the wall-clock playback check.
  const fixedGame=await snapshot();
  fs.writeFileSync(path.join(root,'fixed-game-simulation-world.json'),JSON.stringify(fixedGame));
  const fixedWorld={entities:structuredClone(fixedGame.entities),frame:fixedGame.frame,sim_frame:fixedGame.simFrame,elapsed:fixedGame.simulationTime,clear_color:fixedGame.clearColor};
  // Runtime-created siblings can share an index; saved scene imports require unique sibling slots.
  const siblings=new Map();
  for(const entity of fixedWorld.entities){const key=entity.parent??null;if(!siblings.has(key))siblings.set(key,[]);siblings.get(key).push(entity);}
  report.fixedGameNormalizedSiblingIndices=0;
  for(const children of siblings.values())children.sort((a,b)=>(a.siblingIndex??0)-(b.siblingIndex??0)).forEach((entity,index)=>{
    if(entity.siblingIndex!==index)report.fixedGameNormalizedSiblingIndices++;
    entity.siblingIndex=index;
  });
  report.fixedGameExcludedComponents={};
  // Renderer-owned particles/effects advance on wall time even while Play is paused.
  // Keep the full dynamic QA below, and isolate static rendering in a saved gameplay fixture.
  for(const entity of fixedWorld.entities)for(const type of Object.keys(entity.components)){
    if(!/^(ParticleEmitter2D|ParticleEmitter3D|TrailRenderer2D|EffekseerEffect|SampledEffect)$/.test(type))continue;
    delete entity.components[type];
    report.fixedGameExcludedComponents[type]=(report.fixedGameExcludedComponents[type]??0)+1;
  }
  const worldHash=world=>createHash('sha256').update(JSON.stringify(world,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value)).digest('hex');
  report.fixedGameWorldHash=worldHash(fixedWorld);
  fs.writeFileSync(path.join(root,'fixed-game-world.json'),JSON.stringify(fixedWorld));
  async function verifyPausedGame(key,world){
    const pausedWorldHash=worldHash(world),frames=[];let pixelHash;
    for(let frame=0;frame<6;frame++){
      const captureStarted=performance.now();
      const shot=await query('view.screenshot',{target:'game',maxSize:850,includeNativeProfile:true});
      const captureWallMs=performance.now()-captureStarted;
      // Only historical baseline runs may omit the retained Play revision.
      if(!report.allowSnapshotCaptures)assert.ok(Number.isSafeInteger(shot.nativeProfile?.worldRevision),'Paused native capture must reuse its published Play revision');
      const png=Buffer.from(shot.dataUrl.split(',')[1],'base64');
      const pixels=createHash('sha256').update(png).digest('hex');
      frames.push({...shot.nativeProfile,pixelSha256:pixels,captureWallMs});
      report[key+'Frames']=frames;
      assert.equal(worldHash(await snapshot()),pausedWorldHash,'Paused capture must not change the full game world');
      if(frame>=2){pixelHash??=pixels;assert.equal(pixels,pixelHash,'Paused effects must not advance during repeated captures');assert.equal(shot.nativeProfile.worldRevision,frames[2].worldRevision);}
      if(frame===5)fs.writeFileSync(path.join(out,label+'-'+key+'.png'),png);
    }
    report[key+'PixelHash']=pixelHash;
  }
  await verifyPausedGame('pausedGame',fixedGame);
  console.log('PASS paused native Game captures including particles and sampled effects');
  await execute('playback.pause');
  await sleep(3000);
  await execute('playback.pause');
  await execute('playback.step',{deltaTime:0.016,steps:3});
  const gameShot=await query('view.screenshot',{target:'game'});
  assert.equal(gameShot.nativeProfile,undefined,'Default screenshot response must omit native profiling');
  fs.writeFileSync(path.join(out,'native-game.png'),Buffer.from(gameShot.dataUrl.split(',')[1],'base64'));
  report.profiles.game=await query('profiler.get_samples',{source:'game',limit:120});
  assert.ok(report.profiles.game.nativeProfileCount>0,'Game must render through the native viewport');
  report.gameWarmFrames=[];
  for(let frame=0;frame<12;frame++){
    const before=report.profiles.game.nativeLatest?.timestamp;
    await execute('playback.step',{deltaTime:0.016,steps:1});
    await waitUntil('native gameplay frame',async()=>{
      report.profiles.game=await query('profiler.get_samples',{source:'game',limit:120});
      return report.profiles.game.nativeLatest&&report.profiles.game.nativeLatest.timestamp!==before;
    });
    report.gameWarmFrames.push(report.profiles.game.nativeLatest);
  }
  await verifyPausedGame('resumedPausedGame',await snapshot());
  assert.ok(report.resumedPausedGameFrames[2].counts.uiPrimitives>report.pausedGameFrames[2].counts.uiPrimitives,'Resumed gameplay must populate particles before its paused-frame check');
  await execute('playback.stop');
  assert.equal((await snapshot()).entities.find(entity=>entity.entity===target.entity).name,target.name);
  report.checks.push({playPauseStepStop:true,editStateRestored:true});
  await execute('scene.load_json',{json:JSON.stringify({version:1,name:'PerformanceFixedGame',world:fixedWorld})});
  await execute('panel.focus',{kind:'game'});
  const fixedLoaded=await snapshot();
  assert.equal(fixedLoaded.entities.length,fixedWorld.entities.length);
  fs.writeFileSync(path.join(root,'fixed-game-loaded-world.json'),JSON.stringify(fixedLoaded));
  const fixedLoadedHash=worldHash(fixedLoaded);
  report.fixedGameLoadedWorldHash=fixedLoadedHash;
  const displayedSize=report.profiles.game.nativeLatest.renderSize;
  assert.ok(displayedSize?.length===2,'Fixed capture must match the measured native viewport size');
  const fixedCaptureSize=Math.max(...displayedSize);
  assert.ok(fixedCaptureSize>=256&&fixedCaptureSize<=4096);
  report.fixedGameFrames=[];
  await assert.rejects(query('view.screenshot',{target:'scene',includeNativeProfile:true}),/Native screenshot profiling requires the Game viewport/);
  for(let frame=0;frame<12;frame++){
    const shot=await query('view.screenshot',{target:'game',maxSize:fixedCaptureSize,includeNativeProfile:true});
    assert.ok(shot.nativeProfile?.callTree,'Fixed capture must return its own native profile');
    assert.ok(Number.isFinite(shot.nativeProfile.worldSyncMs),'Snapshot capture must report world synchronization');
    assert.deepEqual(shot.nativeProfile.renderSize,[shot.width,shot.height]);
    assert.deepEqual(shot.nativeProfile.renderSize,displayedSize,'Fixed capture must avoid render-target resize work');
    const png=Buffer.from(shot.dataUrl.split(',')[1],'base64');
    const pngHash=createHash('sha256').update(png).digest('hex');
    fs.writeFileSync(path.join(root,`fixed-game-${frame}.png`),png);
    report.fixedGameFrames.push({...shot.nativeProfile,pixelSha256:pngHash});
    assert.equal(worldHash(await snapshot()),fixedLoadedHash,'Fixed capture must not advance the world');
    if(frame>=2){
      report.fixedGamePixelHash??=pngHash;
      assert.equal(pngHash,report.fixedGamePixelHash,'Warmed fixed-state pixels must remain identical');
    }
    if(frame===11)fs.writeFileSync(path.join(out,label+'-fixed-game.png'),png);
  }
  console.log('PASS fixed-state native captures; world and warmed pixels unchanged');

  const replaceIsolatedResource=(file,bytes)=>{
    const relative=path.relative(sample,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    const temporary=file+'.performance-qa-'+process.pid+'.tmp';
    fs.writeFileSync(temporary,bytes,{flag:'wx'});
    try{fs.renameSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
  };
  report.resourceHotReload=[];
  for(const [relative,change] of [
    ['Assets/Materials/Ground.mmat',raw=>JSON.stringify({...JSON.parse(raw.toString('utf8')),shader:'unlit',base_color:[1,0,1,1],base_color_texture:''})],
    ['Assets/Shaders/ClassicGround.mshader',bytes=>{const raw=bytes.toString('utf8'),marker='s.base_color=mix(color,rock,cliff);';assert.ok(raw.includes(marker));return raw.replace(marker,'s.base_color=vec3<f32>(1.0,0.0,1.0);');}],
    ['Assets/Art/console-gold.png',()=>fs.readFileSync(path.join(sample,'Assets/Art/console-lumber.png'))],
    ['Assets/WarcraftIII/Textures/ReplaceableTextures/TeamColor/TeamColor01.png',()=>fs.readFileSync(path.join(sample,'Assets/WarcraftIII/Textures/ReplaceableTextures/TeamColor/TeamColor00.png'))],
  ]){
    const file=path.join(sample,relative),original=fs.readFileSync(file),sourceFile=path.join(source,relative),sourceDigest=hash(sourceFile);
    const result={asset:relative};report.resourceHotReload.push(result);
    const captureHash=async()=>{
      let shot;
      try{shot=await query('view.screenshot',{target:'game',maxSize:fixedCaptureSize,includeNativeProfile:true});}
      catch(error){if(error.code!=='NOT_READY'||!error.message.includes('canvas is not available yet'))throw error;result.notReadyRetries=(result.notReadyRetries??0)+1;return null;}
      assert.equal(worldHash(await snapshot()),fixedLoadedHash,'Asset hot reload must not mutate the captured world');
      return createHash('sha256').update(Buffer.from(shot.dataUrl.split(',')[1],'base64')).digest('hex');
    };
    try{
      replaceIsolatedResource(file,change(original));
      await waitUntil('native resource hot reload '+relative,async()=>{const pixels=await captureHash();if(!pixels||pixels===report.fixedGamePixelHash)return false;result.changedPixelHash=pixels;return true;});
    }finally{replaceIsolatedResource(file,original);}
    await waitUntil('native resource restoration '+relative,async()=>{const pixels=await captureHash();if(pixels!==report.fixedGamePixelHash)return false;result.restoredPixelHash=pixels;return true;});
    assert.equal(hash(file),createHash('sha256').update(original).digest('hex'));
    assert.equal(hash(sourceFile),sourceDigest,'Source sample assets must stay unchanged');
  }
  console.log('PASS native material, shader and texture hot reload and exact pixel restoration');

  const logs=await query('console.get_logs',{limit:300});
  report.logs=logs;
  assert.equal(logs.filter(log=>log.level==='error').length,0,JSON.stringify(logs));
  assert.equal(hash(sourceScene),sourceHash);
  report.passed=true;
  console.log('PASS native playback and console; source scene unchanged');
}catch(error){report.error=error.stack;try{report.logs=await query('console.get_logs',{limit:300});}catch{}process.exitCode=1;console.error(error.stack);}
finally{
  try{await execute('playback.stop');await execute('project.close',{discardDirty:true});}catch(error){report.projectCloseError=error.message;}
  closeBridgeConnection();
  try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
}
