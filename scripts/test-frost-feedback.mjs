// Author: MiYu. Real client commands retain combat feedback across simulation ticks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../samples/frostbound-realms/',import.meta.url),source=['simulation','terrain','visuals','client'].map(name=>fs.readFileSync(new URL('game/'+name+'.js',root),'utf8')).join('\n'),world=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,catalog=JSON.parse(fs.readFileSync(new URL('model-catalog.json',root)));
function client(){
  const commands=[],inbox=[],engine={snapshot:structuredClone(world),network:{poll:()=>inbox.splice(0),close(){},send(){},connect(){}},storage:{load:()=>null,save(){}},setActive(){},playAudio(){},pushCommandJson:command=>commands.push(JSON.parse(command))};
  const buttons=world.entities.filter(e=>/^action\d+ box$/.test(e.name)).map(e=>{const r=e.components.RectTransform;return {id:e.name.split(' ')[0],group:'hud',x:r.anchored_position[0],y:r.anchored_position[1],w:r.size_delta[0],h:r.size_delta[1]};});
  const context=vm.createContext({engine,FrostArt:catalog,FrostPortraitViews:Object.fromEntries(JSON.parse(fs.readFileSync(new URL('head-portraits.json',root))).views.map(v=>[v.key,v])),FrostButtons:buttons});vm.runInContext(source,context);
  vm.runInContext(`const createFeedback=Frost.create;Frost.create=(mode,options)=>{const s=createFeedback(mode,options);if(mode!=='moba')return s;s.units=[];s.resources=[];s.map.terrain.fill(0);s.nextWave=100000;s.teams.forEach(t=>t.ai=false);const h=Frost.spawn(s,'hero',0,0,0,{heroClass:3}),c=Frost.spawn(s,'creep',0,0,1,{hp:1,damage:0,speed:0});h.order={type:'attack',target:c.id};globalThis.feedbackState=s;Frost.visibility(s);return s;};`,context);
  const tick=(dt,keys=[])=>{engine.input={keys:[],pressedKeys:keys,releasedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};context.onTick(dt);};
  return {context,commands,inbox,tick};
}
{
  const {context,commands,tick}=client();tick(.01);commands.length=0;tick(.2,['F2']);assert.equal(context.feedbackState.frame,2);assert.equal(context.feedbackState.corpses.length,1);
  assert.equal(commands.filter(c=>c.component==='Text'&&c.value.text==='DENY').length,1,'first-tick deny must render even if a second tick follows in the same frame');
  commands.length=0;tick(.05);assert.equal(commands.filter(c=>c.component==='Text'&&c.value.text==='DENY').length,0,'feedback is not emitted again');
}
for(const hidden of [false,true]){
  const {context,commands,inbox,tick}=client();tick(.01);tick(.01,['Enter']);tick(.01,['F2']);
  const states=vm.runInContext(`(()=>{const s=Frost.create('moba');Frost.tick(s);const first=Frost.publicState(s,0);Frost.tick(s);return [first,Frost.publicState(s,0)];})()`,context);
  if(hidden)states[0].visible[0].fill(0);
  inbox.push({type:'connected'},...([{type:'joined',team:0,code:'TEST',token:'token',state:states[0]},{type:'state',state:states[0]},{type:'state',state:states[1]}].map(data=>({type:'message',data}))));commands.length=0;tick(.1);
  assert.equal(commands.filter(c=>c.component==='Text'&&c.value.text==='DENY').length,hidden?0:1,'batched network states retain visible feedback once and respect visibility at receipt');
}
console.log('PASS: client retains one deny label across two simulation ticks or batched/duplicate network states, with fog filtering at receipt');
