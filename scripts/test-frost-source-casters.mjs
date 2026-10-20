// Author: MiYu. Original Necromancer/Shaman production, training, regeneration, missiles and saved compatibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
export const sourceCasterCases=[{kind:'necromancer',building:'temple',faction:3,key:'Rune',field:'necromancy'},{kind:'shaman',building:'spiritlodge',faction:1,key:'Rost',field:'shamanism'}];
export const stepCasters=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
export function sourceCasterFixture(c,options={}){const map=S.defaultMap();for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);map.props=[];map.units=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map,factions:[c.faction,0],ai:[false,false],...options});s.units=[];const hall=S.spawn(s,'hall',0,-24,24),enemyHall=S.spawn(s,'hall',1,24,-24);hall.upgradeTier=3;hall.maxHp=hall.hp=S.mainBase(s,hall).hp;S.updateTechnology(s);s.teams[0].gold=s.teams[0].wood=10000;const producer=S.spawn(s,c.building,0,0,0),unit=S.spawn(s,c.kind,0,-8,-4,{order:{type:'hold'},bloodlustAuto:false});S.visibility(s);return {s,hall,enemyHall,producer,unit};}
const cmd=(s,u,type,fields={})=>S.command(s,u.team,{type,ids:[u.id],...fields}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),round=x=>Math.floor(Math.fround(Math.fround(x)+.5));
assert.equal(S.PROTOCOL,113);
for(const c of sourceCasterCases){
 const r=S.sourceCasterRules.units[c.kind],b=S.sourceCasterRules.buildings[c.building],training=S.sourceCasterRules.research[c.key];
 assert.equal(r.food,2);assert.deepEqual([r.damage,r.bonus,r.dice,r.sides,r.initialMana],[8.5,7,1,2,75]);
 {
  const {s,producer,unit}=sourceCasterFixture(c);assert.deepEqual([unit.hp,unit.maxHp,unit.damage,unit.speed,unit.mana,unit.armorValue],[r.hp,r.hp,8.5,2.7,75,0]);assert.deepEqual([producer.maxHp,producer.armorValue,S.unitType(producer).armor],[b.hp,5,'fortified']);assert.equal(S.maxMana(producer),0);assert.equal(S.movementRadius(unit),.16);assert.equal(S.population(s,0).used,2);assert.equal(S.trainType(s,c.kind,0).food,2);
  const gold=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(cmd(s,producer,'train',{kind:c.kind}),null);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood-r.wood);assert.equal(producer.queue[0].left,r.time);assert.equal(S.population(s,0).used,4);assert.ok(cmd(s,producer,'casterResearch'));stepCasters(s,r.time*5);const resumed=S.restore(s);stepCasters(s,r.time*5);stepCasters(resumed,r.time*5);assert.deepEqual(s,resumed);const recruit=s.units.find(u=>u.kind===c.kind&&u.id!==unit.id);assert.ok(recruit);near(recruit.mana,75+r.manaRegen*S.DT);assert.equal(recruit.maxHp,r.hp);assert.equal(producer.queue.length,0);assert.equal(producer.mana,0);
  assert.equal(cmd(s,producer,'train',{kind:c.kind}),null);assert.equal(cmd(s,producer,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood-r.wood);assert.equal(S.population(s,0).used,4);
 }
 console.log('PASS source '+c.kind+': original price, full production clock, two food, initial mana, building armor, cancel and mid-production save');
 {
  const {s,producer,unit}=sourceCasterFixture(c),other=S.spawn(s,c.building,0,8,8);
  for(let rank=1;rank<=2;rank++){
   const level=training.levels[rank-1],max=S.maxMana(unit),hp=unit.maxHp;unit.hp=hp*.37;unit.mana=75.25;const beforeHp=unit.hp;
   assert.equal(S.sourceCasterTraining(s,producer).hotkey,level.hotkey);const budget=[s.teams[0].gold,s.teams[0].wood];assert.equal(cmd(s,producer,'casterResearch'),null);assert.equal(cmd(s,other,'casterResearch')!==null,true);assert.equal(producer.casterResearch.left,level.time);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[budget[0]-level.gold,budget[1]-level.wood]);assert.equal(cmd(s,producer,'cancelCasterResearch'),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],budget);assert.equal(cmd(s,producer,'casterResearch'),null);stepCasters(s,level.time*5);const resumed=S.restore(s);stepCasters(s,level.time*5-1);stepCasters(resumed,level.time*5-1);assert.deepEqual(s,resumed);const oldMana=unit.mana,oldHp=unit.hp;S.tick(s);S.tick(resumed);assert.deepEqual(s,resumed);assert.equal(unit.maxHp,hp+40);near(unit.hp,round(Math.fround((hp+40)*Math.fround(oldHp/hp)))+(c.kind==='shaman'?.25*S.DT:0));near(unit.mana,round(Math.fround((max+100)*Math.fround(oldMana/max)))+(r.manaRegen+.325*rank)*S.DT);assert.equal(unit.casterRank,rank);assert.equal(S.maxMana(unit),200+100*rank);const fresh=S.spawn(s,c.kind,0,-16,-10,{order:{type:'hold'}});assert.equal(fresh.hp,r.hp+40*rank);assert.equal(fresh.mana,75);assert.equal(S.maxMana(fresh),200+100*rank);unit.mana=0;stepCasters(s,10);near(unit.mana,r.manaRegen+.325*rank);
  }
 }
 console.log('PASS source '+c.kind+': both paid training clocks, duplicate prevention, full refunds, rounded HP/mana ratios, .325 regeneration and new-unit pools');
 {
  const {s,unit}=sourceCasterFixture(c);unit.x=0;unit.z=0;unit.hp=100;const victim=S.spawn(s,'soldier',1,5,0,{order:{type:'hold'}});victim.damage=0;victim.hp=victim.maxHp=1000;unit.order={type:'attack',target:victim.id};s.teams[0].upgrade=3;S.visibility(s);S.tick(s);assert.ok(unit.weaponWindup);assert.equal(s.projectiles.length,0);const windup=S.restore(s);stepCasters(s,Math.ceil(r.damagePoint/S.DT));stepCasters(windup,Math.ceil(r.damagePoint/S.DT));assert.deepEqual(s,windup);const shot=s.projectiles.find(p=>p.source===unit.id);assert.ok(shot);assert.equal(shot.sourceCasterRules,1);assert.ok([8,9].includes(shot.damage));assert.equal(shot.art,'source-'+c.kind);near(shot.y,.6);near(Math.hypot(shot.vx,shot.vy,shot.vz),r.missileSpeed);S.tick(s);const flying=S.restore(s);assert.deepEqual(flying.projectiles,s.projectiles);if(r.missileArc)assert.ok(s.projectiles[0].y>s.projectiles[0].baseY);else near(s.projectiles[0].y,s.projectiles[0].baseY);unit.hp=0;flying.units.find(u=>u.id===unit.id).hp=0;stepCasters(s,10);stepCasters(flying,10);assert.deepEqual(s,flying);assert.equal(s.projectiles.length,0);const expected=shot.damage*S.sourceCasterRules.damageTable.magic[S.unitType(victim).armor]/(1+.06*S.armorValue(victim,s));near(victim.hp,1000-expected);assert.equal(victim.slow||0,0);assert.ok(!unit.hp);
  const {s:missing,unit:bad}=sourceCasterFixture(c);delete bad.sourceCasterRules;assert.throws(()=>S.restore(missing),/caster marker/);
 }
 console.log('PASS source '+c.kind+': dice, front swing, source missile/arc, launch height, magic armor table, owner death and deterministic in-flight restore');
 {
  const {s,unit}=sourceCasterFixture(c);unit.hp=100;unit.mana=0;stepCasters(s,10);near(unit.hp,100+(c.kind==='shaman'?.25:0));near(unit.mana,r.manaRegen);if(c.kind==='necromancer'){s.blight=[{team:0,x:unit.x,z:unit.z,radius:3.5}];stepCasters(s,10);near(unit.hp,102);}
  const immune=S.spawn(s,'dryad',1,unit.x+2,unit.z);assert.equal(S.canAttack(unit,immune),false);unit.order={type:'hold'};assert.ok(S.restore(s));
 }
 console.log('PASS source '+c.kind+': always/blight health regeneration, source mana regeneration and magic-immune targets');
 {
  const {s,producer,unit}=sourceCasterFixture(c,{sourceCasterVersion:0});assert.equal(unit.sourceCasterRules,undefined);assert.equal(unit.mana,150);assert.equal(S.trainType(s,c.kind,0).food,3);unit.hp=80;unit.mana=75.25;const hp=unit.maxHp;assert.equal(cmd(s,producer,'casterResearch'),null);producer.casterResearch.left=.1;const old=S.clone(s);delete old.sourceCasterVersion;const restored=S.restore(old);assert.equal(restored.sourceCasterVersion,0);S.tick(s);S.tick(restored);assert.deepEqual(s,restored);assert.equal(unit.maxHp,hp+40);assert.equal(unit.hp,120);near(unit.mana,75.25+(.667+.25)*S.DT);
 }
 console.log('PASS source '+c.kind+': missing-version saves retain prototype statistics, food, regeneration and training pool policy');
}
for(const c of sourceCasterCases){
 for(const patch of [{sourceCasterRules:0},{sourceCasterRules:null},{team:1},{maxHp:1},{damage:42},{speed:3.6},{armorValue:1},{casterRank:1}]){const {s,unit}=sourceCasterFixture(c);Object.assign(unit,patch);assert.throws(()=>S.restore(s),/source caster/);}
 for(const healthUpgradeVersion of [0,1])for(const manaUpgradeVersion of [0,1]){const {s,producer,unit}=sourceCasterFixture(c,{healthUpgradeVersion,manaUpgradeVersion});unit.hp=100;unit.mana=75.25;assert.equal(cmd(s,producer,'casterResearch'),null);producer.casterResearch.left=.1;const hp=unit.maxHp;S.tick(s);near(unit.hp,(healthUpgradeVersion?round(Math.fround((hp+40)*Math.fround(100/hp))):140)+(c.kind==='shaman'?.025:0));near(unit.mana,(manaUpgradeVersion?113:75.25)+(S.sourceCasterRules.units[c.kind].manaRegen+.325)*S.DT);assert.ok(S.restore(s));}
}
console.log('PASS source caster invalid-marker/stat/rank rejection and independent HP/mana compatibility policies');
for(const value of [-1,2,null,'1']){assert.throws(()=>S.create('skirmish',{sourceCasterVersion:value}),/caster.*version/);const {s}=sourceCasterFixture(sourceCasterCases[0]);s.sourceCasterVersion=value;assert.throws(()=>S.restore(s),/caster.*version/);}
for(const mode of ['moba','td','rpg'])assert.equal(S.create(mode).sourceCasterVersion,0);
const root=new URL('../samples/frostbound-realms/',import.meta.url),receipt=JSON.parse(fs.readFileSync(new URL('source-casters-sources.json',root))),hash=raw=>createHash('sha256').update(raw).digest('hex');
for(const record of receipt.files){const raw=fs.readFileSync(new URL(record.path,root));assert.equal(raw.length,record.bytes);assert.equal(hash(raw),record.sha256);}
console.log('PASS source caster version boundaries and '+receipt.files.length+' signed retained-source/runtime files');
