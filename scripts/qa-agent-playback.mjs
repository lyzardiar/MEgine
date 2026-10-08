// Author: MiYu. Verify bridge input edges, paused stepping and captures in an owned native editor.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),tag=Date.now(),root=path.join(nativeQaRoot,'agent-playback-'+tag),sample=path.join(root,'sample');
const output=path.join(repo,'docs/designs/frostbound-realms/native-agent-playback-qa.json');
configureNativeQa(root);fs.cpSync(path.join(repo,'samples/spinning-cube'),sample,{recursive:true});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));
Object.assign(project,{language:'javascript',startupScript:'Assets/Scripts/Main.js',storageId:'agent-playback-'+tag});
fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const scenePath=path.join(sample,'Assets/Scenes/Main.mscene'),scene=JSON.parse(fs.readFileSync(scenePath,'utf8'));
const textStyle={font:'',font_size:12,color:[1,1,1,1],alignment:'Left',vertical_align:'Top',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false};
scene.world.entities.push({entity:4,name:'Input telemetry',active:true,components:{Text:{...textStyle,text:'{}'}}});fs.writeFileSync(scenePath,JSON.stringify(scene));
fs.rmSync(path.join(sample,'Assets/Scripts/Main.ts'),{force:true});
fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),`// Author: MiYu. Native input edge probe.
function onTick(dt,frame){const target=engine.findEntitiesByName(['Input telemetry'])[0];if(!target)throw Error('Input telemetry missing');engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:target.entity,component:'Text',value:Object.assign(${JSON.stringify(textStyle)},{text:JSON.stringify({frame,input:engine.input})})}));}
`);
process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const report={author:'MiYu',passed:false,scope:'Owned native editor: script input edges, paused batch stepping, live revision guards and requested scene capture. No Warcraft performance or physical input claim.',editorSha256:createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex'),commands:[]};
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function measured(kind,name,fn){const start=performance.now();try{return await fn();}finally{report.commands.push({kind,name,ms:performance.now()-start});write();}}
const query=(name,args={})=>measured('query',name,()=>bridgeQuery(name,args));
const execute=(name,args={},options={})=>measured('execute',name,async()=>{const r=await bridgeExecute(name,args,{requestId:randomUUID(),timeoutMs:60000,...options});assert.ok(r.ok,r.error?.message);return r;});
const telemetry=async()=>JSON.parse((await query('entity.get',{name:'Input telemetry'})).components.Text.text);
let hash=0xcbf29ce484222325n;for(const b of Buffer.from(project.storageId))hash=BigInt.asUintN(64,(hash^BigInt(b))*0x100000001b3n);
const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',hash.toString(16).padStart(16,'0'));let requested=false;
try {
 requested=true;await query('project.state');
 try {await execute('project.open',{root:sample});} catch(e){if(!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(e.message))throw e;}
 const deadline=Date.now()+120000;
 while(true){const p=await query('project.state');report.lastProjectState=p;if(p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample))break;const logs=await query('console.get_logs',{limit:10}),failure=logs.find(l=>l.level==='error'&&l.message.includes('Editor initialization failed'));if(failure)throw Error(failure.message);if(Date.now()>deadline){report.bootWindow=await query('window.ui_snapshot',{maxElements:100});throw Error('Project did not become ready');}await new Promise(r=>setTimeout(r,1000));}
 await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});
 await execute('playback.play',{paused:true});await execute('playback.step');
 const before=await telemetry();report.initialTelemetry=before;assert.ok(before.input,JSON.stringify({telemetry:before,logs:await query('console.get_logs',{limit:10})}));
 const queued=await execute('playback.input',{keys:['KeyB'],buttons:[0],pointerDelta:[4,-2]});
 await execute('playback.input',{pointerDelta:[3,1]});await execute('playback.input',{keys:[],buttons:[]});
 assert.deepEqual(await telemetry(),before,'input must remain queued until a paused step');
 const step=await execute('playback.step');let t=await telemetry();
 assert.deepEqual(t.input.pressedKeys,['KeyB']);assert.deepEqual(t.input.releasedKeys,['KeyB']);assert.deepEqual(t.input.pressedButtons,[0]);assert.deepEqual(t.input.releasedButtons,[0]);assert.deepEqual(t.input.pointerDelta,[7,-1]);
 assert.equal(step.data.frame,t.frame);assert.ok(step.sceneRevision>queued.sceneRevision);
 const batch=await execute('playback.step',{steps:3});t=await telemetry();assert.equal(batch.data.frame,t.frame);assert.equal(t.frame,step.data.frame+3);
 assert.deepEqual(t.input.pressedKeys,[]);assert.deepEqual(t.input.releasedKeys,[]);assert.deepEqual(t.input.pointerDelta,[0,0]);
 await assert.rejects(()=>execute('playback.input',{keys:['KeyF']},{expectedSceneRevision:queued.sceneRevision}),e=>/revision/i.test(e.message));
 const guarded=await execute('playback.input',{keys:['KeyD']},{expectedSceneRevision:batch.sceneRevision});assert.equal(guarded.sceneRevision,batch.sceneRevision);
 await execute('playback.step');assert.deepEqual((await telemetry()).input.pressedKeys,['KeyD']);
 await execute('panel.focus',{kind:'scene'});
 const capture=await execute('playback.input',{keys:[]},{screenshot:true});assert.equal(capture.screenshotCaptured,true,JSON.stringify(capture));assert.ok(capture.screenshot.dataUrl.startsWith('data:image/'));
 fs.writeFileSync(path.join(repo,'docs/designs/frostbound-realms/native-agent-playback.png'),Buffer.from(capture.screenshot.dataUrl.split(',')[1],'base64'));
 const logs=await query('console.get_logs',{limit:40});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));
 report.inputEdges=true;report.batchFrame=true;report.revisionGuard=true;report.sceneCapture=true;report.passed=true;console.log('PASS native agent playback edges, batch frame, revision guards and scene capture');
} catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally {
 if(requested)try{await execute('playback.stop');}catch{}
 try{report.shutdown=await closeNativeQa(root);if(report.passed&&report.shutdown.normalExit)report.cleanup=removeNativeQaFixture(root,storage);}catch(e){report.shutdownError=e.message;report.passed=false;process.exitCode=1;}
 closeBridgeConnection();write();
}
