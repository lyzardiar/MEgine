// Author: MiYu. Verify authored material, instance and shader refresh through the native Scene consumer.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');
const label='resource-poll-'+Date.now(),root=path.join(out,'native-qa',label),project=path.join(root,'sample');configureNativeQa(root);
for(const folder of ['Assets/Scenes','Assets/Scripts'])fs.mkdirSync(path.join(project,folder),{recursive:true});
const write=(name,value)=>{const target=path.join(project,name),staged=target+'.qa-new';fs.writeFileSync(staged,typeof value==='string'?value:JSON.stringify(value));fs.renameSync(staged,target);};
write('project.json',{name:label,storageId:label,version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js'});
write('Assets/Scripts/Main.js','function onTick() {}');
write('Assets/Scenes/Main.mscene',{version:1,name:'Main',world:{entities:[{entity:1,name:'Polled material',components:{Transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},MeshRenderer:{mesh:'cube',material:'Assets/Child.minst'}}}]}});
const material=color=>({version:10,shader:'custom',custom_shader:'Assets/Surface.mshader',base_color:color});
const instance=overrides=>({version:2,parent:'Assets/Base.mmat',overrides:{roughness:.2,...overrides}});
const hook=body=>`fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { ${body} }`;
write('Assets/Base.mmat',material([1,0,0,1]));write('Assets/Child.minst',instance({}));write('Assets/Surface.mshader',hook('return color;'));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config')});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const result=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(result.ok,JSON.stringify(result));return result.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={label,passed:false,editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),checks:[],transitions:[]};
async function pixels(){
  const deadline=Date.now()+20000;
  for(;;)try{const shot=await query('view.screenshot',{target:'scene',maxSize:1280});return Buffer.from(shot.dataUrl.split(',')[1],'base64');}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(150);}
}
async function waitPixels(name,predicate){
  const started=Date.now();let attempts=0;
  for(;;){
    const bytes=await pixels(),value=hash(bytes);attempts++;
    if(predicate(value)){fs.writeFileSync(path.join(out,label+'-'+name+'.png'),bytes);report.transitions.push({name,elapsedMs:Date.now()-started,attempts,sha256:value});return value;}
    assert.ok(Date.now()-started<10000,name+' must reach expected native pixels');await sleep(100);
  }
}
try{
  await query('project.state');await execute('project.open',{root:project});await execute('panel.focus',{kind:'scene'});await execute('view.set_camera',{pivot:[0,0,0],yaw:0,pitch:0,distance:5});
  let previous,stable=0;const red=await waitPixels('red',value=>{stable=value===previous?stable+1:0;previous=value;return stable>=2;});
  write('Assets/Base.mmat',material([0,0,1,1]));const blue=await waitPixels('blue',value=>value!==red);
  write('Assets/Base.mmat',material([1,0,0,1]));await waitPixels('red-restored',value=>value===red);
  write('Assets/Base.mmat',material([0,0,1,1]));await waitPixels('blue-restored',value=>value===blue);
  report.checks.push('Parent material edits reach native pixels through an unchanged material instance and restore exact images');
  write('Assets/Child.minst',instance({base_color:[1,0,0,1]}));await waitPixels('instance-red',value=>value===red);
  write('Assets/Child.minst',instance({}));await waitPixels('instance-restored',value=>value===blue);
  report.checks.push('Instance override edits and removal refresh native pixels without component changes');
  write('Assets/Surface.mshader',hook('return vec4<f32>(0.0,1.0,0.0,color.a);'));await waitPixels('shader-green',value=>value!==red&&value!==blue);
  write('Assets/Surface.mshader',hook('return color;'));await waitPixels('shader-restored',value=>value===blue);
  report.checks.push('Custom surface shader edits and restoration reach the current native material consumer');
  fs.unlinkSync(path.join(project,'Assets/Base.mmat'));await waitPixels('missing-parent',value=>value!==blue);
  write('Assets/Base.mmat',material([0,0,1,1]));await waitPixels('parent-recovered',value=>value===blue);
  report.checks.push('A deleted parent produces visible failure and recreating it restores exact native pixels');
  report.errors=(await query('console.get_logs',{limit:1000})).filter(entry=>entry.level==='error');
  assert.ok(report.errors.every(entry=>JSON.stringify(entry).includes('Base.mmat')),'Only the intentionally deleted parent may report an error');
  report.profile=await query('profiler.get_samples',{source:'scene',limit:24,includeNativeTimings:true});assert.ok(report.profile.nativeLatest.counts.cameraVisibleObjects>0);
  report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label,passed:report.passed,normalExit:report.cleanup?.normalExit,error:report.error,cleanupError:report.cleanupError}));}
