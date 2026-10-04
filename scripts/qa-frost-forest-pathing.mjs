// Author: MiYu. Isolated native Release rendering and real UI input for forest pathing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag=process.env.MENGINE_QA_TAG||Date.now(),root=path.join(process.env.MENGINE_QA_ROOT||path.join(repo,'tmp'),'frost-forest-pathing-'+tag),sample=path.join(root,'sample'),out=path.join(repo,'docs/designs/frostbound-realms');
fs.mkdirSync(root,{recursive:true});fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='frost-forest-pathing-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const script=path.join(sample,'Assets/Scripts/Main.js'),product=fs.readFileSync(script,'utf8');
assert.equal(product.split('JSON.stringify({mode,').length,2);assert.equal(product.split('receive();controls(input,dt);').length,2);
const fixture=`
// MiYu: native-only forest passage fixture with ordinary product resource and movement rules.
var qaBiome=0,qaDefault=Frost.defaultMap;
Frost.defaultMap=(mode)=>{const map=qaDefault(mode);if(map.mode!=='skirmish')return map;map.name='Forest passage';map.tileset=qaBiome;for(const field of ['terrain','heights','relief','ramps'])map[field].fill(0);map.props=Array.from({length:30},(_,i)=>({kind:'tree',x:-6,z:-29+i*2,amount:100}));map.units=[{kind:'worker',team:0,x:-8,z:17},{kind:'soldier',team:0,x:-11,z:17},{kind:'dragon',team:0,x:-10,z:23}];map.spawns=[[-6,21],[22,-20]];map.players.forEach(p=>p.ai=false);return map;};
`;
fs.writeFileSync(script,product.replace('var FrostClient=',fixture+'var FrostClient=').replace('JSON.stringify({mode,','JSON.stringify({qaResources:state.resources,qaUnits:state.units,qaMap:map,qaCleared:state.clearedResources,qaFrame:state.frame,mode,').replace('receive();controls(input,dt);',"if(input.pressedKeys.includes('KeyJ'))qaBiome=(qaBiome+1)%3;receive();controls(input,dt);")+`
var qaCreate=Frost.create;
Frost.create=(mode,options={})=>{if(mode!=='skirmish'||options.map)return qaCreate(mode,options);const s=qaCreate(mode,{...options,map:Frost.defaultMap(mode),ai:[false,false]});s.units=[];Frost.spawn(s,'hall',0,-20,20);Frost.spawn(s,'hall',1,22,-20);Frost.spawn(s,'worker',0,-8,17);Frost.spawn(s,'soldier',0,-11,17);Frost.spawn(s,'dragon',0,-10,23);s.resources.find(r=>r.z===17).amount=5;Frost.visibility(s);return s;};
`);
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows '+(process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS||'');
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs'),require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(path.join(source,'model-catalog.json')));const V=require('../samples/frostbound-realms/game/visuals.js');
const execute=async(name,args={})=>{report.lastCommand=name;const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Frost telemetry').components.Text.text),step=(steps=1,deltaTime=.1)=>execute('playback.step',{deltaTime,steps});
const key=async k=>{await execute('playback.input',{keys:[k]});await step();await execute('playback.input',{keys:[]});await step();};
const click=async(p,button=0)=>{await execute('playback.input',{pointer:p,viewport:[1280,720],buttons:[button]});await step();await execute('playback.input',{buttons:[]});await step();};
const point=(s,p)=>{const angle=Math.atan2(V.camera.height,V.camera.depth);return [640+(p.x-s.camera[0])/s.zoom*360,360+((p.z-s.camera[1])*Math.sin(angle)-(p.y||0)*Math.cos(angle))/s.zoom*360];};
const capture=async name=>{await execute('playback.input',{pointer:[640,230],viewport:[1280,720]});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'forest-pathing-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));};
const report={author:'MiYu',passed:false,protocol:S.PROTOCOL,tag,scope:'Native Release QuickJS and Agent input: sealed forests, harvest passages, flying, building previews, save/load and map-editor placement',physicalInput:false,audioListening:false,biomes:[]};
const actor=(s,kind)=>s.qaUnits.find(u=>u.kind===kind&&u.team===0),select=async kind=>{const s=await state(),u=actor(s,kind);await click(point(s,{...u,y:S.unitHeight({map:s.qaMap},u)}));assert.deepEqual((await state()).selected,[u.id]);return u;};
const preview=async p=>{await execute('playback.input',{pointer:point(await state(),p),viewport:[1280,720]});await step();return (await snapshot()).entities.find(e=>e.name==='Placement preview').components.MaterialPropertyBlock.base_color;};
try{
  const boot=await query('project.state');if(!boot.ready||path.resolve(boot.project.root)!==path.resolve(sample)){try{await execute('project.open',{root:sample});}catch(e){if(!/request timed out|lifecycle is busy|workspace is still loading|A project is already open/.test(e.message))throw e;}}
  for(let i=0;;i++){const p=await query('project.state');if(p.ready&&p.editorReady){assert.equal(path.resolve(p.project.root),path.resolve(sample));break;}if(i>=120)throw Error('Native project readiness timeout');await sleep(500);}
  await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play');await sleep(500);await execute('playback.pause');await step(2);
  for(const tileset of [0,1,2]){
    if(tileset){await key('F10');await key('KeyX');assert.equal((await state()).mode,'title');await key('KeyJ');}
    await key('F1');let s=await state();assert.equal(s.tileset,tileset);await select('soldier');await click(point(await state(),{x:2,z:17}),2);await step(20);s=await state();assert.ok(actor(s,'soldier').x<=-6-S.TREE_RADIUS-S.movementRadius({kind:'soldier'})+.01);await capture(['winter-blocked','forest-blocked','barrens-blocked'][tileset]);
    await select('worker');await key('KeyB');await key('KeyF');const invalid=await preview({x:-6,z:17});assert.ok(invalid.every((v,i)=>Math.abs(v-[1,.18,.12,.5][i])<1e-6));const gold=(await state()).gold;await click(point(await state(),{x:-6,z:17}));assert.equal((await state()).gold,gold);assert.match((await state()).notice,/clear flat dry/);await key('Escape');
    await select('dragon');await click(point(await state(),{x:2,z:23}),2);await step(25);assert.ok(actor(await state(),'dragon').x>0);
    await select('worker');await key('KeyG');await click(point(await state(),{x:-6,z:17}));s=await state();const ri=s.qaResources.findIndex(r=>r.z===17);assert.equal(s.qaResources[ri].amount,0);assert.ok(s.qaCleared[0].includes(ri));await select('soldier');await click(point(await state(),{x:2,z:17}),2);await step(40);assert.ok(actor(await state(),'soldier').x>0);await capture(['winter-opened','forest-opened','barrens-opened'][tileset]);
    if(tileset===1){await key('F5');const saved=await state();assert.match(saved.notice,/Saved quicksave/);await key('F10');await key('KeyX');await click([1090,206]);await click([1090,363]);s=await state();assert.equal(s.mode,'playing');assert.deepEqual(s.qaCleared,saved.qaCleared);assert.equal(s.qaResources[ri].amount,0);}
    const profile=await query('profiler.get_samples',{source:'game',limit:30});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);report.biomes.push({tileset,sealedGround:true,harvestOpensPassage:true,airCrosses:true,redBuildingPreviewAndNoPayment:true,clearedResourceKnowledge:true,saveLoad:tileset===1,shaderRejections:0});
  }
  await key('F10');await key('KeyX');await key('F4');let s=await state();assert.equal(s.mode,'editor');const props=s.qaMap.props.length,units=s.qaMap.units.length;await key('Digit4');await click(point(await state(),{x:-9,z:17}));s=await state();assert.equal(s.qaMap.props.length,props);assert.match(s.notice,/Keep trees clear/);await key('KeyV');await click(point(await state(),{x:-6,z:17}));s=await state();assert.equal(s.qaMap.units.length,units);assert.match(s.notice,/Clear trees/);await click(point(await state(),{x:-11,z:13}));assert.equal((await state()).qaMap.units.length,units+1);await key('F5');await key('F6');assert.equal((await state()).qaMap.units.length,units+1);await capture('editor');report.editor={treeOverActorRejected:true,groundUnitOverTreeRejected:true,clearGroundPlacement:true,mapSaveLoad:true};
  report.passed=true;console.log(JSON.stringify(report));
}catch(e){report.error=e.stack;try{report.failureState=await state();await capture('failure');}catch{}process.exitCode=1;console.error(e.stack);}
finally{fs.writeFileSync(path.join(out,'forest-pathing-native-qa.json'),JSON.stringify(report,null,2)+'\n');try{await execute('playback.stop');}catch{}closeBridgeConnection();}
