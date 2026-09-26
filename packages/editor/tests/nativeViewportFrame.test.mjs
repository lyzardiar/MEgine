import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeGamePreviewSize, parseNativeViewportFrame, requiresBrowserViewportSnapshot } from '../src/nativeViewportFrame.ts';

test('browser overlays and interactive UI retain a matching snapshot', () => {
  assert.equal(requiresBrowserViewportSnapshot([{ components: { Text: {}, SpriteRenderer: {} } }]), false);
  for (const type of ['SpineSkeleton', 'Button', 'Toggle', 'Slider', 'Scrollbar', 'InputField', 'Dropdown', 'ListView', 'ScrollView', 'TabView']) {
    assert.equal(requiresBrowserViewportSnapshot([{ components: { [type]: {} } }]), true);
  }
});

function packet(width=2,height=1){
  const metadata=new TextEncoder().encode(JSON.stringify({hasAuthoredCamera:true,profile:{schemaVersion:1,totalMs:1}}));
  const buffer=new ArrayBuffer(16+metadata.length+width*height*4),view=new DataView(buffer);
  [0x3146474d,width,height,metadata.length].forEach((value,index)=>view.setUint32(index*4,value,true));
  new Uint8Array(buffer,16,metadata.length).set(metadata);
  new Uint8Array(buffer,16+metadata.length).set([255,12,34,255,56,78,90,128]);
  return buffer;
}
test('live preview matches display pixels without changing aspect or upscaling low-resolution games',()=>{
  assert.deepEqual(nativeGamePreviewSize(1080,1920,503,895),{width:503,height:894});
  assert.deepEqual(nativeGamePreviewSize(320,180,1920,1080),{width:320,height:180});
  assert.deepEqual(nativeGamePreviewSize(1080,1920,1080,1920),{width:1080,height:1920});
  assert.deepEqual(nativeGamePreviewSize(1080,1920,503,895,true),{width:1080,height:1920});
});
test('native frame preserves exact RGBA pixels and metadata without copying the pixel buffer',()=>{
  const buffer=packet(),frame=parseNativeViewportFrame(buffer);
  assert.equal(frame.width,2);assert.equal(frame.height,1);assert.equal(frame.hasAuthoredCamera,true);
  assert.deepEqual([...frame.rgba],[255,12,34,255,56,78,90,128]);assert.equal(frame.rgba.buffer,buffer);
});
test('native frame rejects invalid magic, dimensions, metadata length and truncated pixels',()=>{
  for(const [offset,value] of [[0,0],[4,0],[8,4097],[12,0xffffffff]]){const buffer=packet();new DataView(buffer).setUint32(offset,value,true);assert.throws(()=>parseNativeViewportFrame(buffer));}
  assert.throws(()=>parseNativeViewportFrame(packet().slice(0,-1)));assert.throws(()=>parseNativeViewportFrame(new ArrayBuffer(8)));
});
