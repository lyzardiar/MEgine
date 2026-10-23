// Author: MiYu. Focused native presentation checks for source Warcraft menu assets and navigation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createRequire} from 'node:module';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const source=path.resolve('samples/frostbound-realms'),out=path.resolve('tmp/docs-artifacts/war3-ui'),label='native-'+Date.now(),root=path.join(out,label),sample=path.join(root,'sample');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE,'Set MENGINE_EDITOR_EXECUTABLE');configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','.mengine','Builds'].includes(path.basename(p))&&!path.basename(p).startsWith('user-v')});
const config=JSON.parse(fs.readFileSync(path.join(sample,'project.json'),'utf8'));config.storageId=label;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(config));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot'),step=(steps=1)=>execute('playback.step',{steps,deltaTime:1/60});
let viewport=[1280,720];
async function input(args){await execute('playback.input',{keys:[],buttons:[],viewport,...args});await step();}
async function key(k){await input({keys:[k]});await input({});await step(6);}
async function click(name){const pointer=clientWorldFixture(await snapshot()).canvasPoint(name,viewport,false);await input({pointer,buttons:[0]});await input({pointer});await step(6);}
const report={passed:false,label,editorSha256:createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex'),screens:[]};
let lanServer,lanHost;
async function capture(name){await step(10);for(let i=0;;i++)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280,includeNativeProfile:true});const file=path.join(out,label+'-'+name+'.png');fs.writeFileSync(file,Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.screens.push({name,file,viewport,profile:shot.nativeProfile});console.log('Captured '+name);return;}catch(error){if(i>20||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}}
const mode=s=>JSON.parse(s.entities.find(e=>e.name==='Frost telemetry').components.Text.text).mode;
try{
  if(process.argv.includes('--lan-only')){
    const {createServer}=await import('../samples/frostbound-realms/server.mjs');lanServer=createServer({port:0});const {port}=await lanServer.listening;
    const scriptPath=path.join(sample,'Assets/Scripts/Main.js'),script=fs.readFileSync(scriptPath,'utf8'),patched=script.replace("address='127.0.0.1:7788'","address='127.0.0.1:"+port+"'");assert.notEqual(patched,script);fs.writeFileSync(scriptPath,patched);
    report.lan={address:'127.0.0.1:'+port,sourceScriptSha256:createHash('sha256').update(script).digest('hex'),testedScriptSha256:createHash('sha256').update(patched).digest('hex'),fixtureChange:'Default TCP endpoint only'};
  }
  for(let i=0;;i++)try{await query('project.state');break;}catch(error){if(i===20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:sample});await execute('scene.open',{name:'Main',discardDirty:true});await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step(12);
  assert.equal(mode(await snapshot()),'title');
  if(process.argv.includes('--lan-only')){
    await click('network box');for(let i=0;mode(await snapshot())!=='rooms';i++){assert.ok(i<30,'LAN connection');await sleep(100);await step();}await capture('lan-empty');
    const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');lanHost=net.createConnection({host:'127.0.0.1',port:Number(report.lan.address.split(':')[1])});lanHost.on('data',()=>{});
    await new Promise((resolve,reject)=>{lanHost.once('connect',resolve);lanHost.once('error',reject);});lanHost.write(JSON.stringify({type:'hello',protocol:S.PROTOCOL,name:'原生验收房主'})+'\n'+JSON.stringify({type:'create',mode:'skirmish',map:S.defaultMap('skirmish'),faction:0,heroClass:0})+'\n');
    for(let i=0;!lanServer.rooms.size;i++){assert.ok(i<30,'Host room creation');await sleep(100);}await click('lanRefresh box');for(let i=0;!(await snapshot()).entities.find(e=>e.name==='room0 label').components.Text.text;i++){assert.ok(i<30,'Room list arrival');await sleep(100);await step();}await capture('lan-room');
    viewport=[960,900];await execute('view.set_game_resolution',{resolution:{width:960,height:900}});await input({pointer:[480,450]});await capture('lan-room-tall');await click('lanJoin box');for(let i=0;mode(await snapshot())!=='lobby';i++){assert.ok(i<30,'Native join');await sleep(100);await step();}
    const room=[...lanServer.rooms.values()][0];assert.equal(room.players.length,2);assert.equal(room.players[1].name,'玩家');report.lan.joined=true;report.lan.playerName=room.players[1].name;
  }else if(process.argv.includes('--options-only')){
    await click('options box');await capture('options-gameplay');await click('optionsVideo box');await capture('options-video');await click('optionsSound box');await click('optionMusicVolumeSlider box');await capture('options-sound');
    viewport=[960,900];await input({pointer:[480,450]});await capture('options-sound-tall');await click('optionsCancel box');assert.equal(mode(await snapshot()),'title');
  }else{
  await capture('main');
  if(!process.argv.includes('--main-only')){
  await click('multiplayer box');assert.equal(mode(await snapshot()),'title');
  await click('solo box');assert.equal(mode(await snapshot()),'single');await capture('single');
  await click('replay box');assert.equal(mode(await snapshot()),'single');
  await click('custom box');assert.equal(mode(await snapshot()),'custom');await capture('maps');
  await key('Escape');await key('Escape');await click('options box');assert.equal(mode(await snapshot()),'options');
  await click('optionsSound box');await click('optionMusicVolumeSlider box');await capture('sound');
  await click('optionsBack box');viewport=[960,900];await input({pointer:[0,0]});await capture('main-tall');
  await click('solo box');assert.equal(mode(await snapshot()),'single');await key('Escape');viewport=[1280,720];await input({});
  await key('F1');await key('F10');assert.equal(mode(await snapshot()),'playing');await capture('pause');
  await click('pauseOptions box');assert.equal(mode(await snapshot()),'options');await key('Escape');assert.equal(mode(await snapshot()),'playing');
  }
  }
  report.errors=(await query('console.get_logs',{limit:300})).filter(e=>e.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}lanHost?.destroy();await lanServer?.close();closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;process.exitCode=1;}fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,label,screens:report.screens.length,error:report.error}));}
