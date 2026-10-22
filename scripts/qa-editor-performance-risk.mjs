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
const report={root,passed:false,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),checks:[],profiles:{}};
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
  await execute('playback.pause');
  await sleep(3000);
  await execute('playback.pause');
  await execute('playback.step',{deltaTime:0.016,steps:3});
  const gameShot=await query('view.screenshot',{target:'game'});
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
  await execute('playback.stop');
  assert.equal((await snapshot()).entities.find(entity=>entity.entity===target.entity).name,target.name);
  report.checks.push({playPauseStepStop:true,editStateRestored:true});
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
