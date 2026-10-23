// Author: MiYu. Verify final map-resource identity, dependency rewriting and immutable publication.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {prepareSharedMapAssets,publishImmutableAsset,rewriteGlb} from './frost-shared-map-assets.mjs';

const artifacts=fileURLToPath(new URL('../tmp/docs-artifacts/',import.meta.url));fs.mkdirSync(artifacts,{recursive:true});
const root=fs.mkdtempSync(path.join(artifacts,'shared-map-assets-')),shared=path.join(root,'published');
const write=(folder,file,value)=>{const target=path.join(folder,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);};
const record=(plan,sourcePath)=>plan.assets.find(asset=>asset.record.sourcePath===sourcePath);
function glb(value){
  const text=JSON.stringify(value),data=Buffer.from(text+' '.repeat((4-Buffer.byteLength(text)%4)%4)),header=Buffer.alloc(20),bin=Buffer.from([4,0,0,0,0x42,0x49,0x4e,0,1,2,3,4]);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+data.length+bin.length,8);header.writeUInt32LE(data.length,12);header.writeUInt32LE(0x4e4f534a,16);return Buffer.concat([header,data,bin]);
}
function fixture(name,texture='same texture'){
  const folder=path.join(root,name);
  write(folder,'Assets/Textures/diffuse.png',texture);
  write(folder,'Assets/Materials/unit.mmat',JSON.stringify({texture:'Assets/Textures/diffuse.png'}));
  write(folder,'Assets/Effects/unit.mfx',JSON.stringify({material:'Assets/Materials/unit.mmat'}));
  write(folder,'Assets/Models/unit.glb',glb({asset:{version:'2.0'},extras:{material:'Assets/Materials/unit.mmat'},images:[{uri:'../Textures/diffuse.png'}]}));
  write(folder,'Assets/Scenes/Main.mscene',JSON.stringify({mesh:'Assets/Models/unit.glb#pose=0:0',effect:'Assets/Effects/unit.mfx',script:'Assets/Scripts/Main.js'}));
  write(folder,'Assets/Scripts/Main.js',"var mesh='Assets/Models/unit.glb';var data='Assets/Data/pathing.json';");
  write(folder,'Assets/Data/pathing.json','{}');write(folder,'Assets/Licenses/license.txt','License');
  return folder;
}
const first=fixture('one'),second=fixture('two'),different=fixture('different','changed texture');
const a=prepareSharedMapAssets(first,'Assets/Maps/one',shared),b=prepareSharedMapAssets(second,'Assets/Maps/two',shared),c=prepareSharedMapAssets(different,'Assets/Maps/different',shared);
a.publish();const count=fs.readdirSync(path.join(shared,'Assets/WarcraftShared/v1')).length;b.publish();
assert.equal(fs.readdirSync(path.join(shared,'Assets/WarcraftShared/v1')).length,count);
for(const asset of a.assets.filter(asset=>asset.record.storage==='shared'))assert.equal(asset.path,record(b,asset.record.sourcePath).path);
for(const sourcePath of ['Assets/Textures/diffuse.png','Assets/Materials/unit.mmat','Assets/Effects/unit.mfx','Assets/Models/unit.glb'])assert.notEqual(record(a,sourcePath).path,record(c,sourcePath).path);
for(const sourcePath of ['Assets/Materials/unit.mmat','Assets/Effects/unit.mfx','Assets/Models/unit.glb'])assert.equal(record(a,sourcePath).record.sourceSha256,record(c,sourcePath).record.sourceSha256);
const scene=JSON.parse(record(a,'Assets/Scenes/Main.mscene').bytes),script=record(a,'Assets/Scripts/Main.js').bytes.toString();
assert.equal(scene.mesh,record(a,'Assets/Models/unit.glb').path+'#pose=0:0');assert.equal(scene.script,'Assets/Maps/one/Scripts/Main.js');assert.ok(script.includes('Assets/Maps/one/Data/pathing.json'));assert.ok(script.includes(record(a,'Assets/Models/unit.glb').path));
const model=record(a,'Assets/Models/unit.glb').bytes;let gltf;
assert.deepEqual(rewriteGlb(model,text=>{gltf=JSON.parse(text);return text;}),model);assert.deepEqual(model.subarray(-4),Buffer.from([1,2,3,4]));assert.equal(gltf.images[0].uri,record(a,'Assets/Textures/diffuse.png').path);
assert.equal(record(a,'Assets/Licenses/license.txt').record.storage,'shared');
const absent=fixture('absent');fs.unlinkSync(path.join(absent,'Assets/Textures/diffuse.png'));assert.throws(()=>prepareSharedMapAssets(absent,'Assets/Maps/absent',shared),/Unknown Assets reference/);
const cycle=fixture('cycle');write(cycle,'Assets/Materials/unit.mmat',JSON.stringify({effect:'Assets/Effects/unit.mfx'}));assert.throws(()=>prepareSharedMapAssets(cycle,'Assets/Maps/cycle',shared),/Cyclic shared asset dependency/);
const target=path.join(shared,record(a,'Assets/Textures/diffuse.png').path);assert.throws(()=>publishImmutableAsset(target,Buffer.from('corrupt replacement')),/content mismatch/);assert.equal(fs.readFileSync(target,'utf8'),'same texture');
assert.throws(()=>rewriteGlb(Buffer.from('bad'),text=>text),/Invalid GLB/);
console.log('PASS shared assets: map deduplication, byte isolation, transitive dependency identity, local paths, GLB JSON/BIN, missing references, cycles and immutable writes. Evidence: '+root);
