// Author: MiYu. Capture both native MOBA bases and inspect the actual rendered objective parts.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {nativeQaRoot,configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),base=process.env.MENGINE_QA_PROJECT_ROOT||source,root=path.join(nativeQaRoot,'moba-art-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'docs/designs/frostbound-realms'),hash=raw=>createHash('sha256').update(raw).digest('hex');
const receipt=JSON.parse(fs.readFileSync(path.join(source,'moba-model-sources.json')));
for(const p of [process.env.MENGINE_EDITOR_EXECUTABLE,path.join(repo,'packages/agent/mcp/server.mjs'),path.join(source,'Assets/Scenes/Main.mscene')])assert.ok(p&&fs.existsSync(p),'Missing QA prerequisite: '+p);
for(const r of receipt.files)assert.equal(hash(fs.readFileSync(path.join(source,r.path))),r.sha256,'Signed asset: '+r.path);
configureNativeQa(root);fs.mkdirSync(sample);
function linkTree(from,to){fs.mkdirSync(to,{recursive:true});for(const entry of fs.readdirSync(from)){const src=path.join(from,entry),dst=path.join(to,entry);if(fs.statSync(src).isDirectory())linkTree(src,dst);else fs.linkSync(src,dst);}}
linkTree(path.join(base,'Assets'),path.join(sample,'Assets'));
function replaceFile(relative,raw){const p=path.join(sample,relative);fs.mkdirSync(path.dirname(p),{recursive:true});if(fs.existsSync(p))fs.unlinkSync(p);fs.writeFileSync(p,raw);}
for(const r of receipt.files.filter(r=>r.path.startsWith('Assets/')))replaceFile(r.path,fs.readFileSync(path.join(source,r.path)));
replaceFile('Assets/Scenes/Main.mscene',fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene')));
const original=fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'),'utf8'),instrumented=original.replace('  return {tick};',"  return {tick,qaView:which=>{solo('moba');team=which;camera=which?[21,-21]:[-21,21];zoom=12;},qaFocus:()=>{const ancient=state.units.find(u=>u.team===team&&u.mobaObjective?.role==='ancient');selected=[ancient.id];camera=[ancient.x,ancient.z];zoom=6;}};").replace('JSON.stringify({mode,','JSON.stringify({qaUnits:state.units,qaMap:map,mode,');
replaceFile('Assets/Scripts/Main.js',Buffer.from(instrumented+"\nvar qaViewTeam=-1,qaRenderTick=onTick;onTick=function(dt,frame){var control=engine.storage.load('moba-art-view');if(control&&control.team!==qaViewTeam){qaViewTeam=control.team;FrostClient.qaView(qaViewTeam);}if(control?.focus)FrostClient.qaFocus();qaRenderTick(dt,frame);};\n"));
const project={...JSON.parse(fs.readFileSync(path.join(source,'project.json'))),storageId:'moba-art-'+path.basename(root)};fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));fs.mkdirSync(storage,{recursive:true});
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs'),require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;globalThis.FrostArt=Object.assign({},...['model-catalog','druid-models','moba-models'].map(n=>require('../samples/frostbound-realms/'+n+'.json')));const V=require('../samples/frostbound-realms/game/visuals.js');
const execute=async(n,args={})=>{const r=await bridgeExecute(n,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),step=()=>execute('playback.step',{deltaTime:.1,steps:1}),state=async()=>JSON.parse((await query('entity.get',{name:'Frost telemetry'})).components.Text.text);
const report={author:'MiYu',passed:false,root,sample,storage,sourceClientSha256:hash(original),sceneSha256:hash(fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene'))),editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),models:[],screenshots:[],scope:'Owned native Editor, scripted view changes, physical asset paths. Inspects real mesh/pose references and transforms; no physical input or cross-machine acceptance.'};
async function capture(team,frame,focus){
  const deadline=Date.now()+30000;let profile;while(Date.now()<deadline){profile=(await query('profiler.get_samples',{source:'game',limit:1})).nativeLatest;if(profile?.worldRevision===frame)break;await sleep(200);}assert.equal(profile?.worldRevision,frame,'Screenshot uses the stepped native world revision');
  const shot=await query('view.screenshot',{target:'game'}),name=(focus?'moba-ancient-':'moba-base-')+(team?'scourge':'sentinel')+'.png';fs.writeFileSync(path.join(out,name),Buffer.from(shot.dataUrl.split(',')[1],'base64'));report.screenshots.push({name,team,frame,worldRevision:profile.worldRevision});console.log('PASS native base',team);
}
try{
 await query('project.state');try{await execute('project.open',{root:sample});}catch(error){if(!/workspace is still loading|A project is already open|lifecycle is busy|request timed out|did not finish loading/.test(error.message))throw error;}
 const deadline=Date.now()+120000;let ready=false;while(Date.now()<deadline){const p=await query('project.state');if(p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample)){ready=true;break;}await sleep(500);}assert.ok(ready,'native project ready');
 await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play',{paused:true});
 await execute('playback.input',{pointer:[640,230],viewport:[1280,720]});await step();
 for(const team of [0,1]){
  fs.writeFileSync(path.join(storage,'moba-art-view.json'),JSON.stringify({team}));await step();const renderedStep=await step(),live=await state();assert.equal(live.mode,'playing');assert.equal(live.kind,'moba');assert.equal(live.team,team);const world=await query('scene.snapshot');
  const objectives=live.qaUnits.filter(u=>u.team===team&&u.mobaObjective&&['ancient','ranged'].includes(u.mobaObjective.role));assert.equal(objectives.length,4,'One ancient and three ranged barracks per base');
  for(const u of objectives){
   const view=V.model({teams:[{},{}]},u),index=live.qaUnits.findIndex(v=>v.id===u.id),prefix='Unit '+index,parts=world.entities.filter(e=>e.active!==false&&(e.name===prefix||e.name.startsWith(prefix+' part '))&&e.components.MeshRenderer);
   assert.ok(parts.length,'native objective geometry visible');for(const part of parts){assert.ok(part.components.Transform.scale.every(v=>Math.abs(v-view.scale)<.00001));assert.ok(view.asset.parts.some(p=>part.components.MeshRenderer.mesh.startsWith(p.mesh)));}
   const clip=V.classicClip(view.asset,'Stand',u);assert.ok(parts.every(p=>p.components.MeshRenderer.mesh.includes('#pose='+clip+':')),'correct rooted/stand source clip');report.models.push({team,role:u.mobaObjective.role,key:view.key,scale:view.scale,clip,visibleParts:parts.length,worldSize:view.asset.size.map(v=>v*view.scale)});
  }
  await capture(team,renderedStep.frame,false);
  fs.writeFileSync(path.join(storage,'moba-art-view.json'),JSON.stringify({team,focus:true}));const closeup=await step();await capture(team,closeup.frame,true);
 }
 const profile=await query('profiler.get_samples',{source:'game',limit:20}),logs=await query('console.get_logs',{limit:100});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.materialPipelinesRejected=0;report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);try{report.logs=await query('console.get_logs',{limit:40});}catch{}}
finally{try{await execute('playback.stop');}catch{}try{report.shutdown=await closeNativeQa(root);}catch(error){report.shutdownError=error.message;report.passed=false;process.exitCode=1;}closeBridgeConnection();fs.writeFileSync(path.join(out,'native-moba-art-validation.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,sample,report:path.join(out,'native-moba-art-validation.json')}));
