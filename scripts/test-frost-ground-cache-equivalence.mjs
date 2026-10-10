// Author: MiYu. Compare complete routes and actual AI state against the prior exhaustive search.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import Module from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),filename=repo+'samples/frostbound-realms/game/simulation.js',baseline=process.argv[2]??'46a296b';
function load(source){const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(repo+'samples/frostbound-realms/game');m._compile(source,filename);return m.exports;}
const before=load(execFileSync('git',['show',baseline+':samples/frostbound-realms/game/simulation.js'],{cwd:repo,encoding:'utf8',maxBuffer:8*1024*1024})),after=load(fs.readFileSync(filename,'utf8'));
let paths=0,aiFrames=0;
for(const name of ['default','siege','highland'])for(const factions of [[0,2],[1,2],[2,2]]){
  const worlds=[before,after].map(S=>S.create('skirmish',{map:name==='siege'?S.siegeMap():name==='highland'?S.highlandMap():S.defaultMap(),factions,ai:[true,true]}));
  for(let i=0;i<35;i++){before.tick(worlds[0]);after.tick(worlds[1]);assert.deepEqual(worlds[1],worlds[0],name+' factions '+factions+' AI frame '+i);aiFrames++;}
}
for(const name of ['default','highland','sealed']){
  const setup=S=>{const map=name==='default'?S.defaultMap():S.highlandMap();map.units=[];map.triggers=[];map.props=[{kind:'tree',x:-3,z:3,amount:500},{kind:'tree',x:-3,z:5,amount:500}];if(name==='sealed')map.ramps.fill(0);const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];return s;};
  const worlds=[before,after].map(setup);
  for(const kind of ['worker','soldier','knight','glaivethrower'])for(const team of [0,1]){
    const units=worlds.map((s,i)=>[before,after][i].spawn(s,kind,team,-13,3));
    for(const [x,z] of [[-5,7],[-11,3],[23,-23],[-31,31],[1,5]]){
      const routes=worlds.map((s,i)=>[before,after][i].path(s,units[i],x,z));assert.deepEqual(routes[1],routes[0],name+' '+kind+' team '+team+' goal '+[x,z]);paths++;
    }
    const probes=worlds.map(s=>({...s,serial:s.serial+1,units:[...s.units,{id:s.serial+1,kind:'hall',team,x:-5,z:7,hp:1,built:.01,queue:[]}]}));
    const routes=probes.map((s,i)=>[before,after][i].path(s,units[i],-5,7));assert.deepEqual(routes[1],routes[0],name+' blocked hall approach '+kind+' team '+team);paths++;
  }
}
console.log(JSON.stringify({author:'MiYu',baseline,passed:true,completePathsCompared:paths,completeAiStatesCompared:aiFrames,scope:'Exact previous search equivalence on immutable maps: both teams, four collision profiles, trees, ramps, sealed cliffs, boundary targets, hypothetical building footprints and 35 actual AI frames for each of nine map/faction combinations.'}));
