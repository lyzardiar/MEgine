// Author: MiYu. Measure native Player frame intervals in an isolated scripted match.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const kind=process.argv[2]||'skirmish',startKey={skirmish:'F1',moba:'F2',td:'F3'}[kind];assert.ok(startKey,'Mode must be skirmish, moba or td');
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag='frost-player-qa-'+kind+'-'+Date.now();
const root=path.join(process.env.MENGINE_QA_ROOT||path.join(repo,'tmp'),tag),projectRoot=path.join(root,'sample');
fs.mkdirSync(root,{recursive:true});fs.cpSync(source,projectRoot,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const projectPath=path.join(projectRoot,'project.json'),project=JSON.parse(fs.readFileSync(projectPath));project.storageId=tag;fs.writeFileSync(projectPath,JSON.stringify(project));
const script=path.join(projectRoot,'Assets/Scripts/Main.js');
const fixture=`
var qaPlayerTick=onTick,qaFrame=0,qaElapsed=0,qaDone=false,qaWindows=[[],[],[]],qaStates=[];
onTick=function(dt){
  qaFrame++;const key=qaFrame===2?'${startKey}':qaFrame===4||qaFrame===6?'Home':null;
  engine.input={...engine.input,keys:[],pressedKeys:key?[key]:[],releasedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[engine.input.viewport[0]/2,engine.input.viewport[1]/2]};
  qaPlayerTick(dt);
  if(qaFrame<8||qaDone)return;
  const before=qaElapsed;qaElapsed+=dt;
  if(before>=5&&before<20){const index=Math.floor((before-5)/5);qaWindows[index].push(dt*1000);}
  for(let i=0;i<3;i++)if(!qaStates[i]&&qaElapsed>=10+i*5){const telemetry=engine.snapshot.entities.find(e=>e.name==='Frost telemetry');qaStates[i]={...JSON.parse(telemetry.components.Text.text),viewport:engine.input.viewport};}
  if(qaElapsed>=20){qaDone=true;engine.storage.save('native-frame-intervals',{warmupSeconds:5,sampleWindowSeconds:5,intervalsMs:qaWindows,states:qaStates});}
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
  const raw=JSON.parse(fs.readFileSync(resultPath)),log=fs.readFileSync(path.join(root,'stderr.txt'),'utf8'),errors=log.split('\n').filter(line=>/\bERROR\b|render:|script tick failed/.test(line));assert.deepEqual(errors,[]);
  const pipelineStats=[...log.matchAll(/rejected=(\d+), error_variants=(\d+)/g)];assert.ok(pipelineStats.length>0,'Player reports material pipeline status');assert.ok(pipelineStats.every(m=>m[1]==='0'&&m[2]==='0'),'Player material pipelines compile');
  const runs=raw.intervalsMs.map((samples,i)=>{assert.ok(samples.length>=10);assert.ok(samples.every(v=>Number.isFinite(v)&&v>0));const state=raw.states[i];assert.equal(state.mode,'playing');assert.equal(state.kind,kind);assert.equal(state.zoom,12);assert.ok(state.frame>(i?raw.states[i-1].frame:0),'Simulation advances');const sorted=[...samples].sort((a,b)=>a-b),totalMs=samples.reduce((a,b)=>a+b,0);return {samples:samples.length,durationMs:totalMs,frameLoopFps:samples.length*1000/totalMs,meanMs:totalMs/samples.length,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),state};});
  const report={passed:true,kind,scope:'Standalone native Player frame-loop intervals from onTick dt; successful render logs checked, physical display presentation is not measured.',physicalInput:false,audioListening:false,fixture:'Isolated source project; scripted '+startKey+', two Home presses, centered pointer; game rules and assets unchanged.',executable:exe,executableSha256:hash(exe),sourceSceneSha256:hash(path.join(source,'Assets/Scenes/Main.mscene')),sourceScriptSha256:hash(path.join(source,'Assets/Scripts/Main.js')),fixtureScriptSha256:hash(script),projectRoot,processId:child.pid,warmupSeconds:raw.warmupSeconds,sampleWindowSeconds:raw.sampleWindowSeconds,loggedErrors:errors,materialPipelineRejections:0,runs};
  fs.writeFileSync(path.join(root,'raw-intervals.json'),JSON.stringify(raw));fs.writeFileSync(path.join(repo,'docs/designs/frostbound-realms/native-player-performance-'+kind+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({kind,projectRoot,runs:runs.map(r=>({fps:r.frameLoopFps,meanMs:r.meanMs,p95Ms:r.p95Ms,viewport:r.state.viewport}))},null,2));
}finally{if(child.exitCode===null)child.kill();fs.closeSync(stdout);fs.closeSync(stderr);}
