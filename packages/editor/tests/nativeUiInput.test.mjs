import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {solveRectTransform} from '../src/ui/rectLayout.ts';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
const {layoutUiOverlay,hitTestUi}=await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(()=>server.close());
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
