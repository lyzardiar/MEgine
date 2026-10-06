// Author: MiYu. Native battle status rendering, pause, authoritative TCP peers and reconnect.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fork,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms'),tag=Date.now(),sample=path.join(process.env.MENGINE_QA_ROOT||'D:/MEngineNativeQA','status-effects-'+tag,'sample'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const executable=process.env.MENGINE_EDITOR_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/mengine-editor-tauri.exe',originalCreate=S.create,peers=[],sleep=ms=>new Promise(r=>setTimeout(r,ms)),nativeAnchors=process.argv.includes('--native-anchors'),classicNodes=nativeAnchors||process.argv.includes('--classic-nodes'),billboardArt=classicNodes||process.argv.includes('--billboard-art'),spellArt=billboardArt||process.argv.includes('--spell-art'),capturePrefix=nativeAnchors?'native-anchor':classicNodes?'classic-node':billboardArt?'classic-billboard':spellArt?'classic-spell':'classic-status',reportName=nativeAnchors?'native-anchor-art-qa.json':classicNodes?'native-classic-node-art-qa.json':billboardArt?'native-billboard-art-qa.json':spellArt?'native-spell-art-qa.json':'native-status-effects-qa.json';
function fixture(create,mode,options={},withSpells=false){
  const s=create(mode,options);if(mode!=='skirmish')return s;
  s.map.terrain.fill(0);s.map.heights.fill(0);s.map.relief.fill(0);s.map.ramps.fill(0);s.map.props=[];s.resources=[];s.units=[];s.teams.forEach(t=>t.ai=false);
  for(let team=0;team<2;team++){
    for(let faction=0;faction<4;faction++)Frost.spawn(s,'hall',team,-15+faction*10,team?0:10,{baseRules:1,baseFaction:faction,hp:180,maxHp:1000,damage:0,...(faction===2?{ancientRegen:30}:{})});
    const squad=[];for(let i=0;i<4;i++)squad.push(Frost.spawn(s,i===1?'hero':'soldier',team,-12+i*8,team?-5:16,{hp:100,maxHp:1000,damage:0,mana:0,order:{type:'hold'},...(i===0?{itemRegen:{hp:2,mana:0,left:45}}:i===1?{itemRegen:{hp:0,mana:3,left:30}}:i===2?{sanctuary:true}:{cripple:60})}));
    if(withSpells){
      const caster=Frost.spawn(s,'shaman',team,-10,team?-5:16,{casterRank:2,mana:400,damage:0}),shieldCaster=Frost.spawn(s,'shaman',team,10,team?-5:16,{casterRank:1,mana:400,damage:0}),base=s.units.find(u=>u.team===team&&u.kind==='hall');
      squad[1].inventory=[8];for(const command of [{type:'casterSpell',ids:[caster.id],spell:'bloodlust',target:squad[0].id},{type:'casterSpell',ids:[shieldCaster.id],spell:'lightningShield',target:squad[3].id},{type:'useItem',ids:[squad[1].id],slot:0,item:8,target:base.id,x:base.x+3,z:base.z+1}]){const error=Frost.command(s,team,command);if(error)throw Error(error);}
    }
  }
  Frost.visibility(s);return s;
}
globalThis.Frost=S;S.create=(mode,options)=>fixture(originalCreate,mode,options,spellArt);
const app=createServer({port:0}),address=await app.listening;
fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='status-effects-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const script=path.join(sample,'Assets/Scripts/Main.js');let body=fs.readFileSync(script,'utf8');body=body.replace("address='127.0.0.1:7788'","address='127.0.0.1:"+address.port+"'");assert.ok(body.includes('var FrostClient='));body=body.replace('var FrostClient=',`const nativeEffectCreate=Frost.create;Frost.create=(mode,options)=>(${fixture.toString()})(nativeEffectCreate,mode,options,${spellArt});\nvar FrostClient=`);fs.writeFileSync(script,body);
fs.writeFileSync(path.join(out,nativeAnchors?'native-anchor-art-fixture.json':classicNodes?'classic-node-art-fixture.json':billboardArt?'billboard-art-fixture.json':spellArt?'spell-art-fixture.json':'status-effects-fixture.json'),JSON.stringify({sample,method:'Isolated copies of the game assets and a deterministic battlefield fixture'},null,2)+'\n');
if(process.argv.includes('--prepare-only')){await app.close();S.create=originalCreate;console.log('Prepared status battlefield:',sample);process.exit(0);}
function peer(i){
  const config=path.join(repo,'tmp','status-effects-peer-'+tag+'-'+i);fs.mkdirSync(config,{recursive:true});
  const debug=process.env.MENGINE_QA_DEBUG_PORT?' --remote-debugging-port='+(Number(process.env.MENGINE_QA_DEBUG_PORT)+i):'';
  const child=fork(path.join(repo,'scripts/qa-frostbound.mjs'),['--peer'],{cwd:repo,env:{...process.env,MENGINE_EDITOR_CONFIG_DIR:config,MENGINE_EDITOR_EXECUTABLE:executable,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:(process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS||'')+debug},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});child.stderr.on('data',b=>process.stderr.write(b));
  let serial=0;const waiting=new Map();child.on('message',m=>{const request=waiting.get(m.id);if(request){clearTimeout(request.timer);waiting.delete(m.id);m.error?request.reject(Error(m.error)):request.resolve(m.result);}});
  const call=(op,name,args)=>new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject,timer:setTimeout(()=>reject(Error('QA timeout '+name)),90000)});child.send({id,op,name,args});});
  const p={child,query:(n,a)=>call('query',n,a),execute:(n,a)=>call('execute',n,a),close:()=>call('close')};peers.push(p);return p;
}
const snapshot=p=>p.query('scene.snapshot'),state=async p=>JSON.parse((await snapshot(p)).entities.find(e=>e.name==='Frost telemetry').components.Text.text),until=async(check,label,timeout=60000)=>{const end=Date.now()+timeout;while(Date.now()<end){const result=await check();if(result)return result;await sleep(350);}throw Error('Timed out '+label);};
// Wait through the in-flight frame and the frame that consumes each input edge.
const press=async(p,key)=>{for(const keys of [[key],[]]){const before=(await p.query('editor.state')).frame;await p.execute('playback.input',{keys,viewport:[1280,720]});await until(async()=>(await p.query('editor.state')).frame>=before+2,'native input frame');}};
async function open(p){
  await p.query('project.state');try{await p.execute('project.open',{root:sample});}catch(e){if(!/workspace is still loading|BridgeConnectionError|did not finish loading|A project is already open/.test(e.message))throw e;}
  await until(async()=>{const s=await p.query('project.state');return s.ready&&s.editorReady&&path.resolve(s.project.root)===path.resolve(sample);},'native project');
  await p.execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await p.execute('panel.focus',{kind:'game'});await p.execute('playback.play');await until(async()=>(await state(p)).mode==='title','native title');
}
async function capture(p,name){const shot=await p.query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));}
async function effects(p){return (await snapshot(p)).entities.filter(e=>e.active!==false&&e.name.startsWith('Classic status ')&&e.components.Transform.position[1]>-50);}
async function spells(p){return (await snapshot(p)).entities.filter(e=>e.active!==false&&e.name.startsWith('Classic spell ')&&e.components.SampledEffect&&e.components.Transform.position[1]>-50);}
async function checkAnchors(p){
  const world=await snapshot(p),entities=world.entities,camera=entities.find(e=>e.name==='Strategy camera').components.Transform;
  const matrix=t=>{const [x,y,z,w]=t.rotation,[sx,sy,sz]=t.scale;return [(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,0,0,0,1];},view=matrix(camera),cache=new Map();let comparisons=0,maxError=0;
  for(const e of entities){
    if(e.active===false||!e.components.SampledEffect||e.components.Transform.position[1]<-50)continue;
    const matched=e.name.match(/^Classic (status|spell) (\d+) (\w+)$/);if(!matched||matched[3]==='portalArea')continue;
    const owner=entities.find(n=>(n.name==='Unit '+matched[2]||n.name.startsWith('Unit '+matched[2]+' part '))&&n.active!==false&&n.components.MeshRenderer?.mesh.includes('#pose=')),mesh=owner?.components.MeshRenderer?.mesh;if(!mesh)continue;
    const model=matrix(owner.components.Transform),key=mesh+'|'+JSON.stringify(model);let nodes=cache.get(key);
    if(!nodes){const split=mesh.indexOf('#pose='),probe=process.env.MENGINE_POSE_PROBE_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/examples/gltf_bounds.exe',run=spawnSync(probe,['--nodes',path.join(sample,mesh.slice(0,split))+mesh.slice(split),'--billboard-camera='+[-view[8],-view[9],-view[10],view[4],view[5],view[6]].join(','),'--billboard-model='+model.join(',')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr||run.error?.message);nodes=JSON.parse(run.stdout).nodes;assert.ok(Array.isArray(nodes));cache.set(key,nodes);}
    const point=name=>nodes.find(n=>name.test((n.name||'').trim()))?.position;
    let local=point(/^Origin Ref$/i)||[0,0,0],slot=matched[3];
    if(slot==='bloodlustLeft')local=point(/^Hand Left Ref$/i)||local;
    else if(slot==='bloodlustRight')local=point(/^Hand Right Ref$/i)||local;
    else if(slot.startsWith('fire')){const points=['First','Second','Third'].map(n=>point(new RegExp('^Sprite '+n+' Ref$','i'))).filter(Boolean),large=point(/^Sprite Large Ref$/i);if(large)points.push(large);if(!points.length)continue;local=points[Number(slot.slice(4))];if(!local)continue;}
    const expected=owner.components.Transform.position.map((v,i)=>v+model[i]*local[0]+model[4+i]*local[1]+model[8+i]*local[2]),actual=e.components.Transform.position,error=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));assert.ok(error<.0002,e.name+' native anchor error '+error);comparisons++;maxError=Math.max(maxError,error);
  }
  assert.ok(comparisons>=16,'native attachment comparisons '+comparisons);return {comparisons,maxPositionError:maxError,method:'One atomic native world snapshot, actual actor pose references and camera transforms against compiled node probe'};
}
const report={method:'Native editor Game View, Agent input and real TCP server',sample,editorSha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),passed:false};
try{
  const a=peer(0);await open(a);await press(a,'F1');await until(async()=>(await state(a)).mode==='playing','solo battle');await sleep(600);
  const observed=await effects(a),paths=observed.map(e=>e.components.SampledEffect.effect);assert.ok(observed.length>=16,observed.length+' active original status effects');for(const name of ['HealingSalveTarget','ClarityTarget','Staff_Sanctuary_Target','RejuvenationTarget','CrippleTarget','ElfLargeBuildingFire','UndeadLargeBuildingFire'])assert.ok(paths.some(p=>p.includes(name)),name);
  if(nativeAnchors)report.soloAnchors=await checkAnchors(a);
  report.solo={active:observed.length,sources:[...new Set(paths)]};await capture(a,capturePrefix+'-battlefield');
  if(spellArt){
    const roots=await spells(a),sources=roots.map(e=>e.components.SampledEffect.effect);for(const name of ['BloodLustTarget','BloodLustSpecial','LightningShieldTarget','MassTeleportTo'])assert.ok(sources.some(p=>p.includes(name)),name);report.spells={active:roots.length,sources:[...new Set(sources)]};
    await a.execute('playback.pause');const hero=(await state(a)).heroes.find(u=>u.order?.type==='townPortal');assert.ok(hero);await a.execute('playback.step',{deltaTime:S.DT,steps:Math.ceil(hero.order.left/S.DT)+1});const arrivals=(await spells(a)).filter(e=>e.components.SampledEffect.effect.includes('MassTeleportTarget'));assert.ok(arrivals.length>=2);report.portalArrivals=arrivals.length;await capture(a,capturePrefix+'-arrival');await a.execute('playback.play');
  }
  await press(a,'F10');await until(async()=>(await state(a)).paused,'game pause');const paused=await effects(a),pausedSpells=spellArt?await spells(a):[];await sleep(450);const after=await effects(a);assert.deepEqual(after.map(e=>e.components.SampledEffect),paused.map(e=>e.components.SampledEffect));if(spellArt)assert.deepEqual((await spells(a)).map(e=>e.components.SampledEffect),pausedSpells.map(e=>e.components.SampledEffect));if(nativeAnchors){assert.deepEqual(after.map(e=>e.components.Transform),paused.map(e=>e.components.Transform));assert.deepEqual((await spells(a)).map(e=>e.components.Transform),pausedSpells.map(e=>e.components.Transform));}report.gamePause=true;
  await press(a,'KeyX');await press(a,'Enter');await press(a,'F1');await until(async()=>(await state(a)).room,'host lobby');const code=(await state(a)).room,b=peer(1);await open(b);await press(b,'Enter');await press(b,'F3');await until(async()=>(await state(b)).mode==='rooms','room browser');await press(b,'Enter');await until(async()=>(await state(b)).room===code,'guest joins');await press(b,'Enter');await press(a,'Enter');await press(a,'Enter');await until(async()=>(await state(a)).netStates>8&&(await state(b)).netStates>8,'authoritative frames');
  for(const p of [a,b]){const active=await effects(p);assert.ok(active.length>=16);assert.ok(active.every(e=>e.components.SampledEffect.playing===false),'source time comes from authority');}if(nativeAnchors)report.networkAnchors=[await checkAnchors(a),await checkAnchors(b)];
  report.network={hostActive:(await effects(a)).length,guestActive:(await effects(b)).length};if(spellArt){for(const p of [a,b])assert.ok((await spells(p)).some(e=>e.components.SampledEffect.effect.includes('BloodLustTarget')));report.network.spells=[(await spells(a)).length,(await spells(b)).length];await press(b,'Space');}await capture(b,capturePrefix+'-network');const guest=[...app.clients].find(c=>c.player?.team===1);assert.ok(guest);guest.socket.destroy();await until(async()=>[...app.clients].some(c=>c!==guest&&c.player?.team===1)&&(await state(b)).mode==='playing','guest reconnect');assert.ok((await effects(b)).length>=16);if(spellArt)assert.ok((await spells(b)).some(e=>e.components.SampledEffect.effect.includes('BloodLustTarget')));report.reconnect=true;
  for(const [i,p] of peers.entries()){const profile=await p.query('profiler.get_samples',{source:'game',limit:20}),logs=await p.query('console.get_logs',{limit:100});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);if(billboardArt)assert.ok(profile.nativeLatest.counts.billboardMeshes>0,'native camera-facing geometry is loaded');assert.ok(!/sampled effect:|cannot load texture|viewport (mesh|texture).*could not be loaded|unsupported component|ReferenceError|TypeError/i.test(JSON.stringify(logs)),JSON.stringify(logs));report['peer'+i]={counts:profile.nativeLatest.counts,logs};}
  report.passed=true;console.log('PASS native original '+(spellArt?'spell geometry and status':'status')+' battlefield, frozen pause, two real TCP clients and reconnect');
}catch(e){report.error=e.stack;for(const [i,p] of peers.entries())try{report['failure'+i]={state:await state(p),logs:await p.query('console.get_logs',{limit:50})};await capture(p,'classic-status-failure-'+i);}catch{}process.exitCode=1;console.error(e.stack);}
finally{fs.writeFileSync(path.join(out,reportName),JSON.stringify(report,null,2)+'\n');for(const p of peers){try{await p.execute('playback.stop');await p.close();}catch{}p.child.kill();}await app.close();S.create=originalCreate;}
