// Author: MiYu. Verify native editor interaction on the published Warcraft scene with inherited Scene restrictions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag=Date.now(),root=path.join(nativeQaRoot,'scene-interaction-'+tag),sample=path.join(root,'sample');
const output=path.join(repo,'docs/designs/frostbound-realms/native-scene-interaction-qa.json');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='scene-interaction-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const scenePath=path.join(sample,'Assets/Scenes/Main.mscene'),scene=JSON.parse(fs.readFileSync(scenePath)),sourceId=Math.max(...scene.world.entities.map(e=>e.entity))+1;
const transform={position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
scene.world.entities.push({entity:sourceId,name:'Scene interaction QA parent',parent:null,siblingIndex:-2,active:true,components:{Transform:transform}},{entity:sourceId+1,name:'Scene interaction QA child',parent:sourceId,siblingIndex:0,active:true,components:{Transform:transform}},{entity:sourceId+2,name:'Scene interaction QA other',parent:null,siblingIndex:-1,active:true,components:{Transform:transform}});
fs.writeFileSync(scenePath,JSON.stringify(scene));
process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR);
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report={author:'MiYu',passed:false,startedAt:new Date().toISOString(),sample,editorSha256:sha(process.env.MENGINE_EDITOR_EXECUTABLE),qaSha256:sha(fileURLToPath(import.meta.url)),mainSha256:sha(path.join(sample,'Assets/Scripts/Main.js')),sceneSha256:sha(scenePath),entities:scene.world.entities.length,commands:[],scope:'Owned unfocused native editor; published Warcraft scene with three deterministic empty QA entities. Scene bridge commands hide a parent and disable picking for another root. Three selection/query cycles use nonempty restrictions. Checks state counts, branch clearing and unchanged authored-scene revisions. Includes frontend scheduling, rendering and bridge overhead; does not measure physical mouse/keyboard, semantic full-window snapshots, UI button clicks or gameplay FPS.'};
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function measured(kind,name,args={}) {
  const start=performance.now();let timing;report.pendingCommand={kind,name,startedAt:new Date().toISOString()};write();
  try {
    if(kind==='query')return await bridgeQuery(name,args,{traceTiming:true,onTiming:t=>{timing=t;}});
    const result=await bridgeExecute(name,args,{traceTiming:true,requestId:randomUUID(),timeoutMs:name==='playback.step'?300000:60000});assert.ok(result.ok,result.error?.message);timing=result.bridgeTiming;return result.data;
  } finally {report.commands.push({kind,name,phase:report.phase||'startup',ms:performance.now()-start,timing});delete report.pendingCommand;write();console.log(name,Math.round(report.commands.at(-1).ms)+' ms');}
}
const query=(n,a={})=>measured('query',n,a),execute=(n,a={})=>measured('execute',n,a);
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));
try {
  await query('project.state');try{await execute('project.open',{root:sample});}catch(e){if(!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(e.message))throw e;}
  const deadline=Date.now()+120000;while(true){const p=await query('project.state');if(p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample))break;assert.ok(Date.now()<deadline,'project readiness timeout');await new Promise(r=>setTimeout(r,1000));}
  report.phase='setup';await execute('panel.focus',{kind:'scene'});
  const parent=await query('entity.get',{name:'Scene interaction QA parent'}),childInfo=await query('entity.get',{name:'Scene interaction QA child'}),other=await query('entity.get',{name:'Scene interaction QA other'});
  const id=parent.entity,childId=childInfo.entity,otherId=other.entity;assert.equal(childInfo.parent,id);report.nativeIds={parent:id,child:childId,other:otherId};
  const before=await query('editor.state');
  assert.ok(Number.isSafeInteger(before.sceneRevision));
  assert.equal((await execute('view.set_scene_visibility',{id,visible:false})).visible,false);
  assert.equal((await execute('view.set_scene_pickability',{id:otherId,pickable:false})).pickable,false);
  let state=await query('editor.state');assert.equal(state.sceneVisibility.hiddenCount,2);assert.equal(state.sceneVisibility.unpickableCount,1);
  assert.equal(state.sceneRevision,before.sceneRevision,'Scene flags must not change authored scene revision');assert.equal(state.dirty,before.dirty);assert.equal(state.undoLabel,before.undoLabel);
  report.phase='restricted';
  for(let i=0;i<3;i++){await execute('selection.set',{ids:[i%2?id:otherId]});const child=await query('entity.get',{name:'Scene interaction QA child'});assert.equal(child.entity,childId);assert.equal(child.parent,id);state=await query('editor.state');assert.equal(state.sceneVisibility.hiddenCount,2);assert.equal(state.sceneVisibility.unpickableCount,1);}
  report.phase='verify';
  assert.equal((await execute('view.set_scene_visibility',{id:childId,visible:true})).visible,true);
  assert.equal((await execute('view.set_scene_pickability',{id:otherId,pickable:true})).pickable,true);
  state=await query('editor.state');assert.equal(state.sceneVisibility.hiddenCount,0);assert.equal(state.sceneVisibility.unpickableCount,0);assert.equal(state.sceneRevision,before.sceneRevision);
  report.branchCleared=true;report.authoredSceneRevisionUnchanged=true;
  report.phase='playing';
  await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});
  await execute('playback.play',{paused:true});await execute('playback.step',{deltaTime:.001,steps:1});
  await execute('playback.input',{keys:['F1'],viewport:[1280,720]});await execute('playback.step',{deltaTime:.001,steps:1});
  const telemetry=JSON.parse((await query('entity.get',{name:'Frost telemetry'})).components.Text.text);assert.equal(telemetry.mode,'playing');report.gameMode=telemetry.mode;
  await execute('playback.stop');
  const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;console.log('PASS native Scene restriction branches and measured selection/query cycles');
} catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally {
  try{report.shutdown=await closeNativeQa(root);if(report.passed&&report.shutdown.normalExit)report.cleanup=removeNativeQaFixture(root,storage);}catch(e){report.shutdownError=e.message;report.passed=false;process.exitCode=1;}
  closeBridgeConnection();write();
}
