// Author: MiYu. Measure cold Edit-mode Game and Scene presentation without starting Play.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const repo=fileURLToPath(new URL('../',import.meta.url)),label='viewport-startup-'+Date.now(),root=path.join(repo,'tmp/docs-artifacts/editor-performance-risk',label),sample=path.join(root,'sample');
const {configureNativeQa,closeNativeQa}=await import(pathToFileURL(path.join(repo,'scripts/frost-native-qa-runtime.mjs')));configureNativeQa(root);
fs.cpSync(path.join(repo,'samples/frostbound-realms'),sample,{recursive:true,filter:file=>!['SourceAssets','.mengine','Builds'].includes(path.basename(file))});
const config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));config.storageId=label;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import(pathToFileURL(path.join(repo,'packages/agent/mcp/server.mjs')));
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;},sleep=ms=>new Promise(r=>setTimeout(r,ms));
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const budgetIndex=process.argv.indexOf('--first-frame-timeout-ms'),budget=budgetIndex<0?15000:Number(process.argv[budgetIndex+1]);assert.ok(Number.isFinite(budget)&&budget>0&&budget<=60000,'First frame timeout must be 1 through 60000 ms');
const allocatorLifecycle=process.argv.includes('--allocator-lifecycle');
const report={label,exe:process.env.MENGINE_EDITOR_EXECUTABLE,editorSha256:crypto.createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex'),inputSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(sample,'Assets/Scenes/Main.mscene'))).digest('hex'),budgetMs:budget,passed:false,timings:[],profiles:{}};
try{
 await query('project.state');let started=performance.now();await execute('project.open',{root:sample});report.projectOpenMs=performance.now()-started;
 await execute('panel.focus',{kind:'game'});await execute('profiler.clear');
 for(const source of ['game','scene']){
  if(source==='scene'){const s=await query('scene.snapshot'),camera=s.entities.find(e=>e.name==='Strategy camera')??s.entities.find(e=>e.components.Camera3D);assert.ok(camera);await execute('selection.set',{ids:[camera.entity]});await execute('profiler.clear');await execute('panel.focus',{kind:'scene'});}
  const started=performance.now();
  for(;;){const p=await query('profiler.get_samples',{source,limit:5,includeNativeTimings:true});report.timings.push({source,elapsedMs:performance.now()-started,nativeProfiles:p.nativeProfileCount,paint:p.summary});if(p.nativeProfileCount){report.profiles[source]=p;break;}if(performance.now()-started>budget)throw Error(source+' native first frame timed out');await sleep(200);}
  const image=await query('view.screenshot',{target:source,maxSize:1280,includeNativeProfile:source==='game'});fs.writeFileSync(path.join(root,source+'.png'),Buffer.from(image.dataUrl.split(',')[1],'base64'));
 }
 if(allocatorLifecycle){
  report.allocatorLifecycle={live:{},closed:{}};
  for(const source of ['game','scene']){
   const regular=await query('profiler.get_samples',{source,limit:1});assert.equal(Object.hasOwn(regular,'gpuAllocator'),false,'Allocator diagnostics stay opt-in');
   const sampled=(await query('profiler.get_samples',{source,limit:1,includeGpuAllocator:true})).gpuAllocator;assert.ok(sampled&&Number.isSafeInteger(sampled.deviceId));report.allocatorLifecycle.live[source]=sampled;
  }
  const previous=report.allocatorLifecycle.live.game.deviceId;assert.equal(previous,report.allocatorLifecycle.live.scene.deviceId,'Live views report one shared device');
  await execute('project.close',{discardDirty:true});
  const closedDeadline=performance.now()+15000;report.allocatorLifecycle.closedWait=[];
  for(;;){
   try{const state=await query('project.state');report.allocatorLifecycle.closedWait.push({phase:state.phase,editorReady:state.editorReady});if(state.phase==='welcome'&&!state.editorReady)break;}
   catch(error){if(!/BridgeConnectionError|request timed out|not ready|connection closed/i.test(String(error)))throw error;}
   assert.ok(performance.now()<closedDeadline,'Close must finish its page reload and reach welcome before reopen');await sleep(150);
  }
  for(const source of ['game','scene']){const sampled=(await query('profiler.get_samples',{source,limit:1,includeGpuAllocator:true})).gpuAllocator;assert.equal(sampled,null,'Closed project has no viewport device');report.allocatorLifecycle.closed[source]=sampled;}
  await execute('project.open',{root:sample});await execute('panel.focus',{kind:'game'});await execute('profiler.clear');const deadline=performance.now()+budget;
  for(;;){const p=await query('profiler.get_samples',{source:'game',limit:1});if(p.nativeProfileCount)break;assert.ok(performance.now()<deadline,'Reopened project must present fresh native pixels');await sleep(200);}
  const reopened=(await query('profiler.get_samples',{source:'game',limit:1,includeGpuAllocator:true})).gpuAllocator;assert.ok(reopened);assert.notEqual(reopened.deviceId,previous,'Reopened project owns a new GPU context');report.allocatorLifecycle.reopened=reopened;
  const image=await query('view.screenshot',{target:'game',maxSize:1280});fs.writeFileSync(path.join(root,'game-reopened.png'),Buffer.from(image.dataUrl.split(',')[1],'base64'));
 }
 report.logs=await query('console.get_logs',{limit:40});assert.deepEqual(report.logs.filter(log=>log.level==='error'),[]);report.passed=true;
}catch(e){report.error=e.stack;try{report.logs=await query('console.get_logs',{limit:40});}catch{}process.exitCode=1;}
finally{try{await execute('project.close',{discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(e){report.cleanupError=e.message;process.exitCode=1;}fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,passed:report.passed,error:report.error,projectOpenMs:report.projectOpenMs,firstFrames:report.timings.filter(p=>p.nativeProfiles).map(({source,elapsedMs})=>({source,elapsedMs})),cleanup:report.cleanup}));}
