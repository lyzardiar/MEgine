// Author: MiYu. Authoritative clock, visibility transitions, neutral rest and persistence.
import assert from 'node:assert/strict';
import {battleFixture} from './frost-battle-fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function game(hour=8){const map=S.defaultMap();map.startingHour=hour;map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{blademasterVersion:0,archmageVersion:0,bloodMageVersion:0,map});s.units=[];return s;}
for(const [frame,hour,night] of [[0,8,false],[1999,17.995,false],[2000,18,true],[3200,0,true],[4399,5.995,true],[4400,6,false],[4800,8,false]]){const s=game();s.frame=frame;assert.ok(Math.abs(S.timeOfDay(s)-hour)<1e-9);assert.equal(S.isNight(s),night);assert.ok(S.daylight(s)>=0&&S.daylight(s)<=1);}
for(const bad of [-1,24,8.5,NaN,'8'])assert.throws(()=>S.validateMap({...S.defaultMap(),startingHour:bad}),/starting hour/);
{const old=S.defaultMap();delete old.startingHour;assert.equal(S.validateMap(old).startingHour,8);assert.equal(S.timeOfDay(battleFixture(S,'skirmish',{map:{...old,startingHour:22}},['hero','barracks','farm','guard','harvest'])),22);}
{
 const s=game(),hero=S.spawn(s,'hero',0,-6,0,{damage:0,order:{type:'hold'}}),enemy=S.spawn(s,'hero',1,4,0,{damage:0,order:{type:'hold'}});s.frame=1999;S.visibility(s);assert.ok(S.isVisible(s,0,enemy));S.tick(s);assert.ok(!S.isVisible(s,0,enemy),'dusk updates sight on the first night tick');assert.equal(s.explored[0][S.index(enemy.x,enemy.z)],1);assert.ok(!S.publicState(s,0).units.some(u=>u.id===enemy.id));assert.ok(S.command(s,0,{type:'attack',ids:[hero.id],target:enemy.id}));
 s.frame=4399;S.visibility(s);S.tick(s);assert.ok(S.isVisible(s,0,enemy),'dawn updates sight on the first day tick');
 const copy=S.clone(s);copy.frame=2000;assert.ok(!S.isVisible(S.restore(copy),0,enemy),'restore recomputes night visibility');
}
{
 const s=game(22),hero=S.spawn(s,'hero',0,-6,0,{heroClass:2,damage:10}),guard=S.spawn(s,'neutral',-1,-2,0,{home:[-2,0]}),ally=S.spawn(s,'neutral',-1,1,0,{home:[1,0]}),far=S.spawn(s,'neutral',-1,20,20,{home:[20,20]});S.visibility(s);step(s,4);assert.ok(S.asleep(s,guard));assert.equal(guard.hp,guard.maxHp,'idle troops do not acquire sleeping camps');assert.equal(hero.hp,hero.maxHp,'sleeping guard ignores proximity');
 assert.equal(S.command(s,0,{type:'attack',ids:[hero.id],target:guard.id}),null);step(s,4);assert.ok(!S.asleep(s,guard));assert.ok(guard.hp<guard.maxHp);assert.ok(ally.awakeUntil>s.frame);assert.ok(S.asleep(s,far));
 const copy=S.restore(s);step(s,5);step(copy,5);assert.deepEqual(copy.units,s.units);assert.deepEqual(copy.visible,s.visible);
 hero.x=-25;hero.z=-25;hero.order={type:'hold'};step(s,120);assert.ok(S.asleep(s,guard));assert.ok(S.asleep(s,ally));
 for(const awakeUntil of [-1,NaN,1.5]){const invalid=S.clone(s);invalid.units.find(u=>u.id===guard.id).awakeUntil=awakeUntil;assert.throws(()=>S.restore(invalid),/wake time/);}
 guard.order={type:'attackMove',x:-10,z:0};assert.ok(!S.asleep(s,guard),'map-scripted orders remain active');
 const legacy=S.clone(s);delete legacy.units.find(u=>u.id===guard.id).awakeUntil;S.restore(legacy);
}
{
 const s=game(22),hall=S.spawn(s,'hall',0,0,0),tower=S.spawn(s,'tower',0,0,0);S.visibility(s);assert.equal(s.visible[0][S.index(8,0)],1);s.units=[hall];S.visibility(s);assert.equal(s.visible[0][S.index(8,0)],0,'towers retain more night sight than ordinary units');
}
{
 const root=new URL('../samples/frostbound-realms/',import.meta.url),world=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,commands=[],context=vm.createContext({engine:{snapshot:world,setActive(){},playAudio(){},storage:{load(){},save(){}},network:{poll:()=>[],close(){}},pushCommandJson:c=>commands.push(JSON.parse(c))}});vm.runInContext(fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),context);
 vm.runInContext("const createNight=Frost.create;Frost.create=(mode,options={})=>{const map=Frost.defaultMap(mode);map.startingHour=22;return createNight(mode,{...options,map});};",context);
 const tick=keys=>{context.engine.input={keys:[],pressedKeys:keys,buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};context.onTick(.1);};tick([]);tick(['F1']);const light=commands.findLast(c=>c.component==='DirectionalLight');assert.equal(light.value.intensity,.65);assert.ok(commands.some(c=>c.component==='Image'&&c.value.material==='Assets/Materials/DayNightDial.mmat'&&Math.abs(c.value.color[0]-22/24)<.01&&c.value.color[1]===0));commands.length=0;tick(['F10']);tick(['KeyX']);assert.equal(commands.find(c=>c.component==='DirectionalLight').value.intensity,2,'title restores authored daylight');
}
console.log('PASS: 480-second clock, starting-hour validation/editor data, exact dusk/dawn sight, fog privacy, neutral sleep/group wake/return to rest, scripted orders, saves and client night lighting/title reset');
