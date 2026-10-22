// Author: MiYu. Exercise the real native filesystem watcher and polling HTTP protocol on a large asset directory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createServer } from 'vite';
import { mengineFsPlugin } from '../vite/mengineFsPlugin.ts';

test('asset polling indexes more than 10000 files and observes external edits without idle scans', { timeout: 120_000 }, async () => {
  const count=10025;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-assets-'));
  const assets = path.join(root, 'Assets');fs.mkdirSync(assets);
  for (let i=0;i<count;i++) {
    const file=path.join(assets, `Asset${String(i).padStart(5,'0')}.mmat`);
    fs.writeFileSync(file,'{}');
    fs.writeFileSync(`${file}.meta`,JSON.stringify({schemaVersion:1,guid:randomUUID(),importer:'material'}));
  }
  const originalRead=fs.readFileSync;let metadataReads=0;
  fs.readFileSync=function(file,...args){if(String(file).endsWith('.meta'))metadataReads++;return originalRead.call(this,file,...args);};
  const server=await createServer({configFile:false,root,plugins:[mengineFsPlugin({projectRoot:root,editorRoot:root})],server:{port:0,host:'127.0.0.1'},logLevel:'error'});
  try {
    await server.listen();
    await new Promise(resolve=>server.watcher._readyEmitted ? resolve() : server.watcher.once('ready',resolve));
    const url=`http://127.0.0.1:${server.httpServer.address().port}/__mengine/assets`;
    const get=async(query='')=>{const result=await fetch(url+query,{headers:{Connection:'close'}}).catch(error=>{throw new Error(`asset request ${query || 'full scan'} failed`,{cause:error});});assert.equal(result.status,200);return result.json();};
    const start=performance.now(),first=await get();
    const fullScanMs=performance.now()-start;
    assert.equal(first.assets.length,count);
    await new Promise(resolve=>setTimeout(resolve,100));
    await get(`?poll=1&revision=${first.revision}`);
    metadataReads=0;
    const idleStart=performance.now();
    for(let i=0;i<10;i++)assert.equal((await get(`?poll=1&revision=${first.revision}`)).assets,null);
    const idlePollMs=(performance.now()-idleStart)/10;
    assert.equal(metadataReads,0,'idle polls must not reopen metadata');
    const waitFor=async(predicate,revision=first.revision)=>{
      const deadline=Date.now()+10000;
      while(Date.now()<deadline){const value=await get(`?poll=1&revision=${revision}`);if(value.assets&&predicate(value.assets))return value;await new Promise(resolve=>setTimeout(resolve,30));}
      assert.fail('Development asset watcher did not publish the disk change');
    };
    const file=path.join(assets,'Asset00000.mmat'),meta=`${file}.meta`;
    const beforeStat=fs.statSync(meta),before=JSON.parse(fs.readFileSync(meta,'utf8'));
    // Same-size metadata with restored timestamps must still be invalidated by the file event.
    fs.writeFileSync(meta,JSON.stringify({...before,guid:randomUUID()}));fs.utimesSync(meta,beforeStat.atime,beforeStat.mtime);
    const changed=await waitFor(files=>files.find(a=>a.name==='Asset00000.mmat')?.guid!==before.guid);
    fs.writeFileSync(file,'{"changed":true}');
    await waitFor(files=>files.find(a=>a.name==='Asset00000.mmat')?.size>2,changed.revision);
    const added=path.join(assets,'New.mmat');fs.writeFileSync(added,'{}');
    await waitFor(files=>files.some(a=>a.name==='New.mmat'));
    fs.unlinkSync(added);await waitFor(files=>files.length===count);
    fs.writeFileSync(meta,'broken');await waitFor(files=>files.find(a=>a.name==='Asset00000.mmat')?.metaStatus==='invalid');
    const result={assets:count,fullScanMs,idlePollMs,includesHttp:true};
    console.log('asset-index-web benchmark:',JSON.stringify(result));
    if(process.env.MENGINE_ASSET_BENCHMARK_OUTPUT){fs.mkdirSync(path.dirname(process.env.MENGINE_ASSET_BENCHMARK_OUTPUT),{recursive:true});fs.writeFileSync(process.env.MENGINE_ASSET_BENCHMARK_OUTPUT,JSON.stringify(result,null,2));}
  } finally {fs.readFileSync=originalRead;await server.close();fs.rmSync(root,{recursive:true,force:true});}
});
