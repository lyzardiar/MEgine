// Author: MiYu. Native thumbnail omission and browser project/sliced texture resolution.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=await createServer({root,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
const library=await server.ssrLoadModule('/src/spriteLibrary.ts');
test.after(()=>server.close());

test('native project thumbnails return no browser URL without accessing the texture catalogue',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),sprites=library.listSprites();
  const inaccessible={get id(){throw new Error('Native thumbnail must not resolve catalogue entries');}};
  sprites.push(inaccessible);
  try {
    globalThis.window={__TAURI_INTERNALS__:{}};
    for(const id of ['Assets/UI/Icon.png','Icon','Assets/UI/Atlas.png#Idle','white',''])assert.equal(library.spriteAssetUrl(id),null);
    assert.equal(sprites.at(-1),inaccessible);
  } finally {sprites.pop();if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});

test('browser thumbnails preserve catalogue aliases, slices, encoded paths and refreshed texture identities',async()=>{
  const previousFetch=globalThis.fetch,previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  let sprites=[
    {id:'Assets/UI/Panel Image.png',name:'Panel Image.png',folder:'Assets/UI',relPath:'Assets/UI/Panel Image.png'},
    {id:'Assets/UI/Atlas.png#Idle',name:'Idle',folder:'Assets/UI',relPath:'Assets/UI/Atlas.png',textureId:'Assets/UI/Shared Sheet.png',sliceName:'Idle',rect:[0,0,24,24]},
  ];
  try {
    globalThis.window={};globalThis.fetch=async url=>{assert.equal(url,'/__mengine/sprites');return {ok:true,json:async()=>({sprites})};};
    await library.refreshSprites();
    assert.equal(library.spriteAssetUrl('panel image'),'/__mengine/asset/Assets/UI/Panel%20Image.png');
    assert.equal(library.spriteAssetUrl('Idle'),'/__mengine/asset/Assets/UI/Shared%20Sheet.png');
    assert.equal(library.spriteAssetUrl('Assets/UI/Atlas.png#Idle'),'/__mengine/asset/Assets/UI/Shared%20Sheet.png');
    assert.equal(library.spriteAssetUrl('file:///G:/project/Assets/UI/Panel%20Image.png'),'/__mengine/asset/Assets/UI/Panel%20Image.png');
    assert.equal(library.spriteAssetUrl('Assets/UI/Unknown'),'/__mengine/asset/Assets/UI/Unknown.png');
    assert.equal(library.spriteAssetUrl('outside.png'),null);assert.equal(library.spriteAssetUrl('white'),null);
    sprites=[{...sprites[1],textureId:'Assets/UI/Repacked.png'}];await library.refreshSprites();
    assert.equal(library.spriteAssetUrl('Idle'),'/__mengine/asset/Assets/UI/Repacked.png');
    assert.equal(library.resolveSpriteTextureId('Idle'),'Assets/UI/Repacked.png');
  } finally {globalThis.fetch=previousFetch;if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;}
});
