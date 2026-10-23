// Author: MiYu. Exercise real detached-panel selection against an isolated Amazonia editing scene.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const label='selection-sync-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample');
configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:file=>!['SourceAssets','.mengine','Builds'].includes(path.basename(file))});
const config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));
config.storageId=label;config.mainScene='Assets/Maps/amazonia/Scenes/Main.mscene';config.startupScript='Assets/Scripts/qa-selection.js';
config.buildScenes=[config.mainScene,...config.buildScenes.filter(scene=>scene!==config.mainScene)];
fs.writeFileSync(path.join(sample,config.startupScript),'function onTick() {}\n');fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const response=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(response.ok,JSON.stringify(response));return response.data;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),snapshot=()=>query('scene.snapshot'),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={label,passed:false,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),sourceSceneSha256:hash(path.join(source,config.mainScene)),checks:[],actions:[]};
const ui=windowLabel=>query('window.ui_snapshot',{windowLabel,maxElements:5000});
async function waitFor(description,read){const deadline=Date.now()+20000;for(;;){const result=await read();if(result)return result;assert.ok(Date.now()<deadline,description);await sleep(150);}}
async function element(windowLabel,name){return waitFor(windowLabel+' missing '+name,async()=>{const page=await ui(windowLabel),item=page.elements.find(e=>e.name===name);return item?{page,item}:null;});}
async function action(windowLabel,name,command,args={}){const {page,item}=await element(windowLabel,name);return execute(command,{windowLabel,selector:item.selector,expectedSnapshotRevision:page.snapshotRevision,...args});}
async function select(windowLabel,entity,ctrlKey=false){
  await action(windowLabel,'Search hierarchy','window.ui_set_value',{value:entity.name});
  const started=performance.now();await action(windowLabel,entity.name,'window.ui_click',{ctrlKey});
  report.actions.push({windowLabel,entity:entity.entity,ctrlKey,agentActionMs:performance.now()-started});
}
async function expectSelection(ids){await waitFor('main selection '+ids,async()=>JSON.stringify((await query('selection.get')).selectedIds)===JSON.stringify(ids));}
async function expectInspector(name){await waitFor('Inspector selection '+name,async()=>(await ui('panel-inspector')).elements.some(e=>e.name==='GameObject name'&&e.value===name));}
try{
  for(let i=0;;i++)try{await query('project.state');break;}catch(error){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot();report.entities=authored.entities.length;
  const candidates=authored.entities.filter(e=>e.name.startsWith('Doodad-')&&e.parent==null),[first,second]=candidates;assert.ok(first&&second);
  const originalState=await query('editor.state');report.sceneName=originalState.sceneName;
  await execute('panel.detach',{kind:'inspector'});await execute('panel.focus',{kind:'hierarchy'});
  await select('main',first);await expectSelection([first.entity]);await expectInspector(first.name);
  report.checks.push('Main hierarchy click reaches detached Inspector');
  await execute('panel.detach',{kind:'hierarchy'});
  for(const target of [second,first,second]){await select('panel-hierarchy',target);await expectSelection([target.entity]);await expectInspector(target.name);}
  await select('panel-hierarchy',first,true);await expectSelection([second.entity,first.entity]);
  await select('panel-hierarchy',second,true);await expectSelection([first.entity]);await expectInspector(first.name);
  await select('panel-hierarchy',first,true);await expectSelection([]);
  await action('main','Enter Play Mode','window.ui_press_key',{key:'ArrowDown'});
  const navigated=await waitFor('main keyboard selection',async()=>{const value=await query('selection.get');return value.selected!=null?value:null;});
  await expectInspector(authored.entities.find(e=>e.entity===navigated.selected).name);
  assert.deepEqual((await snapshot()).entities,authored.entities);assert.equal((await query('editor.state')).dirty,originalState.dirty);
  report.checks.push('Three windows: detached single/multiple/clear selections and main keyboard selection preserve scene content and dirty state');
  await select('panel-hierarchy',first);await expectInspector(first.name);
  const renamed=first.name+' QA rename';report.renameAction=await action('panel-inspector','GameObject name','window.ui_set_value',{value:renamed});
  await action('panel-inspector','GameObject name','window.ui_press_key',{key:'Enter'});
  await waitFor('detached name edit',async()=>(await query('entity.get',{id:first.entity})).name===renamed);
  assert.equal((await query('editor.state')).dirty,true);await select('panel-hierarchy',second);await expectInspector(second.name);assert.equal((await query('editor.state')).dirty,true);
  await action('panel-inspector','Lock Inspector','window.ui_press_key',{key:'z',ctrlKey:true});await waitFor('name undo in its editing window',async()=>(await query('entity.get',{id:first.entity})).name===first.name);
  await select('panel-hierarchy',first);await expectInspector(first.name);
  assert.deepEqual((await snapshot()).entities,authored.entities);
  report.checks.push('Detached content edit, selection while dirty and undo in the editing window synchronize');
  await execute('scene.open',{name:originalState.sceneName,discardDirty:true});await select('panel-hierarchy',second);await expectSelection([second.entity]);await expectInspector(second.name);
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:2,deltaTime:1/60});await execute('playback.stop');
  assert.deepEqual((await snapshot()).entities,authored.entities);await select('panel-hierarchy',first);await expectSelection([first.entity]);await expectInspector(first.name);
  await execute('panel.dock',{kind:'hierarchy'});await execute('panel.detach',{kind:'hierarchy'});await select('panel-hierarchy',second);await expectSelection([second.entity]);await expectInspector(second.name);
  report.checks.push('Same-name scene reload, paused Play/Step/Stop restoration and reopened Hierarchy retain synchronization');
  report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  assert.equal(hash(path.join(source,config.mainScene)),report.sourceSceneSha256);report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;try{report.windows=await query('window.list');report.selection=await query('selection.get');report.lastUi=await Promise.all(['main','panel-hierarchy','panel-inspector'].map(windowLabel=>ui(windowLabel)));}catch(diagnostic){report.diagnosticError=diagnostic.message;}console.error(error.stack);}
finally{
  try{await execute('playback.stop');await execute('scene.open',{name:report.sceneName??'Main',discardDirty:true});for(const kind of ['hierarchy','inspector'])await execute('panel.dock',{kind});}catch(error){report.restoreError=error.message;}
  closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,passed:report.passed,checks:report.checks,error:report.error}));
}
