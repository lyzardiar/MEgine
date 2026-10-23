// Author: MiYu. Native mip isolation and real-map shader acceptance without an engine rebuild.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),fixture=path.resolve(process.argv[2]||''),map=path.resolve(process.argv[3]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.argv[2]&&process.argv[3]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide atlas fixture, regenerated map project and MENGINE_EDITOR_EXECUTABLE');
const label='terrain-atlas-'+Date.now(),root=path.join(out,'native-qa',label),reportPath=path.join(out,label+'.json'),hash=raw=>createHash('sha256').update(raw).digest('hex');
configureNativeQa(root);
const samples=[fixture,map].map((source,index)=>{const target=path.join(root,'sample-'+index);fs.cpSync(source,target,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});return target;});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={fixture,map,label,passed:false,shots:[],checks:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),shaderSha256:hash(fs.readFileSync(path.join(map,'Assets/Shaders/Ground.mshader')))};
const reuseIndex=process.argv.indexOf('--atlas-report'),reuse=reuseIndex<0?null:path.resolve(process.argv[reuseIndex+1]);
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});const file=path.join(out,label+'-'+name+'.png');fs.writeFileSync(file,Buffer.from(shot.dataUrl.split(',')[1],'base64'));return {path:file,pixels:shot.dataUrl,profile:shot.nativeProfile};}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
try{
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(error){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  if(reuse){
    const prior=JSON.parse(fs.readFileSync(reuse,'utf8'));assert.equal(prior.fixture,fixture);assert.equal(prior.shaderSha256,report.shaderSha256);assert.equal(prior.editorSha256,report.editorSha256);assert.equal(prior.shots.length,9);
    report.shots=prior.shots;report.reusedAtlasReport=reuse;
  }else{
  await execute('project.open',{root:samples[0]});const authored=await query('scene.snapshot'),tiles=authored.entities.find(e=>e.name==='Tiles');
  for(const mode of ['fixed','legacy']){
    await execute('component.set',{entity:tiles.entity,type:'MeshRenderer',value:{mesh:'Assets/Models/'+mode+'.glb',material:'Assets/Materials/'+mode+'.mmat'}});
    for(const lod of mode==='fixed'?[0,2.5,3,4,5.5,6,8]:[3,6]){
      await execute('component.set',{entity:tiles.entity,type:'MaterialPropertyBlock',value:{custom_parameter_names:['test_lod'],custom_parameter_values:[[lod,0,0,0]]}});
      await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});const shot=await capture(mode+'-'+lod);report.shots.push({mode,lod,path:shot.path});await execute('playback.stop');
    }
  }
  report.fixtureErrors=(await query('console.get_logs',{limit:200})).filter(log=>log.level==='error');assert.equal(report.fixtureErrors.length,0,JSON.stringify(report.fixtureErrors));
  await execute('scene.open',{name:'Main',discardDirty:true});
  }
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  report.pixelOutput=execFileSync('python',[path.join(repo,'scripts/test-frost-terrain-atlas.py'),'--verify-native',reportPath],{encoding:'utf8',windowsHide:true});
  report.pixelChecks=JSON.parse(fs.readFileSync(reportPath,'utf8')).pixelChecks;report.checks.push('All six atlas tiles keep their own channels at seven LODs; legacy mip path reproduces contamination');
  await execute('project.open',{root:samples[1]});const mapAuthored=await query('scene.snapshot'),camera=mapAuthored.entities.find(e=>e.name==='Camera');
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});const before=await capture('map-overview');report.mapProfile=before.profile;await execute('playback.stop');
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});assert.equal((await capture('map-restarted')).pixels,before.pixels);await execute('playback.stop');
  await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:6}});
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});await capture('map-near');await execute('playback.stop');
  await execute('component.set',{entity:camera.entity,type:'Camera3D',value:camera.components.Camera3D});assert.deepEqual((await query('scene.snapshot')).entities,mapAuthored.entities);
  report.errors=(await query('console.get_logs',{limit:300})).filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.checks.push('Original Amazonia ground shader loads at overview and near distance; fresh Play reproduces pixels and Stop restores scene');report.passed=true;console.log('PASS native terrain atlas',label,report.pixelOutput);
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(reportPath,JSON.stringify(report,null,2));}
