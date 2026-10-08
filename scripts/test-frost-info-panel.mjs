// Author: MiYu. Source information-card provenance, FDF geometry and generated-client selection transitions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {wardenFixture} from './frost-warden-fixture.mjs';
const require=createRequire(import.meta.url),source=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),root=process.env.MENGINE_FROST_BUILD_OUTPUT||source,H=require('../samples/frostbound-realms/game/hud.js');
const receipt=JSON.parse(fs.readFileSync(path.join(source,'info-panel-sources.json'))),icons=JSON.parse(fs.readFileSync(path.join(source,'info-panel-icons.json'))).icons,hash=raw=>createHash('sha256').update(raw).digest('hex');
for(const f of receipt.files){const raw=fs.readFileSync(path.join(source,f.path));assert.equal(raw.length,f.bytes);assert.equal(hash(raw),f.sha256,f.path);}
for(const [p,h] of Object.entries(receipt.sourceConfigHashes))assert.equal(hash(fs.readFileSync(path.join(source,p))),h,p);
assert.equal(hash(fs.readFileSync(new URL('../'+receipt.generator,import.meta.url))),receipt.generatorSha256);
assert.equal(hash(fs.readFileSync(new URL('./import-frost-console.py',import.meta.url))),receipt.decoderSha256);
assert.equal(new Set(Object.values(icons)).size,27);assert.equal(Object.keys(icons).length,37);
const frame=fs.readFileSync(path.join(source,'SourceAssets/WarcraftIII/UI/FrameDef/UI/InfoPanelUnitDetail.fdf'),'utf8'),attributeBlock=frame.slice(frame.indexOf('Frame "BACKDROP" "IconBackdrop1"')),size=Number(attributeBlock.match(/Width ([\d.]+)/)[1])*1200,gap=Number(attributeBlock.match(/SetPoint LEFT, "IconBackdrop1", RIGHT, ([\d.]+)/)[1])*1200;
const world=JSON.parse(fs.readFileSync(path.join(root,'Assets/Scenes/Main.mscene'))).world,byName=new Map(world.entities.map(e=>[e.name,e])),values=new Map(),active=new Map(),storage=new Map(),copy=o=>JSON.parse(JSON.stringify(o));
const engine={findEntitiesByName:names=>world.entities.filter(e=>names.includes(e.name)),network:{poll:()=>[],close(){},send(){}},storage:{load:k=>storage.has(k)?copy(storage.get(k)):null,save:(k,v)=>storage.set(k,copy(v))},setActive:(id,on)=>active.set(id,on),playAudio(){},pushCommandJson:raw=>{const c=JSON.parse(raw);values.set(c.entity+'/'+c.component,c.value);},assets:{sampleNodes:()=>[]}};
const context=vm.createContext({engine});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);vm.runInContext('const infoRestore=Frost.restore;Frost.restore=raw=>{globalThis.infoState=infoRestore(raw);return infoState;};',context);
const S=context.Frost,component=(n,c)=>values.get(byName.get(n).entity+'/'+c)||byName.get(n).components[c],shown=n=>active.get(byName.get(n).entity)??byName.get(n).active,telemetry=()=>JSON.parse(component('Frost telemetry','Text').text);
function tick(input={},dt=.001){engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720],...input};context.onTick(dt);}
const key=k=>{tick({keys:[k],pressedKeys:[k]});tick();},click=(pointer,keys=[])=>{tick({pointer,keys,buttons:[0],pressedButtons:[0]});tick({pointer,keys,releasedButtons:[0]});};
function ui(n,viewport=[1280,720]){const v=H.viewport({viewport}),r=H.rect(component(n,'RectTransform'),{viewport});return [viewport[0]/2+r.x*v.scale,viewport[1]/2+r.y*v.scale];}
function load(s){storage.set('quicksave',copy(s));if(telemetry().mode==='title')key('F1');if(!telemetry().paused)key('F10');click(ui('pauseLoad box'));assert.ok(context.infoState,telemetry().notice);key('Space');return context.infoState;}
function point(u){const t=telemetry(),a=Math.atan2(context.FrostVisual.camera.height,context.FrostVisual.camera.depth);return [640+(u.x-t.camera[0])/t.zoom*360,360+(u.z-t.camera[1])*Math.sin(a)/t.zoom*360];}
const near=(a,b,n)=>assert.ok(Math.abs(a-b)<1e-5,n),separate=(a,b)=>a.x+a.w/2<=b.x-b.w/2||b.x+b.w/2<=a.x-a.w/2||a.y+a.h/2<=b.y-b.h/2||b.y+b.h/2<=a.y-a.h/2;
tick();let s;
for(let heroClass=0;heroClass<4;heroClass++){
 const f=wardenFixture(S,6);f.s.resources=[];f.s.units=[];const h=S.spawn(f.s,'hero',0,0,0,{heroClass,level:6,skillPoints:6,order:{type:'hold'}});h.xp=37;S.visibility(f.s);s=load(f.s);
 const attributes=S.sourceHeroAttributes(s.units[0]);assert.ok(S.sourceHeroUnit(s.units[0]));
 for(const [i,[attribute,skinKey]] of [['strength','HeroStrengthIcon'],['agility','HeroAgilityIcon'],['intelligence','HeroIntelligenceIcon']].entries()){
  assert.equal(shown('HUD Stat '+attribute+' icon'),true);assert.equal(component('HUD Stat '+attribute+' icon','Image').sprite,icons[skinKey]);assert.equal(component('HUD Stat '+attribute+' value','Text').text,String(attributes[attribute]));
  const r=component('HUD Stat '+attribute+' icon','RectTransform'),number=component('HUD Stat '+attribute+' value','RectTransform');near(r.size_delta[0],size,'FDF attribute width');near(r.size_delta[1],size,'FDF attribute height');near(r.anchored_position[0],-114.75+size/2+i*(size+gap),'FDF attribute stride');near(number.anchored_position[0],r.anchored_position[0]+size/2-.007625*1200,'FDF numeric X');near(number.anchored_position[1],r.anchored_position[1]+size/2-.006875*1200,'FDF numeric Y');
 }
 assert.equal(component('HUD Stat Attack icon','Image').sprite,icons.InfoPanelIconDamageHero);assert.equal(component('HUD Stat Armor icon','Image').sprite,icons.InfoPanelIconArmorHero);
 for(const viewport of [[1024,768],[1280,720],[1920,1080],[2560,1080]]){
  tick({viewport});const r=n=>H.rect(component(n,'RectTransform'),{viewport}),v=H.viewport({viewport});
  for(const stat of ['Attack','Armor']){assert.ok(r('HUD Stat '+stat+' value').x-r('HUD Stat '+stat+' value').w/2-(r('HUD Stat '+stat+' icon').x+r('HUD Stat '+stat+' icon').w/2)>=5,'readable icon/text separation');assert.equal(component('HUD Stat '+stat+' value','Text').vertical_overflow,'Truncate');}
  for(const a of ['strength','agility','intelligence'])for(const n of ['Selection title','HUD Stat rank','HUD Stat experience back','HUD Stat Attack icon','HUD Stat Attack value','HUD Stat Armor icon','HUD Stat Armor value','HUD Stat movement'])assert.ok(separate(r('HUD Stat '+a+' icon'),r(n)),a+' stays clear of '+n+' at '+viewport);
  for(const a of ['strength','agility','intelligence']){const p=r('HUD Stat '+a+' icon');assert.ok(p.y+p.h/2<=v.height/2&&p.x-p.w/2>=-v.width/2&&p.x+p.w/2<=v.width/2);}
  for(const n of ['Health','Mana'])near(r(n+' back').h,r('HUD '+n+' value').h,'portrait number fits the bar');
 }
 tick({pointer:ui('HUD Stat strength icon')});assert.match(component('Tooltip text','Text').text,new RegExp('力量: '+attributes.strength));assert.equal(shown('Tooltip panel'),true);
 s.units[0].level=10;tick({},.081);assert.equal(component('HUD Stat agility value','Text').text,String(S.sourceHeroAttributes(s.units[0]).agility));
}
const generic=wardenFixture(S,3,[0,1]);generic.s.resources=[];s=load(generic.s);assert.equal(S.sourceHeroUnit(s.units[0]),false);for(const a of ['strength','agility','intelligence'])assert.equal(shown('HUD Stat '+a+' icon'),false,'generic heroes have no fabricated attributes');near(component('HUD Stat movement','RectTransform').size_delta[0],byName.get('HUD Stat movement').components.RectTransform.size_delta[0],'ordinary footer is restored');
const hall=S.spawn(s,'hall',0,10,0,{queue:[{kind:'worker',left:10}]});S.visibility(s);tick();click(point(hall));assert.deepEqual(telemetry().selected,[hall.id]);assert.equal(shown('HUD Stat movement'),false,'multiline production queue owns the footer');assert.ok(component('Selection queue','Text').text.includes('\n'));
const a=S.spawn(s,'soldier',0,-3,0,{order:{type:'hold'}}),b=S.spawn(s,'soldier',0,3,0,{order:{type:'hold'}});S.visibility(s);tick();click(point(a));assert.equal(shown('HUD Stat strength icon'),false);assert.equal(component('HUD Stat Attack icon','Image').sprite,icons.InfoPanelIconDamageNormal);click(point(b),['ShiftLeft']);assert.equal(telemetry().selected.length,2);assert.equal(shown('HUD Stat Attack icon'),false);assert.equal(shown('HUD Stat strength icon'),false);assert.equal(shown('HUD Selected 0'),true);
const neutral=S.spawn(s,'neutral',-1,8,-3,{order:{type:'hold'}});S.visibility(s);tick();click(point(neutral));assert.equal(component('HUD Stat Attack icon','Image').sprite,icons.InfoPanelIconDamageNormalNeutral);assert.equal(shown('HUD Stat movement'),true,'movement returns after selecting an ordinary unit');
key('F10');key('KeyX');key('F4');assert.equal(telemetry().mode,'editor');assert.equal(shown('HUD Stat strength icon'),false);assert.equal(shown('Selection stats'),true);
console.log('PASS signed information-card assets, source FDF offsets, all four source heroes, level updates, four viewports, attribute hover and hero/unit/multiselection/editor transitions');
