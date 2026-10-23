// Author: MiYu. Native original unit placement, animation, model-particle and restoration checks.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.resolve(process.argv[2]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001'),label='original-units-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample');
assert.ok(process.argv[2]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide unit project and MENGINE_EDITOR_EXECUTABLE');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:f=>!f.includes(path.sep+'SourceAssets')});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;},sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot');
const hash=raw=>createHash('sha256').update(raw).digest('hex'),placements=JSON.parse(fs.readFileSync(path.join(source,'unit-placements.json'),'utf8'));
const effectsOnly=process.argv.includes('--effects-only');
const report={source,label,effectsOnly,passed:false,checks:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),scriptSha256:hash(fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'))),frames:[]};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});if(name)fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.frames.push(shot.nativeProfile);return shot.dataUrl;}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
try{
  for(let n=0;;n++)try{await query('project.state');break;}catch(error){if(n>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  const began=performance.now();await execute('project.open',{root:sample});const authored=await snapshot();report.openMs=performance.now()-began;report.entities=authored.entities.length;
  const camera=authored.entities.find(e=>e.name==='Camera');
  if(!effectsOnly){
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});
  const initial=await snapshot(),names=new Map(initial.entities.map(e=>[e.name,e]));
  for(const p of placements.filter(p=>p.rendered)){
    const parent=names.get(p.name);assert.ok(parent,p.name);
    for(const field of ['position','rotation','scale'])for(const [i,value] of p.appearance.transform[field].entries())assert.ok(Math.abs(parent.components.Transform[field][i]-value)<.00001,p.name+'/'+field);
    for(const name of p.parts)assert.equal(names.get(name).parent,parent.entity,name);
    if(p.effect)assert.equal(names.get(p.name+'-effect').parent,parent.entity);
  }
  assert.equal(placements.filter(p=>!p.rendered).every(p=>p.kind==='start-location'),true);
  const overview=await capture('overview');await execute('playback.step',{steps:30,deltaTime:1/60});assert.notDeepEqual((await snapshot()).entities,initial.entities);
  const animated=await capture('animated');assert.notEqual(animated,overview);assert.equal(await capture(),animated);await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);
  report.checks.push('All rendered source transforms, runtime parent IDs, animation, paused pixels and Stop restoration');
  }
  await execute('panel.focus',{kind:'game'});
  const targets=effectsOnly?['nshf']:['ngol','ngst','nggr','nshf'].filter(kind=>placements.some(p=>p.source.id===kind&&p.rendered));report.targets=targets;
  for(const kind of targets){
    const placement=placements.find(p=>p.source.id===kind&&p.rendered);assert.ok(placement,'Expected Amazonia target '+kind);
    const position=placement.appearance.transform.position;
    await execute('component.set',{entity:camera.entity,type:'Transform',value:{...camera.components.Transform,position:[position[0],position[1]+20,position[2]]}});
    await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:kind==='nshf'?1.5:4}});
    async function replay(suffix){await execute('playback.play',{paused:true});await execute('playback.step',{steps:30,deltaTime:1/60});const value=await capture(kind+'-'+suffix);await execute('playback.stop');return value;}
    if(!effectsOnly){
    const visible=await replay('visible'),entity=authored.entities.find(e=>e.name===placement.name);await execute('entity.set_active',{id:entity.entity,active:false});assert.notEqual(await replay('hidden'),visible,kind+' model contributes pixels');await execute('entity.set_active',{id:entity.entity,active:true});
    assert.equal(await replay('restarted'),visible,kind+' fresh playback repeats pixels');
    }
    if(kind==='nshf'){
      const effect=authored.entities.find(e=>e.name===placement.name+'-effect'),asset=JSON.parse(fs.readFileSync(path.join(source,placement.effect),'utf8')),clip=asset.clips.findIndex(c=>c.name.toLowerCase()==='death');assert.ok(clip>=0);
      assert.ok(asset.clips[clip].frames.some(f=>Math.abs(f.seconds-.5)<.001&&f.particles.some(p=>asset.materials[p.material].model)),'Source Death frame contains model particles');
      await execute('component.set',{entity:effect.entity,type:'SampledEffect',value:{...effect.components.SampledEffect,clip,time_seconds:.5}});
      async function sample(suffix){await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});const snapshotValue=await snapshot();assert.equal(snapshotValue.entities.find(e=>e.name===effect.name).components.SampledEffect.time_seconds,.5);const pixels=await capture('nshf-death-feathers-'+suffix);await execute('playback.stop');return pixels;}
      const visible=await sample('visible');await execute('entity.set_active',{id:effect.entity,active:false});assert.notEqual(await sample('hidden'),visible,'Original feather model particles contribute pixels');await execute('entity.set_active',{id:effect.entity,active:true});assert.equal(await sample('restarted'),visible);await execute('component.set',{entity:effect.entity,type:'SampledEffect',value:effect.components.SampledEffect});
    }
  }
  report.checks.push(effectsOnly?'Source Death feather model particles contribute pixels and repeat after fresh Play':'Selected source units contribute pixels and repeat after fresh Play: '+targets.join(', '));
  await execute('scene.open',{name:'Main',discardDirty:true});assert.deepEqual((await snapshot()).entities,authored.entities);
  report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;console.log('PASS native original units',label,report.entities,'entities');
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
