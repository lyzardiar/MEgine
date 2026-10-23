// Author: MiYu. Native acceptance for weighted Stand variants in the source-derived small fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.resolve(process.argv[2]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.argv[2]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide the Stand fixture and MENGINE_EDITOR_EXECUTABLE');
const expected=JSON.parse(fs.readFileSync(path.join(source,'../result.json'),'utf8')).checked;
assert.equal(expected.length,24,'Use the fixture from test-frost-doodad-stand.py');
const label='doodad-stand-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),snapshot=()=>query('scene.snapshot'),hash=raw=>createHash('sha256').update(raw).digest('hex');
const placements=JSON.parse(fs.readFileSync(path.join(source,'doodad-placements.json'),'utf8'));
const report={source,label,passed:false,checks:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE))};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const r=await query('view.screenshot',{target:'game',maxSize:1280});fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(r.dataUrl.split(',')[1],'base64'));return r.dataUrl;}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
try{
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(error){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot(),names=new Map(authored.entities.map(e=>[e.name,e]));
  const camera=names.get('Camera'),angle=-.82;
  async function focus(placement){
    const p=names.get(placement.name).components.Transform.position;
    await execute('component.set',{entity:camera.entity,type:'Transform',value:{...camera.components.Transform,position:[p[0],p[1]+8,p[2]+7.5],rotation:[Math.sin(angle/2),0,0,Math.cos(angle/2)]}});
    await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:4}});
  }
  for(const placement of placements)for(const name of placement.parts)assert.ok(names.get(name).components.MeshRenderer.mesh.endsWith('#pose='+placement.animation.clip+':0'));
  const normal=names.get(placements[0].name),alternate=names.get(placements[2].name);
  assert.notEqual(placements[0].animation.clip,placements[2].animation.clip);
  await focus(placements[0]);
  await execute('component.set',{entity:alternate.entity,type:'Transform',value:normal.components.Transform});
  await execute('entity.set_active',{id:alternate.entity,active:false});
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});const ordinaryPixels=await capture('grave-normal');await execute('playback.stop');
  await execute('entity.set_active',{id:normal.entity,active:false});
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});assert.notEqual(hash(await capture('grave-hidden')),hash(ordinaryPixels),'Grave contributes pixels');await execute('playback.stop');
  await execute('entity.set_active',{id:alternate.entity,active:true});
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});assert.equal(hash(await capture('grave-alternate')),hash(ordinaryPixels),'Source Grave clips have identical static geometry');await execute('playback.stop');
  await execute('entity.set_active',{id:normal.entity,active:normal.active});await execute('entity.set_active',{id:alternate.entity,active:alternate.active});
  await execute('component.set',{entity:alternate.entity,type:'Transform',value:alternate.components.Transform});
  report.checks.push('All 24 placements preserve selected clip; both static Grave variants render identically and hiding the parent removes pixels');
  await focus(placements[16]);await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});const before=await snapshot(),initial=await capture('boat-initial');
  await execute('playback.step',{steps:15,deltaTime:1/60});const advanced=await snapshot(),pixels=await capture('boat-advanced');
  for(const index of [8,9,16])for(const name of placements[index].parts){
    const a=before.entities.find(e=>e.name===name).components.MeshRenderer.mesh,b=advanced.entities.find(e=>e.name===name).components.MeshRenderer.mesh;
    assert.notEqual(a,b);assert.ok(b.includes('#pose='+placements[index].animation.clip+':'));
  }
  assert.notEqual(hash(initial),hash(pixels),'Boat pixels animate');assert.equal(hash(await capture('boat-paused')),hash(pixels),'Pause freezes pixels');await execute('playback.stop');
  report.checks.push('Both selected Fish clips and Rowboat advance without changing selected variant; boat pixels animate and pause is stable');
  await execute('component.set',{entity:camera.entity,type:'Transform',value:camera.components.Transform});await execute('component.set',{entity:camera.entity,type:'Camera3D',value:camera.components.Camera3D});
  assert.deepEqual((await snapshot()).entities,authored.entities);
  report.errors=(await query('console.get_logs',{limit:300})).filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.passed=true;console.log('PASS native doodad Stand',label);
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
