// Author: MiYu. Source oblique camera controls use runtime IDs, map bounds, and no idle writes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root='samples/frostbound-realms/Assets/Maps/amazonia/',script=fs.readFileSync(root+'Scripts/Main.js','utf8'),runtime=fs.readFileSync('scripts/frost-original-camera-client.js','utf8');
const config=JSON.parse(script.match(/var originalCameraConfig=(.*);\r?\n/)[1]);
const normalize=text=>text.replace(/\r\n/g,'\n');
assert.ok(normalize(script).includes(normalize(runtime).trim()),'installed map camera is current');
assert.ok(normalize(fs.readFileSync('samples/frostbound-realms/Assets/Scripts/Main.js','utf8')).includes(normalize(script).trim()),'startup bundle embeds the installed map runtime');
assert.equal(config.presets[0].distance,1650/128);assert.equal(config.presets[0].pitch,(304-360)*Math.PI/180);assert.deepEqual(config.target,[26,-24]);
assert.equal(config.projectionAspect,16/9);assert.equal(config.presets[0].fov,70);
const authored=JSON.parse(fs.readFileSync(root+'Scenes/Main.mscene')).world.entities.find(e=>e.name==='Camera'),commands=[];
let lookups=0,previousTicks=0;
const engine={input:{viewport:[1280,720],pointer:[640,360]},findEntitiesByName:names=>{lookups++;assert.deepEqual([...names],['Camera']);return [{...structuredClone(authored),entity:4294967315}];},pushCommandJson:raw=>commands.push(JSON.parse(raw))};
const context=vm.createContext({engine,originalCameraConfig:config,onTick:()=>previousTicks++});vm.runInContext(runtime,context);
const tick=(input={},dt=1/60)=>{commands.length=0;engine.input={viewport:[1280,720],pointer:[640,360],...input};context.onTick(dt);return commands;};
tick();assert.equal(commands.length,2);assert.ok(commands.every(c=>c.entity===4294967315));assert.equal(commands[1].value.projection,'perspective');assert.ok(commands[0].value.rotation[0]<-.4&&commands[0].value.rotation[0]>-.6);
const expectedFov=70/Math.sqrt(1+(16/9)**2);assert.equal(commands[1].value.fov_y_degrees,expectedFov);assert.equal(authored.components.Camera3D.fov_y_degrees,expectedFov);
for(let i=0;i<10;i++)assert.equal(tick().length,0);assert.equal(lookups,1);
for(const viewport of [[960,900],[1920,1080],[0,0],[1,1]])assert.equal(tick({viewport}).length,0,'pixel viewport does not change source logical projection');
const start=authored.components.Transform.position;
tick({keys:['KeyD']});assert.ok(commands[0].value.position[0]>start[0]);
tick({pressedKeys:['Equal']});assert.ok(commands[0].value.rotation[0]>authored.components.Transform.rotation[0]);
tick({buttons:[1],pointer:[640,360]});tick({buttons:[1],pointer:[700,400]});assert.equal(commands.length,2);const dragged=commands[0].value.position[0];tick({pointer:[750,450]});assert.equal(commands.length,0);
assert.ok(dragged<start[0]);
for(let i=0;i<1000;i++)tick({keys:['KeyD','KeyS']},.1);
assert.equal(tick({keys:['KeyD','KeyS']},.1).length,0,'map target stops at bounds');assert.ok(previousTicks>1000);
assert.equal(tick({keys:['KeyW']},0).length,0);assert.equal(tick({keys:['KeyW']},-1).length,0);
console.log('PASS original source camera: angle/start, perspective, move, zoom, middle drag, bounds, runtime IDs, idle writes and pause');

// Fractional touchpad deltas and wheel extremes remain inside the source preset range.
let current=structuredClone(authored.components.Transform);
const zoom=input=>{tick(input);if(commands.length)current=commands[0].value;return structuredClone(current);};
const far=zoom({wheelDelta:100});assert.equal(tick({wheelDelta:100}).length,0);
const near=zoom({wheelDelta:-100});assert.equal(tick({wheelDelta:-100}).length,0);assert.notDeepEqual(near,far);
const half=zoom({wheelDelta:.5});assert.notDeepEqual(half,near);assert.notDeepEqual(half,far);
for(const value of [NaN,Infinity,-Infinity])assert.equal(tick({wheelDelta:value}).length,0);
assert.equal(tick().length,0,'wheel is consumed by the input frame, idle camera does not drift');
console.log('PASS wheel camera: source min/max, fractional deltas, invalid input and idle');
