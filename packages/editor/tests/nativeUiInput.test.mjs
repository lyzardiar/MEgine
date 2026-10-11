import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {solveRectTransform} from '../src/ui/rectLayout.ts';
import {createNativeViewportWorldArgs} from '../src/nativeViewportFrame.ts';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
const {layoutUiOverlay,hitTestUi}=await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(()=>server.close());
test('displayed native UI layout and hits keep captured values until the next frame arrives',()=>{
  const entities=[{entity:1,components:{Canvas:{render_mode:'ScreenSpaceOverlay'},GraphicRaycaster:{enabled:true}}},{entity:2,parent:1,components:{RectTransform:{anchored_position:[0,0],size_delta:[200,64]},InputField:{text:'first'}}}];
  const world=createNativeViewportWorldArgs({entities,clearColor:[0,0,0,1],simulationTime:0}).frameWorld();
  entities[1].components.RectTransform.anchored_position[0]=400;entities[1].components.InputField.text='second';
  const layout=source=>layoutUiOverlay(source,{x:0,y:0,w:1280,h:720},new Set(),undefined,undefined,0,undefined,true);
  const displayed=layout(world.entities),current=layout(entities),field=displayed.find(item=>item.input),x=field.rect.x+100,y=field.rect.y+32;
  assert.equal(world.entities[1].components.InputField.text,'first');
  assert.equal(hitTestUi(displayed,x,y,{entities:world.entities,viewport:{x:0,y:0,w:1280,h:720}})?.entity,2);
  assert.equal(hitTestUi(current,x,y,{entities,viewport:{x:0,y:0,w:1280,h:720}}),null);
});
test('native Game hit regions and input proxy placement match native screen coordinates',()=>{
  const entities=[{entity:1,parent:null,components:{Canvas:{render_mode:'ScreenSpaceOverlay'},GraphicRaycaster:{enabled:true}}},{entity:2,parent:1,components:{RectTransform:{anchored_position:[0,-28],size_delta:[800,64]},InputField:{font:'Assets/Fonts/NotoSansSC.ttf',text:'霜境'}}}];
  const native=layoutUiOverlay(entities,{x:0,y:0,w:1280,h:720},new Set(),undefined,undefined,0,undefined,true);
  const input=native.find(item=>item.input);
  assert.deepEqual(input.rect,{x:240,y:300,w:800,h:64});assert.equal(hitTestUi(native,640,332)?.entity,2);assert.equal(hitTestUi(native,640,388),null);
  const browser=layoutUiOverlay(entities,{x:0,y:0,w:1280,h:720},new Set());assert.equal(browser.find(item=>item.input).rect.y,356);
});
test('native anchors and asymmetric pivots retain the Rust solve_rect convention',()=>{
  const parent={x:10,y:20,w:600,h:400},rt={anchor_min:[.1,.2],anchor_max:[.4,.6],pivot:[.25,.8],anchored_position:[12,-15],size_delta:[20,30]};
  const rect=solveRectTransform(parent,rt,true);assert.ok(Math.abs(rect.x-77)<1e-9);assert.ok(Math.abs(rect.y-61)<1e-9);assert.ok(Math.abs(rect.w-200)<1e-9);assert.ok(Math.abs(rect.h-190)<1e-9);
});

test('native nested sorting canvases preserve input hit geometry',()=>{
  const entities=[{entity:1,parent:null,components:{Canvas:{render_mode:'ScreenSpaceOverlay'},GraphicRaycaster:{enabled:true},RectTransform:{anchored_position:[40,-20],size_delta:[1000,600]}}},{entity:2,parent:1,components:{Canvas:{render_mode:'ScreenSpaceOverlay',override_sorting:true},GraphicRaycaster:{enabled:true},RectTransform:{anchored_position:[70,-40],size_delta:[400,250]}}},{entity:3,parent:2,components:{RectTransform:{anchored_position:[0,-28],size_delta:[200,64]},InputField:{text:'中文'}}}];
  const native=layoutUiOverlay(entities,{x:0,y:0,w:1280,h:720},new Set(),undefined,undefined,0,undefined,true);const field=native.find(item=>item.input);assert.deepEqual(field.rect,{x:650,y:240,w:200,h:64});assert.equal(hitTestUi(native,750,272)?.entity,3);
});

test('native nested layout and hits follow in-place hierarchy, activity and sibling edits',()=>{
  const rect={anchored_position:[0,0],size_delta:[200,60]};
  const entities=[
    {entity:1,components:{Canvas:{render_mode:'ScreenSpaceOverlay'},GraphicRaycaster:{enabled:true}}},
    {entity:2,parent:1,components:{RectTransform:rect,LayoutGroup:{direction:'Horizontal',spacing:[0,0],padding:[0,0,0,0],child_force_expand:false,child_control_width:false,child_control_height:false,child_alignment:'UpperLeft'}}},
    {entity:3,parent:1,components:{Canvas:{render_mode:'ScreenSpaceOverlay',override_sorting:true},GraphicRaycaster:{enabled:true},RectTransform:{anchored_position:[200,0],size_delta:[200,60]}}},
    {entity:4,parent:2,siblingIndex:0,components:{RectTransform:{size_delta:[60,30]},InputField:{text:'first'}}},
    {entity:5,parent:2,siblingIndex:1,components:{RectTransform:{size_delta:[60,30]},InputField:{text:'second'}}},
  ];
  const layout=()=>layoutUiOverlay(entities,{x:0,y:0,w:800,h:600},new Set(),undefined,undefined,0,undefined,true);
  const first=layout(),left=first.find(item=>item.entity===4).rect,right=first.find(item=>item.entity===5).rect;
  assert.equal(right.x-left.x,60);
  const hit=(items,rect)=>hitTestUi(items,rect.x+rect.w/2,rect.y+rect.h/2)?.entity;
  assert.equal(hit(first,left),4);assert.equal(hit(first,right),5);
  entities[4].siblingIndex=-1;
  const reordered=layout();assert.equal(hit(reordered,left),5);assert.equal(hit(reordered,right),4);
  entities[4].active=false;
  const inactive=layout();assert.equal(hit(inactive,left),4);assert.equal(hit(inactive,right),undefined);
  entities[4].active=true;entities[4].parent=3;
  const reparented=layout(),moved=reparented.find(item=>item.entity===5).rect;
  assert.equal(hit(reparented,left),4);assert.equal(hit(reparented,moved),5);assert.ok(moved.x>right.x);
  entities.push({entity:6,parent:2,siblingIndex:2,components:{RectTransform:{size_delta:[60,30]},InputField:{text:'added'}}});
  assert.equal(hit(layout(),right),6);
  entities.splice(entities.findIndex(e=>e.entity===6),1);assert.equal(hit(layout(),right),undefined);
});
