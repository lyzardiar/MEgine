// Author: MiYu. Reproduce the symmetric escape decision with alternate last-bit Math.hypot results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const file=new URL('../samples/frostbound-realms/game/simulation.js',import.meta.url),source=fs.readFileSync(file,'utf8'),require=createRequire(file);
const goal=[-.13654158676313344,-4.864294028436625],first=[13.890518265773897,-1.258875647271173],second=[13.747103517845643,-.7409642551617939],distance=14.48300555167683;
function run(improvement){
 const math=Object.create(Math),module={exports:{}};vm.runInNewContext(source,{module,require,Math:math});const S=module.exports,s=S.create('skirmish',{ai:[false,false]});
 for(let team=0;team<2;team++){const ids=[];for(let i=0;i<48;i++)ids.push(S.spawn(s,i%3?'soldier':'archer',team,(team?1:-1)*(10+i%4),-9+Math.floor(i/4)*1.5).id);for(let i=0;i<ids.length;i+=40)assert.equal(S.command(s,team,{type:'attackMove',ids:ids.slice(i,i+40),x:0,z:0}),null);}
 S.tick(s);S.tick(s);let firstCalls=0,secondCalls=0;
 math.hypot=(...args)=>{if(args.length===2){const matches=p=>Math.abs(args[0]-(goal[0]-p[0]))<1e-12&&Math.abs(args[1]-(goal[1]-p[1]))<1e-12;if(matches(first)){firstCalls++;return distance;}if(matches(second)){secondCalls++;return distance-improvement;}}return Math.hypot(...args);};
 S.tick(s);assert.ok(firstCalls&&secondCalls,'both valid symmetric candidates reached the real movement scorer');const u=s.units.find(u=>u.id===86),expected=improvement>1e-10?second:first;assert.ok(Math.hypot(u.x-expected[0],u.z-expected[1])<1e-12,JSON.stringify({improvement,actual:[u.x,u.z],expected}));
 return {improvement,firstCalls,secondCalls,position:[u.x,u.z]};
}
const cases=[0,1.7763568394002505e-15,1e-11,1e-6].map(run);
console.log(JSON.stringify({passed:true,cases,scope:'Real 110-unit battle escape: exact ties and sub-threshold score improvements retain the first valid direction; a materially better valid direction still replaces it.'}));
