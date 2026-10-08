// Author: MiYu. Root/Uproot, living building clearance, production, healing and saved forms.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function arena(){const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.props=[];map.units=[];map.triggers=[];const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];S.spawn(s,'hall',1,24,-24);const a=S.spawn(s,'hall',0,0,0);S.visibility(s);return {s,a};}
const cmd=(s,a,type,args={})=>S.command(s,0,{type,ids:[a.id],...args}),up=(s,a)=>{assert.equal(cmd(s,a,'uproot'),null);step(s,25);assert.ok(a.uprooted);};
{
 const {s,a}=arena();assert.ok(S.solid(s,0,0));assert.equal(cmd(s,a,'uproot'),null);assert.equal(a.speed,0);assert.equal(a.uprooted,false);assert.equal(a.ancientShift.left,2.5);const unchanged=S.clone(s);assert.match(cmd(s,a,'move',{x:6,z:0}),/changing/);assert.deepEqual(s,unchanged);step(s,24);assert.ok(!a.uprooted);const saved=S.restore(s);S.tick(s);S.tick(saved);assert.equal(a.uprooted,true);assert.equal(a.speed,.4);assert.equal(S.unitType(a).armor,'heavy');assert.equal(S.mobile(a),true);assert.equal(S.solid(s,0,0),false,'uprooted Ancient is removed from static obstacle map');assert.deepEqual(s.units,saved.units);assert.equal(cmd(s,a,'move',{x:6,z:0}),null);step(s,80);assert.ok(a.x>2);assert.equal(cmd(s,a,'stop'),null);assert.equal(cmd(s,a,'rootAncient'),null);step(s,24);assert.ok(a.uprooted);S.tick(s);assert.equal(a.uprooted,false);assert.equal(a.speed,0);assert.equal(S.unitType(a).armor,'fortified');assert.ok(S.solid(s,a.x,a.z));assert.equal(s.winner,null,'moving main base still prevents defeat');assert.ok(S.restore(s));
}
{
 const {s,a}=arena();s.teams[0].gold=10000;assert.equal(cmd(s,a,'train',{kind:'worker'}),null);const paid=s.teams[0].gold;up(s,a);const left=a.queue[0].left;step(s,100);close(a.queue[0].left,left);assert.equal(s.teams[0].gold,paid);assert.deepEqual(S.trainable(s,a),[]);assert.match(cmd(s,a,'train',{kind:'worker'}),/production/);assert.match(cmd(s,a,'tech'),/idle/);const restored=S.restore(s);assert.equal(cmd(s,a,'rootAncient'),null);assert.equal(cmd(restored,restored.units.find(u=>u.id===a.id),'rootAncient'),null);step(s,Math.ceil((S.trainType(s,'worker',0).time+S.ancientRules.morph)/S.DT));step(restored,Math.ceil((S.trainType(restored,'worker',0).time+S.ancientRules.morph)/S.DT));assert.equal(a.queue.length,0);assert.equal(s.units.filter(u=>u.kind==='worker').length,1);assert.deepEqual(s.units,restored.units);
}
for(const obstacle of ['water','relief','tree','rock','unit','building']){
 const {s,a}=arena();up(s,a);if(obstacle==='water')s.map.terrain[S.index(a.x+2,a.z)]=1;else if(obstacle==='relief')s.map.relief[16*33+16]=.5;else if(obstacle==='tree')s.resources.push({kind:'tree',x:2,z:0,amount:50});else if(obstacle==='rock')s.map.doodads=[{kind:'rock',x:2,z:0,variant:0,scale:1,yaw:0}];else S.spawn(s,obstacle==='unit'?'soldier':'farm',0,2,0);const before=S.clone(s);assert.match(cmd(s,a,'rootAncient'),/footprint/,obstacle);assert.deepEqual(s,before,obstacle+' rejection remains atomic');
}
{
 const {s,a}=arena();up(s,a);s.resources=[{kind:'tree',x:2.1,z:0,amount:600}];a.hp=700;S.visibility(s);assert.equal(cmd(s,a,'eatTree',{resource:0}),null);S.tick(s);assert.equal(s.resources[0].amount,0);assert.equal(a.ancientRegen,30);assert.equal(a.hp,700);assert.equal(s.resources[0].felled.frame,s.frame);const saved=S.restore(s);step(s,300);step(saved,300);close(a.hp,1200);assert.equal(a.ancientRegen,undefined);assert.deepEqual(s.units,saved.units);assert.deepEqual(s.resources,saved.resources);assert.equal(s.teams[0].wood, saved.teams[0].wood);assert.match(cmd(s,a,'eatTree',{resource:0}),/living tree/);assert.ok(s.clearedResources[0].includes(0));
}
{
 const {s,a}=arena();up(s,a);s.resources=[{kind:'tree',x:4,z:0,amount:600},{kind:'tree',x:4,z:2.2,amount:100}];a.hp=700;S.visibility(s);assert.equal(cmd(s,a,'eatTree',{resource:0}),null);step(s,100);assert.equal(s.resources[0].amount,0);const hp=a.hp;a.x=4;a.z=0;assert.equal(cmd(s,a,'eatTree',{resource:1}),null);S.tick(s);assert.equal(a.ancientRegen,30);step(s,10);close(a.hp-hp,500/30*1.1);assert.ok(S.restore(s));
}
{
 const {s,a}=arena();up(s,a);const v=S.spawn(s,'soldier',0,0,0,{damage:0});assert.equal(cmd(s,a,'move',{x:6,z:0}),null);step(s,60);assert.ok(S.distance(a,v)>=S.movementRadius(a)+S.movementRadius(v)-1e-6,'large mobile body escapes overlapping friendly troop');assert.ok(S.restore(s));
}
{
 const {s,a}=arena();up(s,a);s.resources=[{kind:'tree',x:2.1,z:0,amount:600}];a.hp=700;S.visibility(s);assert.equal(cmd(s,a,'eatTree',{resource:0}),null);S.tick(s);assert.equal(cmd(s,a,'rootAncient'),null);step(s,25);close(a.hp,700+500/30*2.5);close(a.ancientRegen,27.5);assert.ok(!a.uprooted);const saved=S.restore(s);step(s,275);step(saved,275);close(a.hp,1200);assert.deepEqual(s.units,saved.units);
}
{
 const {s,a}=arena(),b=S.spawn(s,'hall',0,8,0);assert.equal(S.command(s,0,{type:'uproot',ids:[a.id,b.id]}),null);step(s,25);assert.ok(a.uprooted&&b.uprooted);assert.equal(S.command(s,0,{type:'rootAncient',ids:[a.id,b.id]}),null);step(s,25);assert.ok(!a.uprooted&&!b.uprooted);assert.equal(S.command(s,0,{type:'uproot',ids:[a.id,b.id]}),null);step(s,25);b.x=4;const before=S.clone(s);assert.match(S.command(s,0,{type:'rootAncient',ids:[a.id,b.id]}),/footprint/);assert.deepEqual(s,before);
}
for(const edit of [a=>a.uprooted=1,a=>a.uprooted=true,a=>a.ancientShift={uprooted:false,left:1},a=>a.ancientRegen=31,a=>a.order={type:'eatTree',resource:99},a=>{a.baseFaction=0;a.uprooted=false;}]){const {s,a}=arena();edit(a);assert.throws(()=>S.restore(s));}
{
 const {s,a}=arena(),h=S.spawn(s,'hero',0,12,0,{heroClass:3,inventory:[8],damage:0});S.visibility(s);assert.equal(S.command(s,0,{type:'useItem',ids:[h.id],slot:0,item:8,target:a.id}),null);assert.equal(h.order.type,'townPortal');assert.equal(cmd(s,a,'uproot'),null);step(s,50);assert.equal(h.order,null);assert.equal(h.x,12);assert.match(s.announcements[0],/destination base.*unavailable/);assert.ok(S.restore(s));
}
{
 const {s,a}=arena();up(s,a);assert.equal(cmd(s,a,'hold'),null);assert.equal(S.restore(s).units.find(u=>u.id===a.id).order.type,'hold');assert.equal(cmd(s,a,'patrol',{x:6,z:0}),null);assert.equal(S.restore(s).units.find(u=>u.id===a.id).order.type,'patrol');assert.equal(cmd(s,a,'move',{x:6,z:0}),null);assert.equal(cmd(s,a,'move',{x:6,z:6,append:true}),null);assert.equal(S.restore(s).units.find(u=>u.id===a.id).waypoints.length,1);assert.equal(cmd(s,a,'stop'),null);assert.equal(cmd(s,a,'rootAncient'),null);S.spawn(s,'soldier',0,2,0,{order:{type:'hold'}});step(s,25);assert.ok(a.uprooted);assert.equal(a.speed,.4);assert.equal(a.ancientShift,undefined);assert.match(s.announcements[0],/blocked/);assert.ok(S.restore(s));
}
{
 const {s,a}=arena();delete a.uprooted;assert.equal(S.restore(s).units.find(u=>u.id===a.id).uprooted,false);a.baseRules=0;assert.match(cmd(s,a,'uproot'),/Night Elf/);assert.equal(S.restore(s).units.find(u=>u.id===a.id).uprooted,undefined);
}
{
 globalThis.Frost=S;globalThis.FrostArt=createRequire(import.meta.url)('../samples/frostbound-realms/model-catalog.json');const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
 for(const tier of [1,2,3]){
  const {s,a}=arena();a.upgradeTier=tier;const rooted=V.model(s,a);assert.ok(!rooted.asset.classicUprooted);
  const clip=walking=>rooted.asset.animations[V.classicSample(a,rooted.asset,walking,.3).clip].name;
  assert.match(clip(false),/Stand Alternate/i);a.ancientShift={uprooted:true,left:1.25};const moving=V.model(s,a);assert.ok(moving.asset.classicUprooted);assert.equal(moving.key,rooted.key);assert.match(clip(false),/^Morph Alternate$/i);
  const at12=V.classicSample(a,moving.asset,false,0),at30=V.classicSample(a,moving.asset,false,0,undefined,30);assert.ok(Math.abs(at12.frame/12-at30.frame/30)<=1/12);
  delete a.ancientShift;a.uprooted=true;a.speed=.4;assert.match(clip(true),/^Walk$/i);a.ancientRegen=30;assert.match(clip(false),/^Spell Eat Tree$/i);delete a.ancientRegen;a.cd=.8;assert.match(clip(false),/^Attack/i);a.cd=0;assert.ok(!/Alternate/i.test(clip(false)));a.ancientShift={uprooted:false,left:1.25};assert.equal(clip(false),'Morph');
 }
}
{
 const {s,a}=arena(),h=S.spawn(s,'hero',0,12,0,{heroClass:3,inventory:[8],damage:0});S.visibility(s);assert.equal(S.command(s,0,{type:'useItem',ids:[h.id],slot:0,item:8,target:a.id,x:S.townPortal.baseRange-.1,z:0}),null);up(s,a);assert.equal(cmd(s,a,'move',{x:-6,z:0}),null);step(s,10);assert.ok(S.distance(a,h.order)>S.townPortal.baseRange);const saved=S.restore(s);step(s,15);step(saved,15);assert.equal(h.order,null);assert.equal(h.x,12);assert.deepEqual(s.units,saved.units);
}
{
 const {s,a}=arena();up(s,a);const dest=S.spawn(s,'hall',0,-20,0,{damage:0}),blocker=S.spawn(s,'hall',0,-15.8,0,{damage:0,uprooted:true}),h=S.spawn(s,'hero',0,5,0,{heroClass:3,inventory:[8],damage:0});S.visibility(s);assert.equal(S.command(s,0,{type:'useItem',ids:[h.id],slot:0,item:8,target:dest.id,x:blocker.x,z:blocker.z}),null);step(s,50);assert.equal(a.x,0,'a mobile Ancient remains a building, not a portal passenger');assert.equal(blocker.x,-15.8);assert.ok(h.x< -10);assert.ok(S.distance(h,blocker)>=S.movementRadius(h)+S.movementRadius(blocker)+.1);assert.ok(S.restore(s));
}
console.log('PASS Ancients: exact 2.5s forms, heavy/fortified armor, moving collision and static footprint removal, suspended paid production, root terrain/body rejection, full non-stacking 500HP/30s Eat Tree, native tree fall, exact saves and invalid metadata');
