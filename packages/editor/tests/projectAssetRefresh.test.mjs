// Author: MiYu. Exercise shared asset refreshes, published watcher snapshots and project-library consumers.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ configFile: false, root, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, watch: null } });
const assets = await server.ssrLoadModule('/src/projectAssets.ts');
const { refreshProjectLibraries } = await server.ssrLoadModule('/src/projectAssetLibraries.ts');
const { attachDesktopProject } = await server.ssrLoadModule('/src/transport/desktopProjectSession.ts');
const { listScripts } = await server.ssrLoadModule('/src/scriptLibrary.ts');
test.after(() => server.close());

const file = (name, revision='1', kind='material') => ({ id:`Assets/${name}`, relPath:`Assets/${name}`, name, folder:'Assets', kind, revision, guid:name, size:2, metaStatus:'ready', metaError:null });
function host() {
  const originalWindow=globalThis.window, calls=[], deferred=[];
  const state={files:[file('A.mmat')],defer:false};
  globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{
    calls.push(command);
    if(command==='get_project_snapshot')return {projectRoot:'G:\\Project',world:{entities:[]}};
    if(command==='list_project_sprites')return [];
    if(command==='list_project_assets'){
      if(state.defer)return new Promise(resolve=>deferred.push(resolve));
      return structuredClone(state.files);
    }
    if(command==='poll_project_assets')return {revision:JSON.stringify(state.files),assets:args.knownRevision===JSON.stringify(state.files)?null:structuredClone(state.files)};
    throw Error(`unexpected invoke: ${command}`);
  }}};
  assets.resetProjectAssetState();
  return {state,calls,deferred,close(){globalThis.window=originalWindow;assets.resetProjectAssetState();}};
}
const event = (remote) => new CustomEvent('asset-change',{detail:{remote,changes:[]}});

test('local external events consume the published poll; remote listeners share one refresh and force still scans',async()=>{
  const io=host();try{
    await assets.pollProjectFileChanges();io.calls.length=0;
    await Promise.all([assets.refreshProjectFilesForEvent(event(false)),assets.refreshProjectFilesForEvent(event(false)),assets.refreshProjectFiles({force:false})]);
    assert.deepEqual(io.calls,[]);
    io.state.defer=true;
    const remote=Promise.all([assets.refreshProjectFilesForEvent(event(true)),assets.refreshProjectFilesForEvent(event(true)),assets.refreshProjectFiles()]);
    assert.deepEqual(io.calls,['list_project_assets']);
    io.deferred.shift()([file('Remote.mmat')]);await remote;
    assert.equal(assets.listProjectFiles()[0].name,'Remote.mmat');
    io.state.defer=false;await assets.refreshProjectFiles({force:true});
    assert.deepEqual(io.calls,['list_project_assets','list_project_assets']);
  }finally{io.close();}
});

test('an old full refresh cannot replace a newer poll or another project session',async()=>{
  const io=host();try{
    await assets.refreshProjectFiles();io.state.defer=true;
    const pending=assets.refreshProjectFiles();
    io.state.files=[file('A.mmat','new')];
    assert.equal((await assets.pollProjectFileChanges())[0].type,'modified');
    io.deferred.shift()([file('A.mmat','old')]);await pending;
    assert.equal(assets.listProjectFiles()[0].revision,'new');
    const old=assets.refreshProjectFiles();assets.resetProjectAssetState();
    const fresh=assets.refreshProjectFiles();
    io.deferred[1]([file('Other.mmat')]);await fresh;
    io.deferred[0]([file('Old.mmat')]);await old;
    assert.equal(assets.listProjectFiles()[0].name,'Other.mmat');
  }finally{io.close();}
});

test('Project consumers use cached script metadata and refresh sprites only for sprite dependencies or force',async()=>{
  const io=host();try{
    await attachDesktopProject();
    io.state.files=[file('Main.ts','1','script'),file('A.mmat'),file('Texture.png','1','texture')];
    await assets.pollProjectFileChanges();io.calls.length=0;
    await Promise.all([refreshProjectLibraries(),refreshProjectLibraries()]);
    assert.deepEqual(io.calls,['list_project_sprites']);
    assert.equal(listScripts()[0].absPath,'G:\\Project\\Assets\\Main.ts');
    io.state.files[1]=file('A.mmat','2');await assets.pollProjectFileChanges();io.calls.length=0;
    await refreshProjectLibraries();assert.deepEqual(io.calls,[]);
    io.state.files[2]=file('Texture.png','2','texture');await assets.pollProjectFileChanges();io.calls.length=0;
    await refreshProjectLibraries();assert.deepEqual(io.calls,['list_project_sprites']);
    io.state.files.push(file('Texture.png.sprite.json','1','sprite-import'));await assets.pollProjectFileChanges();io.calls.length=0;
    await refreshProjectLibraries();assert.deepEqual(io.calls,['list_project_sprites']);
    io.calls.length=0;await refreshProjectLibraries(true);
    assert.deepEqual(io.calls,['list_project_assets','list_project_sprites']);
  }finally{io.close();}
});
