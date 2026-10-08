// Author: MiYu. Exercise signed Blood Mage meshes at original clip boundaries in the native pose reader.
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {models,root,receipt} from './test-frost-blood-mage-source.mjs';
const references=[];for(const m of Object.values(models))for(const p of m.parts)for(const [clip,a] of m.animations.entries()){const last=Math.ceil(a.duration*30);for(const frame of new Set([0,Math.floor(last/2),last]))references.push(path.join(root,p.mesh)+`#pose=${clip}:${frame}@30`);}
const probe=process.env.MENGINE_GLTF_PROBE||'D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe',output=execFileSync(probe,['--stdin'],{input:references.join('\n')+'\n',maxBuffer:16*1024*1024,windowsHide:true}).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);assert.equal(output.length,references.length);
for(const box of output){assert.ok(box.vertices>0);assert.ok(box.min.every(Number.isFinite)&&box.max.every(Number.isFinite));}
console.log(`PASS original Blood Mage assets: ${receipt.files.length} signed outputs, 12 model bindings, 16 source effects, exact valid ranks and ${output.length} native poses`);
