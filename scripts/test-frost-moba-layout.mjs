// Author: MiYu. Authored objective placement, compatibility, geometry spacing and real navigation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),map=require('../samples/frostbound-realms/Assets/Maps/moba.json'),copy=v=>JSON.parse(JSON.stringify(v));
globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Scripts/Main.js',import.meta.url),'utf8').match(/^var FrostArt=(.+);$/m)[1]);const V=require('../samples/frostbound-realms/game/visuals.js');
const state=S.create('moba',{map,ai:[false,false]});assert.deepEqual(state.map.mobaLayout,map.mobaLayout);assert.deepEqual(S.restore(copy(state)).map.mobaLayout,map.mobaLayout);
for(const team of [0,1]){
  const units=state.units.filter(u=>u.team===team&&u.mobaObjective),layout=S.mobaObjectives.layout(team,map);
  assert.deepEqual(units.slice(1).map(u=>[u.x,u.z]),map.mobaLayout[team]);assert.deepEqual(S.publicState(state,team).map.mobaLayout,map.mobaLayout);
  const boxes=units.map(u=>{const v=V.model(state,u),yaw=V.heading(state,u)+(v.asset.classicYaw||0),c=Math.cos(yaw),s=Math.sin(yaw);return {min:v.asset.bounds.min.map(n=>n*v.scale),max:v.asset.bounds.max.map(n=>n*v.scale),p:[u.x*c-u.z*s,u.x*s+u.z*c]};});
  for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++){const a=boxes[i],b=boxes[j];assert.ok([0,1].some((k)=>{const axis=k?2:0;return a.p[k]+a.max[axis]<=b.p[k]+b.min[axis]||b.p[k]+b.max[axis]<=a.p[k]+a.min[axis];}),'rotated source model footprints do not overlap: '+team+'/'+i+'/'+j);}
  for(const o of layout.filter(o=>['melee','ranged'].includes(o.role))){const tower=layout.find(v=>v.role==='tower'&&v.tier===3&&v.lane===o.lane),origin=map.spawns[team];assert.ok(Math.hypot(o.p[0]-origin[0],o.p[1]-origin[1])<Math.hypot(tower.p[0]-origin[0],tower.p[1]-origin[1]),'barracks behind T3');}
  for(const lane of [0,1,2]){const s=S.create('moba',{map,ai:[false,false]}),u=s.units.find(u=>u.team===team&&u.kind==='hero'),target=S.lanePath(team,lane)[1];assert.equal(S.command(s,team,{type:'move',ids:[u.id],x:target[0],z:target[1]}),null);let ticks=0;while(Math.hypot(u.x-target[0],u.z-target[1])>1&&ticks++<240)S.tick(s);assert.ok(Math.hypot(u.x-target[0],u.z-target[1])<=1,'hero traverses base exit '+team+'/'+lane);}
}
for(const change of [m=>m.mobaLayout.pop(),m=>m.mobaLayout[0].pop(),m=>m.mobaLayout[0][0]=[Infinity,0],m=>m.mobaLayout[0][1]=[...m.mobaLayout[0][0]],m=>m.mobaLayout[0][0]=[0,0],m=>m.props.push({kind:'tree',x:m.mobaLayout[0][0][0],z:m.mobaLayout[0][0][1],amount:600})]){const m=copy(map);change(m);if(m.mobaLayout[0]?.[0]?.every(n=>n===0))m.terrain[S.index(0,0)]=1;assert.throws(()=>S.validateMap(m),/MOBA/);}
const legacy=copy(map);delete legacy.mobaLayout;const old=S.create('moba',{map:legacy,ai:[false,false]});assert.deepEqual(old.units.filter(u=>u.team===0&&u.mobaObjective?.role==='tower'&&u.mobaObjective.tier===4).map(u=>[u.x,u.z]),[[-21,19],[-19,22]]);assert.deepEqual(S.restore(copy(old)).units.map(u=>[u.x,u.z]),old.units.map(u=>[u.x,u.z]));
assert.deepEqual(S.validateMap({...map,mode:'skirmish'}).mobaLayout,map.mobaLayout,'mode switching preserves dormant layout');
const cube={size:[2,8,2],bounds:{min:[-1,0,-1],max:[1,8,1]}};assert.ok(V.overlapsView(V.viewBounds(cube,1,0,0,0,8),[-1,-1,1,1]),'foreground canopy can cover a distant ground anchor');assert.ok(!V.overlapsView(V.viewBounds(cube,1,0,15,0,8),[-1,-1,1,1]));
console.log('PASS authored MOBA layout: 34 placements, source geometry spacing, barracks ordering, six base exits, persistence, invalid-site rejection, legacy restoration and canopy projection');
