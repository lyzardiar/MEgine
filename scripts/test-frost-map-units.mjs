// Author: MiYu. Verify original unit-to-visual ownership, source selection feedback and perspective picking.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const sample='samples/frostbound-realms/',map=sample+'Assets/Maps/amazonia/',data=JSON.parse(fs.readFileSync(map+'Data/OriginalUnitBindings.json'));
const source=fs.readFileSync(map+'Source/war3map.j','utf8'),scene=JSON.parse(fs.readFileSync(map+'Scenes/Main.mscene')).world;
for(const e of scene.entities){e.entity+=4294967296;if(e.parent!==undefined&&e.parent!==null)e.parent+=4294967296;}
const world=clientWorldFixture(scene),engine={...world.engine};let writes=0;
engine.pushCommandsJson=raw=>{const commands=JSON.parse(raw);writes+=commands.length;for(const c of commands)engine.pushCommandJson(JSON.stringify(c));return true;};
Object.defineProperty(engine,'snapshot',{get(){assert.fail('Unit binding must not request a full scene snapshot');}});
const context=vm.createContext({engine});for(const name of ['warcraft-jass','warcraft-unit-initialization','warcraft-map-units'])vm.runInContext(fs.readFileSync(sample+'game/'+name+'.js','utf8'),context);
const init=context.FrostWarcraftUnitInitialization.initialize(source),M=context.FrostWarcraftMapUnits,units=M.create(init,data);assert.equal(units.status,'ready',units.error);assert.equal(units.count,96);world.commit();
assert.equal(world.queries(),1);assert.equal(new Set(init.units.map(u=>u.visual.entity)).size,96);
for(const u of init.units){const profile=data.definitions[u.typeId].movement;assert.deepEqual(JSON.parse(JSON.stringify(u.movement)),profile??null);if(profile)assert.ok(Object.isFrozen(u.movement));}
for(const u of init.units){const p=data.placements.find(p=>p.index===u.visual.placementIndex),root=world.entity(p.name);assert.equal(root.entity,u.visual.entity);assert.equal(p.creationNumber,u.visual.creationNumber);assert.equal(root.components.Transform.position[0],u.sourcePosition[0]/128);assert.equal(root.components.Transform.position[2],-u.sourcePosition[1]/128||0);assert.ok(root.entity>4294967296);}
const gold=init.units.find(u=>u.typeId==='ngol'),root=world.snapshot.entities.find(e=>e.entity===gold.visual.entity),camera=world.entity('Camera'),circle=world.entity('Map unit selection');
assert.equal(gold.name,'金矿');assert.equal(gold.states.MAX_LIFE,150000);assert.equal(gold.resourceAmount,12500);
const pitch=-56*Math.PI/180,distance=12;camera.components.Transform={position:[root.components.Transform.position[0],root.components.Transform.position[1]-Math.sin(pitch)*distance,root.components.Transform.position[2]+Math.cos(pitch)*distance],rotation:[Math.sin(pitch/2),0,0,Math.cos(pitch/2)],scale:[1,1,1]};
const click=(pointer=[640,360],viewport=[1280,720])=>{units.tick({pointer,viewport,pressedButtons:[0]});world.commit();};
const q=world.queries(),n=writes;for(let i=0;i<600;i++)units.tick({pressedButtons:[],viewport:[1280,720]});assert.equal(world.queries(),q);assert.equal(writes,n);
click();assert.equal(units.selected().id,gold.id);assert.equal(circle.active,true);assert.equal(circle.components.MeshRenderer.material,data.selection.sizes[2].material);assert.deepEqual(circle.components.MaterialPropertyBlock.base_color,[1,1,0,1]);assert.equal(circle.components.Transform.scale[0],5*72/128);
assert.equal(circle.components.MeshRenderer.mesh,data.placements.find(p=>p.index===gold.visual.placementIndex).selectionMesh);assert.equal(circle.components.Transform.position[1],data.definitions.ngol.selectionZ+.01);
const after=writes;click();assert.equal(writes,after,'unchanged selection emits no scene writes');click([450,450],[900,900]);assert.equal(units.selected().id,gold.id);
click([-1,-1]);assert.equal(units.selected().id,gold.id);click([600,42]);assert.equal(units.selected().id,gold.id,'top map UI does not select through');
root.components.Transform.position[0]+=6;camera.components.Transform.position[0]+=6;click();assert.equal(units.selected().id,gold.id);assert.equal(circle.components.Transform.position[0],root.components.Transform.position[0],'selection reads current Inspector transforms on demand');
assert.equal(circle.components.MeshRenderer.mesh,data.selection.mesh,'relocated unit cannot reuse stale ground geometry');
root.active=false;click();assert.notEqual(units.selected()?.id,gold.id);root.active=true;
camera.components.Transform={position:[0,100,0],rotation:[0,0,0,1],scale:[1,1,1]};click();assert.equal(units.selected(),null);assert.equal(circle.active,false);
const ray={origin:[0,0,10],direction:[0,0,-1],near:.1,far:100},transform={position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},bounds={min:[-1,-1,-1],max:[1,1,1]};
assert.equal(M.hitBox(ray,transform,bounds),9);assert.equal(M.hitBox({...ray,origin:[2,0,10]},transform,bounds),null);assert.equal(M.hitBox({...ray,far:8},transform,bounds),null);assert.equal(M.hitBox(ray,{...transform,scale:[2,2,2]},bounds),8);
const fresh=context.FrostWarcraftUnitInitialization.initialize(source),broken=structuredClone(data);broken.placements.push({...broken.placements[0],index:999});const count=writes;
assert.equal(M.create(fresh,broken).status,'unsupported');assert.equal(writes,count);assert.equal(fresh.units[0].visual,undefined,'ambiguous bindings publish no partial unit/visual association');
const missing=structuredClone(data);missing.placements[0].name='missing visual';assert.equal(M.create(fresh,missing).status,'unsupported');assert.equal(writes,count);
const second=M.create(context.FrostWarcraftUnitInitialization.initialize(source),data);assert.equal(second.selected(),null);assert.equal(M.create({status:'unsupported'},data),null);assert.equal(M.create(init,null),null);
const legacy=structuredClone(data);for(const definition of Object.values(legacy.definitions))delete definition.movement;
const legacyInit=context.FrostWarcraftUnitInitialization.initialize(source);assert.equal(M.create(legacyInit,legacy).status,'ready');assert.ok(legacyInit.units.every(u=>u.movement===null));
const enriched=structuredClone(data),kind=init.units[0].typeId;enriched.definitions[kind].movement={type:'foot',speed:270,turnRate:.6,collisionSize:31};
const moving=context.FrostWarcraftUnitInitialization.initialize(source);assert.equal(M.create(moving,enriched).status,'ready');const member=moving.units.find(u=>u.typeId===kind),same=moving.units.filter(u=>u.typeId===kind);
enriched.definitions[kind].movement.speed=999;assert.equal(member.movement.speed,270);for(const u of same)assert.equal(u.movement,member.movement);
for(const profile of [null,{}, {type:' foot',speed:270,turnRate:.6,collisionSize:31},{type:'foot',speed:NaN,turnRate:.6,collisionSize:31},{type:'foot',speed:270,turnRate:Infinity,collisionSize:31}]){
 const invalid=structuredClone(data),fresh=context.FrostWarcraftUnitInitialization.initialize(source);invalid.definitions[kind].movement=profile;const before=writes;
 assert.equal(M.create(fresh,invalid).status,'unsupported');assert.equal(writes,before);assert.equal(fresh.units[0].visual,undefined);assert.equal(fresh.units[0].movement,undefined);
}
console.log('PASS 96 source bindings, source HP/mana/names/movement, frozen shared profiles, legacy packages, 64-bit IDs, oblique picking, atomic failures and 600 idle frames without queries/writes');
