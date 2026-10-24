// Author: MiYu. Multi-Canvas Scene layout shares one item source and keeps live ownership and projection.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
const {layoutUiOverlay,layoutUiScene3D}=await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(()=>server.close());
const viewport={x:0,y:0,w:800,h:600},camera={eye:[0,2,8],target:[0,0,0],fovYDeg:60},size={w:800,h:600};
const rect=x=>({anchor_min:[0,0],anchor_max:[0,0],pivot:[.5,.5],anchored_position:[x,50],size_delta:[30,20]});
function fixture(){return [
  {entity:1,components:{Canvas:{render_mode:'ScreenSpaceOverlay'}}},
  {entity:2,parent:1,components:{RectTransform:rect(30),Image:{color:[1,0,0,1]},RectMask2D:{}}},
  {entity:3,parent:2,components:{RectTransform:rect(20),Text:{text:'First',font_size:14}}},
  {entity:10,components:{Canvas:{render_mode:'ScreenSpaceCamera',render_camera:'20',plane_distance:3}}},
  {entity:11,parent:10,components:{RectTransform:rect(70),Image:{color:[0,1,0,.5]}}},
  {entity:12,parent:11,components:{Canvas:{render_mode:'ScreenSpaceOverlay',override_sorting:true},RectTransform:rect(90),Image:{color:[0,0,1,1]}}},
  {entity:20,components:{Transform:{position:[0,0,10],rotation:[0,0,0,1],scale:[1,1,1]},Camera3D:{fov:45}}},
];}

test('all Scene Canvas roots read a supplied overlay once and preserve masks, nested ownership and item order',()=>{
  const entities=fixture(),selected=new Set([3]),items=layoutUiOverlay(entities,viewport,selected,undefined,camera,null);let reads=0;
  const cached={get items(){reads++;return items;}};
  const result=layoutUiScene3D(entities,camera,viewport,selected,size,undefined,cached);
  assert.equal(reads,1);assert.deepEqual(result,layoutUiScene3D(entities,camera,viewport,selected,size));
  assert.ok(result.items.some(item=>item.entity===2));assert.ok(result.items.some(item=>item.entity===11));
});

test('WorldSpace-only and disabled roots do not request screen layout',()=>{
  const cached={get items(){assert.fail('No screen Canvas needs items');}};
  assert.deepEqual(layoutUiScene3D([{entity:1,components:{Canvas:{render_mode:'WorldSpace'}}}],camera,viewport,new Set(),size,undefined,cached).items,[]);
  assert.deepEqual(layoutUiScene3D([{entity:1,active:false,components:{Canvas:{render_mode:'ScreenSpaceOverlay'}}}],camera,viewport,new Set(),size,undefined,cached).items,[]);
});

test('new calls observe text, parent, activation, camera, selection and viewport changes',()=>{
  const entities=fixture();const before=layoutUiScene3D(entities,camera,viewport,new Set(),size);
  entities[2].components.Text.text='Updated';entities[2].parent=10;entities[1].active=false;
  const nextCamera={...camera,eye:[3,4,9]},nextViewport={...viewport,w:960},selected=new Set([11]);
  const items=layoutUiOverlay(entities,{...viewport,w:1024,h:720},selected,undefined,nextCamera,null);
  const after=layoutUiScene3D(entities,nextCamera,nextViewport,selected,{w:1024,h:720},undefined,{items});
  assert.deepEqual(after,layoutUiScene3D(entities,nextCamera,nextViewport,selected,{w:1024,h:720}));assert.notDeepEqual(after,before);
});

test('overlay entries without a current Canvas owner are excluded without changing the other roots',()=>{
  const entities=fixture(),selected=new Set(),items=layoutUiOverlay(entities,viewport,selected,undefined,camera,null);
  const result=layoutUiScene3D(entities,camera,viewport,selected,size,undefined,{items:[...items,{...items[0],entity:999999}]});
  assert.deepEqual(result,layoutUiScene3D(entities,camera,viewport,selected,size,undefined,{items}));
});
