// Author: MiYu. Native default melee opening through actual worker, altar and saved-production UI.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms'),tag=process.env.MENGINE_QA_TAG||Date.now();
const sample=path.join(process.env.MENGINE_QA_ROOT||'D:/MEngineNativeQA','frost-qa-'+tag,'sample');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(repo,'tmp','frost-qa-'+tag+'-0');process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/pose-runtime/mengine-editor-tauri.exe';
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='frost-opening-qa-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const script=path.join(sample,'Assets/Scripts/Main.js');fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace('JSON.stringify({mode,','JSON.stringify({qaUnits:state.units,qaTeams:state.teams,mode,'));
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),V=require('../samples/frostbound-realms/game/visuals.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;};
const until=async(check,label)=>{const end=Date.now()+180000;while(Date.now()<end){try{const result=await check();if(result)return result;}catch(e){if(e.name!=='BridgeConnectionError'&&!/loading|NOT_READY/.test(e.message+' '+e.code))throw e;}await sleep(500);}throw Error('Timed out '+label);};
const scene=()=>bridgeQuery('scene.snapshot'),state=async()=>JSON.parse((await scene()).entities.find(e=>e.name==='Frost telemetry').components.Text.text);
const frame=async args=>{await execute('playback.input',{...args,viewport:[1280,720]});await execute('playback.step',{deltaTime:.1});};
const key=async k=>{await frame({keys:[k]});await frame({keys:[]});await frame({});};
const click=async p=>{await frame({pointer:p,buttons:[0]});await frame({buttons:[]});await frame({});};
const point=(s,u)=>{const pitch=Math.atan2(V.camera.height,V.camera.depth);return [640+(u.x-s.camera[0])/s.zoom*360,360+((u.z-s.camera[1])*Math.sin(pitch)-S.elevation(S.defaultMap(),u.x,u.z)*Math.cos(pitch))/s.zoom*360];};
const ui=async name=>{const r=(await scene()).entities.find(e=>e.name===name+' box').components.RectTransform;await click([640+r.anchored_position[0],360+r.anchored_position[1]]);};
const button=async pattern=>{const e=(await scene()).entities.find(e=>/^action\d+ label$/.test(e.name)&&pattern.test(e.components.Text.text));assert.ok(e,'button '+pattern);await ui(e.name.replace(' label',''));};
const steps=async count=>{for(let left=count;left>0;left-=25)await execute('playback.step',{deltaTime:.1,steps:Math.min(25,left)});};
const capture=async name=>{await sleep(300);const shot=await bridgeQuery('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'melee-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));};
const load=async()=>{await key('F5');await key('F10');await key('KeyX');await ui('solo');await ui('continue');assert.equal((await state()).mode,'playing');};
const report={passed:false,scope:'Native Release editor, untouched default map/armies/resources/AI, actual UI input and rendering',physicalInput:false,executable:process.env.MENGINE_EDITOR_EXECUTABLE,executableSha256:crypto.createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex'),sourceScriptSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'))).digest('hex'),startedAt:new Date().toISOString()};
try{
 const boot=await until(()=>bridgeQuery('project.state'),'bridge ready');if(!boot.ready||path.resolve(boot.project.root)!==path.resolve(sample))try{await execute('project.open',{root:sample});}catch(e){if(e.name!=='BridgeConnectionError'&&!/loading|already open/.test(e.message))throw e;}
 await until(async()=>{const p=await bridgeQuery('project.state');return p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample)&&await scene();},'scene ready');
 await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play');await until(async()=>(await state()).mode==='title','title');await execute('playback.pause');await key('F1');
 let s=await state();assert.equal(s.hero,undefined);assert.equal(s.gold,500);assert.equal(s.wood,150);assert.equal(s.selected[0],s.worker.id);assert.equal(s.gatherers.length,5);assert.ok(s.gatherers.every(u=>!u.order));await capture('human-start');
 const worker=s.gatherers[0],lumber=s.gatherers[1],mine=s.resources.find(r=>r.kind==='mine'&&S.distance(worker,r)<14),tree=s.resources.find(r=>r.kind==='tree'&&S.distance(lumber,r)<14);
 await click(point(s,worker));await key('KeyG');await click(point(await state(),mine));await click(point(await state(),lumber));await key('KeyG');await click(point(await state(),tree));await steps(120);s=await state();assert.ok(s.gold>500);assert.ok(s.wood>150);await capture('human-gathering');
 await click(point(s,s.gatherers.find(u=>u.id===worker.id)));await key('KeyB');await button(/^Sanctuary/);await click(point(await state(),{x:-14,z:16}));await steps(160);s=await state();const altar=s.production.find(u=>u.kind==='altar');assert.ok(altar);assert.equal(altar.built,1);
 await click(point(s,altar));const gold=s.gold,wood=s.wood;await button(/^Frost Warden/);s=await state();assert.ok(s.gold>=gold);assert.ok(s.wood>=wood);assert.equal(s.production.find(u=>u.id===altar.id).queue[0].paidGold,0);assert.equal(s.production.find(u=>u.id===altar.id).queue[0].paidWood,0);assert.equal(s.production.find(u=>u.id===altar.id).queue[0].heroClass,0);await capture('human-altar');await load();assert.equal((await state()).production.find(u=>u.id===altar.id).queue[0].heroClass,0);
 await steps(551);s=await state();assert.equal(s.heroes.length,1);assert.equal(s.hero.heroClass,0);await click([35,107]);assert.equal((await state()).selected[0],s.hero.id);await capture('human-hero');
 await steps(Math.max(0,1000-(await state()).frame));s=await state();const ai=s.qaUnits.filter(u=>u.team===1);for(const kind of ['altar','farm','barracks','hero'])assert.ok(ai.some(u=>u.kind===kind&&u.built===1),'actual default AI '+kind);assert.ok(ai.some(u=>S.armies[s.qaTeams[1].faction].units.includes(u.kind)));
 for(let faction=1;faction<4;faction++){
  await key('F10');await key('KeyX');await ui('solo');await ui('custom');await ui('faction');await ui('map0');await ui('mapStart');s=await state();assert.equal(s.faction,faction);assert.equal(s.gold,500);assert.equal(s.wood,150);assert.equal(s.heroes.length,0);assert.equal(s.gatherers.filter(u=>u.kind==='worker').length,faction===3?3:5);assert.ok(s.gatherers.every(u=>!u.order));assert.equal(s.mines.filter(u=>u.team===0).length,faction===3?1:0);await capture(['','orc-start','nightelf-start','undead-start'][faction]);
 }
 const profile=await bridgeQuery('profiler.get_samples',{source:'game',limit:30});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);Object.assign(report,{passed:true,fourFactionDefaultStarts:true,workerSelection:true,explicitGoldAndLumber:true,actualAltarConstruction:true,freeFirstHero:true,savedProduction:true,heroShortcut:true,defaultAiOpening:true,shaderRejections:0});console.log('PASS native actual four-faction starts, gathering, altar/free hero UI, saved production, hero shortcut and default AI opening');
}catch(e){report.error=e.stack;try{fs.writeFileSync(path.join(out,'melee-opening-failure-state.json'),JSON.stringify(await state(),null,2));await capture('opening-failure');}catch{}throw e;}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'melee-opening-native.json'),JSON.stringify(report,null,2)+'\n');try{await execute('playback.stop');}catch{}closeBridgeConnection();}
