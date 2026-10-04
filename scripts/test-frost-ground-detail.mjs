// Author: MiYu. Ground-cover placement, terrain edits, seasonal materials and slope alignment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);globalThis.Frost=require('../samples/frostbound-realms/game/simulation.js');globalThis.FrostArt=require('../samples/frostbound-realms/model-catalog.json');
const T=require('../samples/frostbound-realms/game/terrain.js'),V=require('../samples/frostbound-realms/game/visuals.js'),map=Frost.validateMap(Frost.defaultMap()),before=JSON.stringify(map),details=T.details(map),points=details.filter(Boolean);
assert.ok(points.length>50&&details.length===192);assert.equal(T.details(map),details);assert.equal(new Set(points.map(p=>p.tile)).size,points.length);assert.equal(JSON.stringify(map),before);
for(const p of points){assert.equal(map.terrain[p.tile],0);assert.ok(Frost.groundClear(map,p.x,p.z,p.x,p.z,.55));assert.ok(Math.abs(p.y+.02-Frost.elevation(map,p.x,p.z))<1e-7);assert.ok(Math.abs(Math.hypot(...p.normal)-1)<1e-7);}
const p=points[0],index=details.indexOf(p);map.terrain[p.tile]=1;assert.equal(T.details(map)[index],null);map.terrain[p.tile]=0;map.surfaces[p.tile]=2;assert.equal(T.details(map)[index],null);map.surfaces[p.tile]=3;assert.ok(T.details(map)[index]);
const oldY=T.details(map)[index].y;map.relief.fill(.25);assert.notEqual(T.details(map)[index].y,oldY);assert.deepEqual(T.details(Frost.validateMap(map)),T.details(map));
for(const [i,p] of details.entries())if(p){
  for(const green of [true,false]){const near=V.groundDetail(i,12,green,p.normal),far=V.groundDetail(i,27,green,p.normal);assert.equal(near.mesh,near.asset.lods[0]);assert.equal(far.mesh,near.asset.lods[1]);assert.equal(near.scale,far.scale);assert.ok(near.scale*Math.max(near.asset.size[0],near.asset.size[2])<=1.100001);
    const [x,y,z,w]=near.rotation,up=[2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x)];assert.ok(Math.abs(Math.hypot(x,y,z,w)-1)<1e-7);assert.ok(up.every((n,i)=>Math.abs(n-p.normal[i])<1e-7));
    const mat=JSON.parse(fs.readFileSync('samples/frostbound-realms/'+near.material));assert.equal(mat.surface,'cutout');assert.equal(mat.alpha_cutoff,.3);assert.ok(mat.double_sided);assert.ok(fs.existsSync('samples/frostbound-realms/'+mat.base_color_texture));
  }
}
console.log('PASS: deterministic bounded grass patches, terrain cache invalidation, water/snow/road rejection, ground contact, persistence, seasonal materials and native slope quaternion');
