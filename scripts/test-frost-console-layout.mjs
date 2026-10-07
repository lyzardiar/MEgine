// Author: MiYu. Original console frame proportions and anchored native controls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url),root=new URL('../samples/frostbound-realms/',import.meta.url),H=require('../samples/frostbound-realms/game/hud.js'),layout=require('../samples/frostbound-realms/console-layout.json'),receipt=require('../samples/frostbound-realms/console-sources.json');
const entities=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world.entities,byName=new Map(entities.map(e=>[e.name,e])),near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,label);
const frame=fs.readFileSync(new URL('SourceAssets/WarcraftIII/UI/FrameDef/UI/ConsoleUI.fdf',root),'utf8'),blocks=[...frame.matchAll(/Texture\s*\{([^}]+)\}/g)].map(m=>m[1]);assert.equal(blocks.length,9);
assert.deepEqual(layout.reference,[960,720]);
for(const [i,block] of blocks.entries()){const width=Number(block.match(/Width ([\d.]+)/)[1]),height=Number(block.match(/Height ([\d.]+)/)[1]);near(layout.pieces[i].size[0]/width,layout.pieces[i].size[1]/height,'source frame units use one scale');}
for(const file of receipt.files)assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file.path,root))).digest('hex'),file.sha256,file.path);
const contained=(a,b)=>b.x-b.w/2>=a.x-a.w/2-1e-6&&b.x+b.w/2<=a.x+a.w/2+1e-6&&b.y-b.h/2>=a.y-a.h/2-1e-6&&b.y+b.h/2<=a.y+a.h/2+1e-6;
for(const viewport of [[1024,768],[1280,720],[1920,1080],[2560,1080]]){
 const input={viewport},v=H.viewport(input),rect=n=>H.rect(byName.get(n).components.RectTransform,input),bounds={x:0,y:0,w:v.width,h:v.height};
 const left=rect('HUD Console 5'),center=rect('HUD Console 6'),right=rect('HUD Console 7');near(left.x+left.w/2,center.x-center.w/2,'left source seam');near(center.x+center.w/2,right.x-right.w/2,'right source seam');
 for(const n of ['Minimap',...Array.from({length:12},(_,i)=>'action'+i+' icon'),...Array.from({length:6},(_,i)=>'item'+i+' icon')]){const r=rect(n);near(r.w,r.h,n+' is square');assert.ok(contained(bounds,r),n+' is inside the viewport');}
 const mini=rect('Minimap');for(let i=0;i<256;i++){const tile=rect('Mini tile '+i);assert.ok(contained({...mini,w:mini.w+.11,h:mini.h+.11},tile),'minimap terrain follows its frame');}
 for(const n of ['HUD Live portrait','Selection title','HUD Stat rank','HUD Stat Attack value','HUD Stat Armor value','HUD Inventory title','hudMenu box','HUD Gold value'])assert.ok(contained(bounds,rect(n)),n+' is inside the viewport');
 for(let i=0;i<12;i++){const box=rect('action'+i+' box'),icon=rect('action'+i+' icon');assert.ok(contained(box,icon));near(box.x,icon.x,'command icon center');near(box.y,icon.y,'command icon center');assert.ok(H.contains(box,{x:box.x,y:box.y}),'click uses rendered bounds');}
 const portrait=rect('Portrait'),health=rect('Health back');near(portrait.x,health.x,'portrait health alignment');near(portrait.w,health.w,'portrait health width');
 near(v.scale,Math.min(viewport[0]/960,viewport[1]/720),'uniform original HUD reference');
}
const world=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,values=new Map(),active=new Map(),engine={snapshot:structuredClone(world),network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},setActive:(id,on)=>active.set(id,on),playAudio(){},pushCommandJson:raw=>{const c=JSON.parse(raw);values.set(c.entity+'/'+c.component,c.value);},assets:{sampleNodes:()=>[]}},context=vm.createContext({engine});
vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);
const component=(n,c)=>values.get(byName.get(n).entity+'/'+c)||byName.get(n).components[c],tick=input=>{engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};context.onTick(.001);},telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
tick();tick({keys:['F1'],pressedKeys:['F1']});tick();assert.equal(telemetry().mode,'playing');
for(const viewport of [[1024,768],[1280,720],[1920,1080],[2560,1080]]){
 tick({viewport,keys:['Space'],pressedKeys:['Space']});tick({viewport});
 const input={viewport},v=H.viewport(input),r=H.rect(component('Minimap','RectTransform'),input),pointer=[viewport[0]/2+r.x*v.scale,viewport[1]/2+r.y*v.scale];
 tick({viewport,pointer,buttons:[0],pressedButtons:[0]});tick({viewport,pointer,releasedButtons:[0]});assert.ok(telemetry().camera.every(n=>Math.abs(n)<1e-6),'actual minimap click centers camera at '+viewport);
 const scaler=component('Interface','CanvasScaler');assert.deepEqual(Array.from(scaler.reference_resolution),[960,720]);assert.equal(scaler.match_width_or_height,v.match);
 const icon=H.rect(component('action0 icon','RectTransform'),input),box=H.rect(component('action0 box','RectTransform'),input);near(icon.x,box.x,'actual command icon and hit region');near(icon.y,box.y,'actual command icon and hit region');
}
tick({keys:['F10'],pressedKeys:['F10']});tick();tick({keys:['KeyX'],pressedKeys:['KeyX']});tick();tick({keys:['F4'],pressedKeys:['F4']});tick();assert.equal(telemetry().mode,'editor');
for(const viewport of [[1024,768],[1280,720],[1920,1080],[2560,1080]]){
 tick({viewport});tick({viewport});
 const input={viewport},frame=H.rect(component('HUD Frame Commands','RectTransform'),input),info=H.rect(component('HUD Frame Info','RectTransform'),input);
 for(let i=0;i<12;i++){const box=H.rect(component('action'+i+' box','RectTransform'),input),label=component('action'+i+' label','Text');assert.ok(contained(frame,box),'actual editor command fits its frame at '+viewport);assert.ok(box.x-box.w/2>info.x+info.w/2,'actual editor command stays clear of information');assert.equal(label.horizontal_overflow,'Wrap','editor labels wrap inside the command');}
}
console.log('PASS console source proportions, signed assets, square minimap/command/inventory controls, source seams, portrait bars and viewport bounds at four resolutions');
