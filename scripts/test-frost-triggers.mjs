// Author: MiYu. Event chains, atomic actions, repeating schedules and authored regions.
import assert from 'node:assert/strict';
import {battleFixture} from './frost-battle-fixture.mjs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const c=(when='timer',value=1,extra={})=>({when,value,team:0,region:-1,kind:'*',...extra});
const a=(action='gold',value=10,extra={})=>({action,value,team:0,region:-1,kind:'archer',text:'Event fired',...extra});
const t=(conditions=[c()],actions=[a()],extra={})=>({name:'Test',x:-10,z:15,after:-1,conditions,actions,...extra});
const game=triggers=>{const map=S.defaultMap();map.triggers=triggers;map.regions=[{name:'Pass',x:-10,z:15,width:8,height:8}];const s=battleFixture(S,'skirmish',{map,ai:[false,false]},['hero','barracks','farm','guard','harvest']);for(const u of s.units)u.order=null;return s;};
{
  const s=game([t([c('timer',1),c('gold',550)],[a('gold',100),a('wood',50)]),t([c('delay',2)],[a('message',1,{text:'Chain complete'})],{after:0})]);step(s,20);assert.equal(s.triggered.length,0,'all conditions must pass');s.teams[0].gold=550;S.tick(s);assert.equal(s.teams[0].gold,650);assert.equal(s.teams[0].wood,300);step(s,19);assert.equal(s.triggered.length,1,'delay is relative to prerequisite firing');S.tick(s);assert.equal(s.announcements[0],'Chain complete');assert.deepEqual(s.triggered,[0,1]);
}
{
  let s=game([t([c('timer',1),c('gold',600)],[a('gold',7)],{logic:'any',limit:3,interval:2})]);step(s,10);assert.equal(s.teams[0].gold,507);s=S.restore(s);step(s,19);assert.equal(s.triggerState[0].count,1);S.tick(s);assert.equal(s.triggerState[0].count,2);step(s,50);assert.equal(s.triggerState[0].count,3);assert.equal(s.teams[0].gold,521);assert.deepEqual(s.triggered,[0]);const broken=S.clone(s);broken.triggerState[0].count=99;assert.throws(()=>S.restore(broken));
}
{
  const s=game([t([c('timer',1)],[a('gold',40),a('spawn',3,{region:0}),a('wood',60)])]);while(s.units.length<S.LIMIT-1)S.spawn(s,'worker',1,20,-20);step(s,10);assert.equal(s.teams[0].gold,500,'full spawn batch prevents partial reward');assert.equal(s.triggered.length,0);s.units.splice(-4);S.tick(s);assert.equal(s.teams[0].gold,540);assert.equal(s.teams[0].wood,310);assert.equal(s.triggerState[0].count,1);assert.equal(s.units.filter(u=>u.team===0&&u.kind==='archer').length,3);assert.ok(s.units.filter(u=>u.team===0&&u.kind==='archer').every(u=>Math.abs(u.x+10)<=4&&Math.abs(u.z-15)<=4));
}
{
  const s=game([t([c()],[a('attackMove',1),a('spawn',1)])]);step(s,10);assert.equal(s.units.at(-1).order,null,'actions execute in authored order');
  const ordered=game([t([c()],[a('spawn',1),a('attackMove',1)])]);step(ordered,10);assert.equal(ordered.units.at(-1).order.type,'attackMove');
}
{
  const s=game([t([c('enter',1,{region:0,kind:'hero'}),c('units',2,{region:0,kind:'archer'})],[a('gold',20)]),t([c('clear',1,{team:1,region:0})],[a('heal',50,{region:0}),a('message')],{after:0})]);const hero=s.units.find(u=>u.kind==='hero'&&u.team===0);hero.x=-10;hero.z=15;hero.hp-=100;S.spawn(s,'archer',0,-9,15);step(s,1);assert.equal(s.triggered.length,0);S.spawn(s,'archer',0,-11,15);const hp=hero.hp;S.tick(s);assert.deepEqual(s.triggered,[0,1]);assert.equal(hero.hp,hp+50);const publicState=S.publicState(s,0);assert.deepEqual(publicState.map.regions,[]);assert.equal(publicState.triggerState,undefined);assert.equal(publicState.announcements[0],'Event fired');assert.equal(S.publicState(s,1).announcements[0],'','opponents cannot read targeted messages');
}
{
  const map=S.eventMap();assert.deepEqual(S.validateMap(JSON.parse(JSON.stringify(map))),map);assert.throws(()=>S.removeRegion(map,0),/Reassign/);assert.throws(()=>S.removeTrigger(map,0),/Reassign/);S.removeTrigger(map,2);assert.equal(map.triggers.length,2);S.removeTrigger(map,1);S.removeTrigger(map,0);S.removeRegion(map,0);assert.equal(map.regions[0].name,'Mountain pass');
  const base=game([t()]).map;for(const patch of [{after:0},{limit:0},{interval:0},{conditions:[]},{actions:[a('spawn',33)]},{conditions:[c('enter',1,{region:2})]}])assert.throws(()=>S.validateMap({...base,triggers:[{...base.triggers[0],...patch}]}));assert.throws(()=>S.validateMap({...base,regions:[{...base.regions[0],width:100}]}));
  const legacy=game([]);legacy.map.triggers=[{when:'timer',action:'gold',team:0,value:1,after:-1,x:0,z:0}];delete legacy.triggerState;const migrated=S.restore(legacy);step(migrated,15);assert.equal(migrated.teams[0].gold,501);
}
{
  const s=battleFixture(S,'skirmish',{map:S.eventMap(),ai:[false,false]},['hero','barracks','farm','guard','harvest']),h=s.units.find(u=>u.kind==='hero'&&u.team===0);step(s,60);assert.equal(S.command(s,0,{type:'move',ids:[h.id],x:-8,z:4}),null);step(s,200);assert.deepEqual(s.triggered,[0,1,2],'Supply Road chain completes using legal movement and authored orders');assert.match(s.announcements[0],/Escort complete/);
}
console.log('PASS: region filters, all/any conditions, atomic ordered actions, saved repeat clocks, relative delays, dependency edits, legacy maps and legal Supply Road chain');

{
  const map=S.eventMap(),name='中'.repeat(39)+'😀尾',text='字'.repeat(119)+'😀尾';map.name=name;map.regions[0].name=name;map.triggers[0].name=name;map.triggers[0].actions[0].text=text;
  const validated=S.validateMap(map);assert.equal(validated.name,'中'.repeat(39)+'😀');assert.equal(validated.regions[0].name,validated.name);assert.equal(validated.triggers[0].name,validated.name);assert.equal(validated.triggers[0].actions[0].text,'字'.repeat(119)+'😀');assert.deepEqual(S.validateMap(JSON.parse(JSON.stringify(validated))),validated);
}
