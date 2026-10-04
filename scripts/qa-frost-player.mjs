// Author: MiYu. Measure native Player frame intervals in an isolated scripted match.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const samplingBefore=process.argv.includes('--sampling-before');
const poseMotion=process.argv.includes('--poses')||process.argv.includes('--poses-before');
const motion=poseMotion||process.argv.includes('--motion')||process.argv.includes('--motion-before'),before=samplingBefore||process.argv.includes('--poses-before')||process.argv.includes('--motion-before')||process.argv.includes('--before');
const kind=process.argv[2]||'skirmish',startKey={skirmish:'F1',moba:'F2',td:'F3'}[kind];assert.ok(startKey,'Mode must be skirmish, moba or td');
const sourceRevision=process.env.MENGINE_QA_SOURCE_REV||null,capturePrefix=process.env.MENGINE_QA_CAPTURE_PREFIX||'';assert.ok(!sourceRevision||!before,'Choose a source revision or the historical before fixture');
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag='frost-player-qa-'+kind+'-'+Date.now();
const root=path.join(process.env.MENGINE_QA_ROOT||path.join(repo,'tmp'),tag),projectRoot=path.join(root,'sample');
fs.mkdirSync(root,{recursive:true});fs.cpSync(source,projectRoot,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const projectPath=path.join(projectRoot,'project.json'),project=JSON.parse(fs.readFileSync(projectPath));project.storageId=tag;fs.writeFileSync(projectPath,JSON.stringify(project));
const script=path.join(projectRoot,'Assets/Scripts/Main.js');
if(sourceRevision){const prefix=fs.readFileSync(script,'utf8').split('\n').slice(0,4).join('\n'),read=name=>execFileSync('git',['show',sourceRevision+':samples/frostbound-realms/game/'+name+'.js'],{cwd:repo,maxBuffer:4*1024*1024}).toString();fs.writeFileSync(script,prefix+'\n'+['simulation','terrain','visuals','client'].map(read).join('\n'));}
if(before){const current=fs.readFileSync(path.join(source,'game/client.js'),'utf8'),old=execFileSync('git',['show',(poseMotion||samplingBefore?'51a244a':'71076ce')+':samples/frostbound-realms/game/client.js'],{cwd:repo,maxBuffer:4*1024*1024}).toString(),body=fs.readFileSync(script,'utf8');assert.ok(body.includes(current));fs.writeFileSync(script,body.replace(current,old));}
const sourceScriptSha256=crypto.createHash('sha256').update(fs.readFileSync(script)).digest('hex');
const fixture=`
${motion?`var qaMotionState,qaMotionNativeCreate=Frost.create;Frost.create=(kind,options={})=>{qaMotionState=qaMotionNativeCreate(kind,{...options,ai:[false,false]});return qaMotionState;};`:''}
var qaMotionTrace=[],qaMotionPhase=0;
var qaPlayerTick=onTick,qaFrame=0,qaElapsed=0,qaDone=false,qaWindows=[[],[],[]],qaStates=[];
onTick=function(dt){
  qaFrame++;let key=qaFrame===2?'${startKey}':qaFrame===4||qaFrame===6?'Home':null;
  let pointer=[engine.input.viewport[0]/2,engine.input.viewport[1]/2],pressedButtons=[];
  ${motion?`if(qaFrame===8){const camera=engine.snapshot.entities.find(e=>e.name==='Strategy camera').components,viewport=engine.input.viewport,zoom=camera.Camera3D.orthographic_size,p=camera.Transform.position;pointer=[viewport[0]/2+(-12-p[0])/zoom*viewport[1]/2,viewport[1]/2+(18-(p[2]-42))*Math.sin(Math.atan2(32,42))/zoom*viewport[1]/2];pressedButtons=[2];}
  if(qaMotionPhase===0&&qaElapsed>=12){key='Escape';qaMotionPhase=1;}else if(qaMotionPhase===1&&qaElapsed>=13){key='Escape';qaMotionPhase=2;}`:''}
  engine.input={...engine.input,keys:[],pressedKeys:key?[key]:[],releasedKeys:[],buttons:pressedButtons,pressedButtons,releasedButtons:[],pointer};
  qaPlayerTick(dt);
  ${motion?`if(qaFrame>=9&&!qaDone){const hero=qaMotionState.units.find(u=>u.team===0&&u.kind==='hero'),index=qaMotionState.units.indexOf(hero),entity=engine.snapshot.entities.find(e=>e.name==='Unit '+index);qaMotionTrace.push({at:qaElapsed,frame:qaMotionState.frame,position:entity.components.Transform.position,mesh:entity.components.MeshRenderer.mesh,x:hero.x,z:hero.z,phase:qaMotionPhase});}`:''}
  if(qaFrame<8||qaDone)return;
  const before=qaElapsed;qaElapsed+=dt;
  if(before>=5&&before<20){const index=Math.floor((before-5)/5);qaWindows[index].push(dt*1000);}
  for(let i=0;i<3;i++)if(!qaStates[i]&&qaElapsed>=10+i*5){const telemetry=engine.snapshot.entities.find(e=>e.name==='Frost telemetry');qaStates[i]={...JSON.parse(telemetry.components.Text.text),viewport:engine.input.viewport};}
  if(qaElapsed>=20){qaDone=true;engine.storage.save('native-frame-intervals',{warmupSeconds:5,sampleWindowSeconds:5,intervalsMs:qaWindows,states:qaStates,motion:qaMotionTrace});}
};
`;
fs.appendFileSync(script,fixture);
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(tag))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);
const dataRoot=process.env.LOCALAPPDATA||process.env.XDG_DATA_HOME||path.join(process.env.HOME||root,'.local/share');
const resultPath=path.join(dataRoot,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'),'native-frame-intervals.json');
const exe=process.env.MENGINE_PLAYER_EXECUTABLE||path.join(repo,'target/release/mengine-runtime.exe'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const stdout=fs.openSync(path.join(root,'stdout.txt'),'w'),stderr=fs.openSync(path.join(root,'stderr.txt'),'w');
const child=spawn(exe,['--project-root',projectRoot,'--scene','Assets/Scenes/Main.mscene','--script',script,'--title','Frostbound Player QA'],{cwd:projectRoot,windowsHide:true,env:{...process.env,RUST_LOG:'mengine_runtime=info,mengine_rhi=info,wgpu_core=warn'},stdio:['ignore',stdout,stderr]});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let launchError;child.once('error',error=>{launchError=error;});
try{
  const deadline=Date.now()+90000;while(!fs.existsSync(resultPath)){if(launchError)throw launchError;assert.equal(child.exitCode,null,'Player exited before measurement');assert.ok(Date.now()<deadline,'Player measurement timed out; see '+root);await sleep(500);}
  const raw=JSON.parse(fs.readFileSync(resultPath)),log=fs.readFileSync(path.join(root,'stderr.txt'),'utf8'),errors=log.split('\n').filter(line=>/\bERROR\b|render:|script tick failed|could not be loaded/.test(line));assert.deepEqual(errors,[]);
  const pipelineStats=[...log.matchAll(/rejected=(\d+), error_variants=(\d+)/g)];assert.ok(pipelineStats.length>0,'Player reports material pipeline status');assert.ok(pipelineStats.every(m=>m[1]==='0'&&m[2]==='0'),'Player material pipelines compile');
  const runs=raw.intervalsMs.map((samples,i)=>{assert.ok(samples.length>=10);assert.ok(samples.every(v=>Number.isFinite(v)&&v>0));const state=raw.states[i];assert.equal(state.mode,'playing');assert.equal(state.kind,kind);assert.equal(state.zoom,12);assert.ok(state.frame>(i?raw.states[i-1].frame:0),'Simulation advances');const sorted=[...samples].sort((a,b)=>a-b),totalMs=samples.reduce((a,b)=>a+b,0);return {samples:samples.length,durationMs:totalMs,frameLoopFps:samples.length*1000/totalMs,meanMs:totalMs/samples.length,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),state:Object.fromEntries(['mode','kind','frame','camera','zoom','units','gold','selected','paused','online','winner','viewport'].map(k=>[k,state[k]]))};});
  let motionResult;
  if(motion){const trace=raw.motion;assert.ok(trace.length>100);const movement=trace.filter(p=>p.at<4),changes=movement.filter((p,i)=>i&&Math.hypot(p.position[0]-movement[i-1].position[0],p.position[2]-movement[i-1].position[2])>.00001),between=changes.filter(p=>{const i=movement.indexOf(p);return p.frame===movement[i-1].frame;}),authority=movement.filter((p,i)=>i&&Math.hypot(p.x-movement[i-1].x,p.z-movement[i-1].z)>.00001);assert.ok(changes.length>10);const paused=trace.filter(p=>p.at>12.3&&p.at<12.9);assert.ok(paused.length>10);if(poseMotion&&!before)assert.ok(movement.filter(p=>p.mesh.includes('#pose=1:')).every(p=>p.mesh.endsWith('@30')),'native walking meshes use 30 Hz');if(!before){assert.ok(between.length>=5&&changes.length>authority.length,'native model transforms update more often than authoritative positions');assert.ok(paused.every(p=>JSON.stringify(p.position)===JSON.stringify(paused[0].position)&&p.mesh===paused[0].mesh),'native paused transforms and pose geometry freeze');}motionResult={baseline:before,samples:trace.length,movementChanges:changes.length,authorityChanges:authority.length,changesBetweenSimulationTicks:between.length,pausedSamples:paused.length,pausedPosesEqual:paused.every(p=>p.mesh===paused[0].mesh),walkingMeshChanges:movement.filter((p,i)=>i&&p.mesh.includes('#pose=1:')&&p.mesh!==movement[i-1].mesh).length,requestedPoseRate:movement.find(p=>p.mesh.includes('#pose=1:'))?.mesh.endsWith('@30')?30:12,nativeComponentObservation:true};}
  const report={passed:true,kind,motion:motionResult,sourceRevision,scope:'Standalone native Player frame-loop intervals from onTick dt; successful render logs checked, physical display presentation is not measured.',physicalInput:false,audioListening:false,fixture:(motion?'Scripted native pointer movement and one-second pause; ':'')+'Isolated source project; scripted '+startKey+', two Home presses, centered pointer; '+(sourceRevision?'game source from '+sourceRevision:'current game rules')+' and current assets.',executable:exe,executableSha256:hash(exe),sourceSceneSha256:hash(path.join(source,'Assets/Scenes/Main.mscene')),sourceScriptSha256,fixtureScriptSha256:hash(script),projectRoot,processId:child.pid,warmupSeconds:raw.warmupSeconds,sampleWindowSeconds:raw.sampleWindowSeconds,loggedErrors:errors,materialPipelineRejections:0,runs};
  report.groundAssets=Object.fromEntries(['ground-sources.json','Assets/Materials/Ground.mmat','Assets/Shaders/Ground.mshader'].map(relative=>[relative,hash(path.join(source,relative))]));report.measuredAt=new Date().toISOString();
  fs.writeFileSync(path.join(root,'raw-intervals.json'),JSON.stringify(raw));fs.writeFileSync(path.join(repo,'docs/designs/frostbound-realms/'+capturePrefix+(poseMotion?'native-player-poses-':samplingBefore?'native-player-sampling-':motion?'native-player-motion-':'native-player-performance-')+(before?'before-':'')+kind+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({kind,projectRoot,motion:motionResult,runs:runs.map(r=>({fps:r.frameLoopFps,meanMs:r.meanMs,p95Ms:r.p95Ms,viewport:r.state.viewport}))},null,2));
}finally{if(child.exitCode===null)child.kill();fs.closeSync(stdout);fs.closeSync(stderr);}
