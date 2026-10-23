// Author: MiYu. Exercise file-picker UI, async import state and a converted map absent from the catalog.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url));
assert.ok(process.argv[2],'Usage: node scripts/test-frost-map-import.mjs <runtime-converter-receipt>');
const entry=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
assert.ok(!read('Assets/Maps/catalog.json').maps.some(map=>map.id===entry.id),'Use a map absent from the installed catalog');
const content={...entry,scriptSource:fs.readFileSync(path.join(root,entry.script),'utf8')},requests=[],imports=[];let world,cancels=0;
const engine={network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){},assets:{sampleNodes:()=>[]},loadScene:file=>requests.push(file),importContent:(...args)=>imports.push(args),cancelContentImport:()=>cancels++};
const context=vm.createContext({engine});
function scene(file){world=clientWorldFixture(read(file).world);Object.assign(engine,world.engine);engine.pushCommandsJson=json=>{for(const c of JSON.parse(json))engine.pushCommandJson(JSON.stringify(c));return true;};engine.scene={path:file};context.onSceneLoaded?.(engine.scene);}
scene('Assets/Scenes/Main.mscene');vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);context.onSceneLoaded(engine.scene);
function tick(input={},dt=1/60){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720],...input};context.onTick(dt);world.commit();if(requests.length){assert.equal(requests.length,1);scene(requests.shift());}}
function click(name){const pointer=world.canvasPoint(name,[1280,720],false);tick({pointer,buttons:[0],pressedButtons:[0]});tick({pointer,releasedButtons:[0]});}
tick();click('solo box');click('custom box');assert.equal(world.visible('mapOpen box'),true);click('mapOpen box');assert.deepEqual(imports,[['warcraft-map',null]]);
context.onContentImport({status:'importing',file:'任意地图.w3x'});for(let i=0;i<12;i++)tick({},1);assert.ok(context.FrostMapSession.importStatus().busy);assert.match(world.entity('Map description').components.Text.text,/任意地图/);
assert.equal(world.visible('Map loading back'),true);assert.match(world.entity('Map loading status').components.Text.text,/准备地图转换/);
context.onContentImport({status:'progress',step:3,steps:8,message:'转换装饰物',completed:20,total:100});tick();
assert.match(world.entity('Map loading status').components.Text.text,/20\/100/);const partial=world.entity('Map loading fill').components.RectTransform.size_delta[0];assert.equal(partial,350*3.2/8);
for(let i=0;i<20;i++)tick({},1);assert.equal(world.entity('Map loading fill').components.RectTransform.size_delta[0],partial,'time must not fabricate progress');
context.onContentImport({status:'progress',step:3,steps:8,message:'转换装饰物',completed:100,total:100});tick();assert.equal(world.entity('Map loading fill').components.RectTransform.size_delta[0],175);
context.onContentImport({status:'progress',step:3,steps:0,message:'invalid'});tick();assert.equal(world.entity('Map loading fill').components.RectTransform.size_delta[0],175);
click('mapStart box');assert.equal(engine.scene.path,'Assets/Scenes/Main.mscene');click('mapOpen box');assert.equal(cancels,1);
context.onContentImport({status:'complete',content});tick();assert.equal(context.FrostMapPackages.length,1,'cancelled late completion must not load');
tick({},.1);assert.equal(world.visible('Map loading back'),false);
click('mapOpen box');context.onContentImport({status:'failed',message:'不支持的地图数据'});tick({},.1);assert.match(world.entity('Map description').components.Text.text,/不支持的地图数据/);assert.equal(context.FrostMapSession.importStatus().busy,false);
click('mapOpen box');tick({pressedKeys:['Escape']});assert.equal(cancels,2);context.onContentImport({status:'cancelled'});tick();
context.FrostClient.openMaps();tick({},.1);click('mapOpen box');context.onContentImport({status:'complete',content});tick();
assert.equal(engine.scene.path,'Assets/Scenes/Main.mscene');assert.equal(world.visible('Map loading back'),true);assert.match(world.entity('Map loading status').components.Text.text,/正在进入地图/);
tick();assert.equal(engine.scene.path,entry.scene,JSON.stringify(context.FrostMapSession.status())+' requests='+imports.length);assert.equal(context.FrostMapSession.status().map,entry.id);assert.ok(world.snapshot.entities.some(e=>e.name.startsWith('Unit-')));
const first=context.FrostMapSession.status().pathing;tick({pressedKeys:['Escape']});tick();assert.equal(world.entity('Map name').components.Text.text,entry.title);
click('mapStart box');tick();assert.equal(context.FrostMapSession.status().pathing.revision,0);assert.deepEqual(context.FrostMapSession.status().pathing.size,first.size);
tick({pressedKeys:['Escape']});tick();click('mapOpen box');context.onContentImport({status:'complete',content:{...content,cached:true}});tick();assert.equal(context.FrostMapPackages.length,2,'cached imports replace the same entry');
console.log('PASS arbitrary map UI, measured progress without timer estimates, pre-switch loading UI, cancellation/late completion/Escape, failure retry, dynamic scene load, return/reload and cache deduplication');
