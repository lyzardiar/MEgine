// Author: MiYu. Verify production bundle counters and their semantic Profiler readout in a small owned native fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { configureNativeQa, closeNativeQa } from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const label='profiler-bundles-'+Date.now(),root=path.join(out,'native-qa',label),project=path.join(root,'sample');configureNativeQa(root);
for(const directory of ['Assets/Scenes','Assets/Scripts'])fs.mkdirSync(path.join(project,directory),{recursive:true});
fs.writeFileSync(path.join(project,'project.json'),JSON.stringify({name:label,storageId:label,version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js'}));
fs.writeFileSync(path.join(project,'Assets/Scripts/Main.js'),'function onTick() {}');
const entities=Array.from({length:128},(_,i)=>({entity:i+1,name:'Cube '+i,components:{Transform:{position:[i%16*.2-1.5,Math.floor(i/16)*.2-.7,0],rotation:[0,0,0,1],scale:[.1,.1,.1]},MeshRenderer:{mesh:'cube',material:'default'}}}));
fs.writeFileSync(path.join(project,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Main',world:{entities}}));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config')});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={label,passed:false,editorSha256:createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex')};
try{
  await query('project.state');await execute('project.open',{root:project});await execute('panel.focus',{kind:'scene'});await execute('view.set_camera',{pivot:[0,0,0],yaw:0,pitch:0,distance:5});
  const deadline=Date.now()+30000;
  for(;;){const p=await query('profiler.get_samples',{source:'scene',limit:24,includeNativeTimings:true});if(p.nativeLatest?.counts.worldBundleHits===1&&p.nativeProfileCount>=3){report.profile=p;break;}assert.ok(Date.now()<deadline,'Native fixture must reuse one world bundle');await sleep(200);}
  await execute('panel.focus',{kind:'profiler'});await sleep(500);
  let page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});const scene=page.elements.find(e=>e.selector?.includes('profiler-source-tab-scene'));assert.ok(scene);await execute('window.ui_click',{windowLabel:'main',selector:scene.selector,expectedSnapshotRevision:page.snapshotRevision});await sleep(300);
  page=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});const overview=page.elements.find(e=>e.name==='Overview'&&e.role==='tab');assert.ok(overview);await execute('window.ui_click',{windowLabel:'main',selector:overview.selector,expectedSnapshotRevision:page.snapshotRevision});await sleep(500);
  report.ui=await query('window.ui_snapshot',{windowLabel:'main',maxElements:5000});
  for(const name of ['World Bundle Builds: 0','World Bundle Hits: 1'])assert.ok(report.ui.elements.some(e=>e.role==='group'&&e.name===name),name+' must be exposed with its current value');
  const shot=await query('view.window_screenshot',{windowLabel:'main',maxSize:1920});fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
  report.errors=(await query('console.get_logs',{limit:100})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;try{const shot=await query('view.window_screenshot',{windowLabel:'main',maxSize:1920});fs.writeFileSync(path.join(out,label+'-failure.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}catch{}}
finally{closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,passed:report.passed,normalExit:report.cleanup?.normalExit,error:report.error,cleanupError:report.cleanupError}));}
