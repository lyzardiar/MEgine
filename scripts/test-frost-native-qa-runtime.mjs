// Author: MiYu. Verify disposable fixture boundaries and preservation of unrelated saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configureNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'frost-qa-cleanup-')),env={...process.env};
try{
 assert.throws(()=>configureNativeQa('relative'),/absolute/);
 const root=path.join(parent,'owned'),saves=path.join(parent,'local/MEngine/UserData'),storage=path.join(saves,'0123456789abcdef'),other=path.join(saves,'fedcba9876543210');
 configureNativeQa(root);assert.throws(()=>configureNativeQa(root),/EEXIST/);
 process.env.LOCALAPPDATA=path.join(parent,'local');for(const folder of [storage,other]){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'quicksave.json'),'preserved');}
 assert.throws(()=>removeNativeQaFixture(root,parent),/storage boundary/);assert.ok(fs.existsSync(root));assert.ok(fs.existsSync(storage));
 fs.writeFileSync(path.join(root,'discovery/agent-bridge.json'),'{}');assert.throws(()=>removeNativeQaFixture(root,storage),/still in use/);fs.unlinkSync(path.join(root,'discovery/agent-bridge.json'));
 fs.writeFileSync(path.join(root,'runtime/pending'),'');assert.throws(()=>removeNativeQaFixture(root,storage),/still in use/);fs.unlinkSync(path.join(root,'runtime/pending'));
 const owner=path.join(root,'qa-owner.json');fs.writeFileSync(owner,JSON.stringify({pid:process.pid+1,root:path.resolve(root)}));assert.throws(()=>removeNativeQaFixture(root,storage),/ownership/);fs.writeFileSync(owner,JSON.stringify({pid:process.pid,root:path.resolve(root)}));
 assert.deepEqual(removeNativeQaFixture(root,storage),{fixtureRemoved:true,qaStorageRemoved:true});assert.equal(fs.existsSync(root),false);assert.equal(fs.existsSync(storage),false);assert.equal(fs.readFileSync(path.join(other,'quicksave.json'),'utf8'),'preserved');
 console.log('PASS QA fresh-root guard, ownership, active editor/runtime refusal, save boundary and unrelated save preservation');
}finally{
 for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);
 fs.rmSync(parent,{recursive:true,force:true});
}
