// Author: MiYu. Source priority, native production budget, saved scheduling and genuine economy tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),AI=require('../samples/frostbound-realms/game/night-elf-ai.js'),source=AI.source;
const unit=(qty,id,town=-1)=>({type:'unit',qty,id,town}),research=(qty,id)=>({type:'research',qty,id,town:-1});
import {nightAiFixture} from './frost-night-elf-ai-fixture.mjs';
const fixture=()=>nightAiFixture(S);
function env(s){return AI.environment(S,s,0,s.nightAI[0]);}
{
 const s=fixture(),a=s.nightAI[0],e=env(s);source.init_vars(a.vars,e.native);source.build_sequence(a.vars,e.native);
 const golden=[unit(1,'etol'),unit(5,'ewsp'),unit(1,'eate'),unit(7,'ewsp'),unit(1,'emow'),unit(8,'ewsp'),unit(1,'eaom'),unit(9,'ewsp'),unit(1,'hero:0'),unit(10,'ewsp'),unit(2,'emow'),unit(1,'earc'),unit(1,'eden'),unit(2,'earc'),unit(11,'ewsp'),unit(3,'earc'),unit(12,'ewsp'),unit(1,'edob'),unit(3,'emow'),unit(13,'ewsp'),unit(4,'earc'),unit(14,'ewsp'),unit(5,'earc'),unit(15,'ewsp'),unit(6,'earc'),unit(1,'etoa'),{type:'expand',qty:2,id:'etol',town:-1},research(1,'Resm'),research(1,'Rema'),unit(4,'emow'),unit(1,'hero:1')];
 assert.deepEqual(a.plan,golden);assert.equal(a.vars.c_food_made,0,'preserve original snapshot statement order');source.init_vars(a.vars,e.native);assert.equal(a.vars.c_food_made,10);
 for(let i=0;i<6;i++)S.spawn(s,'nightarcher',0,0,i);source.init_vars(a.vars,e.native);assert.equal(a.vars.archer_opening,false);s.units=s.units.filter(u=>u.kind!=='nightarcher');source.init_vars(a.vars,e.native);assert.equal(a.vars.archer_opening,false,'latched after losses');
 const b=fixture(),g=b.nightAI[0];S.spawn(b,'hero',0,0,0,{heroClass:1});source.init_vars(g.vars,env(b).native);assert.equal(g.vars.basic_opening,false);for(let i=0;i<6;i++)S.spawn(b,'nightarcher',0,0,i);source.init_vars(g.vars,env(b).native);assert.equal(g.vars.archer_opening,true,'opening archer latch stops refreshing once basic opening ended');
 const f={...source.defaults,c_archer_done:5,c_dragon_done:1,c_talon_done:2,c_dryad_done:3,c_huntress_done:2,c_chimaera_done:1,c_bear_done:1,c_hero3_done:1,c_hero2_done:1,c_mtn_giant_done:2};assert.equal(source.force_level(f,{}),53);
 console.log('PASS original AI opening: all 31 source priorities, integer division, statement ordering, permanent flags and force weights');
}
{
 const s=fixture(),a=s.nightAI[0],e=env(s),hall=s.units.find(u=>u.team===0&&u.kind==='hall');hall.upgradeTier=3;const bear=S.spawn(s,'druidbear',0,0,0),crow=S.spawn(s,'druidcrow',0,0,3);S.spawn(s,'ancientlore',0,-10,0);S.spawn(s,'ancientwind',0,-10,8);S.spawn(s,'shop',0,-20,5);S.spawn(s,'workshop',0,-20,-5);S.spawn(s,'barracks',0,-10,-10);S.spawn(s,'chimaeraroost',0,0,10);S.spawn(s,'mountaingiant',0,4,4);S.spawn(s,'dryad',0,4,8);S.spawn(s,'hero',0,-4,0,{heroClass:1});S.spawn(s,'glaivethrower',0,8,8);Object.assign(s.teams[0],{gold:2500,wood:1000});source.init_vars(a.vars,e.native);source.init_vars(a.vars,e.native);source.build_sequence(a.vars,e.native);
 assert.equal(e.townCount('etol',true),1);assert.equal(e.townCount('etoa',true),1);assert.equal(e.townCount('edoc',true),1);assert.equal(e.townCount('edot',true),1);assert.ok(a.plan.some(p=>p.id==='emtg'));assert.ok(a.plan.some(p=>p.id==='edry'));assert.ok(a.plan.some(p=>p.id==='efdr'));assert.ok(a.plan.some(p=>p.id==='edoc'));assert.ok(a.plan.some(p=>p.id==='edot'));assert.ok(a.plan.some(p=>p.id==='Repd'),'retain source legacy research ID');assert.equal(a.plan.some(p=>p.id==='Repb'),false);
 a.plan=[];e.native.SetBuildNext(3,'edry');assert.deepEqual(a.plan,[unit(2,'edry')]);e.native.BuildFactory('eaoe');assert.deepEqual(a.plan.at(-1),unit(2,'eaoe'));s.teams[0].wood=500;e.native.BuildFactory('eaoe');assert.deepEqual(a.plan.at(-1),unit(1,'eaoe'));
 assert.ok(bear&&crow);console.log('PASS original AI late game: upgraded Tree/form aliases, Giant/Dryad/Druids/Faerie and factory caps, exact legacy Repd intent');
}
{
 const s=fixture(),a=s.nightAI[0],e=env(s);s.teams[0].gold=420;s.teams[0].wood=500;a.plan=[unit(10,'ewsp'),unit(1,'emow')];AI.execute(S,s,0,a,e);const hall=s.units.find(u=>u.kind==='hall'&&u.team===0);assert.equal(hall.queue.length,3);assert.equal(s.teams[0].gold,240);assert.equal(s.units.some(u=>u.kind==='farm'),false,'entire 5-Wisp deficit reserved');assert.equal(e.count('ewsp'),8);a.plan[0].qty=8;AI.execute(S,s,0,a,e);assert.ok(s.units.some(u=>u.kind==='farm'),'paid queued units satisfy target on next loop');
 const b=fixture();b.teams[0].gold=200;const st=b.nightAI[0];st.plan=[research(1,'Repd'),unit(1,'eate')];AI.execute(S,b,0,st,env(b));assert.ok(b.units.some(u=>u.kind==='altar'),'failed research does not block units');
 const c=fixture(),ac=c.nightAI[0];ac.plan=[unit(1,'emtg'),unit(1,'eate')];Object.assign(c.teams[0],{gold:5000,wood:5000});AI.execute(S,c,0,ac,env(c));assert.equal(c.units.some(u=>u.kind==='altar'),false,'failed production blocks following unit');
 console.log('PASS native AI production: paid queues, whole-deficit virtual budget, unit blocking and research nonblocking');
}
{
 const s=fixture();for(let i=0;i<200;i++)S.tick(s);const restored=S.restore(s);for(let i=0;i<100;i++){S.tick(s);S.tick(restored);}assert.deepEqual(restored,s);assert.equal(S.publicState(s,0).nightAI,undefined);assert.equal(S.publicState(s,1).nightAI,undefined);
 for(const mutate of [a=>a.vars.basic_opening=1,a=>a.nextBuild=s.frame+31,a=>a.rng=-1,a=>a.plan.push(unit(999,'ewsp')),a=>a.vars.hero_id2=a.vars.hero_id,a=>a.plan.push(unit(1,'unknown'))]){const bad=S.clone(s);mutate(bad.nightAI[0]);assert.throws(()=>S.restore(bad),/Night Elf AI/);}
 const legacy=S.clone(s);delete legacy.nightAiVersion;delete legacy.nightAI;assert.equal(S.restore(legacy).nightAiVersion,0);
 const other=S.create('skirmish',{factions:[0,3],ai:[true,true]});assert.deepEqual(other.nightAI,[null,null]);const modes=['moba','td','rpg'].map(m=>S.create(m,{factions:[2,2],ai:[true,true]}));for(const m of modes)assert.deepEqual(m.nightAI,[null,null]);
 console.log('PASS AI save and privacy: deterministic continuation, rejected malformed clocks/variables/plan, legacy saves and other modes');
}
{
 const s=fixture(),a=s.nightAI[0],hall=s.units.find(u=>u.team===0&&u.kind==='hall');hall.upgradeTier=3;for(const [kind,x,z] of [['ancientwind',-12,-12],['chimaeraroost',-22,-15],['shop',-20,5],['farm',-12,25]])S.spawn(s,kind,0,x,z);Object.assign(s.teams[0],{gold:5000,wood:5000});const e=env(s);a.plan=[unit(1,'edot'),unit(1,'echm')];const prices=['druidtalon','chimaera'].map(k=>S.trainType(s,k,0));AI.execute(S,s,0,a,e);assert.equal(s.teams[0].gold,5000-prices.reduce((n,r)=>n+r.gold,0));assert.equal(s.teams[0].wood,5000-prices.reduce((n,r)=>n+r.wood,0));assert.equal(s.units.flatMap(u=>u.queue).filter(q=>q.kind==='druidtalon'||q.kind==='chimaera').length,2);S.setAI(s,0,false);const ticks=Math.ceil(Math.max(...prices.map(r=>r.time))/S.DT);for(let i=0;i<=ticks;i++)S.tick(s);for(const kind of ['druidtalon','chimaera'])assert.ok(s.units.some(u=>u.kind===kind&&u.team===0&&u.built===1));assert.ok(S.restore(s));
 console.log('PASS AI late production adapters: paid Talon/Chimaera from seeded legal facilities, source full timers and strict saves');
}
{
 for(const job of ['mine','tree']){
  const s=fixture(),mine=s.units.find(u=>u.team===0&&u.kind==='entangledmine');Object.assign(s.teams[0],{gold:0,wood:0});const ri=s.resources.findIndex(r=>r.kind===job);
  for(const w of s.units.filter(u=>u.team===0&&u.kind==='worker'))assert.equal(S.command(s,0,{type:'gather',ids:[w.id],resource:ri}),null);
  for(let i=0;i<250;i++)S.tick(s);assert.ok(s.teams[0].gold>0);assert.ok(s.teams[0].wood>0);assert.equal(S.mineResidents(s,mine).length,4);assert.ok(S.restore(s));
 }
 const s=fixture();S.setAI(s,0,false);assert.equal(s.nightAI[0],null);S.setAI(s,0,true);for(let i=0;i<30;i++)S.tick(s);assert.ok(S.restore(s));
 console.log('PASS AI recovery: legal reassignment of all-lumber/all-gold workers, mine unload, gold and wood income, controller takeover');
}
{
 execFileSync('python',['scripts/import-frost-night-elf-ai.py','--check'],{stdio:'pipe'});
 execFileSync('python',['scripts/test-frost-night-elf-ai-compiler.py'],{stdio:'pipe'});
 const receipt=JSON.parse(fs.readFileSync('samples/frostbound-realms/night-elf-ai-sources.json','utf8'));assert.equal(receipt.functions.length,5);
 console.log('PASS exact reproducible original Night Elf source compilation and strict compiler rejection');
}
export {fixture};
