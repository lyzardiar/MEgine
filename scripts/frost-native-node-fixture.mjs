// Author: MiYu. Client fixtures use the actual compiled node evaluator.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url));
export function nativeNodeQueries(){
  const cache=new Map(),probe=process.env.MENGINE_POSE_PROBE_EXECUTABLE||'D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe';
  return {sampleNodes(reference,options={}){
    const key=reference+'|'+JSON.stringify(options);if(cache.has(key))return structuredClone(cache.get(key));
    const split=reference.indexOf('#pose=');assert.ok(split>0,'explicit native pose required');
    const args=['--nodes',path.join(root,reference.slice(0,split))+reference.slice(split)];
    if(options.camera){args.push('--billboard-camera='+[...options.camera.look,...options.camera.up].join(','),'--billboard-model='+options.camera.model.join(','));}
    const run=spawnSync(probe,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr||run.error?.message);
    let nodes=JSON.parse(run.stdout).nodes;assert.ok(Array.isArray(nodes),'native node result');if(options.attachmentsOnly)nodes=nodes.filter(n=>n.attachment);
    cache.set(key,nodes);return structuredClone(nodes);
  }};
}
