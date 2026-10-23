// Author: MiYu. Verify the combined original terrain, doodad and unit scene in one native playback.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.resolve(process.argv[2]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.argv[2]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide combined map project and MENGINE_EDITOR_EXECUTABLE');
const read=file=>JSON.parse(fs.readFileSync(path.join(source,file),'utf8'));
const units=read('unit-placements.json'),doodads=read('doodad-placements.json'),terrain=read('terrain-sources.json');
assert.ok(units.some(p=>p.rendered)&&doodads.length,'Expected both source placement layers');
const label='original-map-composition-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={source,label,passed:false,mapSha256:terrain.mapSha256,editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),scriptSha256:hash(fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'))),checks:[],frames:[]};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});if(name)fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.frames.push(shot.nativeProfile);return shot.dataUrl;}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
try{
  for(let n=0;;n++)try{await query('project.state');break;}catch(error){if(n>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  const began=performance.now();await execute('project.open',{root:sample});const authored=await snapshot();report.openMs=performance.now()-began;
  const names=new Map(authored.entities.map(e=>[e.name,e]));assert.equal(names.size,authored.entities.length,'Unique names across combined layers');
  for(const placement of [...doodads,...units.filter(p=>p.rendered)]){
    const parent=names.get(placement.name);assert.ok(parent,placement.name);
    for(const name of placement.parts)assert.equal(names.get(name)?.parent,parent.entity,name);
  }
  report.entities=authored.entities.length;report.doodads=doodads.length;report.units=units.filter(p=>p.rendered).length;
  report.checks.push('Combined placement names and parent references');
  await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});
  await execute('playback.step',{steps:1,deltaTime:1/60});const initial=await snapshot();await capture('overview');
  await execute('playback.step',{steps:30,deltaTime:1/60});const animated=await snapshot(),previous=new Map(initial.entities.map(e=>[e.name,e]));
  const changed=animated.entities.filter(e=>JSON.stringify(e.components)!==JSON.stringify(previous.get(e.name)?.components));
  report.changed={doodads:changed.filter(e=>e.name.startsWith('Doodad-')).length,units:changed.filter(e=>e.name.startsWith('Unit-')).length,terrain:changed.filter(e=>!e.name.startsWith('Doodad-')&&!e.name.startsWith('Unit-')).length};
  for(const [layer,count] of Object.entries(report.changed))assert.ok(count>0,layer+' animation advances in combined callback');
  const pixels=await capture('animated');assert.equal(await capture(),pixels,'Paused combined pixels remain stable');
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities,'Stop restores all layers');
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:31,deltaTime:1/60});
  assert.deepEqual((await snapshot()).entities,animated.entities,'Fresh playback reproduces all layer states');
  assert.equal(await capture(),pixels,'Fresh playback reproduces combined pixels');await execute('playback.stop');
  report.checks.push('Terrain, doodad and unit animation together; pause, Stop and deterministic restart');
  const camera=authored.entities.find(e=>e.name==='Camera'),mine=units.find(p=>p.rendered&&p.source.id==='ngol');assert.ok(camera&&mine);
  const p=mine.appearance.transform.position;
  await execute('component.set',{entity:camera.entity,type:'Transform',value:{...camera.components.Transform,position:[p[0],p[1]+20,p[2]]}});
  await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:16}});
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:31,deltaTime:1/60});await capture('goldmine-surroundings');await execute('playback.stop');
  await execute('scene.open',{name:'Main',discardDirty:true});assert.deepEqual((await snapshot()).entities,authored.entities);
  report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.passed=true;console.log(JSON.stringify({passed:true,label,entities:report.entities,doodads:report.doodads,units:report.units,changed:report.changed}));
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
