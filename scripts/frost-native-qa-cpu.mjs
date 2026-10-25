// Author: MiYu. Sample only the disposable native QA main WebView through its local debugger.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

export async function reserveNativeQaDebuggerPort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;
}

export function selectNativeQaMainTarget(targets,port){
  if(!Number.isInteger(port)||port<1||port>65535||!Array.isArray(targets))throw Error('Invalid QA debugger endpoint');
  const matches=targets.filter(target=>{try{const url=new URL(target.url);return target.type==='page'&&(url.origin==='http://tauri.localhost'||url.origin==='https://tauri.localhost'||url.protocol==='tauri:'&&url.hostname==='localhost')&&!url.search;}catch{return false;}});
  if(matches.length!==1)throw Error('Expected one native QA main WebView, got '+matches.length);
  const target=matches[0],socket=new URL(target.webSocketDebuggerUrl);
  if(socket.protocol!=='ws:'||socket.hostname!=='127.0.0.1'&&socket.hostname!=='localhost'||Number(socket.port)!==port)throw Error('QA debugger socket must use the selected loopback port');
  return target;
}

export function summarizeNativeQaCpuProfile(profile){
  if(!Array.isArray(profile?.nodes)||!Array.isArray(profile.samples)||!Array.isArray(profile.timeDeltas)||profile.samples.length!==profile.timeDeltas.length||!Number.isFinite(profile.startTime)||!Number.isFinite(profile.endTime)||profile.endTime<profile.startTime)throw Error('Invalid QA CPU profile');
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),self=new Map();let sampledUs=0;
  if(nodes.size!==profile.nodes.length)throw Error('Invalid QA CPU node identities');
  for(let i=0;i<profile.samples.length;i++){
    const node=nodes.get(profile.samples[i]),duration=profile.timeDeltas[i];
    if(!node?.callFrame||!Number.isFinite(duration)||duration<0)throw Error('Invalid QA CPU sample');
    sampledUs+=duration;self.set(node.id,(self.get(node.id)||0)+duration);
  }
  const rows=[...self].map(([id,us])=>({id,...nodes.get(id).callFrame,selfMs:us/1000})).sort((a,b)=>b.selfMs-a.selfMs);
  return {durationMs:(profile.endTime-profile.startTime)/1000,sampledMs:sampledUs/1000,samples:profile.samples.length,idleMs:rows.filter(row=>row.functionName==='(idle)').reduce((sum,row)=>sum+row.selfMs,0),topSelf:rows.slice(0,30)};
}

async function connectDebugger(url){
  const socket=new WebSocket(url),pending=new Map();let serial=0;
  const rejectAll=error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();};
  socket.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data);}catch{rejectAll(Error('Invalid QA debugger response'));return;}
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);
    if(message.error)item.reject(Error('QA debugger: '+message.error.message));else item.resolve(message.result);
  });
  socket.addEventListener('close',()=>rejectAll(Error('QA debugger closed')));
  socket.addEventListener('error',()=>rejectAll(Error('QA debugger failed')));
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('QA debugger connection timeout')),5000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('QA debugger connection failed'));},{once:true});});
  }catch(error){socket.close();throw error;}
  return {close(){socket.close();rejectAll(Error('QA debugger closed'));},request(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('QA debugger command timeout: '+method));},5000);pending.set(id,{resolve,reject,timer});try{socket.send(JSON.stringify({id,method,params}));}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}});}};
}

export async function startNativeQaCpuProfile(root,port){
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid QA debugger port');
  const owner=JSON.parse(fs.readFileSync(path.join(root,'qa-owner.json'),'utf8')),editor=JSON.parse(fs.readFileSync(path.join(root,'discovery/agent-bridge.json'),'utf8'));
  if(owner.pid!==process.pid||owner.root!==path.resolve(root)||!editor.background||!Number.isSafeInteger(editor.pid)||editor.pid<1)throw Error('Native QA CPU profile ownership mismatch');
  const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('QA debugger discovery failed');
  const target=selectNativeQaMainTarget(await response.json(),port),connection=await connectDebugger(target.webSocketDebuggerUrl);
  try{await connection.request('Profiler.enable');await connection.request('Profiler.setSamplingInterval',{interval:1000});await connection.request('Profiler.start');}
  catch(error){connection.close();throw error;}
  let stopping;
  return {stop(){return stopping??=(async()=>{try{const {profile}=await connection.request('Profiler.stop'),summary=summarizeNativeQaCpuProfile(profile),file=path.join(root,'main-thread.cpuprofile');fs.writeFileSync(file,JSON.stringify(profile));return {targetId:target.id,targetUrl:target.url,editorPid:editor.pid,samplingIntervalUs:1000,profilePath:file,...summary};}finally{connection.close();}})();}};
}
