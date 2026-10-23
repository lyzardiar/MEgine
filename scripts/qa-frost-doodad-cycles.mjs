// Author: MiYu. Verify completion checkpoints against MSVCR120 fixture expectations in the native editor.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.resolve(process.argv[2]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.argv[2]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide test-frost-doodad-stand.py --cycles project and MENGINE_EDITOR_EXECUTABLE');
const expected=JSON.parse(fs.readFileSync(path.join(source,'../result.json'),'utf8'));
assert.equal(expected.checked.length,26);assert.equal(expected.checkpoints.length,6);
const script=fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'),'utf8');
const value=name=>JSON.parse(script.split('var '+name+'=')[1].split(';\n')[0]);
const definitions=value('originalDoodadDefinitions'),actors=value('originalDoodadActors');
const placements=JSON.parse(fs.readFileSync(path.join(source,'doodad-placements.json'),'utf8'));
const label='doodad-cycles-'+Date.now(),root=path.join(out,'native-qa',label),sample=path.join(root,'sample'),hash=raw=>createHash('sha256').update(raw).digest('hex');
configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),snapshot=()=>query('scene.snapshot');
const report={source,label,passed:false,checks:[],checkpoints:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),scriptSha256:hash(script)};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const r=await query('view.screenshot',{target:'game',maxSize:1280});fs.writeFileSync(path.join(out,label+'-'+name+'.png'),Buffer.from(r.dataUrl.split(',')[1],'base64'));return r.dataUrl;}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
function check(scene,checkpoint){
  const names=new Map(scene.entities.map(e=>[e.name,e]));
  for(const [index,p] of placements.entries()){
    const state=checkpoint.states[index],actor=actors.find(a=>a.parts[0]===p.parts[0]&&a.parts.length);
    if(actor){
      const clip=definitions[actor.definition].clips[state.clip];
      for(const [i,name] of actor.parts.entries()){
        const part=clip.parts[i],frame=Math.min(part.frames-1,Math.floor(state.timeMs*.012)),entity=names.get(name),color=part.states[frame].color;
        assert.equal(entity.components.MeshRenderer.mesh,part.mesh+'#pose='+state.clip+':'+(part.moving?frame:0),name);
        assert.equal(entity.components.MeshRenderer.material,part.states[frame].material,name);
        assert.ok(entity.components.MaterialPropertyBlock.base_color.every((v,i)=>Math.abs(v-color[i])<1e-6),name);
        assert.equal(entity.active,color[3]>.001,name);
      }
    }
    const effect=names.get(p.name+'-effect')?.components.SampledEffect;
    if(effect){assert.equal(effect.clip,state.clip,p.name);assert.ok(Math.abs(effect.time_seconds-state.timeMs/1000)<1e-6,p.name);assert.equal(effect.playing,false);assert.equal(effect.looping,false);}
  }
}
try{
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(error){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await snapshot(),names=new Map(authored.entities.map(e=>[e.name,e])),camera=names.get('Camera'),angle=-.82;
  async function focus(p){const position=names.get(p.name).components.Transform.position;await execute('component.set',{entity:camera.entity,type:'Transform',value:{...camera.components.Transform,position:[position[0],position[1]+7,position[2]+6.5],rotation:[Math.sin(angle/2),0,0,Math.cos(angle/2)]}});await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:5}});}
  await focus(placements[16]);await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});
  for(const [index,checkpoint] of expected.checkpoints.entries()){
    await execute('playback.step',{steps:checkpoint.steps,deltaTime:checkpoint.deltaMs/1000});check(await snapshot(),checkpoint);report.checkpoints.push(index);
  }
  const paused=await capture('boat-cycles');assert.equal(await capture('boat-paused'),paused);await execute('playback.stop');
  report.checks.push('Six checkpoints match independent C RNG continuation for 24 actors and two fixed emitters, including clip, pose, material, color and shared effect time');
  for(const index of [24,25]){
    const placement=placements[index],effect=names.get(placement.name+'-effect');await focus(placement);
    async function replay(suffix){await execute('playback.play',{paused:true});await execute('playback.step',{steps:42,deltaTime:.25});const scene=await snapshot();assert.equal(scene.entities.find(e=>e.name===effect.name).components.SampledEffect.time_seconds,2);const pixels=await capture('effect-'+index+'-'+suffix);await execute('playback.stop');return pixels;}
    const visible=await replay('visible');await execute('entity.set_active',{id:effect.entity,active:false});const hidden=await replay('hidden');assert.notEqual(visible,hidden,'Pure emitter renders after cycle restart');await execute('entity.set_active',{id:effect.entity,active:true});
    report.checks.push('Pure emitter contributes pixels after restart: '+placement.model);
  }
  await execute('playback.play',{paused:true});const first=expected.checkpoints[0];await execute('playback.step',{steps:first.steps,deltaTime:first.deltaMs/1000});check(await snapshot(),first);await execute('playback.stop');
  await execute('component.set',{entity:camera.entity,type:'Transform',value:camera.components.Transform});await execute('component.set',{entity:camera.entity,type:'Camera3D',value:camera.components.Camera3D});assert.deepEqual((await snapshot()).entities,authored.entities);
  report.errors=(await query('console.get_logs',{limit:300})).filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.checks.push('Pause pixels freeze, fresh Play resets RNG/clocks, Stop restores scene, console has zero errors');report.passed=true;console.log('PASS native doodad cycles',label);
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
