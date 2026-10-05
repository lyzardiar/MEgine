// Author: MiYu. Legacy version 1 melee shop stock, atomic purchases, construction and saved continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function arena(faction=0,mode='skirmish'){const map=S.defaultMap(mode);map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];if(mode!=='rpg')map.units=[];map.triggers=[];const s=S.create(mode,{map,ai:[false,false],factions:[faction,0]});s.itemShopVersion=1;s.units=[];s.teams[0].gold=10000;s.teams[0].wood=10000;s.nextWave=1e9;S.spawn(s,'hall',0,-15,10,{damage:0});S.spawn(s,'hall',1,20,-20,{damage:0});const h=S.spawn(s,'hero',0,0,0,{order:{type:'hold'}}),other=S.spawn(s,'hero',0,0,2,{heroClass:1,order:{type:'hold'}}),shop=S.spawn(s,'shop',0,5,0);return {s,h,other,shop};}
const command=(s,h,item,shop)=>S.command(s,h.team,{type:'buy',ids:[h.id],item,...(shop?{shop:shop.id}:{})}),steps=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function reject(s,h,item,shop,match){const before=S.clone(s);assert.match(command(s,h,item,shop),match);assert.deepEqual(s,before,'rejection must not alter inventory, resources, stock or timers');}
for(let faction=0;faction<4;faction++){
 const {s,h,shop}=arena(faction);shop.hp=0;S.spawn(s,'altar',0,-8,-5);const worker=S.spawn(s,'worker',0,-5,-5),gold=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'shop',x:-1,z:-5}),null);const built=s.units.at(-1);assert.equal(built.kind,'shop');assert.equal(s.teams[0].gold,gold-130);assert.equal(s.teams[0].wood,wood-30);reject(s,h,6,built,/completed friendly/);steps(s,260);assert.equal(built.built,1);assert.equal(command(s,h,6,built),null);assert.equal(built.stock[6].count,2);assert.equal(S.restore(s).units.find(u=>u.id===built.id).stock[6].count,2);
}
{
 const {s,h,other,shop}=arena();assert.equal(command(s,h,0,shop),null);assert.equal(shop.stock[0].count,0);assert.equal(shop.stock[0].left,60);reject(s,other,0,shop,/out of stock/);assert.deepEqual(other.inventory,[]);
 const second=S.spawn(s,'shop',0,7,0);assert.equal(command(s,other,0),null);assert.equal(second.stock[0].count,0,'automatic purchase finds a stocked nearby shop');reject(s,h,0,shop,/out of stock/);
 for(let i=0;i<3;i++)assert.equal(command(s,other,6,shop),null);assert.equal(shop.stock[6].count,0);steps(s,299);assert.equal(shop.stock[6].count,0);const saved=S.restore(s);steps(s,1);steps(saved,1);assert.deepEqual(s.units,saved.units);assert.equal(shop.stock[6].count,1);assert.equal(shop.stock[6].left,30);steps(s,900);assert.equal(shop.stock[6].count,3);assert.equal(shop.stock[6].left,0);assert.equal(shop.stock[0].count,1);assert.equal(second.stock[0].count,1);
 const stock=S.clone(shop.stock);s.winner=0;steps(s,50);assert.deepEqual(shop.stock,stock);s.winner=null;assert.equal(command(s,h,2,shop),null);shop.built=.5;const timer=shop.stock[2].left;steps(s,10);assert.equal(shop.stock[2].left,timer);shop.built=1;shop.hp=0;steps(s,10);assert.equal(shop.stock[2].left,timer);
}
{
 const {s,h,shop}=arena();reject(s,h,3,shop,/Requires/);s.teams[0].gold=0;reject(s,h,0,shop,/gold/);s.teams[0].gold=10000;for(let i=0;i<6;i++)h.inventory.push(2);reject(s,h,0,shop,/full/);h.inventory=[];
 for(const shopId of [-1,0,1.5,'constructor',null]){const before=S.clone(s);assert.match(S.command(s,0,{type:'buy',ids:[h.id],item:0,shop:shopId}),/item shop/);assert.deepEqual(s,before);}
 shop.team=1;reject(s,h,0,shop,/friendly/);shop.team=0;shop.hp=0;reject(s,h,0,shop,/friendly/);shop.hp=500;shop.built=.99;reject(s,h,0,shop,/friendly/);shop.built=1;h.x=-6;reject(s,h,0,shop,/friendly/);h.x=0;
 s.resources.push({kind:'tree',x:2.5,z:0,amount:100});reject(s,h,0,shop,/friendly/);s.resources=[];s.map.doodads=[{kind:'rock',x:2.5,z:0,scale:1,variant:0,yaw:0}];reject(s,h,0,shop,/friendly/);s.map.doodads=[];
 s.map.terrain[S.index(2.5,0)]=1;reject(s,h,0,shop,/friendly/);s.map.terrain.fill(0);assert.equal(command(s,h,0,shop),null);assert.equal(S.command(s,0,{type:'sellItem',ids:[h.id],slot:0,item:0}),null);assert.equal(shop.stock[0].count,0,'selling refunds gold without restocking the shop');
 s.visible[1].fill(1);const enemy=S.publicState(s,1).units.find(u=>u.id===shop.id);assert.ok(enemy);assert.equal(enemy.stock,undefined);assert.ok(S.publicState(s,0).units.find(u=>u.id===shop.id).stock);
}
{
 const {s,h,shop}=arena();assert.equal(command(s,h,6,shop),null);const saved=S.clone(s);
 for(const edit of [x=>x.itemShopVersion=3,x=>x.itemShopVersion='1',x=>x.units.find(u=>u.kind==='shop').stock.pop(),x=>x.units.find(u=>u.kind==='shop').stock[6].count=-1,x=>x.units.find(u=>u.kind==='shop').stock[6].count=1.1,x=>x.units.find(u=>u.kind==='shop').stock[6].left=0,x=>x.units.find(u=>u.kind==='shop').stock[6].left=31,x=>x.units.find(u=>u.kind==='shop').stock[0].left=1,x=>x.units.find(u=>u.kind==='hero').stock=[]]){const copy=S.clone(saved);edit(copy);assert.throws(()=>S.restore(copy),/shop/i);}
 const legacy=S.clone(s);legacy.units=legacy.units.filter(u=>u.kind!=='shop');delete legacy.itemShopVersion;const old=S.restore(legacy),hero=old.units.find(u=>u.kind==='hero');hero.x=-12;hero.z=10;assert.equal(old.itemShopVersion,0);assert.equal(command(old,hero,0),null);
 h.x=-12;h.z=10;reject(s,h,0,undefined,/friendly/);
 for(const mode of ['moba','td','rpg']){const {s,h,shop}=arena(0,mode);h.x=-12;h.z=10;for(let i=0;i<4;i++)assert.equal(command(s,h,2),null);const worker=S.spawn(s,'worker',0,0,-5);assert.match(S.command(s,0,{type:'build',ids:[worker.id],kind:'shop',x:0,z:-9}),/melee|hero or summoned/);h.x=0;h.z=0;assert.equal(command(s,h,0,shop),null,'authored shops support explicit purchases in custom modes');}
}
console.log('PASS item shops: four faction construction, friendly completed range/path checks, shared finite stock, nearest stocked shop, atomic rejection, timed refill/caps, winner freeze, exact saves, malformed/legacy states, sell semantics and enemy privacy');
