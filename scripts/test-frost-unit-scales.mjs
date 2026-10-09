// Author: MiYu. Independent UnitUI scales, source body ratios, selection sizes and muzzle offsets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=new URL('../samples/frostbound-realms/',import.meta.url),catalog=require('../samples/frostbound-realms/unit-scale-catalog.json'),source=require('../samples/frostbound-realms/unit-scale-sources.json');
const rows=new Map();let y=0;
for(const line of fs.readFileSync(new URL('SourceAssets/WarcraftIII/Units/unitUI.slk',root),'utf8').split(/\r?\n/)){
 const match=line.match(/^C;X(\d+)(?:;Y(\d+))?;K(.*)\r?$/);if(!match)continue;if(match[2])y=Number(match[2]);if(!rows.has(y))rows.set(y,new Map());rows.get(y).set(Number(match[1]),match[3].trim().replace(/^"|"$/g,''));
}
assert.equal(rows.get(1).get(37),'modelScale');assert.equal(rows.get(1).get(22),'scale');const units=new Map([...rows.values()].map(r=>[r.get(1),r]));
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');for(const file of source.files)assert.equal(sha(fs.readFileSync(new URL(file.path,root))),file.sha256,file.path);
for(const [path,hash] of Object.entries(source.generators))assert.equal(sha(fs.readFileSync(new URL(path,new URL('../',import.meta.url)))),hash,path);
for(const model of Object.values(catalog.models)){assert.equal(model.modelScale,Number(units.get(model.unit).get(37)));assert.equal(model.selectionScale,Number(units.get(model.unit).get(22)));}
globalThis.Frost=require('../samples/frostbound-realms/game/simulation.js');globalThis.FrostArt=Object.assign({},...['model-catalog','druid-models','dryad-models','hippogryph-models','chimaera-models','faerie-dragon-models','mountain-giant-models','demon-hunter-models','keeper-models','priestess-models','warden-models','archmage-models','paladin-models','mountain-king-models','blood-mage-models','orc-hero-models','farseer-models','shadowhunter-models','undead-hero-models','dreadlord-effect-models'].map(name=>JSON.parse(fs.readFileSync(new URL(name+'.json',root)))));const V=require('../samples/frostbound-realms/game/visuals.js');let tested=0;
for(let faction=0;faction<4;faction++){
 const state={teams:[{faction},{faction}],units:[]};
 for(const kind of Object.keys(Frost.types)){
  const u={kind,team:0,built:1,cd:0},view=V.model(state,u);if(!view.asset.classic||view.asset.factionBuilding)continue;
  const definition={unit:Frost.unitType(u).sourceUnit??Frost.unitType(u).id??catalog.models[view.key]?.unit},original=Number(units.get(definition.unit).get(37));assert.equal(view.scale,original*catalog.worldScale);assert.equal(view.height,Math.max(0,view.asset.bounds.max[1])*view.scale+.5,'health bars use the source top rather than underground or wing extent');assert.equal(view.selectionSpan,catalog.circles[/^[A-Z]/.test(definition.unit)?'hero':'unit'].worldSpan*Number(units.get(definition.unit).get(22)),kind+' source selection scale');
  const height=view.asset.size[1];view.asset.size[1]*=2;assert.equal(V.model(state,u).scale,view.scale,'source scale is independent of pose bounds');view.asset.size[1]=height;tested++;
 }
}
const state={teams:[{faction:0},{faction:0}],units:[]},footman=V.model(state,{kind:'soldier',team:0,cd:0,built:1}),hall=V.model(state,{kind:'hall',team:0,cd:0,built:1});assert.ok(hall.asset.size[1]*hall.scale>footman.asset.size[1]*footman.scale*4.5,'town hall retains original height relative to infantry');
const grunt=V.model({teams:[{faction:1}]},{kind:'soldier',team:0,cd:0,built:1}),abomination=V.model(state,{kind:'abomination',team:0,cd:0,built:1});assert.equal(grunt.scale,2.2);assert.equal(abomination.scale,1.8);
const rifle=FrostArt.RealRifleman,[x,h,z]=rifle.muzzle||[0,rifle.bounds.min[1]+rifle.size[1]*.6,rifle.bounds.max[0]],muzzle=V.muzzle({x:0,z:8,fromX:0,fromZ:0,fromY:1.6,team:0});assert.ok(Math.abs(muzzle.y-h*2)<1e-10);assert.ok(Math.abs(muzzle.z-z*2)<1e-10);assert.ok(Math.abs(muzzle.x-x*2)<1e-10);
console.log('PASS source unit scales:',Object.keys(catalog.models).length,'source actor records;',tested,'rendered type/faction mappings; source relative height, selection sizes, bounds independence and rifle muzzle scale');
