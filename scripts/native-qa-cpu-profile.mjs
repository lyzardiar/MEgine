// Author: MiYu. Sample only the disposable QA WebView on its dedicated loopback debugger port.
import net from 'node:net';
import assert from 'node:assert/strict';
export async function configureNativeQaCpuProfile(){
 const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS+=' --remote-debugging-port='+port;
 return async()=>{
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(t=>t.type==='page'&&/^https?:\/\/(?:tauri\.localhost|localhost)(?:[:/]|$)/.test(t.url));
  assert.ok(target?.webSocketDebuggerUrl,'Owned QA main webview debugger is unavailable');
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const r=JSON.parse(event.data),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);if(r.error)p.reject(Error(r.error.message));else p.resolve(r.result);});
  const call=method=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('QA CPU profiler timed out: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method}));});
  try{await call('Profiler.enable');await call('Profiler.start');}catch(e){socket.close();throw e;}
  return async()=>{try{const {profile}=await call('Profiler.stop');return {targetUrl:target.url,profile};}finally{socket.close();}};
 };
}
