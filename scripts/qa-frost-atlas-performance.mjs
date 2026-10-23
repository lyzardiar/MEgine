// Author: MiYu. Alternate legacy and isolated atlas sampling in one native editor and one terrain scene.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),before=path.resolve(process.argv[2]||''),after=path.resolve(process.argv[3]||''),kind=process.argv[4]||'Ground';
assert.ok(process.argv[2]&&process.argv[3]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide before/after terrain projects and MENGINE_EDITOR_EXECUTABLE');assert.ok(['Ground','Water'].includes(kind));
const read=(root,file)=>fs.readFileSync(path.join(root,file)),json=(root,file)=>JSON.parse(read(root,file)),hash=raw=>createHash('sha256').update(raw).digest('hex');
const a=json(before,'terrain-sources.json'),b=json(after,'terrain-sources.json');assert.equal(a.mapSha256,b.mapSha256);assert.deepEqual(a.terrainTiles,b.terrainTiles);
const label='atlas-performance-'+kind.toLowerCase()+'-'+Date.now(),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001'),root=path.join(out,'native-qa',label),sample=path.join(root,'sample');
configureNativeQa(root);fs.cpSync(after,sample,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});
const reference='Assets/AtlasReference',texture='Assets/Textures/'+kind+'.png',material='Assets/Materials/'+kind+'.mmat',sourceFiles=[];
function copyReference(file,target){const raw=read(before,file);fs.writeFileSync(path.join(sample,target),raw);sourceFiles.push({file,sha256:hash(raw)});}
fs.mkdirSync(path.join(sample,reference),{recursive:true});copyReference(texture,reference+'/'+kind+'.png');
const oldMaterial=json(before,material);
if(oldMaterial.base_color_texture)oldMaterial.base_color_texture=reference+'/'+kind+'.png';
if(oldMaterial.custom_shader){
  const oldShader=read(before,oldMaterial.custom_shader);sourceFiles.push({file:oldMaterial.custom_shader,sha256:hash(oldShader)});
  fs.writeFileSync(path.join(sample,reference,kind+'.mshader'),oldShader.toString().replaceAll(texture,reference+'/'+kind+'.png'));oldMaterial.custom_shader=reference+'/'+kind+'.mshader';
}
fs.writeFileSync(path.join(sample,reference,kind+'.mmat'),JSON.stringify(oldMaterial));
for(const mesh of a.meshes.filter(m=>path.basename(m.path).startsWith(kind+'-')))copyReference(mesh.path,reference+'/'+path.basename(mesh.path));
Object.assign(process.env,{MENGINE_GPU_TIMINGS:'1',MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={before,after,kind,label,passed:false,sourceFiles,frames:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),materialSha256:hash(read(after,material)),mapSha256:b.mapSha256};
async function capture(){
  const deadline=Date.now()+30000;
  for(;;)try{return await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
const median=values=>{const sorted=values.toSorted((a,b)=>a-b),mid=sorted.length>>1;return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
try{
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(error){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});const authored=await query('scene.snapshot'),camera=authored.entities.find(e=>e.name==='Camera'),targets=authored.entities.filter(e=>e.name.startsWith(kind+'-'));
  assert.ok(targets.length);report.changedMeshes=targets.length;
  for(const view of ['overview','near']){
    await execute('component.set',{entity:camera.entity,type:'Camera3D',value:{...camera.components.Camera3D,orthographic_size:view==='near'?6:camera.components.Camera3D.orthographic_size}});
    for(const [block,mode] of ['legacy','fixed','fixed','legacy','legacy','fixed'].entries()){
      for(const entity of targets)await execute('component.set',{entity:entity.entity,type:'MeshRenderer',value:mode==='fixed'?entity.components.MeshRenderer:{mesh:reference+'/'+path.basename(entity.components.MeshRenderer.mesh),material:reference+'/'+kind+'.mmat'}});
      await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});
      for(let frame=0;frame<8;frame++){
        await execute('playback.step',{steps:1,deltaTime:1/60});const shot=await capture(),profile=shot.nativeProfile;
        assert.ok(profile?.gpuTimingSupported&&profile.gpuTimingEnabled&&Number.isFinite(profile.gpu?.totalPassMs),'Hardware timestamps required');
        assert.deepEqual(profile.renderSize,[1280,720]);
        if(frame>=2)report.frames.push({view,block,mode,frame,profile});
        if(block<2&&frame===7)fs.writeFileSync(path.join(out,label+'-'+view+'-'+mode+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
      }
      await execute('playback.stop');
    }
  }
  for(const entity of targets)await execute('component.set',{entity:entity.entity,type:'MeshRenderer',value:entity.components.MeshRenderer});
  await execute('component.set',{entity:camera.entity,type:'Camera3D',value:camera.components.Camera3D});assert.deepEqual((await query('scene.snapshot')).entities,authored.entities);
  report.summary=[];
  for(const view of ['overview','near'])for(const mode of ['legacy','fixed']){
    const frames=report.frames.filter(f=>f.view===view&&f.mode===mode);report.summary.push({view,mode,count:frames.length,gpuPassMs:median(frames.map(f=>f.profile.gpu.totalPassMs)),viewportMs:median(frames.map(f=>f.profile.totalMs))});
  }
  report.errors=(await query('console.get_logs',{limit:300})).filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.passed=true;console.log('PASS atlas performance',label,JSON.stringify(report.summary));
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}
