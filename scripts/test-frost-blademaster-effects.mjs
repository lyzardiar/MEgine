// Author: MiYu. Original Mirror Image origin, birth, flight, body emitters and saved continuation.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {blademasterFixture} from './frost-blademaster-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),context=vm.createContext({engine:{}});
vm.runInContext(fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Scripts/Main.js',import.meta.url),'utf8'),context);
const {FrostEffects:E,FrostArt:A,FrostEffectArt:art,FrostVisual:V}=context,copy=o=>JSON.parse(JSON.stringify(o)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const {s,h}=blademasterFixture(S,6);h.skills=[0,3,0,0];h.skillPoints=3;h.mana=S.maxMana(h);
assert.equal(S.command(s,0,{type:'spell',ids:[h.id],slot:1}),null);for(let i=0;i<5&&!h.bladeMirrorEffect;i++)S.tick(s);
assert.ok(h.bladeMirrorEffect);assert.equal(h.bladeMirrorEffect.born,undefined);const split=S.restore(s),original={x:h.x,z:h.z};
function effects(u,clock=s.frame*S.DT,team=0){const asset=A.ClassicBladeMaster,mesh=V.pose(u,asset,false,clock,30),position={x:u.x,y:S.unitHeight(s,u),z:u.z};return E.spells(s,u,{asset},mesh,position,0,1,clock,()=>[0,0,0],team);}
const cast=effects(h).find(e=>e.slot==='bladeMirrorCaster');assert.ok(cast);assert.deepEqual(copy(cast.position),[original.x,S.elevation(s.map,original.x,original.z),original.z]);
for(let i=0;i<5;i++){S.tick(s);S.tick(split);}assert.deepEqual(S.restore(s),S.restore(split));assert.ok(h.bladeMirrorEffect.born);const images=s.units.filter(S.bladeIllusion);assert.equal(images.length,3);
for(const u of [h,...images]){const m=u.bladeMirrorEffect;assert.equal(m.frame,h.bladeMirrorEffect.frame);assert.equal(m.born,m.frame+5);assert.equal(m.x,original.x);assert.equal(m.z,original.z);assert.equal(m.toX,u.x);assert.equal(m.toZ,u.z);assert.ok(effects(u,m.born*S.DT).some(e=>e.slot==='bladeMirrorTarget'));}
const image=images.find(u=>Math.hypot(u.x-original.x,u.z-original.z)>.4),m=image.bladeMirrorEffect,clock=m.born*S.DT+.02;
image.x+=5;image.z+=2;const flight=effects(image,clock).find(e=>e.slot==='bladeMirrorMissile');assert.ok(flight);near(Math.hypot(flight.position[0]-m.x,flight.position[2]-m.z),.2);const yaw=2*Math.atan2(flight.rotation[1],flight.rotation[3]);near(Math.cos(yaw),(m.toX-m.x)/Math.hypot(m.toX-m.x,m.toZ-m.z));near(-Math.sin(yaw),(m.toZ-m.z)/Math.hypot(m.toX-m.x,m.toZ-m.z));assert.equal(effects(image,m.born*S.DT+1).some(e=>e.slot==='bladeMirrorMissile'),false);assert.equal(effects(image,m.born*S.DT+2).some(e=>e.slot==='bladeMirrorTarget'),false);
const body=effects(h,clock).find(e=>e.slot==='bladeActor');assert.ok(body);assert.equal(body.parts.length,0);assert.equal(body.component.effect,art.effects.ClassicBladeMasterEmbedded.effect);const pose=V.pose(h,A.ClassicBladeMaster,false,clock,30).match(/#pose=(\d+):(\d+)@(\d+)$/);assert.equal(body.component.clip,Number(pose[1]));near(body.component.time_seconds,Number(pose[2])/Number(pose[3]));
s.visible[0][S.index(m.x,m.z)]=0;assert.equal(effects(image,clock).some(e=>e.slot==='bladeMirrorCaster'||e.slot==='bladeMirrorMissile'),false);assert.equal(S.publicState(s,0).units.find(u=>u.id===image.id).bladeMirrorEffect,undefined);S.visibility(s);
for(const change of [m=>m.frame++,m=>m.born++,m=>m.toX+=10,m=>m.x=Infinity,m=>m.rank=4,m=>m.extra=1]){const bad=S.restore(s);change(bad.units.find(S.bladeIllusion).bladeMirrorEffect);assert.throws(()=>S.restore(bad),/Mirror image effect/);}
const legacy=copy(s);for(const u of legacy.units)delete u.bladeMirrorEffect;assert.ok(S.restore(legacy));const unrelated=S.spawn(s,'soldier',0,8,0,{order:{type:'hold'}});unrelated.bladeMirrorEffect=copy(m);assert.throws(()=>S.restore(s),/Mirror image effect/);delete unrelated.bladeMirrorEffect;
console.log('PASS original Mirror Image origin, exact split birth, native catalog binding, 10-unit flight/direction, initial destination, nonlooping disappearance, body pose emitters, source fog, forged-state rejection and legacy saves');
