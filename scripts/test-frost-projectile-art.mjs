// Author: MiYu. Projectile profiles, saved-art migration and presentation interpolation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/model-catalog.json',import.meta.url)));const V=require('../samples/frostbound-realms/game/visuals.js');
const kinds={archer:'arrow',bonearcher:'quarrel',hunter:'javelin',ballista:'ballista',catapult:'stone',trebuchet:'stone',flametower:'fire',emberdrake:'fire',frosttower:'frost',spectralwyrm:'frost',druid:'nature',grovewyrm:'nature',necromancer:'shadow',mage:'arcane'};
for(const [kind,art] of Object.entries(kinds)){
 const map=S.defaultMap();map.terrain.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map});s.units=[];const u=S.spawn(s,kind,0,0,0),v=S.spawn(s,'neutral',1,0,6,{speed:0,damage:0});u.order={type:'attack',target:v.id};S.visibility(s);S.tick(s);assert.equal(s.projectiles[0].art,art);assert.equal(S.publicState(s,0).projectiles[0].art,art);const saved=S.clone(s);if(kind!=='archer')saved.projectiles[0].art='bolt';assert.equal(S.restore(saved).projectiles[0].art,art,'legacy art migrates by source kind');
 u.cd=99;for(let i=0;i<8&&!s.events.some(e=>e.type==='impact');i++)S.tick(s);assert.equal(s.events.find(e=>e.type==='impact').art,art);
 const style=V.projectile(art);assert.ok(style.mesh||style.trail);assert.ok(style.scale.every(x=>Number.isFinite(x)&&x>0));if(style.mesh)assert.notEqual(style.mesh.mesh,'cube');assert.ok(fs.existsSync(new URL('../samples/frostbound-realms/Assets/Textures/'+style.texture+'.png',import.meta.url)));
}
for(const [heroClass,art] of ['frost','fire','arrow'].entries())assert.equal(S.projectileArt({kind:'hero',heroClass}),art);
{
 const view=V.projectileView(),p={id:1,x:0,y:1,z:0,vx:20,vy:0,vz:0,art:'arrow',team:0};assert.equal(view.sample([p],10,0)[0].x,0);const target={...p,x:2};view.sample([target],11,.1);assert.ok(Math.abs(view.sample([target],11,.15)[0].x-1)<1e-9,'halfway render between fixed steps');assert.equal(view.sample([target],11,.5)[0].x,2,'never extrapolate past authority');assert.equal(p.x,0);assert.equal(target.x,2,'presentation cannot mutate snapshots');
 assert.deepEqual(view.sample([target],11,.5),view.sample([target],11,.5),'frozen presentation clock');assert.deepEqual(view.sample([],12,.6),[],'impact or visibility loss removes the trail immediately');assert.equal(view.sample([{...p,x:8}],13,.7)[0].x,8,'newly visible ID does not blend from a hidden location');view.sample([{...p,x:10}],14,.8);assert.equal(view.sample([{...p,x:20}],20,.9)[0].x,20,'large snapshot gaps snap');view.reset();assert.equal(view.sample([p],20,1)[0].x,0,'reconnect and saves reset even at the same frame');assert.equal(view.sample([{...p,x:5}],1,1.1)[0].x,5,'rewinding frame does not reuse history');
}
console.log('PASS: ten projectile styles, impact art, legacy migration, bounded interpolation, frozen clock, hidden/removed shots and reconnect reset');
