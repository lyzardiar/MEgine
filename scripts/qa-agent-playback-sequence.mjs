// Author: MiYu. Compare serial and sequenced input in an owned native editor, including the published Warcraft client.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
import {nativeKeyPhases,nativePointPhases} from './frost-native-input.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),full=process.argv.includes('--warcraft'),integrationOnly=process.argv.includes('--integration-only'),tag=Date.now(),prefix='agent-sequence'+(full?'-warcraft':''),root=path.join(nativeQaRoot,prefix+'-'+tag),sample=path.join(root,'sample'),source=path.join(repo,'samples',full?'frostbound-realms':'spinning-cube'),out=path.join(repo,'docs/designs/frostbound-realms/native-'+prefix+'-qa.json');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));Object.assign(project,{language:'javascript',startupScript:'Assets/Scripts/Main.js',storageId:prefix+'-'+tag});fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const scenePath=path.join(sample,'Assets/Scenes/Main.mscene'),scene=JSON.parse(fs.readFileSync(scenePath,'utf8')),scriptPath=path.join(sample,'Assets/Scripts/Main.js'),telemetryName=full?'Frost telemetry':'Input telemetry';
if(full){const script=fs.readFileSync(scriptPath,'utf8');assert.ok(script.includes('JSON.stringify({mode,'));fs.writeFileSync(scriptPath,script.replace('JSON.stringify({mode,','JSON.stringify({qaUnits:state.units,qaInput:engine.input,mode,'));}
else{
 const textStyle={font:'',font_size:12,color:[1,1,1,1],alignment:'Left',vertical_align:'Top',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false};
 scene.world.entities.push({entity:4,name:telemetryName,active:true,components:{Text:{...textStyle,text:'{}'}}});fs.writeFileSync(scenePath,JSON.stringify(scene));fs.rmSync(path.join(sample,'Assets/Scripts/Main.ts'),{force:true});
 fs.writeFileSync(scriptPath,`// Author: MiYu. Native ordered input history.\nlet history=[];function onTick(dt,frame){history.push({dt,frame,input:engine.input});if(history.length>16)history.shift();const target=engine.findEntitiesByName(['Input telemetry'])[0];engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:target.entity,component:'Text',value:Object.assign(${JSON.stringify(textStyle)},{text:JSON.stringify({frame,history})})}));}\n`);
}
process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR);
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={author:'MiYu',passed:false,startedAt:new Date().toISOString(),sample,entityCount:scene.world.entities.length,editorSha256:sha(process.env.MENGINE_EDITOR_EXECUTABLE),sourceMainSha256:full?sha(path.join(source,'Assets/Scripts/Main.js')):null,sourceSceneSha256:sha(path.join(source,'Assets/Scenes/Main.mscene')),fixtureMainSha256:sha(scriptPath),commands:[],samples:[],pairedTimingsMeasured:full&&!integrationOnly,scope:full?'Same owned published Warcraft scene and editor: serial and batched pause/resume input, selection, hold, native F5 save and menu-load click. Startup and queries excluded from paired input timings. No whole-task speedup, physical input, audio or full Warcraft parity claim.':'Owned native input probe: same per-frame input edges and deltas with serial and batched input/step, full validation and revision guards.'};
const write=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
async function execute(name,args={},options={}){report.pending={name,at:new Date().toISOString()};write();const start=performance.now();try{const r=await bridgeExecute(name,args,{requestId:randomUUID(),traceTiming:true,...options});assert.ok(r.ok,r.error?.message);report.commands.push({name,ms:performance.now()-start,timing:r.bridgeTiming});return r;}finally{delete report.pending;write();}}
const query=(name,args={})=>bridgeQuery(name,args),telemetry=async()=>JSON.parse((await query('entity.get',{name:telemetryName})).components.Text.text);
const keyPhases=nativeKeyPhases,sequence=phases=>execute('playback.sequence',{phases});
async function serial(phases){let result;for(const phase of phases){if(phase.input)await execute('playback.input',phase.input);result=await execute('playback.step',{deltaTime:phase.deltaTime??1/60,steps:phase.steps??1});}return result;}
let hash=0xcbf29ce484222325n;for(const b of Buffer.from(project.storageId))hash=BigInt.asUintN(64,(hash^BigInt(b))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',hash.toString(16).padStart(16,'0'));let requested=false;
try{
 const readyStart=performance.now();requested=true;await query('project.state');try{await execute('project.open',{root:sample});}catch(e){if(!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(e.message))throw e;}
 const deadline=Date.now()+120000;while(true){const p=await query('project.state');if(p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample))break;assert.ok(Date.now()<deadline,'Project readiness timeout');await new Promise(r=>setTimeout(r,500));}
 await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await execute('playback.step',{deltaTime:.001});report.readyMs=performance.now()-readyStart;
 if(full){
  await sequence(keyPhases('F1'));assert.equal((await telemetry()).mode,'playing');
  const phases=[...keyPhases('F10'),...keyPhases('Escape')];
  if(!integrationOnly)for(let i=0;i<3;i++)for(const kind of i%2?['batch','serial']:['serial','batch']){const start=performance.now(),r=await (kind==='serial'?serial(phases):sequence(phases));const ms=performance.now()-start,t=await telemetry();assert.equal(t.mode,'playing');assert.equal(t.paused,false);report.samples.push({pair:i,kind,ms,steps:4,rpcCount:kind==='serial'?8:1,frame:r.data.frame});write();console.log('PAIR',i,kind,Math.round(ms)+'ms');}
  await sequence([...keyPhases('Space'),...keyPhases('KeyH'),...keyPhases('F5')]);let t=await telemetry();assert.equal(t.qaUnits.find(u=>u.id===t.selected[0]).order.type,'hold');const saved=JSON.parse(fs.readFileSync(path.join(storage,'quicksave.json'),'utf8'));const selectedId=t.selected[0];assert.ok(saved.units.some(u=>u.id===selectedId&&u.order?.type==='hold'));
  await sequence([...keyPhases('F10'),...nativePointPhases([640,388]),...keyPhases('Space')]);t=await telemetry();assert.equal(t.mode,'playing');assert.equal(t.paused,false);assert.equal(t.qaUnits.find(u=>u.id===selectedId).order.type,'hold');const u=t.qaUnits.find(u=>u.id===selectedId),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),pitch=Math.atan2(32,42);await sequence(nativePointPhases([640+(u.x-t.camera[0])/t.zoom*360,360+((u.z-t.camera[1])*Math.sin(pitch)-S.unitHeight(saved,u)*Math.cos(pitch))/t.zoom*360]));t=await telemetry();assert.equal(t.selected[0],selectedId);report.gameplay={pauseResume:true,selectAndHold:true,F5Save:true,menuLoadClick:true};
 }else{
  const phases=[{input:{keys:['KeyB'],buttons:[0],pointer:[30,40],viewport:[1280,720],pointerDelta:[4,-2]},deltaTime:.01},{steps:2,deltaTime:.02},{input:{keys:[],buttons:[],pointerDelta:[3,1]},deltaTime:.03}];
  const a=await serial(phases),serialTrace=(await telemetry()).history.slice(-4),b=await sequence(phases),batchTrace=(await telemetry()).history.slice(-4);assert.equal(b.data.frame,a.data.frame+4);assert.deepEqual(batchTrace.map(({frame,...v})=>v),serialTrace.map(({frame,...v})=>v));assert.deepEqual(batchTrace[0].input.pressedKeys,['KeyB']);assert.deepEqual(batchTrace[3].input.releasedKeys,['KeyB']);assert.deepEqual(batchTrace[3].input.releasedButtons,[0]);
  const before=await telemetry();await assert.rejects(()=>sequence([{input:{keys:['KeyD']}},{input:{buttons:[3]}}]),/parameter|argument|invalid/i);assert.deepEqual(await telemetry(),before);await assert.rejects(()=>sequence([{steps:600},{}]),/600/);assert.deepEqual(await telemetry(),before);
  await assert.rejects(()=>execute('playback.sequence',{phases:[{}]},{expectedSceneRevision:a.sceneRevision}),/revision/i);assert.deepEqual(await telemetry(),before);report.serialTrace=serialTrace;report.batchTrace=batchTrace;report.validationBeforeMutation=true;report.revisionGuard=true;
 }
 const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));const profile=await query('profiler.get_samples',{source:'game',limit:8});if(full)assert.ok(profile.nativeLatest,'Full game requires native render statistics');if(profile.nativeLatest)assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);report.consoleErrors=0;report.shaderRejections=profile.nativeLatest?.counts.materialPipelinesRejected??null;report.passed=true;console.log('PASS native ordered input',full?'Warcraft integration':'probe');
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally{
 if(requested)try{await execute('playback.stop');}catch{}
 try{report.shutdown=await closeNativeQa(root);if(report.passed&&report.shutdown.normalExit)report.cleanup=removeNativeQaFixture(root,storage);}catch(e){report.shutdownError=e.message;report.passed=false;process.exitCode=1;}
 closeBridgeConnection();report.finishedAt=new Date().toISOString();write();
}
