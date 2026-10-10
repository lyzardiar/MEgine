// Author: MiYu. Compare native thumbnail URL work over the same tracked project image catalogue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'packages/editor'),iterations=Number(process.argv[2]??20),baseline=process.argv[3]??'3e8fa41';
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const original=execFileSync('git',['show',`${baseline}:packages/editor/src/spriteLibrary.ts`],{cwd:repo,encoding:'utf8'}),oldPath=path.join(root,`.sprite-urls-before-${process.pid}.ts`);
const files=execFileSync('git',['ls-files','-z','--',...['png','jpg','jpeg','webp','gif'].map(ext=>`:(glob)samples/frostbound-realms/Assets/**/*.${ext}`)],{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(p=>/\.(png|jpe?g|webp|gif)$/i.test(p));
const sprites=files.map(p=>{const id=p.slice('samples/frostbound-realms/'.length);return {id,name:path.posix.basename(id),folder:path.posix.dirname(id),relPath:id};});assert.ok(sprites.length>100);
const previousFetch=globalThis.fetch,previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');let server;
try {
  fs.writeFileSync(oldPath,original.replace("'./transport/editorTransport'","'./src/transport/editorTransport'"));
  server=await createServer({root,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  const before=await server.ssrLoadModule('/'+path.basename(oldPath)),after=await server.ssrLoadModule('/src/spriteLibrary.ts');
  globalThis.window={};globalThis.fetch=async()=>({ok:true,json:async()=>({sprites})});await before.refreshSprites();await after.refreshSprites();
  const browserBefore=sprites.map(s=>before.spriteAssetUrl(s.id)),browserAfter=sprites.map(s=>after.spriteAssetUrl(s.id));assert.deepEqual(browserAfter,browserBefore);
  globalThis.window={__TAURI_INTERNALS__:{}};const times={before:[],after:[]};let output;
  for(let i=0;i<iterations+2;i++)for(const name of i%2?['after','before']:['before','after']){
    const library=name==='before'?before:after,start=performance.now();output=sprites.map(s=>library.spriteAssetUrl(s.id));const ms=performance.now()-start;
    assert.ok(output.every(url=>url===null));if(i>=2)times[name].push(ms);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],hash=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  console.log(JSON.stringify({author:'MiYu',scope:'One native spriteAssetUrl lookup per tracked PNG/JPEG/WebP/GIF descriptor, matching Project thumbnail enumeration; reconstructed descriptors exclude sliced import records. Node/Vite CPU only, excluding React, scripts, GPU, IPC and native FPS.',baseline,baselineSourceSha256:createHash('sha256').update(original).digest('hex'),catalogueSha256:hash(sprites),sprites:sprites.length,iterations,warmups:2,medianBeforeMs:median(times.before),medianAfterMs:median(times.after),nativeOutputsAllNull:true,browserOutputsEqual:true,nativeOutputSha256:hash(output),browserOutputSha256:hash(browserAfter),samplesMs:times}));
} finally {
  globalThis.fetch=previousFetch;if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;
  await server?.close();fs.rmSync(oldPath,{force:true});
}
