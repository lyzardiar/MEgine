// Author: MiYu. Rendered cliff contours, body clearance, ramp widths and cross-language geometry fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;const T=require('../samples/frostbound-realms/game/terrain.js');
function field(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.relief.fill(0);map.props=[];map.units=[];map.players.forEach(p=>p.ai=false);return map;}
function game(map){const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];return s;}
const advance=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
{
  const map=field();map.heights[S.index(1,1)]=1;const s=game(map),u=S.spawn(s,'soldier',0,1,1);
  assert.ok(!S.walkClear(s,u,.05,.05),'a square-grid corner outside the rendered shelf is unavailable');
  assert.ok(!S.groundClear(map,.5,.5,.5,.5,.5),'the body must fit inside the curved upper rim');
  assert.ok(S.groundClear(map,1,1,1,1,.5));assert.ok(!S.flatSite(map,1,1,1),'a building footprint cannot hang over an inset cliff');
  assert.ok(!S.traversable(map,-3,1,5,1),'a low-ground route cannot cross an enclosed plateau in the same connected region');
  assert.equal(S.command(s,0,{type:'move',ids:[u.id],x:.05,z:.05}),null);assert.deepEqual([u.order.x,u.order.z],[1,1]);advance(s,10);assert.equal(u.order,null);
  const edge=S.groundTile(map,16,16).edges[2],p=edge[0].map((v,i)=>(v+edge[1][i])/2),start={kind:'soldier',x:p[0],z:p[2]+.1};
  assert.ok(S.walkClear(s,start,1,1),'an old save too close to a rim can move back to safety');
  const fly={kind:'dragon',x:1,z:1};assert.ok(S.walkClear(s,fly,-3,-3),'flying movement clears the cliff');
  const copy=S.restore(s);assert.deepEqual(S.publicState(copy,0),S.publicState(s,0));
}
{
  const map=field();for(let z=12;z<=20;z++)for(let x=16;x<=22;x++)map.heights[z*32+x]=1;map.ramps[16*32+15]=1;
  assert.ok(S.groundClear(map,-3,1,3,1,.5),'foot soldiers fit the single-tile ramp');
  assert.ok(!S.groundClear(map,-3,1,3,1,.9),'a siege unit cannot clip the sides of a narrow ramp');
  const s=game(map),u=S.spawn(s,'soldier',0,-3,1);assert.equal(S.command(s,0,{type:'move',ids:[u.id],x:3,z:1}),null);advance(s,60);assert.ok(u.x>2.8&&S.unitHeight(s,u)>1.99);
  map.ramps[15*32+15]=map.ramps[17*32+15]=1;assert.ok(S.groundClear(map,-3,1,3,1,.9),'a wide ramp admits the siege footprint');
  const wide=game(map),siege=S.spawn(wide,'catapult',0,-3,1);assert.equal(S.command(wide,0,{type:'move',ids:[siege.id],x:3,z:1}),null);advance(wide,90);assert.ok(siege.x>2.8&&S.unitHeight(wide,siege)>1.99);
}
const fixtures=[];
for(let mask=0;mask<16;mask++)for(let mode=0;mode<4;mode++){
  const map=field(),cells=[[14,14],[15,14],[14,15],[15,15]];
  for(let k=0;k<4;k++){const [x,z]=cells[k],i=z*32+x;map.heights[i]=mask>>k&1;if(mode)map.ramps[i]=mode===1?1:mode===2?k%2?2:1:k+1;}
  for(let z=0;z<=32;z++)for(let x=0;x<=32;x++)map.relief[z*33+x]=((x+z)%9-4)/16;
  const triangles=cells.flatMap(([x,z])=>{const mesh=S.groundTile(map,x,z);for(const tri of mesh.triangles){const [px,py,pz]=tri[0].map((_,i)=>tri.reduce((n,p)=>n+p[i],0)/3),sample=S.groundSample(map,px,pz);assert.ok(sample&&Math.abs(sample.y-py)<1e-6,JSON.stringify({mask,mode,x,z,px,py,pz,sample}));}return [mesh.triangles[0],mesh.triangles[15],mesh.triangles.at(-1)];});
  fixtures.push({mask,mode,key:T.mesh(map,3,3),triangles});
}
const fixtureFile=new URL('../docs/designs/frostbound-realms/cliff-surface-fixtures.json',import.meta.url);
if(process.argv.includes('--write-fixtures'))fs.writeFileSync(fixtureFile,JSON.stringify(fixtures)+'\n');else assert.deepEqual(JSON.parse(fs.readFileSync(fixtureFile,'utf8')),fixtures,'native parity fixtures reproduce exactly');
console.log('PASS: curved rims, swept body clearance, enclosed cliffs, safe recovery, footprint placement, flying, saves and narrow/wide ramps; 64 native surface fixtures');
