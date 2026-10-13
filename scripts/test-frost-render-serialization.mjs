// Author: MiYu. Verify water parameters and pooled component commands against the preceding generated client.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const baseline=execFileSync('git',['show','13c011c:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),candidate=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
function fixture(source){
  const world=clientWorldFixture(scene,true),commands=[],push=world.engine.pushCommandJson;
  const engine=Object.assign(world.engine,{pushCommandJson:raw=>{const c=JSON.parse(raw);if(c.op==='setComponent'&&c.component==='MaterialPropertyBlock'&&/^(Water|Riverbed) \d+$/.test(world.snapshot.entities.find(e=>e.entity===c.entity)?.name??''))commands.push(c);push(raw);},assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){}});
  const context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  vm.runInContext(source.replace('  return {tick};',"  return {tick,present(next,nextMode,nextTeam){state=next;editMap=next.map;mode=nextMode;team=nextTeam;time+=.1;render(engine.input);}};"),context);
  engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};context.onTick(0);world.commit();
  const state=context.Frost.create('skirmish',{ai:[false,false]});state.units=[];state.resources=[];
  for(let team=0;team<2;team++){state.visible[team].fill(1);state.explored[team].fill(1);}
  return {world,state,context,commands,present(mode='playing',team=0){commands.length=0;context.FrostClient.present(state,mode,team);world.commit();}};
}
const before=fixture(baseline),after=fixture(candidate);let comparisons=0;
function compare(label,mode='playing',team=0){before.present(mode,team);after.present(mode,team);assert.deepEqual(after.commands,before.commands,label+' parsed water commands');const nodes=f=>f.world.snapshot.entities.filter(e=>/^(Water|Riverbed) \d+$/.test(e.name)).map(e=>({name:e.name,active:e.active,components:e.components}));assert.deepEqual(nodes(after),nodes(before),label+' native water state');comparisons++;}
const edit=fn=>{for(const f of [before,after])fn(f.state,f.context);};
compare('initial water');
compare('same simulation clock');assert.equal(after.commands.length,0,'unchanged water remains silent');
edit(s=>s.frame++);compare('advanced simulation clock');assert.ok(after.commands.length>0);
edit(s=>s.visible[0].fill(0));compare('explored fog');edit(s=>s.explored[0].fill(0));compare('unexplored fog');compare('other team fog','playing',1);
for(const tileset of [1,2,0]){edit(s=>s.map.tileset=tileset);compare('tileset '+tileset);}
edit((s,c)=>{c.FrostWater.palettes[0].colors.Smin[0]+=.05;c.FrostWater.texRate+=.25;c.FrostTerrain.names[0]='edited cells';});compare('mutable palette animation rates and names');
edit((s,c)=>c.FrostWater.palettes[0].colors={});compare('empty palette colors');
compare('editor clock','editor');compare('editor advancing clock','editor');
edit((s,c)=>{s.map=c.Frost.clone(s.map);s.map.terrain.fill(1);s.map.heights.fill(0);s.map.ramps.fill(0);s.map.relief.fill(0);});compare('replacement wet geometry');
edit((s,c)=>{s.map=c.Frost.clone(s.map);s.map.terrain.fill(0);});compare('replacement dry geometry');
edit((s,c)=>delete c.FrostWater.palettes[0]);compare('dry map without palette');
compare('title world transition','title');compare('restore game','playing');
const poolSources=[execFileSync('git',['show','13c011c:samples/frostbound-realms/game/effect-pool.js'],{encoding:'utf8'}),fs.readFileSync(new URL('game/effect-pool.js',root),'utf8')];
function poolFixture(source){const context=vm.createContext({}),commands=[],component='quoted " component\\name\n',entity={entity:4294967390,active:true,components:{[component]:{stale:true}}},entities={'Unit 0':entity};vm.runInContext(source,context);const pool=context.FrostEffectPool.create({pushCommandJson:raw=>commands.push(JSON.parse(raw))},entities,{},()=>{});return {pool,commands,component,entity};}
const pools=poolSources.map(poolFixture);
for(const f of pools){const input={position:[.1,-0,NaN,Infinity,undefined],nested:{text:'"\\\n',omitted:undefined}};f.pool.setComponent('Unit 0',f.component,input);input.position[0]=99;f.pool.beginFrame();assert.deepEqual(f.commands[0],f.commands[1],'retry owns independent normalized JSON');f.entity.components[f.component]=f.commands[1].value;f.pool.beginFrame();assert.equal(f.commands.length,2,'acknowledged write stops retry');}
assert.deepEqual(pools[1].commands,pools[0].commands,'initial and retry component commands retain canonical values and escaping');
for(const f of pools){const count=f.commands.length;f.pool.setComponent('Unit 0',f.component,undefined);assert.equal(f.commands.length,count);f.pool.setComponent('Unit 0',f.component,{temporary:'pending'});assert.throws(()=>f.pool.setComponent('Unit 0',f.component,undefined));let called=0;const value={toJSON(){called++;return {text:'owned',array:[1,null]};}};f.pool.setComponent('Unit 0',f.component,value);value.toJSON=()=>{throw Error('caller mutation must not affect retry');};f.pool.beginFrame();assert.equal(called,1);}
assert.deepEqual(pools[1].commands,pools[0].commands,'toJSON snapshot and retries remain equivalent');
console.log(JSON.stringify({author:'MiYu',passed:true,waterComparisons:comparisons,poolChecks:7,scope:'Exact water commands/native state through clocks, fog, teams, tilesets, palette/rate/name edits, mutable maps, editor and menu transitions; pooled canonical JSON, escaping, detached retries and native acknowledgement.'}));
