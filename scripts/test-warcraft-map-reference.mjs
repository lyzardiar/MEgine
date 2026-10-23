// Author: MiYu. Compare exported classic map fields with the pinned independent TypeScript reader.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(path.join(root,'packages/editor/package.json')),ts=require('typescript');
const commit='2ff0bc00c6363f425016e23d88c0fb2929d3b3cc',base=`https://raw.githubusercontent.com/flowtsohg/mdx-m3-viewer/${commit}/`;
const output=path.join(root,'tmp/docs-artifacts/frost-original-maps/reference-check'),sources=new Map(),modules=new Map(),reports=[];
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const inputs=process.argv.slice(2);
assert.ok(inputs.length,'Usage: node scripts/test-warcraft-map-reference.mjs <export directory> [more directories]');
fs.mkdirSync(output,{recursive:true});

async function fetchModule(name){
  if(sources.has(name))return;
  assert.ok(name.startsWith('src/')&&!name.includes('..')&&name.endsWith('.ts'),'Reference dependency must stay inside pinned source tree');
  const response=await fetch(base+name,{signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,name);
  const source=await response.text();sources.set(name,source);
  const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
  for(const [,dependency] of source.matchAll(/from ['"]([^'"]+)['"]/g)){
    assert.ok(dependency.startsWith('.'),'Only relative source dependencies are expected');
    await fetchModule(path.posix.normalize(path.posix.join(path.posix.dirname(name),dependency))+'.ts');
  }
}
function load(name){
  if(modules.has(name))return modules.get(name).exports;
  const module={exports:{}};modules.set(name,module);
  assert.ok(sources.has(name),'Unfetched reference dependency '+name);
  const compiled=ts.transpileModule(sources.get(name),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','module','exports',compiled)(relative=>load(path.posix.normalize(path.posix.join(path.posix.dirname(name),relative))+'.ts'),module,module.exports);
  return module.exports;
}
const formats={terrain:'w3e',pathing:'wpm',info:'w3i',doodads:'doo'};
for(const kind of Object.values(formats))await fetchModule(`src/parsers/w3x/${kind}/file.ts`);
const plain=value=>ArrayBuffer.isView(value)?Array.from(value):Array.isArray(value)?value.map(plain):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)])):value;
function compareFields(ours,theirs,aliases={}){
  for(const [key,value] of Object.entries(ours))assert.deepEqual(plain(value),plain(theirs[aliases[key]||key]),key);
}
for(const directory of inputs){
  const folder=path.resolve(directory),map=JSON.parse(fs.readFileSync(path.join(folder,'map.json'),'utf8')),readers={};
  for(const [name,kind] of Object.entries(formats)){
    if(name==='doodads'&&!map.doodads)continue;
    const receipt=map.source.members['war3map.'+kind],raw=fs.readFileSync(path.join(folder,receipt.preservedFile));
    assert.equal(digest(raw),receipt.sha256,'Preserved member digest');
    const Reader=load(`src/parsers/w3x/${kind}/file.ts`).default,reader=new Reader();reader.load(new Uint8Array(raw),127);readers[name]=reader;
  }
  const t=map.terrain,reference=readers.terrain;
  compareFields({version:t.version,tileset:t.tileset,haveCustomTileset:t.customTileset,groundTilesets:t.groundTilesets,cliffTilesets:t.cliffTilesets,mapSize:t.vertexSize,centerOffset:t.origin},reference);
  for(let y=0;y<t.vertexSize[1];y++)for(let x=0;x<t.vertexSize[0];x++){
    const [ground,water,flags,variation,cliff]=t.corners[y*t.vertexSize[0]+x];
    compareFields({groundHeight:(ground-8192)/512,waterHeight:((water&0x3fff)-8192)/512,mapEdge:water&0x4000,
      ramp:flags&16,blight:flags&32,water:flags&64,boundary:flags&128,groundTexture:flags&15,
      groundVariation:variation&31,cliffVariation:variation>>>5,cliffTexture:cliff>>>4,layerHeight:cliff&15},reference.corners[y][x]);
  }
  compareFields({version:map.pathing.version,size:map.pathing.size,pathing:map.pathing.cells},readers.pathing);
  const info=map.info,ref=readers.info,complex=['players','forces','upgradeAvailability','techAvailability','randomUnitTables','randomItemTables'];
  // Weather is a four-byte identifier; compare its bits across signed/unsigned readers.
  compareFields(Object.fromEntries(Object.entries(info).filter(([key])=>!complex.includes(key))),{...ref,globalWeather:ref.globalWeather>>>0});
  for(const key of complex){
    if(!Object.hasOwn(info,key))continue;
    const actual=ref[{upgradeAvailability:'upgradeAvailabilityChanges',techAvailability:'techAvailabilityChanges'}[key]||key];
    assert.equal(info[key].length,actual.length,key+' length');
    info[key].forEach((value,index)=>compareFields(key==='randomItemTables'?{...value,sets:value.sets.map(items=>({items}))}:value,actual[index],{fixedStartPosition:'isFixedStartPosition',playerMask:'playerMasks',level:'levelAffected'}));
  }
  if(map.doodads){
    const d=map.doodads,ref=readers.doodads;
    assert.equal(d.version,ref.version);
    assert.equal(d.subversion,new DataView(ref.u1.buffer,ref.u1.byteOffset,4).getInt32(0,true));
    assert.equal(d.terrainVersion,new DataView(ref.u2.buffer,ref.u2.byteOffset,4).getUint32(0,true));
    assert.equal(d.doodads.length,ref.doodads.length);
    d.doodads.forEach((entry,index)=>compareFields({...entry,...(entry.itemSets?{itemSets:entry.itemSets.map(items=>({items}))}:{})},ref.doodads[index]));
    assert.equal(d.terrainDoodads.length,ref.terrainDoodads.length);
    d.terrainDoodads.forEach((entry,index)=>compareFields(entry,ref.terrainDoodads[index],{unknown:'u1'}));
    const receipt=map.source.members['war3map.doo'];
    assert.deepEqual(Buffer.from(ref.save(127)),fs.readFileSync(path.join(folder,receipt.preservedFile)),'Independent DOO byte reconstruction');
  }
  reports.push({name:map.name,sourceSha256:map.source.sha256,corners:t.corners.length,pathingCells:map.pathing.cells.length,infoVersion:info.version,players:info.players.length,doodadVersion:map.doodads?.version,doodads:map.doodads?.doodads.length,terrainDoodads:map.doodads?.terrainDoodads.length});
  console.log(`PASS pinned reference: ${map.name}, ${t.corners.length} corners, ${map.pathing.cells.length} pathing bytes, W3I ${info.version}, ${map.doodads?.doodads.length??0} doodads`);
}
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({reference:base,typescript:ts.version,modules:[...sources].map(([name,source])=>({name,sha256:digest(source)})),maps:reports},null,2)+'\n');
