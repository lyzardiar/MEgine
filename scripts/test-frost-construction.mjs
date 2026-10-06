// Author: MiYu. Source visibility, complete attachment transforms and actual game construction presentation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {nativeNodeQueries} from './frost-native-node-fixture.mjs';
const require=createRequire(import.meta.url),root=new URL('../samples/frostbound-realms/',import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),art=require('../samples/frostbound-realms/model-catalog.json'),construction=require('../samples/frostbound-realms/construction-catalog.json');
globalThis.Frost=S;globalThis.FrostArt=art;globalThis.FrostEffectArt=require('../samples/frostbound-realms/effect-catalog.json');globalThis.FrostConstructionArt=construction;globalThis.engine={assets:nativeNodeQueries()};
const V=require('../samples/frostbound-realms/game/visuals.js'),E=require('../samples/frostbound-realms/game/effects.js');globalThis.FrostVisual=V;
const matrix=t=>{const [x,y,z,w]=t.rotation,[sx,sy,sz]=t.scale;return [(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,...t.position,1];};
const close=(a,b,label)=>assert.ok(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<.00002,label);
for(const rotation of [[.2,.3,.4,.8],[.7,.1,.2,.1],[.1,.8,.1,.1],[.1,.1,.8,.1]])for(const scale of [[2,3,4],[-2,3,4]]){
  const norm=Math.hypot(...rotation),original=matrix({position:[3,4,5],rotation:rotation.map(v=>v/norm),scale}),converted=E.nodeTransform(original,{x:0,y:0,z:0},0,1);close(matrix(converted),original,'complete quaternion/scale/reflection reconstruction');
}
assert.equal(E.nodeTransform(matrix({position:[0,0,0],rotation:[0,0,0,1],scale:[0,1,1]}),{x:0,y:0,z:0},0,1),null);
const shear=matrix({position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});shear[4]=.2;assert.throws(()=>E.nodeTransform(shear,{x:0,y:0,z:0},0,1),/affine/);
let sampled=0,visible=0,hidden=0;const sources=new Set();
for(const [key,asset] of Object.entries(art)){
  const owner=asset.sourceModel?.replace(/\\/g,'/').toLowerCase();if(!construction.owners[owner]||sources.has(owner))continue;sources.add(owner);
  for(const progress of [0,.1,.5,.99,1]){
    const u={kind:'hall',team:0,built:progress,hp:100,cd:0},mesh=V.pose(u,asset,false,0,30),at=E.anchors(mesh,.37,1.4),nodes=at.nodes().filter(n=>n.attachment?.path),rendered=E.embedded(u,{key,asset},mesh,{x:2,y:3,z:4},.37,1.4,at);
    const expected=nodes.filter(n=>n.attachment.visibility>.001&&E.nodeTransform(n.matrix,{x:2,y:3,z:4},.37,1.4));assert.equal(rendered.length,expected.length,owner+' authored KATV');
    for(const e of rendered){const node=expected.find(n=>n.index===e.node);assert.equal(e.name,node.attachment.path.replace(/\\/g,'/').replace(/\.mdl$/i,'.mdx').toLowerCase());close(matrix(e),matrix(E.nodeTransform(node.matrix,{x:2,y:3,z:4},.37,1.4)),'native full node transform');assert.match(e.parts[0].mesh,/#pose=\d+:\d+@30$/);assert.equal(e.component.playing,false);assert.ok(e.component.time_seconds<=60);visible++;}
    hidden+=nodes.length-rendered.length;sampled++;
  }
}
assert.equal(sources.size,16);assert.ok(visible>0&&hidden>0);assert.notEqual(construction.models['sharedmodels/ubirth.mdx'].effect,construction.models['buildings/undead/ziggurat/ubirth.mdx'].effect);
const completedAltar=art.RevenantAltar,stand=V.pose({kind:'altar',built:1,team:0},completedAltar,false,0,30);assert.deepEqual(E.embedded({kind:'altar',built:1},{asset:completedAltar},stand,{x:0,y:0,z:0},0,1,{nodes(){throw Error('Invisible Stand must not query nodes');}}),[]);
const scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,script=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),copy=x=>JSON.parse(JSON.stringify(x));
function client(){
  const values=new Map(),active=new Map(scene.entities.map(e=>[e.entity,e.active!==false])),messages=[];
  const engine={assets:nativeNodeQueries(),snapshot:structuredClone(scene),network:{poll:()=>messages.splice(0),connect(){},close(){},send(){}},storage:{load(){},save(){}},setActive:(id,on)=>active.set(id,on),playAudio(){},pushCommandJson:raw=>{const c=JSON.parse(raw);values.set(c.entity+'/'+c.component,c.value);}};
  const context=vm.createContext({engine});vm.runInContext(script,context);vm.runInContext('const constructionCreate=Frost.create;Frost.create=(mode,options)=>{globalThis.constructionState=constructionCreate(mode,options);return constructionState;};',context);
  const entity=name=>scene.entities.find(e=>e.name===name),component=(name,key)=>values.get(entity(name).entity+'/'+key)||entity(name).components[key],tick=(input={},dt=.001)=>{engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};context.onTick(dt);},key=k=>{tick({pressedKeys:[k],keys:[k]});tick();};tick();key('F1');return {context,tick,key,component,on:n=>active.get(entity(n).entity),messages};
}
const c=client(),F=c.context.Frost,s=c.context.constructionState;s.units=[];s.resources=[];s.teams.forEach(t=>{t.ai=false;t.faction=3;t.gold=5000;t.wood=5000;});for(const field of ['terrain','heights','relief','ramps'])s.map[field].fill(0);s.map.props=[];
F.spawn(s,'hall',0,-8,0,{damage:0});F.spawn(s,'hall',1,24,24,{damage:0});const worker=F.spawn(s,'worker',0,0,0,{damage:0});F.visibility(s);assert.equal(F.command(s,0,{type:'build',ids:[worker.id],kind:'altar',x:2,z:0}),null);const building=s.units.at(-1);for(let i=0;i<20;i++)F.tick(s);assert.ok(building.construction.started);c.tick();const name='Classic attachment '+s.units.indexOf(building)+' 0';assert.ok(c.on(name));assert.match(c.component(name,'SampledEffect').effect,/SharedModels\/UBirth\.mfx$/);assert.ok(scene.entities.filter(e=>e.name.startsWith(name+' mesh ')).some(e=>c.on(e.name)));
c.key('F10');const frozen=copy(c.component(name,'SampledEffect')),transform=copy(c.component(name,'Transform'));c.tick({},.2);assert.deepEqual(copy(c.component(name,'SampledEffect')),frozen);assert.deepEqual(copy(c.component(name,'Transform')),transform);assert.ok(F.restore(s));
const saved=F.clone(s),authority=F.publicState(saved,0),peerName='Classic attachment '+authority.units.findIndex(u=>u.id===building.id)+' 0',a=client(),b=client();for(const peer of [a,b]){peer.key('F10');peer.key('KeyX');peer.key('Enter');peer.key('F1');peer.messages.push({type:'connected'},{type:'message',data:{type:'joined',team:0,token:'construction-art',code:'BUILD',state:copy(authority)}});peer.tick();}assert.ok(a.on(peerName));assert.deepEqual(copy(a.component(peerName,'SampledEffect')),copy(b.component(peerName,'SampledEffect')));assert.deepEqual(copy(a.component(peerName,'Transform')),copy(b.component(peerName,'Transform')));a.tick({},.2);assert.deepEqual(copy(a.component(peerName,'SampledEffect')),frozen,'authority construction phase is frozen without new snapshot');
c.key('Escape');s.visible[0].fill(0);building.team=1;c.tick();assert.equal(c.on(name),false,'fog hides embedded model');building.team=0;F.visibility(s);c.tick();assert.ok(c.on(name));assert.equal(F.command(s,0,{type:'cancelBuild',ids:[building.id]}),null);c.tick();assert.equal(c.on(name),false,'cancelled construction removes embedded model');
const completed=F.spawn(s,'altar',0,2,0,{built:1,damage:0});c.tick();const done='Classic attachment '+s.units.indexOf(completed)+' 0';assert.equal(c.on(done),false,'completed Stand uses authored visibility');
console.log('PASS construction art:',sampled,'source poses;',visible,'visible and',hidden,'hidden embedded nodes; exact path identities, full transforms, actual build/cancel, pause, fog, save and authoritative clients');
