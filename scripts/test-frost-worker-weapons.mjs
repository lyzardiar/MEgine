// Author: MiYu. Original worker attack dice, range, windup, interruption and exact saved combat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {workerFixture} from './test-frost-worker-balance.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),rules=require('../samples/frostbound-realms/worker-weapons.json'),manifest=require('../samples/frostbound-realms/worker-weapons-sources.json');
const sha=raw=>createHash('sha256').update(raw).digest('hex'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},order=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra});
for(const r of manifest.sources){const bytes=fs.readFileSync(new URL('../samples/frostbound-realms/'+r.localPath,import.meta.url));assert.equal(bytes.length,r.bytes);assert.equal(sha(bytes),r.sha256);}
assert.equal(sha(fs.readFileSync(new URL('../samples/frostbound-realms/worker-weapons.json',import.meta.url))),manifest.profileSha256);
export function weaponFixture(faction=0,options={}){
 const {s,worker,hall}=workerFixture(faction,options);Object.assign(worker,{x:0,z:0,order:{type:'hold'}});
 const target=S.spawn(s,'soldier',1,0,1.1,{hp:100000,maxHp:100000,damage:0,speed:0,armorValue:0,order:{type:'hold'}});S.visibility(s);return {s,worker,target,hall};
}
for(const [faction,source,min,max,cooldown,point] of [[0,'hpea',5,6,2,.433],[1,'opeo',7,8,3,.5],[3,'uaco',9,10,2.5,.4]]){
 const {s,worker,target}=weaponFixture(faction),r=rules.units[source],d=S.unitType(worker),rng=s.rng,hp=target.hp;
 assert.equal(S.movementRadius(worker),.16);assert.equal(s.workerCombatVersion,1);assert.ok(S.workerCombat(worker));assert.deepEqual([worker.damage,d.range,d.cooldown,d.damagePoint,d.attack,d.antiAir],[(min+max)/2,.9,cooldown,point,'normal',false]);
 step(s,1);assert.equal(target.hp,hp);assert.equal(s.rng,rng,'windup does not spend attack dice');assert.equal(worker.weaponWindup.left,point);assert.equal(worker.cd,cooldown);assert.ok(S.restore(s));
 const continued=S.restore(s);for(let i=0;i<100;i++){S.tick(s);S.tick(continued);assert.deepEqual(s,continued,'pending attack, dice RNG and cooldown survive saving');}
 const {s:a,worker:u,target:v}=weaponFixture(faction),hits=[],rolls=new Set(),factor=rules.damageTable.normal[S.unitType(v).armor]??1;let previous=v.hp;
 for(let i=0;i<400;i++){S.tick(a);if(v.hp!==previous){const damage=(previous-v.hp)/factor;assert.ok(Math.abs(damage-min)<1e-7||Math.abs(damage-max)<1e-7);rolls.add(Math.round(damage));hits.push(a.frame);previous=v.hp;}}
 assert.equal(hits[0],1+Math.ceil(point/S.DT));for(let i=1;i<hits.length;i++)assert.equal(hits[i]-hits[i-1],cooldown/S.DT);assert.deepEqual([...rolls].sort((a,b)=>a-b),[min,max]);
 assert.equal(S.weaponDamage(u,{kind:'worker',armorValue:0},10,a),15,'normal damage uses original medium armor factor');assert.equal(S.weaponDamage(u,{kind:'tower',armorValue:0},10,a),7,'normal damage uses original fortified factor');
 a.teams[0].upgrade=3;const raw=[];for(let i=0;i<100;i++){const before=v.hp;S.tick(a);if(before!==v.hp)raw.push((before-v.hp)/factor);}assert.ok(raw.length);assert.ok(raw.every(n=>Math.abs(n-min)<1e-7||Math.abs(n-max)<1e-7),'generic army upgrades do not add worker damage');
 for(const field of ['left','target','extra']){const bad=S.clone(s),w=bad.units.find(v=>v.id===worker.id);w.weaponWindup={target:target.id,left:point};if(field==='left')w.weaponWindup.left=point+.1;else if(field==='target')w.weaponWindup.target=w.id;else w.weaponWindup.extra=true;assert.throws(()=>S.restore(bad),/weapon|worker combat/);}
 for(const [key,value] of [['damage',1000],['cd',100],['cd',-.1]]){const bad=S.clone(s);bad.units.find(v=>v.id===worker.id)[key]=value;assert.throws(()=>S.restore(bad),/worker combat state/);}
 console.log('PASS worker weapon '+source+': source dice/range/armor, first impact, full cadence, research isolation and exact pending-attack/RNG saves');
}
for(const action of ['stop','move','hold','gather','repair','build']){
 const {s,worker,target,hall}=weaponFixture();order(s,worker,'attack',{target:target.id});step(s,1);assert.ok(worker.weaponWindup);const rng=s.rng,hp=target.hp;
 if(action==='gather'){s.resources.push({kind:'tree',x:3,z:0,amount:100,hp:50});s.map.props.push(S.clone(s.resources[0]));assert.equal(order(s,worker,action,{resource:0}),null);}
 else if(action==='repair'){hall.hp-=100;assert.equal(order(s,worker,action,{target:hall.id}),null);}
 else if(action==='build')assert.equal(order(s,worker,action,{kind:'farm',x:8,z:0}),null);
 else assert.equal(order(s,worker,action,{x:-8,z:0}),null);
 assert.equal(worker.weaponWindup,undefined,action+' cancels pending damage synchronously');assert.equal(s.rng,rng);assert.ok(S.restore(s));step(s,5);assert.equal(target.hp,hp);
}
for(const interrupt of ['stun','outOfRange','hidden','dead']){
 const {s,worker,target}=weaponFixture();step(s,1);const rng=s.rng,hp=target.hp;
 if(interrupt==='stun')worker.stun=1;else if(interrupt==='outOfRange')target.z=10;else if(interrupt==='hidden'){target.x=25;target.z=-25;S.visibility(s);}else{target.damage=10000;target.cd=0;target.order={type:'attack',target:worker.id};}
 step(s,1);assert.equal(worker.weaponWindup,undefined);step(s,3);assert.equal(target.hp,hp);assert.equal(s.rng,rng);
}
{
 const {s,worker,target}=weaponFixture(),air=S.spawn(s,'dragon',1,1,0),friend=S.spawn(s,'soldier',0,1,0);S.visibility(s);for(const v of [air,friend])assert.ok(order(s,worker,'attack',{target:v.id}));
 order(s,worker,'attackMove',{x:2,z:1});step(s,1);const old=worker.weaponWindup;assert.equal(order(s,worker,'move',{x:4,z:4,append:true}),null);assert.equal(worker.weaponWindup,old,'Shift appends preserve the current attack');assert.ok(S.restore(s));
 const other=S.spawn(s,'soldier',1,.2,1,{damage:0,order:{type:'hold'}});assert.equal(order(s,worker,'attack',{target:other.id}),null);assert.equal(worker.weaponWindup,undefined);assert.ok(S.restore(s));
}
for(const options of [{workerCombatVersion:0},{workerBalanceVersion:0}]){
 const {s,worker,target}=weaponFixture(0,options);assert.equal(worker.workerCombat,undefined);assert.equal(worker.damage,6);step(s,1);assert.ok(target.hp<target.maxHp);assert.equal(worker.weaponWindup,undefined);const saved=S.clone(s);delete saved.workerCombatVersion;assert.equal(S.restore(saved).workerCombatVersion,0);
}
for(const value of [-1,2,null,'1']){assert.throws(()=>S.create('skirmish',{workerCombatVersion:value}),/worker combat/);const s=weaponFixture().s;s.workerCombatVersion=value;assert.throws(()=>S.restore(s),/worker combat/);}
assert.throws(()=>S.create('skirmish',{workerBalanceVersion:0,workerCombatVersion:1}),/worker combat/);assert.throws(()=>S.create('moba',{workerCombatVersion:1}),/worker combat/);
for(const mode of ['moba','td','rpg'])assert.equal(S.create(mode).workerCombatVersion,0);
console.log('PASS worker weapon interruption, target masks, Shift queue, legacy balance-only saves and mode/version isolation');

