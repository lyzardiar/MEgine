// Author: MiYu. Actual client render-frame timing, shared material transforms, pause and fog.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,values=new Map(),active=new Map();
const engine={snapshot:structuredClone(world),network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},setActive:(id,on)=>active.set(id,on),playAudio(){},pushCommandJson:raw=>{const c=JSON.parse(raw);values.set(c.entity+'/'+c.component,c.value);}};
const context=vm.createContext({engine,FrostArt:JSON.parse(fs.readFileSync(new URL('model-catalog.json',root))),FrostPortraitViews:Object.fromEntries(JSON.parse(fs.readFileSync(new URL('head-portraits.json',root))).views.map(v=>[v.key,v])),FrostButtons:[]});
vm.runInContext(['simulation','terrain','visuals','client'].map(n=>fs.readFileSync(new URL('game/'+n+'.js',root),'utf8')).join('\n'),context);
vm.runInContext(`const fellingCreate=Frost.create;Frost.create=(mode,options)=>{if(mode!=='skirmish')return fellingCreate(mode,options);const map=Frost.defaultMap();map.tileset=1;for(const field of ['terrain','heights','relief','ramps'])map[field].fill(0);map.props=[{kind:'tree',x:-6,z:16,amount:100}];map.units=[];const s=fellingCreate(mode,{...options,map,ai:[false,false]});s.units=[];Frost.spawn(s,'hall',0,-14,16);Frost.spawn(s,'hall',1,22,-20);Frost.spawn(s,'worker',0,-8,16);s.resources[0].amount=5;Frost.visibility(s);globalThis.fellingState=s;return s;};`,context);
const tick=(dt,pressedKeys=[])=>{engine.input={keys:[],pressedKeys,buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};context.onTick(dt);},id=name=>world.entities.find(e=>e.name===name).entity,transform=name=>values.get(id(name)+'/Transform');
tick(.001);tick(.001,['F1']);vm.runInContext(`Frost.command(fellingState,0,{type:'gather',ids:[fellingState.units.find(u=>u.kind==='worker').id],resource:0});`,context);tick(.1);
assert.ok(context.fellingState.resources[0].felled);const rotations=[];
for(let i=0;i<60;i++){tick(1/60);rotations.push(transform('Prop 0').rotation);for(const part of ['Prop 0 part 1','Prop 0 part 2'])assert.deepEqual(transform(part),transform('Prop 0'));}
assert.ok(rotations.filter((q,i)=>i&&JSON.stringify(q)!==JSON.stringify(rotations[i-1])).length>50,'tree rotation progresses on render frames');
tick(.001,['Escape']);const frozen=structuredClone(transform('Prop 0')),frame=context.fellingState.frame;for(let i=0;i<30;i++)tick(1/60);assert.equal(context.fellingState.frame,frame);assert.deepEqual(transform('Prop 0'),frozen,'pause freezes fractional tree progress');
const r=context.fellingState.resources[0],fallen=structuredClone(r),tile=context.Frost.index(r.x,r.z);context.fellingState.visible[0][tile]=0;tick(.001);assert.deepEqual(transform('Prop 0').rotation.slice(0,3).filter((v,i)=>i!==1),[0,0],'hidden depletion cannot reveal a fall in solo play');assert.deepEqual(JSON.parse(JSON.stringify(r)),JSON.parse(JSON.stringify(fallen)));
context.fellingState.visible[0][tile]=1;tick(.001);assert.deepEqual(transform('Prop 0'),frozen);tick(.001,['Escape']);for(let i=0;i<60;i++)tick(.1);for(const part of ['Prop 0','Prop 0 part 1','Prop 0 part 2'])assert.equal(active.get(id(part)),false);
console.log('PASS client: 60 Hz fall progression, three material parts, frozen fractional pause, solo fog privacy and complete deactivation');
