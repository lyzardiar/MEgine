// Author: MiYu. Publish map resources by their final dependency-rewritten content.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const textExtensions=new Set(['.json','.mscene','.mmat','.mshader','.mfx','.js','.gltf','.prefab','.mpatch','.wgsl','.glsl']);
const localAsset=sourcePath=>/^Assets\/(Scenes|Scripts|Data)\//i.test(sourcePath);
const walk=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{const file=path.join(folder,entry.name);if(entry.isSymbolicLink())throw Error('Linked package files are unsupported: '+file);return entry.isDirectory()?walk(file):[file];});

export function rewriteGlb(bytes,rewrite){
  if(bytes.length<12||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
  const chunks=[];
  for(let offset=12;offset<bytes.length;){
    if(offset+8>bytes.length)throw Error('Truncated GLB');
    const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);let data=bytes.subarray(offset+8,offset+8+size);
    if(data.length!==size||size%4)throw Error('Truncated or unaligned GLB');
    if(type===0x4e4f534a){const text=rewrite(data.toString('utf8').trimEnd());JSON.parse(text);data=Buffer.from(text+' '.repeat((4-Buffer.byteLength(text)%4)%4));}
    const header=Buffer.alloc(8);header.writeUInt32LE(data.length);header.writeUInt32LE(type,4);chunks.push(header,data);offset+=8+size;
  }
  const header=Buffer.from(bytes.subarray(0,12));header.writeUInt32LE(12+chunks.reduce((n,chunk)=>n+chunk.length,0),8);return Buffer.concat([header,...chunks]);
}

export function publishImmutableAsset(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const verify=()=>{if(fs.lstatSync(file).isSymbolicLink()||!fs.readFileSync(file).equals(bytes))throw Error('Shared asset content mismatch: '+file);};
  if(fs.existsSync(file)){verify();return;}
  const temporary=file+'.'+randomUUID()+'.tmp';
  try{
    fs.writeFileSync(temporary,bytes,{flag:'wx'});
    // Linking exposes a complete file atomically and never replaces a concurrent publisher.
    try{fs.linkSync(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}
    verify();
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

export function prepareSharedMapAssets(source,relative,sharedRoot){
  const files=new Map(walk(path.join(source,'Assets')).filter(file=>!file.endsWith('.meta')).map(file=>['Assets/'+path.relative(path.join(source,'Assets'),file).replaceAll('\\','/'),file]));
  const resolved=new Map(),visiting=new Set();
  function reference(sourcePath,owner){
    const suffix=sourcePath.match(/[?#].*$/)?.[0]||'';sourcePath=sourcePath.slice(0,sourcePath.length-suffix.length);
    if(!files.has(sourcePath))throw Error('Unknown Assets reference in '+owner+': '+sourcePath);
    return (localAsset(sourcePath)?relative+'/'+sourcePath.slice(7):resolve(sourcePath).path)+suffix;
  }
  function rewrite(text,owner){
    return text.replace(/Assets\/[^"'`\r\n\\]+/g,match=>{const value=match.trimEnd();return reference(value,owner)+match.slice(value.length);});
  }
  function rewriteGltf(text,owner){
    const value=JSON.parse(text);
    for(const entry of [...(value.images||[]),...(value.buffers||[])]){
      if(!entry.uri||entry.uri.startsWith('data:')||entry.uri.startsWith('Assets/'))continue;
      if(/^[a-z][a-z0-9+.-]*:/i.test(entry.uri)||entry.uri.startsWith('/'))throw Error('Unsupported external GLTF URI in '+owner+': '+entry.uri);
      entry.uri=path.posix.normalize(path.posix.join(path.posix.dirname(owner),decodeURIComponent(entry.uri)));
      if(!entry.uri.startsWith('Assets/'))throw Error('GLTF URI escapes Assets in '+owner);
    }
    return rewrite(JSON.stringify(value),owner);
  }
  function resolve(sourcePath){
    if(resolved.has(sourcePath))return resolved.get(sourcePath);
    if(visiting.has(sourcePath))throw Error('Cyclic shared asset dependency: '+[...visiting,sourcePath].join(' -> '));
    visiting.add(sourcePath);
    const before=fs.readFileSync(files.get(sourcePath)),extension=path.extname(sourcePath).toLowerCase(),storage=localAsset(sourcePath)?'local':'shared';
    const bytes=extension==='.glb'?rewriteGlb(before,text=>rewriteGltf(text,sourcePath)):extension==='.gltf'?Buffer.from(rewriteGltf(before.toString('utf8'),sourcePath)):textExtensions.has(extension)?Buffer.from(rewrite(before.toString('utf8'),sourcePath)):before;
    const sha256=hash(bytes),record={path:storage==='local'?relative+'/'+sourcePath.slice(7):'Assets/WarcraftShared/v1/'+sha256+extension,storage,sourcePath,sourceSha256:hash(before),sha256,bytes:bytes.length};
    const result={record,bytes,path:record.path};resolved.set(sourcePath,result);visiting.delete(sourcePath);return result;
  }
  // Validate the complete graph before publishing any file.
  const assets=[...files.keys()].sort().map(resolve);
  return {assets,publish(){for(const asset of assets)if(asset.record.storage==='shared')publishImmutableAsset(path.join(sharedRoot,asset.path),asset.bytes);}};
}
