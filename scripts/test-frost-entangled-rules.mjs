// Author: MiYu. Original Entangle timing, resident cargo, shared income, persistence and cleanup.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
globalThis.Frost=S;globalThis.FrostArt=require('../samples/frostbound-realms/model-catalog.json');globalThis.FrostEffectArt=require('../samples/frostbound-realms/effect-catalog.json');globalThis.FrostConstructionArt=require('../samples/frostbound-realms/construction-catalog.json');
const V=require('../samples/frostbound-realms/game/visuals.js');globalThis.FrostVisual=V;const E=require('../samples/frostbound-realms/game/effects.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,u,type,args={})=>S.command(s,u.team,{type,ids:[u.id],...args});
function fixture(n=0,instant=true){const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.doodads=[];map.units=[];map.triggers=[];map.props=[{kind:'mine',x:6,z:0,amount:1000},{kind:'tree',x:8,z:8,amount:100}];const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];const base=S.spawn(s,'hall',0,0,0);S.spawn(s,'hall',1,24,-24);const ws=Array.from({length:n},(_,i)=>S.spawn(s,'worker',0,7.3,i*.1));S.visibility(s);const b=instant?S.startEntangle(s,base,s.resources[0],true):null;return {s,base,b,ws};}
function load(f){assert.equal(S.command(f.s,0,{type:'gather',ids:f.ws.map(w=>w.id),resource:0}),null);step(f.s,1);assert.equal(S.mineResidents(f.s,f.b).length,f.ws.length);assert.doesNotThrow(()=>S.restore(f.s));}
{
 const {s,base}=fixture(0,false);assert.equal(cmd(s,base,'entangle',{resource:0}),null);step(s,29);assert.equal(S.entangledMine(s,s.resources[0]),undefined);assert.doesNotThrow(()=>S.restore(s));step(s,1);const b=S.entangledMine(s,s.resources[0]);assert.ok(b&&b.built===0);assert.equal(b.maxHp,800);assert.equal(b.armorValue,2);step(s,599);assert.ok(b.built<1);const saved=S.restore(s);step(s,1);step(saved,1);assert.equal(b.built,1);assert.deepEqual(saved,s);assert.equal(s.teams[0].gold,500);assert.equal(s.teams[0].wood,150);
 assert.match(V.pose(b,V.model(s,b).asset,false,0),/#pose=6:0$/);assert.equal(V.unitPortrait(s,b),'Assets/Art/classic-entangle-mine.png');
}
for(const n of [1,2,3,4,5]){
 const f=fixture(n);load(f);f.b.goldLeft=1;f.b.goldIndex=0;const gold=f.s.teams[0].gold;step(f.s,50);assert.equal(f.s.teams[0].gold,gold+10*n);assert.equal(f.s.resources[0].amount,1000-10*n);assert.ok(f.ws.every(w=>w.inside===f.b.id&&w.cargo===0&&w.gatherCd===0));const view=V.model(f.s,f.b),pose=V.classicSample(f.b,view.asset,false,.3);assert.equal(view.asset.animations[pose.clip].name,'Stand Work '+['First','Second','Third','Fourth','Fifth'][n-1]);
 const definitions=FrostConstructionArt.owners[view.asset.sourceModel.replace(/\\/g,'/').toLowerCase()],nodes=definitions.map(d=>({index:d.id,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,d.id,2,0,1],attachment:{...d,visibility:0}})),mesh=V.pose(f.b,view.asset,false,.3,30),fx=E.embedded(f.b,view,mesh,{x:6,y:0,z:0},0,2,{nodes:()=>nodes});assert.equal(fx.length,n);assert.ok(fx.every(e=>e.name==='sharedmodels/entanglewisp.mdx'&&e.parts.length===7&&e.component.looping));
 step(f.s,7);const restored=S.restore(f.s);step(f.s,113);step(restored,113);assert.deepEqual(restored,f.s,'income cursor and cargo round trip');
 f.s.visible[1].fill(1);const enemy=S.publicState(f.s,1),mine=enemy.units.find(u=>u.id===f.b.id);assert.equal(mine.workers,n);assert.equal(mine.goldLeft,undefined);assert.equal(mine.entangleBase,undefined);assert.ok(!enemy.units.some(u=>f.ws.some(w=>w.id===u.id)));assert.equal(V.model(enemy,mine).key,'ClassicEntangledMine');
 assert.equal(cmd(f.s,f.b,'unloadWisps',{target:f.ws[0].id}),null);assert.equal(f.ws[0].inside,undefined);assert.equal(f.b.workers,n-1);assert.doesNotThrow(()=>S.restore(f.s));
}
{
 const f=fixture(5);load(f);const extra=S.spawn(f.s,'worker',0,8,0);assert.match(cmd(f.s,extra,'gather',{resource:0}),/five/);assert.equal(f.b.workers,5);assert.equal(cmd(f.s,f.b,'unloadWisps'),null);assert.equal(f.b.workers,0);assert.ok(f.ws.every(w=>!w.inside));assert.doesNotThrow(()=>S.restore(f.s));
}
{
 const f=fixture(1);load(f);assert.equal(cmd(f.s,f.ws[0],'move',{x:12,z:8,append:true}),null);f.b.goldLeft=.1;f.b.goldIndex=4;step(f.s,1);assert.equal(f.s.teams[0].gold,510);assert.equal(f.ws[0].inside,undefined);assert.equal(f.ws[0].order.type,'move');assert.doesNotThrow(()=>S.restore(f.s));
}
for(const event of ['uproot','mineDeath','baseDeath','depletion']){
 const f=fixture(3);load(f);if(event==='uproot')assert.equal(cmd(f.s,f.base,'uproot'),null);else if(event==='mineDeath')f.b.hp=0;else if(event==='baseDeath')f.base.hp=0;else{f.s.resources[0].amount=7;f.b.goldLeft=.1;f.b.goldIndex=4;}step(f.s,1);assert.equal(f.b.hp,0);assert.equal(f.base.entangleMine,undefined);assert.ok(f.ws.every(w=>!w.inside&&!w.miningInside));assert.doesNotThrow(()=>S.restore(f.s));if(event==='depletion')assert.equal(f.s.teams[0].gold,507);
}
{
 const f=fixture(0,false);assert.equal(cmd(f.s,f.base,'entangle',{resource:0}),null);assert.equal(cmd(f.s,f.base,'cancelEntangle'),null);step(f.s,40);assert.equal(S.entangledMine(f.s,f.s.resources[0]),undefined);cmd(f.s,f.base,'entangle',{resource:0});step(f.s,30);const b=S.entangledMine(f.s,f.s.resources[0]);assert.equal(cmd(f.s,b,'cancelBuild'),null);assert.equal(f.base.entangleMine,undefined);assert.doesNotThrow(()=>S.restore(f.s));
}
{
 const f=fixture(2);load(f);f.s.map.startingHour=22;f.ws[0].hp=100;f.ws[0].stun=.5;f.ws[0].bloodlust=1;step(f.s,10);assert.ok(f.ws[0].hp>100);assert.equal(f.ws[0].stun,0);assert.ok(f.ws[0].bloodlust<1e-6);assert.equal(f.ws[0].cargo,0);
 for(const mutate of [s=>s.units.find(u=>u.id===f.b.id).goldLeft=2,s=>s.units.find(u=>u.id===f.b.id).goldIndex=5,s=>s.units.find(u=>u.id===f.b.id).workers=5,s=>s.units.find(u=>u.id===f.ws[0].id).inside=f.base.id,s=>s.units.find(u=>u.id===f.ws[0].id).order.mineSlot=f.ws[1].order.mineSlot,s=>s.units.find(u=>u.id===f.ws[0].id).cargo=10,s=>s.units.find(u=>u.id===f.ws[0].id).mineEntry.x=Infinity]){const bad=S.clone(f.s);mutate(bad);assert.throws(()=>S.restore(bad));}
}
{
 const {s,ws}=fixture(1,false);s.entangledVersion=0;const w=ws[0];assert.equal(cmd(s,w,'gather',{resource:0}),null);step(s,1);assert.equal(w.cargo,5);assert.doesNotThrow(()=>S.restore(s));
}
for(let f=0;f<4;f++){const s=S.create('skirmish',{factions:[f,0],ai:[false,false]});assert.equal(s.units.filter(u=>u.kind==='entangledmine').length,f===2?1:0);assert.doesNotThrow(()=>S.restore(s));}
{
 const f=fixture(2);load(f);assert.equal(cmd(f.s,f.ws[0],'move',{x:12,z:8,append:true}),null);f.s.map.terrain.fill(1);const before=S.clone(f.s);assert.match(cmd(f.s,f.b,'unloadWisps'),/No clear exit/);assert.deepEqual(f.s,before,'blocked unload is atomic');f.b.goldIndex=4;f.b.goldLeft=.1;step(f.s,1);assert.equal(f.ws[0].mineExitPending,true);const gold=f.s.teams[0].gold;step(f.s,50);assert.equal(f.s.teams[0].gold,gold+10,'pending resident does not earn again; other resident keeps mining');f.s.map.terrain.fill(0);step(f.s,1);assert.equal(f.ws[0].inside,undefined);assert.equal(f.ws[0].order.type,'move');assert.doesNotThrow(()=>S.restore(f.s));
}
{
 const f=fixture(1);load(f);f.ws[0].hp=.2;f.ws[0].frenzy=1;f.ws[0].frenzySource={id:f.base.id,kind:'necromancer',team:1,x:24,z:-24};step(f.s,1);assert.equal(f.ws[0].hp,0);assert.equal(f.ws[0].inside,undefined);assert.equal(f.b.workers,0);assert.doesNotThrow(()=>S.restore(f.s));
}
{
 const f=fixture();assert.equal(cmd(f.s,f.base,'uproot'),null);step(f.s,25);assert.equal(f.base.uprooted,true);assert.equal(cmd(f.s,f.base,'rootAncient'),null);step(f.s,25);assert.equal(f.base.uprooted,false);assert.ok(f.base.entangleCast);assert.doesNotThrow(()=>S.restore(f.s));step(f.s,30);assert.ok(S.entangledMine(f.s,f.s.resources[0]));step(f.s,600);assert.equal(S.entangledMine(f.s,f.s.resources[0]).built,1);
}
{
 const f=fixture(0,false),other=S.spawn(f.s,'hall',0,0,3);S.visibility(f.s);assert.equal(cmd(f.s,f.base,'entangle',{resource:0}),null);assert.match(cmd(f.s,other,'entangle',{resource:0}),/unused visible/);const w=S.spawn(f.s,'worker',1,6,2);f.s.teams[1].faction=3;f.s.visible[1].fill(1);assert.match(cmd(f.s,w,'build',{kind:'hauntedmine',x:6,z:0}),/occupied/);assert.doesNotThrow(()=>S.restore(f.s));
}
console.log('PASS Entangle: 3+60s, five cargo seats, shared rotating income, original work/child art, queued exit, cleanup, save cursor, privacy, buffs, legacy and four factions');
