// Author: MiYu. Single-asset reads retain index health and optimistic-write protection.
import assert from 'node:assert/strict';
import test from 'node:test';
import {acknowledgeProjectFileWrite,readProjectFileInfo,refreshProjectFiles,pollProjectFileChanges,resetProjectAssetState,readProjectAssetBytesWithRevision,writeProjectAssetText,listProjectFiles} from '../src/projectAssets.ts';

const guid='bf914747-8c6a-418f-b74f-49d49114f9a2';
const asset=(revision='old',extra={})=>({id:'Assets/UI.prefab',guid,name:'UI.prefab',folder:'Assets',relPath:'Assets/UI.prefab',kind:'prefab',revision,size:10,metaStatus:'ready',metaError:null,...extra});
function host(){
  const previous=globalThis.window,calls=[],state={files:[asset()],current:asset()};resetProjectAssetState();
  globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{
    calls.push({command,args});
    if(command==='list_project_assets')return structuredClone(state.files);
    if(command==='poll_project_assets')return {revision:JSON.stringify(state.files),assets:args.knownRevision===JSON.stringify(state.files)?null:structuredClone(state.files)};
    if(command==='get_project_asset_info')return structuredClone(state.current);
    if(command==='read_project_asset')return {contents:[123,125],revision:state.current.revision};
    if(command==='write_project_asset')return {revision:state.current.revision,asset:structuredClone(state.current)};
    throw Error('Unexpected invoke: '+command);
  }}};
  return {state,calls,close(){globalThis.window=previous;resetProjectAssetState();}};
}

test('warm prefab lookups read fresh metadata/revision without scanning or hiding watcher changes',async()=>{
  const io=host();try{
    await refreshProjectFiles();io.calls.length=0;io.state.current=asset('new');
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).revision,'new');
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).revision,'new');
    assert.deepEqual(io.calls.map(c=>c.command),['get_project_asset_info','get_project_asset_info']);
    io.state.files=[io.state.current];assert.equal((await pollProjectFileChanges())[0]?.type,'modified');
  }finally{io.close();}
});

test('idle native polls carry only the revision and project reset discards it',async()=>{
  const io=host();try{
    await refreshProjectFiles();
    assert.deepEqual(await pollProjectFileChanges(),[]);
    const current=listProjectFiles();
    assert.deepEqual(await pollProjectFileChanges(),[]);
    assert.equal(listProjectFiles(),current);
    const polls=io.calls.filter(c=>c.command==='poll_project_assets');
    assert.equal(polls[0].args.knownRevision,null);
    assert.equal(polls[1].args.knownRevision,JSON.stringify(io.state.files));
    resetProjectAssetState();await pollProjectFileChanges();
    assert.equal(io.calls.at(-1).args.knownRevision,null);
  }finally{io.close();}
});

test('single-file ready metadata never clears a known or indexed duplicate GUID',async()=>{
  const io=host();try{
    io.state.files=[asset('old',{metaStatus:'duplicate',metaError:'duplicate GUID'})];await refreshProjectFiles();
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).metaStatus,'duplicate');
    io.state.files=[asset(),asset('old',{id:'Assets/Other.prefab',relPath:'Assets/Other.prefab'})];await refreshProjectFiles();
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).metaStatus,'duplicate');
  }finally{io.close();}
});

test('cold or changed identities request a sidecar-only ownership check without library discovery',async()=>{
  const io=host();try{
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).metaStatus,'ready');
    assert.deepEqual(io.calls.map(c=>[c.command,c.args.checkGuidOwners]),[['get_project_asset_info',true]]);
    io.calls.length=0;io.state.current=asset('new',{guid:'55081cc1-f44d-49fc-8ada-ee889a26ee36'});
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).metaStatus,'ready');
    assert.deepEqual(io.calls.map(c=>[c.command,c.args.checkGuidOwners]),[['get_project_asset_info',false],['get_project_asset_info',true]]);
    io.state.current={...io.state.current,metaStatus:'invalid',metaError:'bad schema'};
    assert.equal((await readProjectFileInfo('Assets/UI.prefab')).metaStatus,'invalid');
  }finally{io.close();}
});

test('reading current information preserves an open document write baseline and accepts host write results',async()=>{
  const io=host();try{
    await refreshProjectFiles();await readProjectAssetBytesWithRevision('Assets/UI.prefab');
    io.state.current=asset('new');await readProjectFileInfo('Assets/UI.prefab');
    await writeProjectAssetText('Assets/UI.prefab','{}');
    assert.equal(io.calls.find(c=>c.command==='write_project_asset').args.expectedRevision,'old');
    assert.equal(listProjectFiles()[0].revision,'new');
  }finally{io.close();}
});


test('acknowledging an asset write does not swallow external metadata-only changes',async()=>{
  const io=host();try{
    await refreshProjectFiles();await pollProjectFileChanges();
    acknowledgeProjectFileWrite('Assets/UI.prefab');
    io.state.files=[asset('old',{metaRevision:'new-meta'})];
    assert.equal((await pollProjectFileChanges())[0]?.type,'modified');
  }finally{io.close();}
});
