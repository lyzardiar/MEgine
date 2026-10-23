// Author: MiYu. Compare every decoded unit field and rebuilt byte with the pinned MIT reader.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),input=path.resolve(process.argv[2]||'');
assert.ok(process.argv[2],'Provide test-warcraft-units.py export directory');
const require=createRequire(path.join(root,'packages/editor/package.json')),ts=require('typescript'),commit='2ff0bc00c6363f425016e23d88c0fb2929d3b3cc';
const base=`https://raw.githubusercontent.com/flowtsohg/mdx-m3-viewer/${commit}/`,out=path.join(input,'reference'),sources=new Map(),modules=new Map();
const hash=raw=>createHash('sha256').update(raw).digest('hex');
async function fetchModule(name){
  if(sources.has(name))return;
  assert.ok(name.startsWith('src/')&&!name.includes('..')&&name.endsWith('.ts'));
  const response=await fetch(base+name,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,name);
  const text=await response.text();sources.set(name,text);const target=path.join(out,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
  for(const [,dependency] of text.matchAll(/from ['"]([^'"]+)['"]/g)){
    assert.ok(dependency.startsWith('.'));
    await fetchModule(path.posix.normalize(path.posix.join(path.posix.dirname(name),dependency))+'.ts');
  }
}
function load(name){
  if(modules.has(name))return modules.get(name).exports;
  const module={exports:{}};modules.set(name,module);assert.ok(sources.has(name));
  const code=ts.transpileModule(sources.get(name),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','module','exports',code)(relative=>load(path.posix.normalize(path.posix.join(path.posix.dirname(name),relative))+'.ts'),module,module.exports);return module.exports;
}
const entry='src/parsers/w3x/unitsdoo/file.ts';await fetchModule(entry);const Reader=load(entry).default,checks=[];
const plain=v=>ArrayBuffer.isView(v)?Array.from(v):Array.isArray(v)?v.map(plain):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;
for(const item of JSON.parse(fs.readFileSync(path.join(input,'manifest.json'),'utf8'))){
  const raw=fs.readFileSync(path.join(input,item.raw)),ours=JSON.parse(fs.readFileSync(path.join(input,item.decoded),'utf8')),reader=new Reader();reader.load(new Uint8Array(raw),127);
  assert.equal(reader.version,ours.version);assert.equal(reader.subversion,ours.subversion);assert.equal(reader.units.length,ours.units.length);
  ours.units.forEach((u,i)=>{for(const [key,value] of Object.entries(u))assert.deepEqual(value,plain(reader.units[i][key]),`${item.name}/${i}/${key}`);});
  assert.deepEqual(Buffer.from(reader.save(127)),raw,item.name+' independent byte reconstruction');
  checks.push({name:item.name,units:ours.units.length,sha256:hash(raw)});console.log('PASS units reference',item.name,ours.units.length);
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reference:base,typescript:ts.version,modules:[...sources].map(([name,text])=>({name,sha256:hash(text)})),checks},null,2));
