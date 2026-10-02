// Author: MiYu. Full Town Portal duration, transport eligibility, immunity, safe arrivals and saved channels.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.players.forEach(p=>p.ai=false);map.props=[{kind:'tree',x:10,z:-5,amount:1000}];const s=S.create('skirmish',{map});s.units=[];const base=S.spawn(s,'hall',0,-24,20,{damage:0}),foe=S.spawn(s,'hall',1,24,-20,{damage:0}),hero=S.spawn(s,'hero',0,10,-10,{inventory:[8],damage:0});S.visibility(s);return {s,base,foe,hero,use:(patch={})=>S.command(s,0,{type:'useItem',ids:[hero.id],slot:0,item:8,target:base.id,...patch})};}
{
 const {s,base,hero,use}=arena(),blocker=S.spawn(s,'soldier',1,-21,17,{damage:0,order:{type:'hold'}});while(s.units.length<S.LIMIT)S.spawn(s,'creep',0,10,-10,{damage:0,order:{type:'hold'}});const army=s.units.filter(u=>u.team===0&&u.kind==='creep');assert.equal(use(),null);step(s,50);assert.equal(s.units.length,S.LIMIT);for(const u of [hero,...army]){assert.ok(u.x<0,'army arrived on the base side');assert.ok(!S.solid(s,u.x,u.z));assert.ok(S.distance(u,blocker)>.8);}const arrived=[hero,...army];for(let i=0;i<arrived.length;i++)for(let j=0;j<i;j++)assert.ok(S.distance(arrived[i],arrived[j])>.8,'capacity arrival does not overlap');
}
{
 const {s,hero}=arena();s.teams[0].ai=true;hero.hp=hero.maxHp*.2;s.frame=39;step(s,1);assert.equal(hero.order.type,'townPortal');assert.deepEqual(hero.inventory,[]);assert.equal(s.teams[0].portalGranted,false,'using an authored scroll does not change first-recruitment history');
}
{
 const {s,base,hero,use}=arena(),repairBase=S.spawn(s,'hall',0,12,0,{hp:10,damage:0}),repairer=S.spawn(s,'worker',0,12,-3),builder=S.spawn(s,'worker',0,13,-8);
 assert.equal(S.command(s,0,{type:'repair',ids:[repairer.id],target:repairBase.id}),null);assert.equal(S.command(s,0,{type:'build',ids:[builder.id],kind:'altar',x:20,z:-8}),null);assert.equal(use(),null);step(s,50);assert.ok(S.distance(hero,base)<8);assert.ok(S.distance(repairer,base)>20);assert.ok(S.distance(builder,base)>20);assert.equal(repairer.order.type,'repair');assert.equal(builder.order.type,'construct');
}
{
 const {s,base,foe,hero,use}=arena();hero.hp=100;assert.equal(S.items[8].gold,350);assert.equal(S.itemValue(8),350);
 const unfinished=S.spawn(s,'hall',0,0,20,{built:.5});for(const patch of [{target:foe.id},{target:unfinished.id},{target:'constructor'},{x:NaN,z:0},{x:31,z:0},{x:0,z:0}]){assert.ok(use(patch));assert.deepEqual(hero.inventory,[8]);assert.equal(hero.order,null);}
 hero.stun=1;assert.match(use(),/disabled/);hero.stun=0;hero.root=1;assert.match(use(),/disabled/);hero.root=0;hero.itemCooldown=10;assert.equal(use(),null);assert.deepEqual(hero.inventory,[]);assert.equal(hero.order.left,5);
 for(const command of [{type:'move',x:0,z:0},{type:'spell',slot:0,x:hero.x,z:hero.z},{type:'buy',item:0},{type:'pickup',loot:1},{type:'learn',slot:0},{type:'useItem',slot:0,item:8}])assert.match(S.command(s,0,{ids:[hero.id],...command}),/channeling/);
 const soldier=S.spawn(s,'soldier',0,12,-12,{damage:0});assert.equal(S.command(s,0,{type:'move',ids:[hero.id,soldier.id],x:15,z:-12}),null);assert.equal(hero.order.type,'townPortal');assert.equal(soldier.order.type,'move');
 const start=[hero.x,hero.z];step(s,49);assert.deepEqual([hero.x,hero.z],start);assert.ok(hero.order.left>0);assert.ok(hero.itemCooldown<6);step(s,1);assert.equal(hero.order,null);assert.ok(S.distance(hero,base)<8);assert.ok(!S.solid(s,hero.x,hero.z));step(s,10);assert.equal(hero.hp,100,'melee main bases do not heal heroes');
}
{
 const {s,base,hero,use}=arena(),near=S.spawn(s,'soldier',0,11,-10,{damage:0}),otherHero=S.spawn(s,'hero',0,12,-10,{damage:0}),flyer=S.spawn(s,'dragon',0,13,-10,{damage:0}),idle=S.spawn(s,'worker',0,10,-12,{damage:0}),busy=S.spawn(s,'worker',0,10,-5,{damage:0}),ghoul=S.spawn(s,'ghoul',0,11,-5,{damage:0}),rooted=S.spawn(s,'soldier',0,9,-10,{root:9,damage:0}),far=S.spawn(s,'soldier',0,28,10,{damage:0}),enemy=S.spawn(s,'soldier',1,10,-9,{damage:0,speed:0});
 s.teams[0].faction=3;const mine={kind:'mine',x:15,z:-5,amount:1000};s.resources.push(mine);s.map.props.push(S.clone(mine));S.spawn(s,'hauntedmine',0,mine.x,mine.z);assert.equal(S.command(s,0,{type:'gather',ids:[busy.id],resource:1}),null);assert.equal(S.command(s,0,{type:'gather',ids:[ghoul.id],resource:0}),null);assert.equal(use(),null);step(s,20);const saved=S.restore(s);step(s,30);step(saved,30);assert.deepEqual(saved,s);
 for(const u of [hero,near,otherHero,flyer,idle])assert.ok(S.distance(u,base)<10,'carried '+u.kind);for(const u of [busy,ghoul,rooted,far,enemy])assert.ok(S.distance(u,base)>15,'left behind '+u.kind);
 const carried=[hero,near,otherHero,idle];for(let i=0;i<carried.length;i++)for(let j=0;j<i;j++)assert.ok(S.distance(carried[i],carried[j])>.8);
}
{
 const {s,base,hero,use}=arena(),ghoul=S.spawn(s,'ghoul',0,11,-5,{damage:0}),join=S.spawn(s,'soldier',0,27,-10,{damage:0});s.teams[0].faction=3;assert.equal(S.command(s,0,{type:'gather',ids:[ghoul.id],resource:0}),null);assert.equal(use(),null);step(s,35);assert.equal(S.command(s,0,{type:'stop',ids:[ghoul.id]}),null);join.x=11;step(s,15);assert.ok(S.distance(ghoul,base)<10);assert.ok(S.distance(join,base)<10,'eligibility is checked at completion');
}
{
 const {s,base,hero,use}=arena(),companion=S.spawn(s,'soldier',0,11,-10,{hp:1,damage:0}),killer=S.spawn(s,'soldier',1,11,-9,{damage:9999,speed:0,order:{type:'attack',target:companion.id}}),caster=S.spawn(s,'shaman',1,10,-12,{casterRank:2,damage:0});S.visibility(s);assert.equal(use(),null);assert.ok(!S.canAttack(killer,hero));assert.match(S.command(s,1,{type:'casterSpell',ids:[caster.id],spell:'purge',target:hero.id}),/Invalid spell target/);
 s.zones.push({team:1,heroClass:0,x:hero.x,z:hero.z,radius:2,damage:9999,slow:5,left:10,pulse:0,slot:3});const hp=hero.hp,mana=hero.mana;step(s,49);assert.equal(hero.hp,hp);assert.ok(hero.mana>mana);assert.ok(!hero.slow);assert.equal(companion.hp,0);step(s,1);assert.ok(S.distance(hero,base)<8);assert.ok(!s.units.includes(companion));
}
{
 const {s,base,hero,use}=arena();for(let z=0;z<32;z++)s.map.terrain[z*32+15]=1;assert.ok(S.path(s,hero,base.x,base.z).at(-1)[0]>=1,'walking cannot cross the water barrier');assert.equal(use({x:base.x+1,z:base.z,target:undefined}),null);step(s,50);assert.ok(S.distance(hero,base)<8,'teleport crosses disconnected terrain');
}
{
 const {s,base,hero,use}=arena();assert.equal(use(),null);step(s,15);assert.equal(S.command(s,0,{type:'stop',ids:[hero.id]}),null);step(s,40);assert.equal(hero.order,null);assert.deepEqual(hero.inventory,[]);assert.ok(S.distance(hero,base)>20,'cancel spends the scroll');
 const second=S.spawn(s,'hall',0,-24,-20,{damage:0});hero.inventory=[8];assert.equal(use(),null);base.hp=0;step(s,1);assert.equal(hero.order,null);assert.match(s.announcements[0],/destroyed/);assert.ok(S.restore(s));assert.equal(second.hp,second.maxHp);
}
{
 const {s,hero,use}=arena();assert.equal(use(),null);for(const patch of [{target:9999},{target:s.units.find(u=>u.team===1).id},{left:6},{left:0},{x:31},{x:0,z:0}]){const bad=S.clone(s);Object.assign(bad.units.find(u=>u.id===hero.id).order,patch);assert.throws(()=>S.restore(bad),/Town Portal/);}
 const bad=S.clone(s);bad.teams[0].portalGranted='false';assert.throws(()=>S.restore(bad),/Town Portal grant/);s.visible[1].fill(1);const visible=S.publicState(s,1).units.find(u=>u.id===hero.id);assert.equal(visible.portalLeft,5);assert.equal(visible.order,null);assert.deepEqual(visible.waypoints,undefined);
 s.map.terrain.fill(1);step(s,50);assert.equal(hero.order,null);assert.match(s.announcements[0],/no free arrival/);
}
{
 const s=S.create('skirmish',{ai:[false,false]}),worker=s.units.find(u=>u.team===0&&u.kind==='worker');assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'altar',x:-14,z:16}),null);step(s,220);const altar=s.units.find(u=>u.team===0&&u.kind==='altar');assert.equal(S.command(s,0,{type:'train',ids:[altar.id],kind:'hero',heroClass:0}),null);step(s,551);const first=S.heroRoster(s,0)[0];assert.deepEqual(first.inventory,[8]);assert.equal(s.teams[0].portalGranted,true);
 s.teams[0].tier=2;s.teams[0].gold=2000;s.teams[0].wood=1000;S.spawn(s,'farm',0,-24,10);assert.equal(S.command(s,0,{type:'train',ids:[altar.id],kind:'hero',heroClass:1}),null);step(s,551);assert.deepEqual(S.heroRoster(s,0).find(u=>u.heroClass===1).inventory,[]);
 const old=S.clone(s);delete old.teams[0].portalGranted;delete old.teams[1].portalGranted;assert.equal(S.restore(old).teams[0].portalGranted,true);first.inventory=[];first.hp=0;first.order=null;assert.equal(S.command(s,0,{type:'revive',ids:[altar.id],target:first.id}),null);step(s,360);assert.deepEqual(first.inventory,[],'revival never replaces a spent scroll');
 first.x=-20;first.z=23;const gold=s.teams[0].gold;assert.equal(S.command(s,0,{type:'buy',ids:[first.id],item:8}),null);assert.equal(s.teams[0].gold,gold-350);assert.deepEqual(first.inventory,[8]);
}
console.log('PASS: first altar scroll, 350-gold repurchase, full 5s channel, immunity/action lock, surviving army/idle workers, busy/rooted exclusions, disconnected terrain, safe arrivals, cancellation/destruction, exact saves and enemy redaction');
