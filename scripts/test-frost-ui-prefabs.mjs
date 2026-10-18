// Author: MiYu. Verify editable prefab inputs, linked instances, references and viewport-independent layout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {applyUiPrefabs,UI_SCREENS,fullStretchRect,canvasRect,controlLocalRect,uiSceneEntities,prefabSource} from './frost-ui-prefabs.mjs';
import {seedUiPrefabs} from './seed-frost-ui-prefabs.mjs';

const project=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),seedRoot=process.argv[2]&&process.argv[2]!=='-'?process.argv[2]:null;
const baseline='0b6a136e895940d08258b488abccdae2e0c85f8b',readSeed=file=>seedRoot?fs.readFileSync(path.join(seedRoot,file),'utf8'):execFileSync('git',['show',baseline+':samples/frostbound-realms/'+file],{cwd:project,encoding:'utf8',maxBuffer:32*1024*1024});
const original=JSON.parse(readSeed('Assets/Scenes/Main.mscene')).world.entities;
const script=readSeed('Assets/Scripts/Main.js'),buttons=JSON.parse(script.match(/var FrostButtons=(.*);\r?\n/)[1]);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'frost-ui-prefabs-'));
const walk=(node,fn,depth=0)=>{fn(node,depth);for(const child of node.children??[])walk(child,fn,depth+1);};
const pixels=(r,w,h)=>({x:(r.anchor_min[0]+(r.anchor_max[0]-r.anchor_min[0])*r.pivot[0]-.5)*w+r.anchored_position[0],y:(r.anchor_min[1]+(r.anchor_max[1]-r.anchor_min[1])*r.pivot[1]-.5)*h+r.anchored_position[1],w:(r.anchor_max[0]-r.anchor_min[0])*w+r.size_delta[0],h:(r.anchor_max[1]-r.anchor_min[1])*h+r.size_delta[1]});
function near(actual,expected,label){for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<1e-8,label+' '+key+': '+actual[key]+' != '+expected[key]);}
try{
  const independentlySeeded=path.join(temp,'seeded');seedUiPrefabs(original,buttons,independentlySeeded);
  let maxDepth=0,totalNodes=0;
  for(const [key] of UI_SCREENS){
    const relative=prefabSource(key),asset=JSON.parse(fs.readFileSync(path.join(project,relative),'utf8')),ids=new Set();
    assert.equal(asset.version,2);walk(asset.root,(node,depth)=>{assert.ok(!ids.has(node.id));ids.add(node.id);assert.ok(!node.components.Canvas,'Only Interface owns a Canvas');assert.ok(node.children.length<=32,'Bounded functional groups: '+node.name);maxDepth=Math.max(maxDepth,depth);totalNodes++;});
    assert.deepEqual(asset,JSON.parse(fs.readFileSync(path.join(independentlySeeded,relative),'utf8')),'deterministic seed '+key);
    assert.equal(fs.readFileSync(path.join(project,relative+'.meta'),'utf8'),fs.readFileSync(path.join(independentlySeeded,relative+'.meta'),'utf8'));
  }
  assert.ok(maxDepth<=5);assert.throws(()=>seedUiPrefabs(original,buttons,independentlySeeded),/refuses to overwrite/);
  const entities=structuredClone(original),out=path.join(temp,'output'),manifest=applyUiPrefabs(entities,buttons,project,out),byName=new Map(entities.map(e=>[e.name,e])),byId=new Map(entities.map(e=>[e.entity,e]));
  assert.equal(byName.size,entities.length,'unique names');assert.equal(byId.size,entities.length,'unique entity IDs');assert.equal(manifest.screens.length,16);assert.equal(Object.keys(manifest.controls).length,buttons.length);
  const rects=new Map();function actualRect(e){if(rects.has(e.entity))return rects.get(e.entity);const parent=byId.get(e.parent),result=canvasRect(parent&&parent.name!=='Interface'?actualRect(parent):fullStretchRect(),e.components.RectTransform??fullStretchRect());rects.set(e.entity,result);return result;}
  let comparisons=0;
  for(const originalEntity of uiSceneEntities(original).entities){
    const entity=byName.get(originalEntity.name);assert.ok(entity,'retained leaf '+originalEntity.name);assert.ok(entity.components.__MEnginePrefab,'linked leaf '+entity.name);
    if(originalEntity.components.RectTransform)for(const [w,h] of [[1280,720],[1920,720],[960,720],[720,1280]]){near(pixels(actualRect(entity),w,h),pixels(originalEntity.components.RectTransform,w,h),entity.name);comparisons++;}
    if(originalEntity.components.Transform)assert.deepEqual(entity.components.Transform,originalEntity.components.Transform,'3D local transform unchanged '+entity.name);
  }
  for(const screen of manifest.screens){
    const prefab=JSON.parse(fs.readFileSync(path.join(project,screen.source),'utf8')),nodes=new Map();walk(prefab.root,n=>nodes.set(n.id,n));
    for(const name of screen.nodes){const e=byName.get(name),link=e.components.__MEnginePrefab;assert.equal(link.source,screen.source);assert.equal(nodes.get(link.node)?.name,name);assert.equal(link.root,e.entity===screen.root);}
    for(const suffix of ['', '.meta'])assert.equal(fs.readFileSync(path.join(project,screen.source+suffix),'utf8'),fs.readFileSync(path.join(out,screen.source+suffix),'utf8'));
  }
  const raw=byName.get('HUD Live portrait').components.RawImage;assert.equal(raw.render_camera,String(byName.get('Portrait camera').entity));assert.equal(raw.render_root,String(byName.get('Portrait model').entity));
  for(const name of ['Portrait model','Portrait camera']){let entity=byName.get(name);while(entity.parent!=null){entity=byId.get(entity.parent);assert.ok(!entity.components.Transform,'Portrait ancestors do not alter world transform');}}
  const button=manifest.controls.solo,box=byName.get('solo box');assert.equal(byId.get(box.parent).name,button.name);assert.deepEqual(box.components.RectTransform.size_delta,[0,0]);assert.deepEqual(box.components.RectTransform.anchored_position,[0,0]);
  const noncenter={...fullStretchRect(),anchor_min:[1,1],anchor_max:[1,1],pivot:[.25,.75],anchored_position:[-50,-30],size_delta:[180,46]},part={...structuredClone(noncenter),pivot:[.1,.9],anchored_position:[-40,-25],size_delta:[166,38]};
  for(const [w,h] of [[1280,720],[1920,1080],[720,1280]])near(pixels(canvasRect(noncenter,controlLocalRect(noncenter,part)),w,h),pixels(part,w,h),'noncenter pivot');
  const editedPath=path.join(out,prefabSource('MainMenu')),edited=JSON.parse(fs.readFileSync(editedPath,'utf8'));walk(edited.root,n=>{if(n.name==='solo label')n.components.Text.text='Prefab edit visible';});fs.writeFileSync(editedPath,JSON.stringify(edited));
  const rebuilt=structuredClone(original);applyUiPrefabs(rebuilt,buttons,out,out);assert.equal(rebuilt.find(e=>e.name==='solo label').components.Text.text,'Prefab edit visible','build consumes edited prefab');
  const root=byName.get('UI MainMenu');root.active=false;let cursor=box,effective=true;while(cursor){effective&&=cursor.active!==false;cursor=byId.get(cursor.parent);}assert.equal(effective,false,'inactive screen suppresses locally active button');
  const minimap=byName.get('UI BattleHUD / Minimap');minimap.active=false;
  for(const entity of entities.filter(e=>/^Mini (tile|unit) /.test(e.name))){let cursor=entity,found=false;while(cursor){if(cursor.entity===minimap.entity){found=true;assert.equal(cursor.active,false);}cursor=byId.get(cursor.parent);}assert.ok(found,'Minimap functional group owns '+entity.name);}
  minimap.active=true;
  const linked=entities.filter(e=>e.components.__MEnginePrefab);assert.equal(linked.length,totalNodes);assert.ok(!entities.some(e=>e.parent===byName.get('Interface').entity&&!e.name.startsWith('UI Layer ')));
  let editorChecks=0;
  if(process.argv[3]){
    const editor=path.join(path.resolve(process.argv[3]),'packages/editor'),{createServer}=await import(pathToFileURL(path.join(editor,'node_modules/vite/dist/node/index.js')).href),server=await createServer({root:editor,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
    try{
      const {parsePrefabAsset,capturePrefabAsset}=await server.ssrLoadModule('/src/prefabAsset.ts'),{createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
      store.loadSceneJson(JSON.stringify({version:1,name:'UI prefab validation',world:{entities:entities.filter(e=>e.name==='Interface'||e.name.startsWith('UI Layer ')||e.components.__MEnginePrefab),frame:0,sim_frame:0,clear_color:[0,0,0,1]}}));
      for(const screen of manifest.screens){
        const asset=parsePrefabAsset(fs.readFileSync(path.join(project,screen.source),'utf8')),instance=store.authoredEntities().find(e=>e.name===screen.name),captured=capturePrefabAsset(screen.key,store.authoredEntities(),instance.entity,{source:screen.source});
        assert.equal(store.getPrefabInstance(instance.entity)?.source,screen.source);
        assert.equal(captured.asset.root.id,asset.root.id,'Apply retains stable root id');assert.deepEqual(new Set(captured.nodeIds.values()),new Set(screen.nodes.map(n=>byName.get(n).components.__MEnginePrefab.node)),'Apply retains all stable node IDs');
        assert.equal(store.markPrefabInstance(instance.entity,screen.source,captured.nodeIds),true);
        assert.notEqual(store.revertPrefabInstance(instance.entity,asset),null,'Revert accepts emitted prefab');editorChecks++;
      }
      const snapshot=store.authoredEntities(),portrait=snapshot.find(e=>e.name==='HUD Live portrait').components.RawImage;
      assert.equal(portrait.render_camera,String(snapshot.find(e=>e.name==='Portrait camera').entity));assert.equal(portrait.render_root,String(snapshot.find(e=>e.name==='Portrait model').entity));
    }finally{await server.close();}
  }
  console.log(JSON.stringify({passed:true,prefabs:manifest.screens.length,controls:buttons.length,linkedNodes:linked.length,maxDepth,viewportComparisons:comparisons,editorApplyRevert:editorChecks,seedRoot}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
