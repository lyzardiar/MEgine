// Author: MiYu. Native async import from a file outside the game project, with no catalog entry.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const sourceMap=process.argv[2];assert.ok(sourceMap,'Provide a .w3m/.w3x not installed in the catalog');
const label='arbitrary-map-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:file=>!['SourceAssets','.mengine','Builds'].includes(path.basename(file))&&!path.basename(file).startsWith('user-v')&&!path.basename(file).startsWith('.import-')});
const chosen=path.join(root,'我的地图','任意岛屿'+path.extname(sourceMap));fs.mkdirSync(path.dirname(chosen),{recursive:true});fs.copyFileSync(sourceMap,chosen);
const jobs=path.join(root,'jobs'),config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));config.storageId=label;config.contentImporters['warcraft-map'].args[0]=path.join(repo,'scripts/runtime-import-frost-map.py');config.contentImporters['warcraft-map'].workDirectory=jobs;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
// F8 selects the fixture's external path through the same engine API; the first click exercises the real picker.
fs.appendFileSync(path.join(sample,config.startupScript),`\nvar qaUsePath=false,qaLastImport=null,qaTick=onTick,qaImport=engine.importContent,qaEvent=onContentImport;
engine.importContent=function(id,file){return qaImport(id,qaUsePath?${JSON.stringify(chosen)}:file);};
onContentImport=function(event){qaLastImport={status:event.status,message:event.message,cached:event.content?.cached};qaEvent(event);};
onTick=function(dt){if(engine.input.pressedKeys.includes('F8'))qaUsePath=true;qaTick(dt);const e=engine.findEntitiesByName(['Frost telemetry'])[0];if(e){const value={...e.components.Text,text:JSON.stringify({qaMap:FrostMapSession.status(),qaImport:qaLastImport})};engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:'Text',value}));}};\n`);
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot'),step=(steps=1)=>execute('playback.step',{steps,deltaTime:1/60});
const report={label,sourceMap,passed:false,editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),scriptSha256:hash(fs.readFileSync(path.join(source,config.startupScript))),checks:[]};
const telemetry=s=>JSON.parse(s.entities.find(e=>e.name==='Frost telemetry').components.Text.text);
async function input(args){await execute('playback.input',{keys:[],buttons:[],viewport:[1280,720],...args});await step();}
async function key(key){await input({keys:[key]});await input({});await step(6);}
async function click(name){const pointer=clientWorldFixture(await snapshot()).canvasPoint(name,[1280,720],false);await input({pointer,buttons:[0]});await input({pointer});await step(6);}
async function until(predicate,seconds=120){const start=Date.now();for(;;){await step(6);const s=await snapshot();if(predicate(s))return s;if(Date.now()-start>seconds*1000)throw Error('Native import timed out');await sleep(300);}}
async function capture(name){for(let i=0;;i++)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280});fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));return;}catch(error){if(i>20||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}}
try{
  for(let i=0;;i++)try{await query('project.state');break;}catch(error){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot();await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step(2);
  await click('solo box');await click('custom box');await capture('selection');
  await click('mapOpen box');await until(s=>telemetry(s).qaImport?.status==='choosing',10);await sleep(1000);await click('mapOpen box');await until(s=>!telemetry(s).qaMap.importing,10);assert.equal(telemetry(await snapshot()).qaImport.status,'cancelled');report.checks.push('Native file-picker request and cancellation');
  await key('F8');await click('mapOpen box');await until(s=>telemetry(s).qaImport?.status==='importing',15);await capture('importing');
  // Input remains live while the converter is processing the file.
  await click('map4 box');assert.equal((await snapshot()).entities.find(e=>e.name==='Map name').components.Text.text,'冬落围城');
  let s=await until(s=>{const e=s.entities.find(e=>e.name==='Frost telemetry');if(e){const t=telemetry(s);assert.notEqual(t.qaImport?.status,'failed',t.qaMap.importMessage);return false;}return s.entities.some(e=>e.name==='Map session status');},300);
  report.entities=s.entities.length;assert.ok(s.entities.some(e=>e.name.startsWith('Doodad-'))&&s.entities.some(e=>e.name.startsWith('Unit-')));await capture('loaded');
  const receipts=()=>fs.readdirSync(jobs).map(name=>path.join(jobs,name,'result.json')).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
  const cold=receipts().find(r=>r.cached===false);assert.ok(cold);assert.equal(cold.sourceSha256,hash(fs.readFileSync(sourceMap)));assert.ok(!JSON.parse(fs.readFileSync(path.join(sample,'Assets/Maps/catalog.json'),'utf8')).maps.some(m=>m.id===cold.id));report.map=cold.id;
  await key('Escape');s=await snapshot();assert.equal(s.entities.find(e=>e.name==='Map name').components.Text.text,'任意岛屿');assert.equal(telemetry(s).qaImport.cached,false);
  await click('mapOpen box');await until(s=>!s.entities.some(e=>e.name==='Frost telemetry'),30);assert.ok(receipts().some(r=>r.cached===true));await key('Escape');assert.equal(telemetry(await snapshot()).qaImport.cached,true);
  report.checks.push('Cold conversion of external Unicode-path map absent from catalog','Responsive menu during conversion; original scene loads without Play restart','Return retains selection; second file open uses verified cache');
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
  console.log(JSON.stringify({passed:true,label,entities:report.entities,checks:report.checks}));
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
