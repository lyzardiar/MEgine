// Author: MiYu. Measure native project opening and Scene operation before and after map-driven pools.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
if(!process.argv[2]){
 const reports=[];for(const [index,variant] of ['before','after','after','before'].entries()){
  execFileSync(process.execPath,[fileURLToPath(import.meta.url),variant,String(index)],{stdio:'inherit',windowsHide:true});
  reports.push(JSON.parse(fs.readFileSync('docs/designs/frostbound-realms/native-scene-loading-'+index+'.json','utf8')));
 }
 fs.writeFileSync('docs/designs/frostbound-realms/native-scene-loading-qa.json',JSON.stringify({author:'MiYu',passed:reports.every(r=>r.passed),rows:reports.flatMap(r=>r.rows),game:reports.find(r=>r.game)?.game,scope:reports[0].scope},null,2)+'\n');console.log('PASS native scene loading: four project opens, 32 camera moves, window capture and native Game frames');process.exit(0);
}
const variant=process.argv[2],runIndex=Number(process.argv[3]);assert.ok(['before','after'].includes(variant));
const root=path.join(nativeQaRoot,'scene-loading-'+Date.now()),sample=path.resolve(process.env.MENGINE_FROST_QA_ASSET_SAMPLE),out='docs/designs/frostbound-realms';
configureNativeQa(root);process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import(pathToFileURL(process.env.MENGINE_AGENT_MODULE));
const execute=async(command,args={})=>{const result=await bridgeExecute(command,args,{requestId:crypto.randomUUID()});assert.ok(result.ok,result.error?.message);return result.data;},delay=ms=>new Promise(r=>setTimeout(r,ms));
const scenePath=path.join(sample,'Assets/Scenes/Main.mscene'),oldScene=fs.readFileSync(scenePath),projectPath=path.join(sample,'project.json'),oldProject=fs.readFileSync(projectPath),project=JSON.parse(oldProject);
project.storageId=path.basename(root);fs.writeFileSync(projectPath,JSON.stringify(project));
const before=execFileSync('git',['show','c0159f6:samples/frostbound-realms/Assets/Scenes/Main.mscene'],{maxBuffer:128*1024*1024}),after=fs.readFileSync('samples/frostbound-realms/Assets/Scenes/Main.mscene'),report={author:'MiYu',passed:false,rows:[],scope:'Same release editor and reused asset sample; native project opening and camera operation. Includes warmed OS/asset/GPU caches; CPU microbenchmarks reported separately.'};
try{
 await query('project.state');
 for(const name of [variant]){
  if((await query('project.state')).project)await execute('project.close',{discardDirty:true});
  fs.writeFileSync(scenePath,name==='before'?before:after);
  const start=performance.now();await execute('project.open',{root:sample});const deadline=Date.now()+120000;
  while(true){const state=await query('project.state');if(state.ready&&state.editorReady)break;assert.ok(Date.now()<deadline,'project ready deadline');await delay(300);}
  const openMs=performance.now()-start;await execute('panel.focus',{kind:'scene'});await execute('view.set_camera',{yaw:0,pitch:55,distance:55,pivot:[0,0,0]});
  const scene=await query('scene.snapshot');assert.equal(scene.entities.length,name==='before'?22370:8973);
  await delay(500);await execute('profiler.clear');const cameraMs=[];
  for(let i=0;i<8;i++){
   const at=performance.now();await execute('view.set_camera',{yaw:i*5,pivot:[i*.2,0,0]});cameraMs.push(performance.now()-at);await delay(150);
  }
  const shot=await query('view.window_screenshot',{windowLabel:'main'});
  if(name==='after'&&runIndex===1)fs.writeFileSync(out+'/scene-loading-native-scene.png',Buffer.from(shot.dataUrl.split(',')[1],'base64'));
  let profile;const profileDeadline=Date.now()+15000;while(true){profile=await query('profiler.get_samples',{source:'scene',limit:20});if(profile.nativeLatest)break;assert.ok(Date.now()<profileDeadline,'native frame profile deadline');await delay(500);}
  const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'));
  report.rows.push({variant:name,openMs,entities:scene.entities.length,rootEntities:scene.entities.filter(e=>e.parent==null).length,cameraMs,nativeSummary:profile.nativeSummary,nativeLatest:profile.nativeLatest});
 }
 if(variant==='after'&&runIndex===1){
  await execute('panel.focus',{kind:'game'});await execute('playback.play');await delay(6000);await execute('profiler.clear');await delay(4000);
  const game=await query('profiler.get_samples',{source:'game',limit:30});assert.ok(game.nativeLatest);report.game=game;await execute('playback.stop');
 }report.passed=true;
 console.log('PASS native Scene '+variant+': one project open, eight camera moves, compact hierarchy and native window capture'+(report.game?' and native Game frames':''));
}catch(error){try{report.failureUi=await query('window.ui_snapshot',{windowLabel:'main'});report.failureProfile=await query('profiler.get_samples',{source:'scene',limit:10});report.failureConsole=await query('console.get_logs',{limit:100});}catch(e){report.diagnosticError=e.message;}report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{report.shutdown=await closeNativeQa(root);}catch(e){report.passed=false;report.shutdownError=e.message;process.exitCode=1;}closeBridgeConnection();fs.writeFileSync(scenePath,oldScene);fs.writeFileSync(projectPath,oldProject);fs.writeFileSync(out+'/native-scene-loading-'+runIndex+'.json',JSON.stringify(report,null,2)+'\n');}
