// Author: MiYu. Original console layout, anchored controls and native viewport interaction.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const editorOnly=process.argv.includes('--editor-only');
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag=Number(process.env.MENGINE_QA_TAG)||Date.now(),prefix='console-layout',root=path.join(nativeQaRoot,prefix+'-'+tag),sample=path.join(root,'sample'),out=path.join(repo,'docs/designs/frostbound-realms');
configureNativeQa(root);
fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId=prefix+'-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const script=path.join(sample,'Assets/Scripts/Main.js');fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace('JSON.stringify({mode,','JSON.stringify({qaUnits:state.units,qaMap:map,qaArmed:armed,mode,'));
process.env.MENGINE_EDITOR_EXECUTABLE??='D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe';process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs'),require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
let qaViewport=[1280,720];
const H=require('../samples/frostbound-realms/game/hud.js');
const execute=async(n,args={})=>{const r=await bridgeExecute(n,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;},sleep=ms=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await query('entity.get',{name:'Frost telemetry'})).components.Text.text),step=()=>execute('playback.step',{deltaTime:.001,steps:1});
async function until(check,label){const end=Date.now()+120000;while(Date.now()<end){if(await check())return;await sleep(500);}throw Error('Timeout '+label);}
const key=async k=>{await execute('playback.input',{keys:[k],viewport:qaViewport});await step();await execute('playback.input',{keys:[]});await step();};
let hash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',hash.toString(16).padStart(16,'0'));fs.mkdirSync(storage,{recursive:true});
async function load(s){fs.writeFileSync(path.join(storage,'quicksave.json'),JSON.stringify(s));if((await state()).mode==='title')await key('F1');if(!(await state()).paused)await key('F10');await execute('playback.input',{pointer:[640,388],viewport:qaViewport,buttons:[0]});await step();await execute('playback.input',{buttons:[]});await step();assert.equal((await state()).mode,'playing');await key('Space');}
async function capture(name){await execute('playback.input',{pointer:[640,230],viewport:qaViewport});await step();const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}
const report={author:'MiYu',passed:false,sample,editorSha256:createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex'),factions:[],viewports:[],physicalInput:false,audioListening:false};
async function click(n){const r=(await query('entity.get',{name:n})).components.RectTransform,v=H.viewport({viewport:qaViewport}),point=H.rect(r,{viewport:qaViewport});await execute('playback.input',{pointer:[qaViewport[0]/2+point.x*v.scale,qaViewport[1]/2+point.y*v.scale],viewport:qaViewport,buttons:[0]});await step();await execute('playback.input',{buttons:[]});await step();}
try{
 await query('project.state');try{await execute('project.open',{root:sample});}catch(e){if(!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(e.message))throw e;}
 await until(async()=>{const p=await query('project.state');return p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample);},'project');
 await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});await step();
 for(let faction=0;faction<(editorOnly?0:4);faction++){
  const map=S.defaultMap();map.name='Console proportions';map.tileset=1;map.triggers=[];map.units=[];const s=S.create('skirmish',{map,factions:[faction,faction],ai:[false,false]});s.units=[];s.resources=[];
  S.spawn(s,'hall',0,-9,5,{upgradeTier:3});S.spawn(s,'farm',0,2,5);const hero=S.spawn(s,'hero',0,-4,-4);hero.inventory=[6];hero.hp=200;S.spawn(s,'worker',0,2,-4);S.visibility(s);await load(S.restore(s));
  let world=await snapshot();const skin=['human','orc','night-elf','undead'][faction];for(let i=0;i<9;i++){const e=world.entities.find(e=>e.name==='HUD Console '+i);assert.equal(e.active,true);assert.equal(e.components.Image.sprite,'Assets/Art/console-'+skin+'-'+i+'.png');}assert.equal(world.entities.find(e=>e.name==='HUD Frame Info').active,false);assert.equal(world.entities.find(e=>e.name==='HUD Live portrait').active,true);
  await click('item0 box');assert.ok((await state()).hero.hp>200,'visible item slot uses the carried healing potion');await capture('console-layout-'+skin);report.factions.push({faction,sourceConsolePieces:9,itemClick:true});console.log('PASS native original console faction',faction);
 }
 for(const viewport of (editorOnly?[]:[[1024,768],[1920,1080],[2560,1080]])){
  qaViewport=viewport;await execute('view.set_game_resolution',{resolution:{width:viewport[0],height:viewport[1]}});await execute('playback.input',{viewport});await execute('playback.step',{deltaTime:.1,steps:1});await key('Space');
  const world=await snapshot(),v=H.viewport({viewport}),r=n=>H.rect(world.entities.find(e=>e.name===n).components.RectTransform,{viewport});
  for(const n of ['Minimap','HUD Live portrait','action0 box','action11 box','item0 box','item5 box','hudMenu box','HUD Gold value']){const p=r(n);assert.ok(p.x-p.w/2>=-v.width/2-1&&p.x+p.w/2<=v.width/2+1&&p.y-p.h/2>=-v.height/2-1&&p.y+p.h/2<=v.height/2+1,n+' stays within viewport');}
  for(const n of ['Minimap','action0 icon','action11 icon','item0 icon','item5 icon']){const p=r(n);assert.ok(Math.abs(p.w-p.h)<1e-6,n+' retains source square proportions');}
  const center=r('HUD Console 6'),left=r('HUD Console 5'),right=r('HUD Console 7');assert.ok(Math.abs(center.x-center.w/2-(left.x+left.w/2))<1e-3&&Math.abs(center.x+center.w/2-(right.x-right.w/2))<1e-3,'source console joins remain continuous across aspect ratios');
  const before=(await state()).camera;await click('Minimap');assert.ok((await state()).camera.every(n=>Math.abs(n)<1e-4),'native float32 pointer centers the minimap within a subpixel');assert.ok(before.some(n=>n!==0));await click('hudMenu box');assert.equal((await state()).paused,true);await key('Escape');assert.equal((await state()).paused,false);
  await key('Space');await click('action0 box');assert.equal((await state()).qaArmed?.type,'move');await key('Escape');
  const name='console-layout-'+viewport.join('x');await capture(name);const raw=fs.readFileSync(path.join(out,name+'.png'));const actual=[raw.readUInt32BE(16),raw.readUInt32BE(20)];report.viewports.push({input:viewport,capture:actual,scale:v.scale,menuClick:true,minimapClick:true,commandClick:true});console.log('PASS native viewport',viewport.join('x'),'capture',actual.join('x'));
 }
 await key('F10');await key('KeyX');await key('F4');assert.equal((await state()).mode,'editor');report.editorViewports=[];
 for(const viewport of [[1280,720],[1024,768],[1920,1080],[2560,1080]]){
  qaViewport=viewport;await execute('view.set_game_resolution',{resolution:{width:viewport[0],height:viewport[1]}});await execute('playback.input',{viewport});await execute('playback.step',{deltaTime:.1,steps:1});
  const world=await snapshot(),input={viewport},v=H.viewport(input),r=n=>H.rect(world.entities.find(e=>e.name===n).components.RectTransform,input);
  report.editorRects={frame:r('HUD Frame Commands'),first:r('action0 box'),last:r('action11 box')};
  const contains=(outer,inner)=>inner.x-inner.w/2>=outer.x-outer.w/2-.01&&inner.x+inner.w/2<=outer.x+outer.w/2+.01&&inner.y-inner.h/2>=outer.y-outer.h/2-.01&&inner.y+inner.h/2<=outer.y+outer.h/2+.01;
  for(const [frame,children] of [['Minimap',['Minimap']],['Portrait',['Portrait']],['Info',['Selection title','Selection stats','Selection queue']],['Commands',Array.from({length:12},(_,i)=>'action'+i+' box')]])for(const child of children)assert.ok(contains(r('HUD Frame '+frame),r(child)),child+' stays in editor '+frame+' panel');
  const info=r('HUD Frame Info');for(let i=0;i<12;i++)assert.ok(r('action'+i+' box').x-r('action'+i+' box').w/2>info.x+info.w/2,'editor commands stay clear of information');
  for(const n of ['HUD Frame Minimap','HUD Frame Portrait','HUD Frame Info','HUD Frame Commands'])assert.ok(contains({x:0,y:0,w:v.width,h:v.height},r(n)),n+' stays in viewport');
  const mini=r('Minimap'),tile=r('Mini tile 0');assert.ok(contains(mini,tile));assert.equal(world.entities.find(e=>e.name==='HUD Frame Inventory').active,false);
  await click('Minimap');assert.ok((await state()).camera.every(n=>Math.abs(n)<1e-4));await click('action9 box');assert.match((await state()).notice,/Saved map/);for(let i=0;i<8;i++)await key('KeyV');assert.equal((await state()).editorPage,8);await click('action8 box');assert.equal((await state()).editorPage,9);await key('KeyV');assert.equal((await state()).editorPage,0);
  const labels=await snapshot();assert.match(labels.entities.find(e=>e.name==='action0 label').components.Text.text,/Ground/,'editor page labels match the current page');await capture('console-editor-'+viewport.join('x'));report.editorViewports.push({input:viewport,containedControls:true,noInfoOverlap:true,minimapClick:true,saveClick:true,pageClick:true});console.log('PASS native editor layout',viewport.join('x'));
 }
 const profile=await query('profiler.get_samples',{source:'game',limit:20}),logs=await query('console.get_logs',{limit:100});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.shaderRejections=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.logs=await query('console.get_logs',{limit:40});await capture('console-layout-failure');}catch{}process.exitCode=1;console.error(e.stack);}
finally{try{await execute('playback.stop');}catch{}try{report.shutdown=await closeNativeQa(root);if(report.passed&&report.shutdown.normalExit)report.cleanup=removeNativeQaFixture(root,storage);}catch(e){report.shutdownError=e.message;report.passed=false;process.exitCode=1;console.error(e.message);}closeBridgeConnection();fs.writeFileSync(path.join(out,editorOnly?'native-editor-layout-qa.json':'native-console-layout-qa.json'),JSON.stringify(report,null,2)+'\n');}
