// Author: MiYu. Verify source Warden geometry, animation selection, missiles and spell attachment output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {wardenFixture} from './frost-warden-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
globalThis.Frost=S;
globalThis.FrostArt={...require('../samples/frostbound-realms/model-catalog.json'),...require('../samples/frostbound-realms/warden-models.json')};
globalThis.FrostEffectArt=require('../samples/frostbound-realms/effect-catalog.json');
Object.assign(FrostEffectArt.effects,require('../samples/frostbound-realms/warden-art.json'));
const V=require('../samples/frostbound-realms/game/visuals.js');globalThis.FrostVisual=V;
const E=require('../samples/frostbound-realms/game/effects.js'),{s,h}=wardenFixture(S,6),r=S.wardenRules;
const model=V.model(s,h),scale=require('../samples/frostbound-realms/unit-scale-catalog.json').worldScale;
assert.equal(model.key,'ClassicWarden');assert.equal(model.scale,scale*r.units.Ewar.modelScale);assert.ok(model.height>0);assert.ok(model.selectionSpan>0);
assert.equal(V.heroPortrait(3,true,h),r.units.Ewar.icon);assert.equal(V.unitPortrait(s,h),r.units.Ewar.icon);
for(const [slot,name] of [[0,'Spell'],[1,'Spell Slam'],[2,'Spell Throw'],[3,'Spell']]){h.wardenCast={slot,rank:1,left:slot===0?r.abilities.AEbl.levels[0].duration/2:Number(r.units.Ewar.sourceRows.UnitWeapons.castpt)/2};const sample=V.classicSample(h,model.asset,false,0);assert.equal(model.asset.animations[sample.clip].name,name);assert.ok(sample.frame>0);}
delete h.wardenCast;
for(const [kind,key,id] of [['vengeanceavatar','ClassicVengeanceAvatar','espv'],['vengeancespirit','ClassicVengeanceSpirit','even']]){const u=S.spawn(s,kind,0,2,0,{summoner:h.id,summoned:true,vengeanceBornFrame:0,expires:500});const visual=V.model(s,u);assert.equal(visual.key,key);assert.equal(visual.scale,scale*r.units[id].modelScale);assert.equal(V.unitPortrait(s,u),r.units[id].icon);}
for(const [art,key] of [['warden','ClassicWardenWardenMissile'],['warden-fan','ClassicWardenFanOfKnivesMissile'],['warden-shadow','ClassicWardenShadowStrikeMissile'],['vengeanceavatar','ClassicWardenSpiritOfVengeanceMissile'],['vengeancespirit','ClassicWardenVengeanceMissile']]){const p=V.projectile(art,.1,0);assert.ok(p.sourceXAxis);assert.ok(p.parts.length>0);assert.equal(p.parts[0].mesh.split('#')[0],FrostArt[key].parts[0].mesh);}
h.wardenLastSlot=0;h.wardenCastFrame=0;h.wardenBlinkFrom={x:-4,z:3};h.x=2;h.z=1;
const spells=u=>E.spells(s,u,V.model(s,u),'',{x:u.x,y:0,z:u.z},0,V.model(s,u).scale,.1,()=>null);
let effects=spells(h);assert.deepEqual(effects.map(e=>e.name),['BlinkCaster','BlinkTarget']);assert.deepEqual(effects[0].position,[-4,0,3]);assert.deepEqual(effects[1].position,[2,0,1]);
h.wardenLastSlot=1;effects=spells(h);assert.ok(effects.some(e=>e.name==='FanOfKnivesCaster'&&e.component.clip===0));
const avatar=s.units.find(S.vengeanceAvatar);s.units.find(S.vengeanceSpirit).summoner=avatar.id;effects=spells(avatar);assert.ok(effects.some(e=>e.name==='SpiritOfVengeanceOrbs1'));assert.ok(effects.some(e=>e.name==='feralspiritdone'));
const enemy=S.spawn(s,'soldier',1,5,0);enemy.shadowStrike={frame:0};assert.ok(spells(enemy).some(e=>e.name==='shadowstrike'));
const client=fs.readFileSync(new URL('../samples/frostbound-realms/game/client.js',import.meta.url),'utf8');assert.ok(client.includes("S.wardenUnit(state.units.find(u=>u.id===selected[0]))&&armed.slot===2"));assert.ok(client.includes("type:'vengeanceAuto'"));assert.ok(client.includes('wardenVersion:1'));
console.log('PASS Warden presentation: source scales and icons, four casting clips, both summons, five source missile geometries, Blink origins, Fan Birth, poison and summon orbs');
