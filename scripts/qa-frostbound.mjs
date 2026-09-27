// Author: MiYu. Isolated native editor processes, Agent input, rendered captures and TCP.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv.includes('--peer')){
  process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
  process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
  const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
  process.on('message',async m=>{try{let result;if(m.op==='query')result=await bridgeQuery(m.name,m.args||{});else if(m.op==='execute'){const r=await bridgeExecute(m.name,m.args||{},{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);result=r.data;}else{closeBridgeConnection();process.send({id:m.id,result:true});process.exit(0);}process.send({id:m.id,result});}catch(e){process.send({id:m.id,error:e.stack});}});
}else{
  fs.mkdirSync(out,{recursive:true});const peers=[],tag=Date.now(),app=createServer();await app.listening;
  const sample=path.join(repo,'tmp','frost-qa-'+tag,'sample');fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='frost-qa-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
  function peer(i){const config=path.join(repo,'tmp',`frost-qa-${tag}-${i}`);fs.mkdirSync(config,{recursive:true});const child=fork(fileURLToPath(import.meta.url),['--peer'],{cwd:repo,env:{...process.env,MENGINE_EDITOR_CONFIG_DIR:config,MENGINE_EDITOR_EXECUTABLE:process.env.MENGINE_EDITOR_EXECUTABLE||path.join(repo,'target/release/mengine-editor-tauri.exe')},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});child.stderr.on('data',b=>process.stderr.write(b));let serial=0;const waiting=new Map();child.on('message',m=>{const p=waiting.get(m.id);if(p){clearTimeout(p.timer);waiting.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});const call=(op,name,args)=>new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('QA timeout '+name)),90000)});child.send({id,op,name,args});});const p={child,query:(n,a)=>call('query',n,a),execute:(n,a)=>call('execute',n,a),close:()=>call('close')};peers.push(p);return p;}
  const state=async p=>JSON.parse((await p.query('scene.snapshot')).entities.find(e=>e.name==='Frost telemetry').components.Text.text);
  const until=async(check,label)=>{const end=Date.now()+20000;while(Date.now()<end){const v=await check();if(v)return v;await sleep(250);}throw Error('Timed out '+label);};
  const press=async(p,key)=>{await p.execute('playback.input',{keys:[key],viewport:[1280,720]});await sleep(220);await p.execute('playback.input',{keys:[]});await sleep(150);};
  const click=async(p,x,y,button=0)=>{await p.execute('playback.input',{pointer:[x,y],viewport:[1280,720],buttons:[button]});await sleep(150);await p.execute('playback.input',{buttons:[]});await sleep(200);};
  const capture=async(p,name)=>{await sleep(400);const shot=await p.query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));};
  async function open(p){await p.execute('project.open',{root:sample});await p.execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await p.execute('panel.focus',{kind:'game'});await p.execute('playback.play');await until(async()=>(await state(p)).mode==='title','title');}
  const report={passed:false,scope:'Two independent native Release editor processes, each with QuickJS, Agent input and real TCP server',physicalInput:false,audioListening:false};
  try{
    const a=peer(0);await open(a);await capture(a,'title');console.log('Native title rendered');
    await click(a,316,369);await until(async()=>(await state(a)).mode==='playing','skirmish click');let before=await state(a);assert.equal(before.kind,'skirmish');
    await click(a,640,310,2);await sleep(1600);let after=await state(a);assert.ok(Math.hypot(after.hero.x-before.hero.x,after.hero.z-before.hero.z)>.5,'right-click moves the hero');
    await a.execute('profiler.clear');await sleep(3000);report.performance={resolution:[1280,720],mode:'skirmish',units:(await state(a)).units,samples:await a.query('profiler.get_samples',{source:'game',limit:120})};
    await press(a,'KeyQ');await click(a,640,320);await sleep(350);assert.ok((await state(a)).hero.mana<150,'native targeted skill spends mana');await capture(a,'skirmish');
    await press(a,'Escape');const paused=(await state(a)).frame;await sleep(400);assert.equal((await state(a)).frame,paused);await press(a,'Escape');await press(a,'F5');assert.match((await state(a)).notice,/Saved/);
    await press(a,'F10');await click(a,433,658);await until(async()=>(await state(a)).mode==='playing','quicksave loaded');report.saveRestored=true;
    await press(a,'F10');await press(a,'F4');const water=(await state(a)).terrainWater;await press(a,'Digit2');await click(a,710,335);assert.ok((await state(a)).terrainWater>water,'terrain brush writes a tile');await press(a,'F5');assert.match((await state(a)).notice,/Saved/);await capture(a,'map-editor');
    await press(a,'F7');await until(async()=>(await state(a)).mode==='playing','custom map test');assert.ok((await state(a)).terrainWater>water);await press(a,'F10');assert.equal((await state(a)).mode,'editor');await press(a,'F6');assert.ok((await state(a)).terrainWater>water);report.mapRoundtrip=true;
    await press(a,'KeyV');assert.equal((await state(a)).editorPage,1);await click(a,820,360);assert.equal((await state(a)).placedUnits,1);await press(a,'KeyV');await click(a,820,360);assert.equal((await state(a)).triggers,1);await press(a,'F5');await press(a,'F6');assert.equal((await state(a)).triggers,1);report.unitTriggerRoundtrip=true;
    // F10 exits a standalone editor; returning from a playtest first keeps editing.
    await click(a,0,0);await press(a,'F10');if((await state(a)).mode==='editor'){await a.execute('playback.stop');await a.execute('playback.play');await sleep(400);}
    await press(a,'F2');await until(async()=>(await state(a)).kind==='moba','moba');await capture(a,'ancients');await press(a,'F10');await press(a,'F3');await until(async()=>(await state(a)).kind==='td','td');await capture(a,'tower-defense');
    await press(a,'F10');await press(a,'F8');await until(async()=>(await state(a)).kind==='rpg','rpg');await capture(a,'rpg');await press(a,'F5');await press(a,'F10');await click(a,433,658);assert.equal((await state(a)).kind,'rpg');report.rpgSave=true;
    await press(a,'F10');await press(a,'Enter');await press(a,'F1');await until(async()=>(await state(a)).room,'host lobby');const code=(await state(a)).room;
    const b=peer(1);await open(b);await press(b,'Enter');await press(b,'F3');await until(async()=>(await state(b)).mode==='rooms','room browser');await press(b,'Enter');await until(async()=>(await state(b)).room===code,'guest joined');
    await press(b,'Enter');await press(a,'Enter');await capture(a,'lobby');await press(a,'Enter');await until(async()=>(await state(a)).netStates>10&&(await state(b)).netStates>10,'both native clients receive authoritative states');await capture(a,'multiplayer');
    report.clients=[await state(a),await state(b)];assert.ok(report.clients.every(p=>p.online&&p.room===code&&p.frame>5));
    const guest=[...app.clients].find(c=>c.player?.team===1);guest.socket.destroy();await until(async()=>[...app.clients].some(c=>c!==guest&&c.player?.team===1)&&(await state(b)).mode==='playing','native reconnect');report.reconnected=true;
    report.passed=true;console.log('PASS native menu, movement, spell, pause, save/load, map editor/playtest, RPG and two-client multiplayer/reconnect');
  }catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}
  finally{fs.writeFileSync(path.join(out,'native-qa.json'),JSON.stringify(report,null,2)+'\n');for(const p of peers){try{await p.execute('playback.stop');await p.close();}catch{}p.child.kill();}await app.close();}
}
