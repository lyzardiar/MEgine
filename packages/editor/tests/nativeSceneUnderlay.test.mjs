// Author: MiYu. Only a fully opaque accepted Scene image may elide covered pixels; object hit regions remain intact.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';

const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const begin=source.indexOf('    if (!nativeSceneFrame?.opaquePixels) {'),end=source.indexOf('    const transformSource =',begin);
assert.ok(begin>0&&end>begin);
const background=new Function('env',compile('const {nativeSceneFrame,ctx,vp,cam,p,isGame,gameCamera,environment,scene2DActive,drawEnvironmentBackground,drawGroundGrid}=env;'+source.slice(begin,end)));
const dotBegin=source.indexOf('        if (isGame || !pr) continue;'),dotEnd=source.indexOf('      const half: Vec3',dotBegin);
assert.ok(dotBegin>0&&dotEnd>dotBegin);
const dots=new Function('env',compile('const {nativeSceneFrame,ctx,hitsRef,isGame,pr,selected}=env; const hits=hitsRef.current; for(const e of env.entities){'+source.slice(dotBegin,dotEnd).replace(/\n      \}\s*$/,'')+'}'));

test('opaque Scene images skip covered environment and grid while transparent and legacy frames keep them',()=>{
  for(const frame of [{image:{},opaquePixels:true},{image:{},opaquePixels:false},{image:{}},null]){
    let operations=0;
    const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){operations++;}})},{get(target,key){operations++;return key in target?target[key]:()=>operations++;},set(){operations++;return true;}});
    background({nativeSceneFrame:frame,ctx,vp:{x:0,y:0,w:640,h:360},cam:{eye:[0,5,5],target:[0,0,0]},p:{clearColor:[0,0,0,1]},isGame:false,gameCamera:null,environment:undefined,scene2DActive:false,drawEnvironmentBackground:()=>{operations++;return false;},drawGroundGrid:()=>operations++});
    assert.equal(operations===0,frame?.opaquePixels===true);
  }
});

test('covered empty-node markers retain the exact hit positions and order without Canvas operations',()=>{
  for(const frame of [{image:{},opaquePixels:true},{image:{},opaquePixels:false},{image:{}},null]){
    let operations=0;const hitsRef={current:[]},ctx=new Proxy({},{get(){return()=>operations++;},set(){operations++;return true;}});
    dots({nativeSceneFrame:frame,ctx,hitsRef,isGame:false,pr:{x:100,y:80},selected:false,entities:[{entity:1},{entity:2}]});
    assert.deepEqual(hitsRef.current,[1,2].map(id=>({kind:'object',id,x:100,y:80,r:10})));assert.equal(operations===0,frame?.opaquePixels===true);
    hitsRef.current=[];dots({nativeSceneFrame:frame,ctx,hitsRef,isGame:false,pr:null,selected:true,entities:[{entity:3}]});assert.deepEqual(hitsRef.current,[]);
  }
});
