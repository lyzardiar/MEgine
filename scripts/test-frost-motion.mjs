// Author: MiYu. Frame-level movement, walking, picking and pause use the live game client.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../samples/frostbound-realms/',import.meta.url),world=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const source=['simulation','terrain','visuals','client'].map(n=>fs.readFileSync(new URL('game/'+n+'.js',root),'utf8')).join('\n'),commands=[],current=new Map(),active=new Map(),inbox=[];
const engine={snapshot:JSON.parse(JSON.stringify(world)),network:{poll:()=>inbox.splice(0),close(){},send(){},connect(){}},storage:{load:()=>null,save(){}},setActive:(id,on)=>active.set(id,on),playAudio(){},pushCommandJson:raw=>{const c=JSON.parse(raw);commands.push(c);current.set(c.entity+'/'+c.component,c.value);}};
const context=vm.createContext({engine,FrostArt:JSON.parse(fs.readFileSync(new URL('model-catalog.json',root))),FrostPortraitViews:Object.fromEntries(JSON.parse(fs.readFileSync(new URL('head-portraits.json',root))).views.map(v=>[v.key,v])),FrostButtons:[]});vm.runInContext(source,context);
vm.runInContext(`const motionCreate=Frost.create;Frost.create=(mode,options)=>{const s=motionCreate(mode,options);if(mode!=='skirmish')return s;s.map.terrain.fill(0);s.map.heights.fill(0);s.map.ramps.fill(0);s.resources=[];const h=Frost.spawn(s,'hero',0,0,0);s.units=[h];h.x=0;h.z=0;h.order={type:'move',x:8,z:0};s.teams.forEach(t=>t.ai=false);Frost.visibility(s);globalThis.motionState=s;return s;};`,context);
const tick=(dt,pressedKeys=[],pointer=[640,360],pressedButtons=[],releasedButtons=[],keys=[])=>{engine.input={keys,pressedKeys,releasedKeys:[],buttons:[],pressedButtons,releasedButtons,pointer,viewport:[1280,720]};context.onTick(dt);};
const entity=name=>world.entities.find(e=>e.name===name).entity,value=(name,component)=>current.get(entity(name)+'/'+component),model=()=>value('Unit 0','Transform').position,mesh=()=>value('Unit 0','MeshRenderer').mesh,telemetry=()=>JSON.parse(value('Frost telemetry','Text').text);
tick(.01);tick(.01,['F1']);commands.length=0;const positions=[],poses=[];
for(let i=0;i<60;i++){tick(1/60);positions.push(model()[0]);poses.push(mesh());assert.ok(model()[0]<=context.motionState.units[0].x+1e-9,'presentation never predicts ahead of authority');}
assert.ok(positions.filter((x,i)=>i&&x>positions[i-1]).length>40,'movement progresses on render frames between simulation ticks');
assert.ok(positions.every((x,i)=>!i||x>=positions[i-1]),'interpolation never runs backwards');
assert.ok(new Set(poses).size>=25,'world bodies sample at least 25 distinct poses per second');assert.ok(poses.every(p=>p.endsWith('@30')),'world poses request native 30 Hz sampling');
for(let i=0;i<8;i++){tick(1/60);assert.match(mesh(),/#pose=1:/,'walking clip persists between authoritative ticks');}
const unit=context.motionState.units[0],visual=model(),camera=value('Strategy camera','Transform').position,zoom=value('Strategy camera','Camera3D').orthographic_size,pitch=Math.atan2(32,42),pointer=[640+(visual[0]-camera[0])/zoom*360,360+((visual[2]-(camera[2]-42))*Math.sin(pitch)-visual[1]*Math.cos(pitch))/zoom*360];
tick(.001,[],pointer,[0]);tick(.001,[],pointer,[],[0]);assert.equal(telemetry().selected[0],unit.id,'input refreshes the HUD and picks the rendered unit');
tick(.001,['Escape']);const paused=model(),pausedMesh=mesh();for(let i=0;i<12;i++)tick(1/60);assert.deepEqual(model(),paused);assert.equal(mesh(),pausedMesh,'paused models and poses freeze');
tick(.001,['Escape']);const beforeCamera=value('Strategy camera','Transform').position[0];tick(1/60,[],pointer,[],[],['ArrowRight']);assert.ok(value('Strategy camera','Transform').position[0]>beforeCamera,'camera pans without waiting for the HUD interval');
tick(.001,['F10']);tick(.001,['KeyX']);tick(.001,['F1']);assert.ok(model()[0]<.01,'new games discard prior interpolation and walking history');
const snapshot=vm.runInContext('Frost.publicState(motionState,0)',context),send=(frame,x,hp=snapshot.units[0].maxHp,joined=false)=>{const s=JSON.parse(JSON.stringify(snapshot));s.frame=frame;s.units[0].x=x;s.units[0].hp=hp;inbox.push({type:'message',data:joined?{type:'joined',team:0,code:'TEST',token:'token',state:s}:{type:'state',state:s}});tick(.001);};
send(20,0,undefined,true);send(21,.45);tick(.04);assert.ok(model()[0]>0&&model()[0]<.45,'network states interpolate without predicting ahead');
send(22,.45,0);assert.equal(active.get(entity('Unit 0')),false,'dead or hidden network units disappear');
send(23,10);assert.equal(model()[0],10,'reappearing units discard hidden tracks');
send(3,-4);assert.equal(model()[0],-4,'rewound snapshots discard future positions');
send(8,4);assert.equal(model()[0],4,'snapshot gaps snap to authoritative position');
send(8,12);assert.equal(model()[0],12,'blink teleports snap even within the same authoritative tick');
send(8,-12,undefined,true);assert.equal(model()[0],-12,'joining or resuming clears reused unit history');
console.log('PASS: per-frame movement, walking, picking, immediate HUD, pause, camera, new-game reset, network interpolation, hidden units, snapshot rewind/gap, blink and rejoin');
