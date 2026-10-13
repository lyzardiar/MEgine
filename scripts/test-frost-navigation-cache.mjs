// Author: MiYu. Compare complete simulation states across cached terrain queries, live edits and moving obstacles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const file=new URL('../samples/frostbound-realms/game/simulation.js',import.meta.url),require=createRequire(file),baseline=execFileSync('git',['show','929824e:samples/frostbound-realms/game/simulation.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
function load(source){const module={exports:{}};vm.runInNewContext(source,{module,require});return module.exports;}
const before=load(baseline),after=load(fs.readFileSync(file,'utf8')),plain=value=>JSON.parse(JSON.stringify(value));
function fixture(S){
 const map=S.defaultMap();for(const key of ['heights','ramps','relief','terrain'])map[key].fill(0);map.props=[];map.doodads=[];map.units=[];map.triggers=[];
 const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];S.spawn(s,'hall',0,-24,20);S.spawn(s,'hall',1,24,-20);
 for(let i=0;i<12;i++)S.spawn(s,i%3?'soldier':'knight',0,-7-i%3,(Math.floor(i/3)-2)*1.2);
 S.visibility(s);assert.equal(S.command(s,0,{type:'move',ids:s.units.filter(u=>u.team===0&&u.kind!=='hall').map(u=>u.id),x:7,z:0}),null);return s;
}
let a=fixture(before),b=fixture(after),comparisons=0;
function compare(label){assert.deepEqual(plain(b),plain(a),label);comparisons++;}
function step(count,label){for(let i=0;i<count;i++){before.tick(a);after.tick(b);compare(label+' '+i);}}
function edit(fn){fn(before,a);fn(after,b);}
compare('initial');step(8,'crowded shared destination');
edit((S,s)=>{for(let z=10;z<22;z++)s.map.terrain[z*32+16]=1;});step(4,'water edits invalidate terrain edges');
edit((S,s)=>{s.map.terrain.fill(0);for(let z=10;z<22;z++)for(let x=15;x<20;x++)s.map.heights[z*32+x]=1;});step(4,'cliff edits invalidate terrain edges');
edit((S,s)=>{for(let z=13;z<19;z++)s.map.ramps[z*32+15]=1;s.map.relief[16*33+15]=-.5;});step(4,'ramp and relief edits');
edit((S,s)=>{s.map=plain(s.map);s.map.heights.fill(0);s.map.ramps.fill(0);s.map.relief.fill(.25);});step(4,'replacement map');
edit((S,s)=>{S.spawn(s,'farm',0,-2,0);s.units[3].x=0;s.units[3].z=0;s.units[4].hp=0;S.visibility(s);});step(4,'new building moved body and dead body');
edit((S,s)=>{const u=s.units[2];S.unitHeight(s,u);s.map.relief.fill(.5);const height=S.unitHeight(s,u);assert.equal(height,S.elevation(s.map,u.x,u.z),'same-frame external relief edit');u.cyclone=1;assert.equal(S.unitHeight(s,u),height+4,'airborne state changes without position change');u.cyclone=0;s.frame++;});compare('same-frame height and airborne state');
edit((S,s)=>{const u=s.units[2];u.x=0;u.z=0;S.unitHeight(s,u);s.map.relief.fill(.75);assert.equal(S.unitHeight(s,u),S.elevation(s.map,0,0),'same-frame edit at a fixed navigation coordinate');});compare('fixed-coordinate raw edit');
function samples(S,s){S.prepareGround(s.map);return [-2,-1.5,0,.5,2].flatMap(x=>[-2,-.5,0,1.5,2].map(z=>plain(S.groundSample(s.map,x,z,true))));}
assert.deepEqual(samples(after,b),samples(before,a),'fixed navigation point samples');
edit((S,s)=>{s.map.relief[16*33+16]=-.5;s.map.heights[16*32+16]=1;s.map.ramps[16*32+16]=2;});assert.deepEqual(samples(after,b),samples(before,a),'same-frame explicit terrain refresh invalidates fixed samples');
a=before.restore(plain(a));b=after.restore(plain(b));compare('restored world');step(6,'restored paths');
console.log(JSON.stringify({passed:true,completeStateComparisons:comparisons,scope:'Crowded paths, water, cliffs, ramps, relief, map replacement, buildings, body movement/death and same-frame external height queries.'}));
