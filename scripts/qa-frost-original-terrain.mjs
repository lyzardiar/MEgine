// Author: MiYu. Validate original-sized map chunks in an isolated native Editor.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.resolve(process.argv[2]||''),out=path.join(repo,'tmp/docs-artifacts/frost-original-terrain');
assert.ok(process.argv[2]&&fs.existsSync(path.join(source,'terrain-sources.json')),'Provide the generated terrain project');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Provide MENGINE_EDITOR_EXECUTABLE');
const label=process.env.MENGINE_TERRAIN_LABEL||'native-terrain';assert.match(label,/^[a-z0-9-]+$/);
const root=path.join(nativeQaRoot,label+'-'+Date.now()),sample=path.join(root,'sample');configureNativeQa(root);fs.mkdirSync(out,{recursive:true});
fs.cpSync(source,sample,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={root,source,label,passed:false,checks:[],editorSha256:createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex')};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));return shot;}
  catch(e){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(e.message))throw e;await sleep(500);}
}
try{
  console.log('START native original terrain',label);
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(e){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(e.message))throw e;await sleep(500);}
  const receipt=JSON.parse(fs.readFileSync(path.join(sample,'terrain-sources.json'),'utf8'));
  await execute('project.open',{root:sample});const authored=await query('scene.snapshot');assert.equal(authored.entities.length,receipt.entities);
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});
  const before=await capture('overview');report.profile=before.nativeProfile;
  const water=s=>s.entities.filter(e=>e.name.startsWith('Water-')).map(e=>e.components.MaterialPropertyBlock?.custom_parameter_values?.[0]?.[0]??0);
  const initial=await query('scene.snapshot');assert.ok(water(initial).length>0);assert.ok(water(initial).every(value=>value===0));
  await execute('playback.step',{steps:8,deltaTime:1/60});const advanced=await query('scene.snapshot');report.waterFrames={initial:water(initial),advanced:water(advanced)};assert.ok(water(advanced).every(value=>value===2),JSON.stringify(report.waterFrames));
  const after=await capture('animated');assert.notEqual(after.dataUrl,before.dataUrl,'Source water frames affect rendered pixels');
  report.checks.push('original-sized terrain and all source mesh chunks load; 15 FPS water animation changes pixels');
  report.frames=[];
  for(let frame=0;frame<6;frame++){await execute('playback.step',{steps:1,deltaTime:1/60});const shot=await capture('profile');report.frames.push(shot.nativeProfile);}
  await execute('playback.stop');assert.deepEqual((await query('scene.snapshot')).entities,authored.entities);
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});const reopened=await capture('restarted');assert.equal(reopened.dataUrl,before.dataUrl,'Fresh Play reproduces exact original terrain pixels');
  report.checks.push('Stop restores authored scene; fresh Play reproduces exact pixels');
  await execute('playback.stop');
  const layout=JSON.parse(fs.readFileSync(path.join(sample,'terrain-layout.json'),'utf8'));
  const sourceMap=JSON.parse(fs.readFileSync(path.join(receipt.sourceExport,'map.json'),'utf8')),origin=sourceMap.terrain.origin;
  const center=sourceMap.terrain.tileSize.map(size=>size/2),distance=p=>(p.cell[0]-center[0])**2+(p.cell[1]-center[1])**2;
  const placement=layout.cliffs.find(p=>p.model.includes('Trans'))||layout.cliffs.reduce((best,p)=>distance(p)<distance(best)?p:best);
  const camera=authored.entities.find(e=>e.name==='Camera'),angle=-.82,target=[origin[0]/128+placement.cell[0]+.5,placement.baseLayer-2,-origin[1]/128-placement.cell[1]-.5];
  await execute('component.set',{entity:camera.entity,type:'Transform',value:{...camera.components.Transform,position:[target[0],target[1]+12,target[2]+11],rotation:[Math.sin(angle/2),0,0,Math.cos(angle/2)]}});
  await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:7}});
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});await capture('cliff-detail');await execute('playback.stop');
  await execute('component.set',{entity:camera.entity,type:'Transform',value:camera.components.Transform});await execute('component.set',{entity:camera.entity,type:'Camera3D',value:camera.components.Camera3D});
  assert.deepEqual((await query('scene.snapshot')).entities,authored.entities);report.checks.push('Oblique source cliff and ramp inspection; camera edits restore exactly');
  const logs=await query('console.get_logs',{limit:300});report.errors=logs.filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.passed=true;console.log('PASS native original terrain',receipt.entities,'entities',receipt.meshes.length,'meshes');
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);try{report.failureLogs=await query('console.get_logs',{limit:100});}catch{}}finally{
  try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(e){report.cleanupError=e.message;}
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
}
