// Author: MiYu. Altar recruitment, retained hero identity, revival, supply and save validation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map});s.units=[];S.spawn(s,'hall',0,-8,0,{damage:0});S.spawn(s,'farm',0,-8,-8);S.spawn(s,'shop',0,-8,4);const altar=S.spawn(s,'altar',0,0,0),other=S.spawn(s,'altar',0,10,0);S.visibility(s);return {s,altar,other,train:(heroClass,building=altar)=>S.command(s,0,{type:'train',ids:[building.id],kind:'hero',heroClass}),revive:(h,building=altar)=>S.command(s,0,{type:'revive',ids:[building.id],target:h.id})};}
{
 const {s,altar,other,train}=arena(),gold=s.teams[0].gold,wood=s.teams[0].wood;
 for(const invalid of [-1,4,'0','constructor',null])assert.match(train(invalid),/Invalid hero/);
 assert.equal(train(2),null);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].wood,wood);assert.equal(S.population(s,0).used,5);assert.equal(altar.queue[0].left,55);
 assert.match(train(2,other),/one hero/);assert.match(train(1,other),/tier 2/);
 assert.equal(S.command(s,0,{type:'cancelTrain',ids:[altar.id],index:0}),null);assert.equal(S.population(s,0).used,0);assert.equal(s.teams[0].gold,gold);
 assert.equal(train(2),null);const saved=S.restore(s);step(s,551);step(saved,551);const h=S.heroRoster(s,0)[0];assert.equal(h.heroClass,2);assert.equal(h.skillPoints,1);assert.equal(h.id,S.heroRoster(saved,0)[0].id);assert.equal(S.population(s,0).used,5);
 assert.match(train(2),/one hero/);assert.match(train(0),/tier 2/);s.teams[0].tier=2;s.teams[0].gold=2000;s.teams[0].wood=1000;
 assert.equal(train(0),null);assert.equal(s.teams[0].gold,1575);assert.equal(s.teams[0].wood,900);assert.equal(S.population(s,0).used,10);assert.match(train(3,other),/tier 3/);
 assert.equal(S.command(s,0,{type:'cancelTrain',ids:[altar.id],index:0}),null);assert.equal(s.teams[0].gold,2000);assert.equal(s.teams[0].wood,1000);
 assert.equal(train(0),null);s.teams[0].tier=3;assert.equal(train(3,other),null);assert.match(train(1),/Maximum three/);step(s,551);assert.deepEqual(S.heroRoster(s,0).map(h=>h.heroClass).sort(),[0,2,3]);
 assert.equal(S.population(s,0).used,15);assert.equal(S.heroRoster(S.restore(s),0).length,3);
}
{
 const {s,altar,other,train,revive}=arena();assert.equal(train(1),null);step(s,551);const h=S.heroRoster(s,0)[0];h.x=4;h.z=0;h.order={type:'hold'};h.level=4;h.skillPoints=4;h.xp=70;
 assert.equal(S.command(s,0,{type:'learn',ids:[h.id],slot:0}),null);h.x=-4;assert.equal(S.command(s,0,{type:'buy',ids:[h.id],item:0}),null);h.x=4;
 h.spell[0]=5;h.itemCooldown=8;h.slow=3;h.hp=1;const killer=S.spawn(s,'soldier',1,4,1,{damage:9999,speed:0,order:{type:'attack',target:h.id}});S.visibility(s);step(s,1);killer.damage=0;killer.order={type:'hold'};
 assert.equal(h.hp,0);assert.ok(s.units.includes(h));assert.equal(h.order,null);assert.equal(s.corpses.some(c=>c.id===h.id),false);assert.equal(S.population(s,0).used,5);assert.match(s.announcements[0],/fallen/);
 s.visible[1].fill(1);assert.ok(!S.publicState(s,1).units.some(u=>u.id===h.id),'opponent never receives retained dead hero state');assert.ok(S.publicState(s,0).units.some(u=>u.id===h.id));
 assert.match(revive(killer),/fallen hero/);assert.ok(S.command(s,1,{type:'revive',ids:[altar.id],target:h.id}));s.teams[0].gold=2000;
 assert.deepEqual(S.heroRevival(h),{gold:298,wood:0,time:110});assert.equal(S.heroRevival({...h,level:1}).gold,170);assert.equal(S.heroRevival({...h,level:10}).gold,550);
 assert.equal(revive(h),null);assert.equal(s.teams[0].gold,1702);assert.equal(S.population(s,0).used,5,'revival does not reserve supply twice');assert.match(revive(h,other),/awaiting revival/);
 const queued=S.restore(s);assert.equal(queued.units.find(u=>u.id===altar.id).queue[0].revive,h.id);
 for(const patch of [{revive:killer.id},{revive:0},{heroClass:2},{paidGold:1},{paidWood:10},{left:111}]){const bad=S.clone(s);Object.assign(bad.units.find(u=>u.id===altar.id).queue[0],patch);assert.throws(()=>S.restore(bad),/hero|production/);}
 const duplicate=S.clone(s);duplicate.units.find(u=>u.id===other.id).queue=[S.clone(altar.queue[0])];assert.throws(()=>S.restore(duplicate),/revival/);
 assert.equal(S.command(s,0,{type:'cancelTrain',ids:[altar.id],index:0}),null);assert.equal(s.teams[0].gold,2000);assert.equal(h.hp,0);assert.equal(revive(h,other),null);
 other.hp=0;step(s,1);assert.ok(!s.units.includes(other));assert.equal(revive(h),null,'another altar can resume a hero after the original altar is destroyed');
 const restored=S.restore(s);step(s,1101);step(restored,1101);const copy=restored.units.find(u=>u.id===h.id);
 assert.equal(h.hp,h.maxHp);assert.ok(h.mana>=100&&h.mana<101);assert.equal(h.level,4);assert.equal(h.xp,70);assert.deepEqual(h.skills,[1,0,0,0]);assert.equal(h.skillPoints,3);assert.deepEqual(h.inventory,[8,0]);assert.equal(h.slow,0);assert.equal(h.spell[0],0);assert.equal(h.itemCooldown,0);assert.deepEqual(copy.inventory,h.inventory);assert.equal(copy.id,h.id);assert.equal(S.population(s,0).used,5);
}
{
 const {s,altar,train}=arena();assert.equal(train(0),null);const old=S.clone(s);delete old.heroLifecycleVersion;delete old.units.find(u=>u.id===altar.id).queue[0].heroClass;delete old.units.find(u=>u.id===altar.id).queue[0].paidGold;delete old.units.find(u=>u.id===altar.id).queue[0].paidWood;old.units.find(u=>u.id===altar.id).queue[0].left=10;
 const migrated=S.restore(old),queue=migrated.units.find(u=>u.id===altar.id).queue;assert.equal(queue[0].heroClass,0);assert.equal(queue[0].paidGold,300);assert.equal(S.restore(migrated).heroLifecycleVersion,1);const before=migrated.teams[0].gold;
 assert.equal(S.command(migrated,0,{type:'cancelTrain',ids:[altar.id],index:0}),null);assert.equal(migrated.teams[0].gold,before+300);
}
{
 const {s,altar,train,revive}=arena(),h=S.spawn(s,'hero',0,20,20,{hp:0,order:null});for(let i=s.units.length;i<S.LIMIT;i++)S.spawn(s,'soldier',0,-25,25,{order:{type:'hold'}});s.teams[0].gold=1000;
 assert.equal(train(1).includes('tier 2'),true);assert.equal(revive(h),null);altar.queue[0].left=.1;step(s,1);assert.equal(h.hp,h.maxHp,'revival reuses identity even at unit capacity');assert.equal(s.units.length,S.LIMIT);
}
{
 const {s,altar}=arena(),a=S.spawn(s,'hero',0,4,0,{heroClass:0,damage:9999,order:{type:'hold'}}),b=S.spawn(s,'hero',0,4,-1,{heroClass:1,damage:0,order:{type:'hold'}}),victim=S.spawn(s,'soldier',1,4,1,{hp:1,damage:0,speed:0});S.visibility(s);S.command(s,0,{type:'attack',ids:[a.id],target:victim.id});step(s,10);assert.equal(a.xp,17.5);assert.equal(b.xp,17.5,'nearby allied heroes split experience');assert.equal(altar.queue.length,0);
}
{
 const {s}=arena(),hero=S.spawn(s,'hero',0,4,0,{heroClass:0,order:{type:'hold'}}),target=S.spawn(s,'soldier',1,4,1,{hp:1000,maxHp:1000,damage:0,speed:0,order:{type:'hold'}});s.teams[0].upgrade=3;S.visibility(s);S.command(s,0,{type:'attack',ids:[hero.id],target:target.id});step(s,10);assert.equal(target.hp,1000-hero.damage,'ordinary weapon research never increases hero damage');
}
console.log('PASS: hero classes, three/tier limits, first free, exact refunds, retained death/supply, altar revival identity/items/skills, cancellation/destruction, malformed/legacy saves, capacity and shared XP');
