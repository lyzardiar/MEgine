// Author: MiYu. Inventory transactions, active items, world pickup and exact saved orders.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function game(mode='skirmish'){const map=S.defaultMap(mode);map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.props=[];if(mode!=='rpg')map.units=[];map.triggers=[];const s=S.create(mode,{map,ai:[false,false],factions:[0,0]});s.teams[0].gold=10000;return s;}
const hero=s=>s.units.find(u=>u.kind==='hero'&&u.team===0),cmd=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra}),buy=(s,u,item)=>assert.equal(cmd(s,u,'buy',{item}),null),slot=(s,u,type,index)=>cmd(s,u,type,{slot:index,item:u.inventory[index]}),tick=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
{
 const s=game(),u=hero(s),base={maxHp:u.maxHp,damage:u.damage,speed:u.speed};u.hp=u.maxHp*.4;buy(s,u,1);close(u.hp/u.maxHp,.4);
 for(let i=0;i<12;i++){assert.equal(slot(s,u,'dropItem',0),null);close(u.maxHp,base.maxHp);close(u.hp/u.maxHp,.4);const d=s.loot[0];assert.equal(cmd(s,u,'pickup',{loot:d.id}),null);tick(s,1);assert.equal(s.loot.length,0);assert.deepEqual(u.inventory,[1]);close(u.hp/u.maxHp,.4);}
 assert.equal(slot(s,u,'sellItem',0),null);close(u.maxHp,base.maxHp);close(u.damage,base.damage);close(u.speed,base.speed);close(u.hp/u.maxHp,.4);
}
{
 const s=game(),u=hero(s);for(const i of [0,1,2,2,2,2])buy(s,u,i);const snapshot=S.clone(s);assert.match(cmd(s,u,'buy',{item:0}),/full/);assert.deepEqual(s,snapshot);u.hp=u.maxHp*.3;buy(s,u,3);assert.equal(u.inventory.length,5);assert.deepEqual(u.inventory,[2,2,2,2,3]);close(u.hp/u.maxHp,.3);
 const money=s.teams[0].gold;assert.equal(slot(s,u,'sellItem',4),null);assert.equal(s.teams[0].gold-money,Math.floor((180+160+120)/2));
 const before=S.clone(s);assert.match(cmd(s,u,'dropItem',{slot:0,item:0}),/current/);assert.deepEqual(s,before,'stale slot cannot remove a different item');u.x=0;u.z=0;assert.match(slot(s,u,'sellItem',0),/shop/);assert.match(cmd(s,u,'buy',{item:6}),/shop/);
}
{
 const s=game(),u=hero(s);buy(s,u,0);buy(s,u,1);s.teams[0].gold=0;const before=S.clone(s);assert.match(cmd(s,u,'buy',{item:3}),/gold/);assert.deepEqual(s,before,'failed recipe is atomic');assert.match(cmd(s,u,'buy',{item:'constructor'}),/item/);
}
{
 const s=game(),u=hero(s);buy(s,u,6);buy(s,u,7);u.hp=300;u.mana=0;u.x=0;u.z=0;assert.equal(slot(s,u,'useItem',0),null);close(u.hp,550);assert.equal(u.itemCooldown,10);assert.deepEqual(u.inventory,[7]);const before=S.clone(s);assert.match(slot(s,u,'useItem',0),/ready/);assert.deepEqual(s,before);
 tick(s,1);assert.equal(s.events.filter(e=>e.type==='spell').length,1,'item effect reaches the authoritative tick');const copy=S.restore(s);tick(s,100);tick(copy,100);assert.deepEqual(s.units,copy.units);assert.equal(u.itemCooldown,0);assert.equal(slot(s,u,'useItem',0),null);assert.equal(u.inventory.length,0);assert.ok(u.mana>=100);
}
{
 const s=game(),u=hero(s);buy(s,u,6);const before=S.clone(s);assert.match(slot(s,u,'useItem',0),/full/);assert.deepEqual(s,before);u.hp-=100;u.stun=2;assert.match(slot(s,u,'useItem',0),/ready/);assert.deepEqual(u.inventory,[6]);
}
{
 const s=game('rpg'),u=hero(s);buy(s,u,0);assert.equal(slot(s,u,'dropItem',0),null);tick(s,1);assert.equal(s.loot.length,1,'player drops are not automatically picked back up');const d=s.loot[0],other=S.spawn(s,'hero',0,u.x+3,u.z);assert.equal(cmd(s,other,'pickup',{loot:d.id}),null);tick(s,30);assert.deepEqual(other.inventory,[0]);assert.deepEqual(u.inventory,[]);assert.equal(s.loot.length,0);
}
{
 const s=game(),u=hero(s);buy(s,u,2);assert.equal(slot(s,u,'dropItem',0),null);const d=s.loot[0],enemy=s.units.find(v=>v.kind==='hero'&&v.team===1);S.visibility(s);assert.equal(S.publicState(s,1).loot.length,0);assert.match(cmd(s,enemy,'pickup',{loot:d.id}),/visible/);u.x+=8;S.visibility(s);assert.equal(cmd(s,u,'pickup',{loot:d.id}),null);tick(s,3);const copy=S.restore(s);tick(s,100);tick(copy,100);assert.deepEqual(s.units,copy.units);assert.deepEqual(s.loot,copy.loot);assert.deepEqual(u.inventory,[2]);
 assert.equal(slot(s,u,'dropItem',0),null);enemy.x=u.x+1.5;enemy.z=u.z;enemy.damage=0;u.damage=0;S.visibility(s);const loot=s.loot[0];assert.equal(cmd(s,u,'pickup',{loot:loot.id}),null);assert.equal(cmd(s,enemy,'pickup',{loot:loot.id}),null);tick(s,1);assert.equal(u.inventory.length+enemy.inventory.length,1,'one pickup winner across teams');assert.equal(s.loot.length,0);
}
{
 const s=game(),u=hero(s);buy(s,u,0);for(let i=0;i<S.LIMIT-64;i++)s.loot.push({id:++s.serial,x:0,z:0,item:0,manual:true,relic:false});const before=S.clone(s);assert.match(slot(s,u,'dropItem',0),/ground/);assert.deepEqual(s,before);assert.equal(S.restore(s).loot.length,S.LIMIT-64);
 for(const edit of [copy=>copy.loot[0].item='constructor',copy=>copy.loot[0].id=-1,copy=>copy.loot[1].id=copy.loot[0].id,copy=>copy.loot[0].manual='yes',copy=>hero(copy).itemCooldown=11,copy=>hero(copy).order={type:'pickup',target:'constructor'}]){const copy=S.clone(s);edit(copy);assert.throws(()=>S.restore(copy),/Invalid saved/);}
 const old=S.clone(game());delete hero(old).itemCooldown;assert.equal(hero(S.restore(old)).itemCooldown,0);
}
{
 const s=game('rpg'),u=hero(s);for(let i=0;i<6;i++)buy(s,u,2);const target=S.spawn(s,'hero',1,u.x+1,u.z,{tag:'boss'});target.damage=0;target.speed=0;u.damage=10000;
 const kill=()=>{target.x=u.x+1;target.z=u.z;target.hp=1;u.cd=0;assert.equal(cmd(s,u,'attack',{target:target.id}),null);tick(s,1);assert.equal(target.hp,0);};
 kill();const first=s.loot.at(-1).id;tick(s,145);assert.ok(target.hp>0);kill();assert.notEqual(s.loot.at(-1).id,first);assert.equal(S.restore(s).loot.length,2,'repeated respawning boss drops restore');
 while(s.loot.length<S.LIMIT)s.loot.push({id:++s.serial,x:0,z:0,item:0,relic:false});kill();assert.equal(s.loot.length,S.LIMIT);target.tag='keeper';kill();assert.equal(s.loot.length,S.LIMIT-(s.quest.relic?1:0));assert.ok(s.quest.relic||s.loot.some(d=>d.relic));assert.doesNotThrow(()=>S.restore(s));
}
console.log('PASS: six slots, atomic recipes, health-ratio invariance, sell value/shop range, potions/cooldown, real pickup/transfer/race, fog, saved routes and malformed saves');
