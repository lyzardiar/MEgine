// Author: MiYu. Native batch acceptance for authored doodad hierarchy, animation and emitter scenes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.resolve(process.argv[2]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
const single=process.argv.includes('--single'),effectsOnly=process.argv.includes('--effects-only'),visualOnly=process.argv.includes('--visual-only'),label=process.env.MENGINE_DOODAD_LABEL||'doodads-native';assert.match(label,/^[a-z0-9-]+$/);
assert.ok(!(effectsOnly&&visualOnly),'Choose either --effects-only or --visual-only');
assert.ok(process.argv[2]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide a generated project and MENGINE_EDITOR_EXECUTABLE');
const root=path.join(out,'native-qa',label+'-'+Date.now()),sample=path.join(root,'sample'),hash=raw=>createHash('sha256').update(raw).digest('hex');
configureNativeQa(root);fs.mkdirSync(out,{recursive:true});fs.cpSync(source,sample,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});
const script=path.join(sample,'Assets/Scripts/Main.js');
fs.writeFileSync(script,"if(typeof engine.pushCommandsJson!=='function')throw Error('Native batch API required');\n"+(single?'delete engine.pushCommandsJson;\n':'')+fs.readFileSync(script,'utf8'));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),snapshot=()=>query('scene.snapshot');
const receipt=JSON.parse(fs.readFileSync(path.join(sample,'doodad-scene-sources.json'),'utf8')),placements=JSON.parse(fs.readFileSync(path.join(sample,'doodad-placements.json'),'utf8'));
const report={root,source,label,single,effectsOnly,visualOnly,passed:false,checks:[],frames:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),sourceScriptSha256:hash(fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'))),mapSha256:receipt.mapSha256};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});if(name)fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));return shot;}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
function memory(){
  const discovery=JSON.parse(fs.readFileSync(path.join(root,'discovery/agent-bridge.json'),'utf8'));assert.ok(Number.isSafeInteger(discovery.pid));
  return JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-Command',`Get-Process -Id ${discovery.pid} | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));
}
try{
  console.log('START native doodads',label);
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(error){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  const opened=performance.now();await execute('project.open',{root:sample});const authored=await snapshot();report.openMs=performance.now()-opened;assert.equal(authored.entities.length,receipt.entities);report.idleMemory=memory();
  if(visualOnly){
    await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});await capture('overview');await execute('playback.stop');
    report.checks.push('Original map loads and renders; visual acceptance requires screenshot inspection');
  }
  if(!effectsOnly&&!visualOnly){
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});
  const initial=await snapshot(),names=new Map(initial.entities.map(entity=>[entity.name,entity]));
  for(const placement of placements){
    const parent=names.get(placement.name);assert.ok(parent,placement.name);
    for(const name of placement.parts)assert.equal(names.get(name).parent,parent.entity,name);
    const effect=names.get(placement.name+'-effect');if(effect)assert.equal(effect.parent,parent.entity,effect.name);
  }
  const before=await capture('overview');report.initialProfile=before.nativeProfile;
  await execute('playback.step',{steps:8,deltaTime:1/60});const advanced=await snapshot(),advancedNames=new Map(advanced.entities.map(entity=>[entity.name,entity]));
  const changes=initial.entities.filter(entity=>entity.name.startsWith('Doodad-')&&entity.components.MeshRenderer&&JSON.stringify(entity.components)!==JSON.stringify(advancedNames.get(entity.name).components));
  assert.ok(changes.length>0,'Native animation changes authored doodad components');report.changedParts=changes.length;
  report.effectEntities=advanced.entities.filter(entity=>entity.components.SampledEffect).length;assert.ok(report.effectEntities>0);
  const after=await capture('animated');assert.notEqual(after.dataUrl,before.dataUrl);
  assert.equal((await capture()).dataUrl,after.dataUrl,'Paused emitter and mesh pixels remain stable');
  report.checks.push('All source placements and native parent IDs load; animation components advance; paused pixels remain stable');
  for(let frame=0;frame<8;frame++){await execute('playback.step',{steps:5,deltaTime:1/60});const shot=await capture();assert.ok(Number.isSafeInteger(shot.nativeProfile.worldRevision));report.frames.push(shot.nativeProfile);}
  report.playMemory=memory();
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});assert.equal((await capture('restarted')).dataUrl,before.dataUrl);
  await execute('playback.stop');report.checks.push('Stop restores authored scene; fresh Play reproduces exact pixels');
  }
  const pureEffects=[...new Map(placements.filter(p=>!p.parts.length).map(p=>[p.model,p])).values()];
  const camera=authored.entities.find(entity=>entity.name==='Camera'),targets=(effectsOnly?pureEffects:[placements.find(p=>/Tree/i.test(p.model)),placements.find(p=>/Fish/i.test(p.model)),...pureEffects,placements.find(p=>/Waterfall|Brazier|Fire/i.test(p.model))]).filter(Boolean);
  if(effectsOnly)assert.ok(pureEffects.length>0,'Provide a map with pure emitter placements');
  report.details=[];
  for(const [index,placement] of [...new Map((visualOnly?targets.slice(0,2):targets).map(p=>[p.name,p])).values()].entries()){
    const entity=authored.entities.find(e=>e.name===placement.name),position=entity.components.Transform.position,angle=-.82;
    await execute('component.set',{entity:camera.entity,type:'Transform',value:{...camera.components.Transform,position:[position[0],position[1]+7,position[2]+6.5],rotation:[Math.sin(angle/2),0,0,Math.cos(angle/2)]}});
    await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:5}});
    const steps=placement.parts.length?18:120;
    await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps,deltaTime:1/60});const visible=await capture('detail-'+index);await execute('playback.stop');
    if(!placement.parts.length){
      const effect=authored.entities.find(e=>e.name===placement.name+'-effect');assert.ok(effect?.active);
      await execute('entity.set_active',{id:effect.entity,active:false});await execute('playback.play',{paused:true});await execute('playback.step',{steps,deltaTime:1/60});const hidden=await capture('detail-'+index+'-without-emitter');await execute('playback.stop');
      assert.notEqual(hidden.dataUrl,visible.dataUrl,'Pure emitter must contribute visible pixels: '+placement.model);await execute('entity.set_active',{id:effect.entity,active:true});
      report.checks.push('Pure emitter changes native pixels: '+placement.model);
    }
    report.details.push({index,name:placement.name,model:placement.model});
  }
  await execute('component.set',{entity:camera.entity,type:'Transform',value:camera.components.Transform});await execute('component.set',{entity:camera.entity,type:'Camera3D',value:camera.components.Camera3D});assert.deepEqual((await snapshot()).entities,authored.entities);
  const logs=await query('console.get_logs',{limit:300});report.errors=logs.filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.passed=true;console.log('PASS native doodads',placements.length,'placements',receipt.entities,'entities',visualOnly?'visual smoke capture':effectsOnly?'pure emitter pixel checks':`${report.changedParts} animated parts, ${report.effectEntities} emitters`);
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);try{report.failureLogs=await query('console.get_logs',{limit:100});}catch{}}
finally{try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