// MiYu: source collision is required for a short-range worker to approach a larger target.
for(const faction of [0,1,3]){const {s,worker}=weaponFixture(faction);s.units=s.units.filter(u=>u.kind!=='soldier');const target=S.spawn(s,'neutral',1,1.5,0,{damage:0,speed:0,order:{type:'hold'}});S.visibility(s);assert.equal(order(s,worker,'attack',{target:target.id}),null);step(s,40);assert.ok(target.hp<target.maxHp,'source collision permits actual pursuit and impact');assert.ok(S.restore(s));}
globalThis.Frost=S;globalThis.FrostArt=require('../samples/frostbound-realms/model-catalog.json');const V=require('../samples/frostbound-realms/game/visuals.js');
for(const [faction,key] of [[0,'RealWorker'],[1,'ClassicPeon'],[3,'RealAcolyte']]){const {s,worker}=weaponFixture(faction),r=S.unitType(worker),asset=FrostArt[key];worker.workerAttackActive=true;worker.cd=r.cooldown-.3;const pose=V.classicSample(worker,asset,false,10,undefined,30);assert.equal(asset.animations[pose.clip].name,'Attack');assert.equal(pose.frame,9,'Attack uses source elapsed time rather than stretching across the cooldown');delete worker.workerAttackActive;const idle=V.classicSample(worker,asset,false,10,undefined,30);assert.match(asset.animations[idle.clip].name,/^Stand/);const {s:a,worker:u}=weaponFixture(faction);step(a,1+Math.ceil((r.damagePoint+r.backswing)/S.DT));assert.equal(u.workerAttackActive,undefined);assert.ok(u.cd>0);assert.ok(S.restore(a));}
console.log('PASS original worker collision/pursuit and source Attack animation/backswing independent of cooldown');

for(const distance of [4.9,6]){const {s,worker,target}=weaponFixture();worker.order=null;target.z=distance;step(s,1);assert.equal(worker.z>0,distance<5,'source acquisition is 500 units');}
console.log('PASS source worker acquisition and damaged save rejection');
