// Author: MiYu. Exercise generated menu input, scene replacement and fresh runtime ownership.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {readMapPackages} from './frost-script-bundle.mjs';
const root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),maps=readMapPackages(root),pack=maps.find(m=>m.id==='amazonia');assert.ok(pack);
const main='Assets/Scenes/Main.mscene',read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),source=fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),requests=[];
let world;
const engine={network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){},assets:{sampleNodes:()=>[]},loadScene:p=>requests.push(p)};
const context=vm.createContext({engine});
function scene(file){world=clientWorldFixture(read(file).world);Object.assign(engine,world.engine);engine.pushCommandsJson=json=>{for(const c of JSON.parse(json))engine.pushCommandJson(JSON.stringify(c));return true;};engine.scene={path:file};context.onSceneLoaded?.(engine.scene);}
scene(main);vm.runInContext(source,context);context.onSceneLoaded(engine.scene);
function tick(input={},dt=1/60,load=true){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720],...input};context.onTick(dt);world.commit();if(load&&requests.length){assert.equal(requests.length,1);scene(requests.shift());}}
const key=k=>tick({keys:[k],pressedKeys:[k]});
function click(name){const pointer=world.canvasPoint(name,[1280,720],false);tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});}
const telemetry=()=>JSON.parse(world.entity('Frost telemetry').components.Text.text);
tick();click('solo box');click('custom box');
assert.equal(telemetry().mode,'custom');click('map4 box');click('map1 box');
assert.equal(world.entity('Map name').components.Text.text,'Amazonia');
assert.equal(world.entity('mapStart label').components.Text.text,'加载地图');
assert.equal(world.entity('Map preview backing').components.Image.sprite,pack.previewImage);
for(const name of ['map2 box','map3 box','faction box','heroChoice box','Hero preview','Map tile 0'])assert.equal(world.visible(name),false,name);
click('mapStart box');tick();assert.equal(context.FrostMapSession.status().map,pack.id);
assert.equal(engine.scene.path,pack.scene);assert.equal(world.snapshot.entities.length,read(pack.scene).world.entities.length);
for(let i=0;i<30;i++)tick();const animated=structuredClone(world.snapshot.entities),elapsed=context.FrostMapSession.status().elapsed;
assert.ok(elapsed>0);assert.deepEqual(Array.from(context.FrostMapSession.status().pathing.size),[384,384]);
key('Space');const frozen=structuredClone(world.snapshot.entities);for(let i=0;i<5;i++)tick();assert.deepEqual(world.snapshot.entities,frozen);assert.equal(context.FrostMapSession.status().elapsed,elapsed);
key('KeyR');assert.equal(context.FrostMapSession.status().elapsed,0);tick();assert.equal(context.FrostMapSession.status().paused,false);
const before=world.entity('Camera').components.Transform.position[0];tick({keys:['KeyD']});assert.ok(world.entity('Camera').components.Transform.position[0]>before);
key('Escape');tick();assert.equal(engine.scene.path,main);assert.equal(telemetry().mode,'custom');assert.equal(world.entity('Map name').components.Text.text,'Amazonia');
// Stale IDs or cached commands fail the fixture immediately when switching worlds.
click('mapStart box');tick();key('Escape');tick();click('map4 box');click('map0 box');click('mapStart box');tick();assert.equal(telemetry().mode,'playing');
// Failed scene requests must leave the old menu usable and allow retry.
context.FrostClient.openMaps(5);tick();assert.equal(context.FrostMapSession.start(pack.id,5),true);assert.equal(context.FrostMapSession.start(pack.id,5),false);requests.splice(0);
for(let i=0;i<13;i++)tick({},1,false);assert.equal(context.FrostMapSession.status().pending,null);assert.equal(engine.scene.path,main);requests.splice(0);assert.equal(context.FrostMapSession.start(pack.id,5),true);tick();assert.equal(world.visible('Map loading back'),true);tick();
// Independent map sessions retain neither changed pathing flags nor animation clocks.
const a=context.FrostMapPackages[0].create(),b=context.FrostMapPackages[0].create(),old=b.pathing.getCell(0,0);a.pathing.setCell(0,0,0,old===255);assert.equal(b.pathing.getCell(0,0),old);assert.equal(b.pathing.revision,0);
const manifest=read('Assets/Maps/amazonia/manifest.json'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const asset of manifest.assets)assert.equal(hash(fs.readFileSync(path.join(root,asset.path))),asset.sha256,asset.path);
assert.equal(hash(fs.readFileSync(path.join(root,manifest.installedSource))),pack.sourceSha256);
assert.ok(read('project.json').buildScenes.includes(pack.scene));
assert.ok(animated.some(e=>e.name.startsWith('Doodad-'))&&animated.some(e=>e.name.startsWith('Unit-')));
console.log('PASS menu click -> Amazonia scene -> pause/reload/move/return -> original skirmish; failed load retry; isolated pathing; source and asset hashes');
