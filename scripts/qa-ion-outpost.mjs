import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createOutpostServer} from '../samples/ion-outpost/server.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),sample=path.join(repo,'samples/ion-outpost'),out=path.join(repo,'docs/designs/ion-outpost');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv.includes('--peer')){
  process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
  process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
  const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
  process.on('message',async request=>{
    try{
      let result;
      if(request.op==='query')result=await bridgeQuery(request.name,request.args||{});
      else if(request.op==='execute'){const r=await bridgeExecute(request.name,request.args||{},{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);result=r.data;}
      else{closeBridgeConnection();process.send({id:request.id,result:true});process.exit(0);}
      process.send({id:request.id,result});
    }catch(error){process.send({id:request.id,error:error.stack});}
  });
}else{
  const tag=Date.now(),peers=[],app=createOutpostServer({port:7777});await app.listening;fs.mkdirSync(out,{recursive:true});
  function peer(index){
    const config=path.join(repo,'tmp',`ion-qa-${tag}-${index}`);fs.mkdirSync(config,{recursive:true});
    const child=fork(fileURLToPath(import.meta.url),['--peer'],{cwd:repo,env:{...process.env,MENGINE_EDITOR_CONFIG_DIR:config,MENGINE_EDITOR_EXECUTABLE:path.join(repo,'target/release/mengine-editor-tauri.exe')},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
    child.stderr.on('data',b=>process.stderr.write(`[peer ${index}] ${b}`));
    let serial=0;const waiting=new Map();child.on('message',m=>{const p=waiting.get(m.id);if(!p)return;clearTimeout(p.timer);waiting.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);});
    const call=(op,name,args)=>new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject,timer:setTimeout(()=>reject(new Error(`peer ${index}: ${name} timed out`)),90000)});child.send({id,op,name,args});});
    const p={child,config,query:(name,args)=>call('query',name,args),execute:(name,args)=>call('execute',name,args),close:()=>call('close')};peers.push(p);return p;
  }
  const telemetry=async p=>{const s=await p.query('scene.snapshot');return JSON.parse(s.entities.find(e=>e.name==='FPS telemetry').components.Text.text);};
  const until=async(check,description,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){const result=await check();if(result)return result;await sleep(150);}throw new Error('Timed out: '+description);};
  const press=async(p,key)=>{await p.execute('playback.input',{keys:[key]});await sleep(130);await p.execute('playback.input',{keys:[]});};
  const capture=async(p,name)=>{const image=await p.query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(image.dataUrl.split(',')[1],'base64'));};
  const report={scope:'Two separate Release native editor processes with real QuickJS clients and TCP server',passed:false};
  try{
    const a=peer(0);await a.execute('project.open',{root:sample});await a.execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await a.execute('panel.focus',{kind:'game'});await a.execute('playback.play');
    await until(async()=>(await telemetry(a)).mode==='title','title');await capture(a,'title');
    await press(a,'F1');await until(async()=>(await telemetry(a)).mode==='playing','solo');
    const aimBefore=(await telemetry(a)).player.yaw;
    await a.execute('playback.input',{pointerDelta:[100,-20],pointerLocked:true});await sleep(350);
    assert.ok(Math.abs((await telemetry(a)).player.yaw-aimBefore)>.15);report.relativeMouseInput=true;
    await a.execute('playback.input',{pointerLocked:false});await sleep(200);await press(a,'Enter');
    const before=await telemetry(a);await a.execute('playback.input',{keys:['KeyW']});await sleep(900);await a.execute('playback.input',{keys:[]});const after=await telemetry(a);assert.ok(Math.hypot(after.player.x-before.player.x,after.player.z-before.player.z)>1);
    await a.execute('playback.input',{keys:['KeyF']});await sleep(700);await a.execute('playback.input',{keys:[]});await capture(a,'solo-combat');
    await press(a,'Escape');await sleep(300);const frozen=await telemetry(a);await sleep(450);assert.equal((await telemetry(a)).frame,frozen.frame);await press(a,'Enter');await press(a,'F10');
    await press(a,'Enter');await until(async()=>(await telemetry(a)).room,'host room');const roomCode=(await telemetry(a)).room;console.log('Native host created room',roomCode);
    const b=peer(1);await b.execute('project.open',{root:sample});await b.execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await b.execute('panel.focus',{kind:'game'});await b.execute('playback.play');await until(async()=>(await telemetry(b)).mode==='title','guest title');
    await press(b,'F2');await until(async()=>(await telemetry(b)).mode==='browser','room browser');await sleep(300);await press(b,'Enter');await until(async()=>(await telemetry(b)).room===roomCode,'guest joins');
    await press(b,'Enter');await sleep(250);await capture(a,'lobby');await press(a,'Enter');
    await until(async()=>(await telemetry(a)).mode==='playing'&&(await telemetry(b)).mode==='playing','both clients playing');
    await a.execute('profiler.clear');await a.execute('playback.input',{keys:['KeyW','KeyF']});await sleep(1800);await a.execute('playback.input',{keys:[]});await sleep(3500);
    const aState=await telemetry(a),bState=await telemetry(b),room=app.rooms.get(roomCode);assert.ok(aState.receivedFrames>120&&bState.receivedFrames>120);assert.ok(aState.verifiedFrames>120&&bState.verifiedFrames>120, 'both QuickJS clients replay and verify authoritative input frames');assert.ok(Math.abs(aState.frame-bState.frame)<30);assert.equal(aState.actors,7);assert.equal(bState.actors,7);
    const authoritative=room.state.actors.find(p=>p.id===aState.id);report.clients=[aState,bState];report.authoritative=JSON.parse(JSON.stringify(authoritative));
    assert.ok(Math.hypot(aState.player.x-authoritative.x,aState.player.z-authoritative.z)<1,'local prediction converges: '+JSON.stringify({client:aState,server:authoritative}));
    await capture(a,'multiplayer');await b.execute('playback.input',{keys:['Tab']});await capture(b,'scoreboard');await b.execute('playback.input',{keys:[]});
    report.performance=await a.query('profiler.get_samples',{source:'game',limit:120});report.clients=[aState,bState];
    const guest=[...app.clients].find(c=>c.id===bState.id);guest.socket.destroy();
    await until(async()=>[...app.clients].some(c=>c.id===bState.id)&&room.state.actors.find(p=>p.id===bState.id)?.connected,'native reconnect',15000);await sleep(700);assert.equal((await telemetry(b)).id,bState.id);
    report.reconnected=true;report.serverMetrics=app.metrics;report.passed=true;console.log('PASS native solo, pause, two-client room/match, prediction and reconnect');
  }catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
  finally{
    fs.writeFileSync(path.join(out,'native-qa.json'),JSON.stringify(report,null,2)+'\n');
    for(const p of peers){try{await p.execute('playback.stop');await p.close();}catch{}if(!p.child.killed)p.child.kill();}
    await app.close();
    console.log('QA configurations:',peers.map(p=>p.config).join(', '));
  }
}
