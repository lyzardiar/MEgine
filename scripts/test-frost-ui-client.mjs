// Author: MiYu. Generated hierarchical UI preserves presentation and blocks covered controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),UI=createRequire(import.meta.url)('../samples/frostbound-realms/game/ui-manager.js');
const previous=file=>execFileSync('git',['show','0b6a136e895940d08258b488abccdae2e0c85f8b:samples/frostbound-realms/'+file],{encoding:'utf8',maxBuffer:32*1024*1024});
function fixture(source,scene){
  const world=clientWorldFixture(scene),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){}}),context=vm.createContext({engine});
  source=source.replace('function show(n,on){','function show(n,on){globalThis.uiVisits++;');
  source=source.replace('  return {tick};',"  return {tick,render,configure:cfg=>{mode=cfg.mode;paused=cfg.paused;selected=[state.units.find(u=>u.kind==='worker'&&u.team===team).id];rename=cfg.rename?{entry:-1}:null;},camera:()=>[...camera],mode:()=>mode,ui:()=>typeof uiManager==='undefined'?null:uiManager};");
  vm.runInContext(source,context);context.onTick(0);world.commit();
  return {world,context,render(mode,viewport,paused=false,rename=false){context.uiVisits=0;context.FrostClient.configure({mode,paused,rename});context.FrostClient.render({keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[0,0],viewport});world.commit();}};
}
const before=fixture(previous('Assets/Scripts/Main.js'),JSON.parse(previous('Assets/Scenes/Main.mscene')).world),after=fixture(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world);
function visible(world,e){while(e){if(e.active===false)return false;e=world.snapshot.entities.find(p=>p.entity===e.parent);}return true;}
function canvas(world,e){if(!e||e.components.Canvas)return {anchor_min:[0,0],anchor_max:[1,1],pivot:[.5,.5],anchored_position:[0,0],size_delta:[0,0]};const p=canvas(world,world.snapshot.entities.find(p=>p.entity===e.parent));return e.components.RectTransform?UI.compose(p,e.components.RectTransform):p;}
let comparisons=0,oldVisits=0,newVisits=0;
for(const viewport of [[1280,720],[1920,720],[960,900]])for(const [mode,paused,rename] of [['title'],['single'],['custom'],['options'],['credits'],['quit'],['network'],['rooms'],['lobby'],['playing'],['playing',true],['editor'],['editor',false,true],['playing'],['editor'],['playing'],['title']]){
  before.render(mode,viewport,paused,rename);after.render(mode,viewport,paused,rename);oldVisits+=before.context.uiVisits;newVisits+=after.context.uiVisits;
  const v=after.context.FrostHUD.viewport({viewport},['playing','finished','reconnecting','editor'].includes(mode));
  for(const old of before.world.snapshot.entities){
    if(!old.components.RectTransform||old.components.Canvas)continue;const next=after.world.entity(old.name);assert.ok(next,old.name);
    assert.equal(visible(after.world,next),visible(before.world,old),`${mode} ${viewport} visibility ${old.name}`);
    if(!visible(before.world,old))continue;
    const a=UI.rectangle(canvas(before.world,old),[v.width,v.height]),b=UI.rectangle(canvas(after.world,next),[v.width,v.height]);
    for(const key of ['x','y','w','h'])assert.ok(Math.abs(a[key]-b[key])<.001,`${mode} ${viewport} ${old.name} ${key}: ${a[key]} != ${b[key]}`);
    comparisons++;
  }
  const ui=after.context.FrostClient.ui();
  if(mode==='playing'&&paused){assert.equal(ui.interactive('hudMenu'),false);assert.equal(ui.interactive('pauseResume'),true);}
  if(mode==='title'){assert.equal(ui.interactive('solo'),true);assert.equal(ui.interactive('mapStart'),false);}
  if(rename)assert.equal(ui.interactive('action0'),false);
}
const source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),editedScene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const moved=editedScene.entities.find(e=>e.name==='UI Control solo').components.RectTransform;moved.anchored_position[0]-=120;moved.anchored_position[1]+=32;moved.size_delta[0]+=30;
editedScene.entities.find(e=>e.name==='UI BattleHUD / Minimap').active=false;
const edited=fixture(source,editedScene),manager=edited.context.FrostClient.ui(),button=manager.buttonRect('solo');
assert.equal(button.x,moved.anchored_position[0]);assert.equal(button.w,moved.size_delta[0]);
edited.world.engine.input={keys:[],pressedKeys:[],buttons:[0],pressedButtons:[0],releasedButtons:[],pointer:[640+button.x,360+button.y],viewport:[1280,720]};
edited.world.render(dt=>edited.context.onTick(dt),0);assert.equal(edited.context.FrostClient.mode(),'single','edited control bounds drive native-style input');
edited.render('playing',[1280,720]);assert.equal(manager.visible('Minimap'),false);assert.equal(manager.visible('Mini tile 0'),false);assert.equal(manager.visible('Mini unit 0'),false);
const cameraBefore=edited.context.FrostClient.camera(),v=edited.context.FrostHUD.viewport({viewport:[1280,720]}),mini=UI.rectangle(edited.world.canvasRect('Minimap'),[v.width,v.height]);
edited.world.engine.input={...edited.world.engine.input,pointer:[640+(mini.x+mini.w/4)*v.scale,360+mini.y*v.scale]};edited.world.render(dt=>edited.context.onTick(dt),0);assert.deepEqual(edited.context.FrostClient.camera(),cameraBefore,'hidden minimap cannot move the camera');
assert.ok(newVisits<oldVisits);
console.log(JSON.stringify({passed:true,comparisons,viewports:3,transitions:51,visibilityVisits:{before:oldVisits,after:newVisits}}));
