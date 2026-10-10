// Author: MiYu. Compare complete incremental decoration data and geometry invalidation with the committed sampler.
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root='samples/frostbound-realms/game/',baseline=process.argv[2]??'5767278';
function load(previous){const context={};for(const file of ['simulation.js','terrain.js']){const filename=path.resolve(root+file),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(previous?execFileSync('git',['show',baseline+':'+root+file],{encoding:'utf8',maxBuffer:8*1024*1024}):fs.readFileSync(root+file,'utf8'),filename);context[file==='simulation.js'?'Frost':'FrostTerrain']=m.exports;}return context;}
const old=load(true),next=load(false);let snapshots=0;
function compare(maps,budget,label){const values=[old,next].map((c,i)=>{globalThis.Frost=c.Frost;return JSON.stringify(c.FrostTerrain.details(maps[i],budget));});assert.equal(values[1],values[0],label+' budget '+budget);snapshots++;}
for(const name of ['defaultMap','highlandMap','siegeMap']){
  const maps=[old,next].map(c=>c.Frost.validateMap(c.Frost[name]()));
  for(const edit of [null,m=>{m.terrain[19]=1;},m=>{m.terrain[19]=0;m.surfaces[19]=2;},m=>{m.surfaces[19]=3;},m=>{m.heights[19]=2;},m=>{m.ramps[19]=1;},m=>{m.relief.fill(.25);},m=>{m.terrain=m.terrain.slice();m.heights.fill(0);m.ramps.fill(0);m.relief.fill(0);},m=>{m.surfaces.fill(3);}]){
    if(edit)for(const m of maps)edit(m);
    for(const budget of [0,8,1,8,0,24,8,144,192])compare(maps,budget,name);
    const copies=[old,next].map((c,i)=>c.Frost.validateMap(JSON.parse(JSON.stringify(maps[i]))));
    compare(copies,8,name+' independent equal map');
    for(const m of copies)m.relief[20]+=.5;
    compare(copies,8,name+' independent edited map');compare(maps,192,name+' retained original map');
  }
}
console.log('PASS: '+snapshots+' exact decoration snapshots across three maps, incremental budgets, geometry/water/surface edits and independent map objects');
