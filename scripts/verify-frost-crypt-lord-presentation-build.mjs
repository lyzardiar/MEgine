// Author: MiYu. Isolated byte-for-byte source bundle and scene regeneration for the opt-in Crypt Lord presentation milestone.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(repo,'tmp'),out=fs.mkdtempSync(path.join(root,'crypt-lord-presentation-repro-')),started=performance.now(),outputs=[];
assert.equal(path.dirname(path.resolve(out)),root);
try{execFileSync(process.execPath,[path.join(repo,'scripts/build-frostbound.mjs')],{cwd:repo,env:{...process.env,MENGINE_FROST_BUILD_OUTPUT:out},windowsHide:true,stdio:'pipe'});for(const p of ['Assets/Scripts/Main.js','Assets/Scenes/Main.mscene']){const actual=fs.readFileSync(path.join(repo,'samples/frostbound-realms',p)),rebuilt=fs.readFileSync(path.join(out,p));outputs.push({path:p,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex'),identical:actual.equals(rebuilt)});assert.ok(actual.equals(rebuilt),p);}}finally{assert.equal(path.dirname(path.resolve(out)),root);fs.rmSync(out,{recursive:true,force:true});}
const report={author:'MiYu',passed:true,isolatedOutput:true,elapsedMs:Math.round(performance.now()-started),outputs,temporaryOutputRemoved:!fs.existsSync(out)};fs.writeFileSync(path.join(repo,'docs/designs/frostbound-realms/crypt-lord-presentation-reproduction-validation.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS byte-identical Main.js and Main.mscene regeneration; isolated output removed');
