// Author: MiYu. Isolated native Release rendering and real UI input for tree felling.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag=process.env.MENGINE_QA_TAG||Date.now(),root=path.join(process.env.MENGINE_QA_ROOT||path.join(repo,'tmp'),'frost-tree-felling-'+tag),sample=path.join(root,'sample'),out=path.join(repo,'docs/designs/frostbound-realms');
fs.mkdirSync(root,{recursive:true});fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='frost-tree-felling-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const script=path.join(sample,'Assets/Scripts/Main.js'),product=fs.readFileSync(script,'utf8');
assert.equal(product.split('JSON.stringify({mode,').length,2);assert.equal(product.split('receive();controls(input,dt);').length,2);
fs.writeFileSync(script,product.replace('JSON.stringify({mode,','JSON.stringify({qaResources:state.resources,qaFrame:state.frame,qaPaused:paused,mode,').replace('receive();controls(input,dt);',"if(input.pressedKeys.includes('KeyJ'))qaBiome=(qaBiome+1)%3;receive();controls(input,dt);")+`
// MiYu: native-only harvesting fixture; product gathering and presentation remain unchanged.
var qaBiome=0,qaCreate=Frost.create;
Frost.create=(mode,options={})=>{
  if(mode!=='skirmish'||options.map)return qaCreate(mode,options);
  const map=Frost.defaultMap();map.name='Tree felling';map.tileset=qaBiome;for(const field of ['terrain','heights','relief','ramps'])map[field].fill(0);map.props=[{kind:'tree',x:-6,z:16,amount:100},{kind:'tree',x:1,z:16,amount:100}];map.units=[];map.spawns=[[-6,20],[22,-20]];map.players.forEach(p=>p.ai=false);
  const s=qaCreate(mode,{...options,map,ai:[false,false]});s.units=[];Frost.spawn(s,'hall',0,-14,16);Frost.spawn(s,'hall',1,22,-20);Frost.spawn(s,'worker',0,-8,16);s.resources[0].amount=5;Frost.visibility(s);return s;
};
`);
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(root,'config');fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows '+(process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS||'');
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs'),require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(path.join(source,'model-catalog.json')));const V=require('../samples/frostbound-realms/game/visuals.js');
const execute=async(name,args={})=>{report.lastCommand=name;const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Frost telemetry').components.Text.text),step=(steps=1,deltaTime=.1)=>execute('playback.step',{deltaTime,steps});
const key=async k=>{await execute('playback.input',{keys:[k]});await step();await execute('playback.input',{keys:[]});await step();};
const click=async p=>{await execute('playback.input',{pointer:p,viewport:[1280,720],buttons:[0]});await step();await execute('playback.input',{buttons:[]});await step();};
const point=(s,p)=>{const angle=Math.atan2(V.camera.height,V.camera.depth);return [640+(p.x-s.camera[0])/s.zoom*360,360+((p.z-s.camera[1])*Math.sin(angle)-(p.y||0)*Math.cos(angle))/s.zoom*360];};
const capture=async name=>{await execute('playback.input',{pointer:[640,230],viewport:[1280,720]});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'tree-felling-'+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));};
const report={author:'MiYu',passed:false,protocol:S.PROTOCOL,tag,scope:'Native Release QuickJS, Agent pointer/keyboard input, all biomes and material parts, pause and saved-game continuation',physicalInput:false,audioListening:false,biomes:[]};
async function check(tileset,active=true){
  const s=await state(),r=s.qaResources[0],scene=await snapshot(),v=V.resource(r,s.zoom,tileset),rootNode=scene.entities.find(e=>e.name==='Prop 0');assert.equal(rootNode.active!==false,active);
  for(let i=0;i<V.environmentPartCount();i++){
    const e=scene.entities.find(e=>e.name==='Prop 0'+(i?' part '+i:'')),part=active&&v?.parts[i];assert.equal(e.active!==false,!!part);
    if(!part)continue;assert.equal(e.components.MeshRenderer.mesh,part.mesh);assert.equal(e.components.MeshRenderer.material,part.material);
    const t=e.components.Transform,rotation=v.rotation||[0,Math.sin(v.yaw/2),0,Math.cos(v.yaw/2)];for(let j=0;j<4;j++)assert.ok(Math.abs(t.rotation[j]-rotation[j])<.02,'part quaternion');for(let j=0;j<3;j++){assert.ok(Math.abs(t.position[j]-[r.x,-(v.sink||0),r.z][j])<1e-6);assert.ok(Math.abs(t.scale[j]-v.scale)<1e-6);}
    if(i)assert.deepEqual(t,rootNode.components.Transform,'all material parts share a root-pivot transform');
  }
  return s;
}
try{
  const boot=await query('project.state');if(!boot.ready||path.resolve(boot.project.root)!==path.resolve(sample)){try{await execute('project.open',{root:sample});}catch(e){if(!/request timed out|lifecycle is busy|workspace is still loading|A project is already open/.test(e.message))throw e;}}
  for(let i=0;;i++){const p=await query('project.state');if(p.ready&&p.editorReady){assert.equal(path.resolve(p.project.root),path.resolve(sample));break;}if(i>=120)throw Error('Native project readiness timeout');await sleep(500);}
  await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play');await sleep(500);await execute('playback.pause');await step(2);
  for(const tileset of [0,1,2]){
    if(tileset){await key('F10');await key('KeyX');assert.equal((await state()).mode,'title');await key('KeyJ');}
    await key('F1');let s=await check(tileset);assert.equal(s.mode,'playing');assert.equal(s.qaResources[0].amount,5);await capture(['winter-standing','forest-standing','barrens-standing'][tileset]);
    await key('KeyG');await click(point(await state(),{x:-6,z:16}));s=await check(tileset);assert.equal(s.qaResources[0].amount,0);assert.ok(s.qaResources[0].felled);
    await step(5);s=await check(tileset);await capture(['winter-falling','forest-falling','barrens-falling'][tileset]);
    await key('Escape');s=await state();assert.equal(s.qaPaused,true);const frozen=(await snapshot()).entities.filter(e=>/^Prop 0(?: part \d+)?$/.test(e.name)).map(e=>e.components.Transform);await step(10);assert.equal((await state()).qaFrame,s.qaFrame);assert.deepEqual((await snapshot()).entities.filter(e=>/^Prop 0(?: part \d+)?$/.test(e.name)).map(e=>e.components.Transform),frozen);
    if(tileset===1){
      await key('Escape');await key('F5');const saved=await state();assert.match(saved.notice,/Saved quicksave/);await key('F10');await key('KeyX');await click([1090,206]);await click([1090,363]);const loaded=await state();assert.equal(loaded.mode,'playing');assert.equal(loaded.qaResources[0].felled.frame,saved.qaResources[0].felled.frame);assert.equal(loaded.qaResources[0].felled.yaw,saved.qaResources[0].felled.yaw);assert.ok(Math.abs(loaded.qaResources[0].felled.age-saved.qaResources[0].felled.age)<=.31);assert.ok(loaded.qaFrame>=saved.qaFrame-1&&loaded.qaFrame<=saved.qaFrame+3);await check(tileset);
    }else await key('Escape');
    await step(15);await check(tileset);await capture(['winter-fallen','forest-fallen','barrens-fallen'][tileset]);await step(50);await check(tileset,false);
    const profile=await query('profiler.get_samples',{source:'game',limit:30});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);report.biomes.push({tileset,materialParts:tileset===1?3:1,harvestInput:true,standingFallingFallenCleared:true,sharedTransform:true,pauseFrozen:true,midFallSaveRestore:tileset===1,shaderRejections:0});
  }
  report.passed=true;console.log(JSON.stringify(report));
}catch(e){report.error=e.stack;try{report.failureState=await state();await capture('failure');}catch{}process.exitCode=1;console.error(e.stack);}
finally{fs.writeFileSync(path.join(out,'tree-felling-native-qa.json'),JSON.stringify(report,null,2)+'\n');try{await execute('playback.stop');}catch{}closeBridgeConnection();}
