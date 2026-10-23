// Author: MiYu. Preserve original JASS bytes in the generated map runtime without evaluating them as JavaScript.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const marker='\n/* Frost unit initialization source */\n',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function attachUnitInitialization(project,relative,records,expectedSourceSha256){
  const scriptPath=relative+'/Scripts/Main.js',jass=path.join(project,relative,'Source/war3map.j');
  if(!fs.existsSync(jass))return null;
  const bytes=fs.readFileSync(jass),source=bytes.toString('utf8'),script=fs.readFileSync(path.join(project,scriptPath),'utf8');
  if(hash(bytes)!==expectedSourceSha256)throw Error('Changed original map JASS');
  const sourceError=bytes.length>8*1024*1024?'Unit initialization source exceeds 8 MiB':!Buffer.from(source,'utf8').equals(bytes)?'Unit initialization requires UTF-8 JASS':null;
  const start=script.indexOf(marker),base=start<0?script:script.slice(0,start);
  const bindingPath=relative+'/Data/OriginalUnitBindings.json',bindingFile=path.join(project,bindingPath),bindings=fs.existsSync(bindingFile)?JSON.parse(fs.readFileSync(bindingFile,'utf8')):null;
  if(bindings){const record=records.find(r=>r.path===bindingPath);if(!record||record.sha256!==hash(fs.readFileSync(bindingFile)))throw Error('Changed original unit bindings');}
  const output=Buffer.from(base+marker+'var originalUnitInitializationSource='+JSON.stringify(sourceError?null:source)+';\n'+(bindings?'var originalUnitBindings='+JSON.stringify(bindings)+';\n':''));
  const implementation=Object.fromEntries(['warcraft-jass','warcraft-unit-initialization','warcraft-map-units'].map(name=>{const file='samples/frostbound-realms/game/'+name+'.js';return [file,hash(fs.readFileSync(fileURLToPath(new URL('../'+file,import.meta.url))))];}));
  const record=records.find(row=>row.path===scriptPath);if(!record)throw Error('Map runtime missing from manifest');
  const sourcePath=relative+'/Source/war3map.j';
  const sourceRecord=records.find(row=>row.path===sourcePath);
  if(sourceRecord){if(sourceRecord.sha256!==hash(bytes))throw Error('Changed original map JASS');}
  else records.push({path:sourcePath,storage:'local',sourcePath:'source/war3map.j',sourceSha256:hash(bytes),sha256:hash(bytes),bytes:bytes.length});
  fs.writeFileSync(path.join(project,scriptPath),output);Object.assign(record,{sha256:hash(output),bytes:output.length});
  return {entry:'CreateAllUnits',source:sourcePath,sourceSha256:hash(bytes),execution:'bounded-jass',fullMapScript:false,implementation,...sourceError?{sourceError}:{}};
}
export function replaceManifestProperty(raw,key,value){
  const encoded=JSON.stringify(value,null,2).replaceAll('\n','\n  '),marker='  "'+key+'": ',at=raw.indexOf('\n'+marker);
  if(at<0){const end=raw.lastIndexOf('\n}');if(end<0)throw Error('Expected formatted map manifest');return raw.slice(0,end)+',\n'+marker+encoded+raw.slice(end);}
  const start=at+1+marker.length;let depth=0,quoted=false,escaped=false;
  for(let end=start;end<raw.length;end++){
    const c=raw[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0)return raw.slice(0,start)+encoded+raw.slice(end+1);}
  }
  throw Error('Unterminated map manifest property');
}
