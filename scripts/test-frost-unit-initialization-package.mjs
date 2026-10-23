// Author: MiYu. Verify source integrity, data-only packaging and deterministic updates without art conversion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {attachUnitInitialization} from './frost-unit-initialization-package.mjs';
import {gameScriptPrefix} from './frost-script-bundle.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'tmp/docs-artifacts/frost-original-maps');fs.mkdirSync(out,{recursive:true});
const project=fs.mkdtempSync(path.join(out,'unit-package-')),relative='Assets/Maps/fixture',folder=path.join(project,relative),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(path.join(folder,'Source'),{recursive:true});fs.mkdirSync(path.join(folder,'Scripts'));
const file=path.join(folder,'Scripts/Main.js'),sourceFile=path.join(folder,'Source/war3map.j'),base='var originalMapPathing={};\nfunction onTick(){}\n';fs.writeFileSync(file,base);
const records=[{path:relative+'/Scripts/Main.js',sha256:hash(base),bytes:Buffer.byteLength(base)}];
assert.equal(attachUnitInitialization(project,relative,records,'missing'),null);
const source='// "\\\n// var exploited=true;\nfunction CreateAllUnits takes nothing returns nothing\nendfunction';fs.writeFileSync(sourceFile,source);
assert.throws(()=>attachUnitInitialization(project,relative,records,'wrong'),/Changed original/);assert.equal(fs.readFileSync(file,'utf8'),base);assert.equal(records.length,1);
assert.throws(()=>attachUnitInitialization(project,relative,[],hash(source)),/runtime missing/);assert.equal(fs.readFileSync(file,'utf8'),base);
const first=attachUnitInitialization(project,relative,records,hash(source)),output=fs.readFileSync(file,'utf8'),context=vm.createContext({});vm.runInContext(output,context);
assert.equal(context.originalUnitInitializationSource,source);assert.equal(context.exploited,undefined);assert.equal(first.fullMapScript,false);
for(const [name,digest] of Object.entries(first.implementation))assert.equal(hash(fs.readFileSync(path.join(repo,name))),digest);
assert.deepEqual(attachUnitInitialization(project,relative,records,hash(source)),first);assert.equal(fs.readFileSync(file,'utf8'),output);assert.equal(records.length,2);assert.equal(records[0].sha256,hash(output));
fs.writeFileSync(sourceFile,source+'\n// changed');assert.throws(()=>attachUnitInitialization(project,relative,records,hash(source)),/Changed original/);assert.equal(fs.readFileSync(file,'utf8'),output);
for(const bytes of [Buffer.from([0xff,0xfe,0x81]),Buffer.alloc(8*1024*1024+1,32)]){
  fs.writeFileSync(sourceFile,bytes);records.splice(1);const unsupported=attachUnitInitialization(project,relative,records,hash(bytes));assert.ok(unsupported.sourceError);
  vm.runInContext(fs.readFileSync(file,'utf8'),context);assert.equal(context.originalUnitInitializationSource,null);assert.equal(hash(fs.readFileSync(sourceFile)),hash(bytes));
}
const sample=path.join(repo,'samples/frostbound-realms'),legacy=fs.readFileSync(path.join(sample,'game/night-elf-ai-source.js'),'utf8').split(/\r?\n/)[0];
assert.equal(gameScriptPrefix(sample,'prefix\n'+legacy+'\nrest'),'prefix\n');assert.equal(gameScriptPrefix(sample,'prefix\nvar FrostMapPackages=[];'),'prefix\n');
const cameraCheck=`import sys,runpy,json
sys.path.insert(0,sys.argv[1])
split=runpy.run_path(sys.argv[1]+'/refresh-frost-map-camera.py')['split_unit_initialization']
script=open(sys.argv[2],encoding='utf-8').read()
base,suffix=split(script)
assert base+suffix==script and suffix and base.rstrip().endswith('onTick=function(dt){originalCameraPreviousTick(dt);originalMapCamera.tick(dt);};')
assert split(base)==(base,'')
for tail in [suffix+'call()',suffix.replace('var originalUnitInitializationSource=', 'var originalUnitInitializationSource=[];')]:
 try:split(base+tail)
 except (ValueError,json.JSONDecodeError):pass
 else:raise AssertionError('Unexpected suffix accepted')
`;
execFileSync('python',['-c',cameraCheck,path.join(repo,'scripts'),path.join(sample,'Assets/Maps/amazonia/Scripts/Main.js')],{stdio:'pipe',windowsHide:true});
console.log('PASS source SHA, idempotent packaging, native provenance, JASS data isolation, encoding/size fallback, legacy bundle and camera refresh boundaries');
