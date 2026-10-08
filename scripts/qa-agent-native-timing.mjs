// Author: MiYu. Measure socket-to-webview delivery, FIFO waits and operations on the published Warcraft scene.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
import {configureNativeQaCpuProfile} from './native-qa-cpu-profile.mjs';
const cpuEnabled=process.env.MENGINE_QA_CPU_PROFILE==='1',variant=cpuEnabled?'-cpu':process.env.MENGINE_QA_TIMING_OPTIMIZED==='1'?'-optimized':'',repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag=Date.now(),root=path.join(nativeQaRoot,'rpc-timing-'+tag),sample=path.join(root,'sample'),out=path.join(repo,'docs/designs/frostbound-realms/native-agent-timing'+variant+'-qa.json');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='rpc-timing-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR);
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const beginCpuProfile=cpuEnabled?await configureNativeQaCpuProfile():null;let stopCpuProfile;
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={author:'MiYu',passed:false,startedAt:new Date().toISOString(),sample,editorSha256:sha(process.env.MENGINE_EDITOR_EXECUTABLE),mainSha256:sha(path.join(source,'Assets/Scripts/Main.js')),sceneSha256:sha(path.join(source,'Assets/Scenes/Main.mscene')),commands:[],scope:'Same published Warcraft scene; paused native editor. Delivery includes readiness and webview event scheduling. Reply includes serialization, IPC and socket/client handling. Wall-clock delivery intervals are approximate; operation and queue durations use the frontend monotonic clock.'};
const write=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
async function measured(kind,name,args={}){
 const started=performance.now(),sentAtMs=Date.now();let timing,value;
 try{
  if(kind==='query')value=await bridgeQuery(name,args,{traceTiming:true,onTiming:t=>{timing=t;}});
  else{const result=await bridgeExecute(name,args,{traceTiming:true,requestId:crypto.randomUUID()});assert.ok(result.ok,result.error?.message);timing=result.bridgeTiming;value=result.data;}
  assert.ok(timing&&Number.isFinite(timing.nativeReceivedAtMs),'Native and frontend timing instrumentation required');return value;
 }finally{
  const ms=performance.now()-started,receivedAtMs=Date.now();const row={kind,name,phase:report.phase??'startup',ms,sentAtMs,receivedAtMs,timing,...(timing?{toNativeMs:timing.nativeReceivedAtMs-sentAtMs,toFrontendMs:timing.frontendReceivedAtMs-timing.nativeReceivedAtMs,replyMs:receivedAtMs-timing.responseReadyAtMs}:{})};report.commands.push(row);write();console.log(name,JSON.stringify(row));
 }
}
const query=(n,a)=>measured('query',n,a),execute=(n,a)=>measured('execute',n,a),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));
try{
 await query('project.state');try{await execute('project.open',{root:sample});}catch(e){if(!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(e.message))throw e;}
 const deadline=Date.now()+120000;while(true){const p=await query('project.state');if(p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample))break;assert.ok(Date.now()<deadline,'project readiness timeout');await sleep(500);}
 report.readyAt=new Date().toISOString();
 report.phase='edit';
 for(let i=0;i<3;i++){await query('entity.get',{name:'Frost telemetry'});await query('project.state');}
 await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await execute('playback.step',{deltaTime:.001,steps:1});
 await execute('playback.input',{keys:['F1'],viewport:[1280,720]});await execute('playback.step',{deltaTime:.001,steps:1});
 report.phase='playing';
 const gameState=JSON.parse((await query('entity.get',{name:'Frost telemetry'})).components.Text.text);assert.equal(gameState.mode,'playing');report.gameMode=gameState.mode;
 if(beginCpuProfile)stopCpuProfile=await beginCpuProfile();
 report.playReadyAt=new Date().toISOString();
 for(let i=0;i<3;i++){await execute('playback.input',{keys:[],buttons:[],viewport:[1280,720]});await query('entity.get',{name:'Frost telemetry'});await execute('playback.step',{deltaTime:.001,steps:1});}
 if(stopCpuProfile){report.cpuProfile=await stopCpuProfile();stopCpuProfile=null;}
 const profile=await query('profiler.get_samples',{source:'game',limit:8});report.profile=profile;
 const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;console.log('PASS native RPC phase measurements');
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally{
 if(stopCpuProfile)try{report.cpuProfile=await stopCpuProfile();}catch(e){report.cpuProfileError=e.message;}
 try{await execute('playback.stop');}catch{}
 try{report.shutdown=await closeNativeQa(root);if(report.passed&&report.shutdown.normalExit)report.cleanup=removeNativeQaFixture(root,storage);}catch(e){report.shutdownError=e.message;report.passed=false;process.exitCode=1;}
 closeBridgeConnection();write();
}
