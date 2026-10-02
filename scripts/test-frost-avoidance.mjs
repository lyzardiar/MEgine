// Author: MiYu. Verify real movement separation, crowd arrival and deterministic saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function game(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.props=[];map.units=[];map.triggers=[];const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];return s;}
const radius=u=>S.types[u.kind].flying?1:S.types[u.kind].attack==='siege'?.9:S.types[u.kind].model==='knight'?.7:.5;
const order=(s,us,x,z)=>{assert.equal(S.command(s,0,{type:'move',ids:us.map(u=>u.id),x,z}),null);return us.map(u=>({id:u.id,x:u.order.x,z:u.order.z}));};
function separate(us,frame){for(let i=0;i<us.length;i++)for(let j=0;j<i;j++)if(!!S.types[us[i].kind].flying===!!S.types[us[j].kind].flying)assert.ok(S.distance(us[i],us[j])>=radius(us[i])+radius(us[j])-.001,JSON.stringify({overlap:[us[i].id,us[j].id],distance:S.distance(us[i],us[j]),frame}));}
function advance(s,n){for(let i=0;i<n;i++){S.tick(s);separate(s.units.filter(u=>u.hp>0&&S.types[u.kind].speed),s.frame);}}
function arrived(s,goals){for(const p of goals){const u=s.units.find(u=>u.id===p.id);assert.equal(u.order,null,JSON.stringify({id:u.id,at:[u.x,u.z],goal:p,order:u.order}));assert.ok(S.distance(u,p)<.13);}}
{
 const s=game(),a=Array.from({length:6},(_,i)=>S.spawn(s,'soldier',0,-12,i*2-5,{damage:0})),b=Array.from({length:6},(_,i)=>S.spawn(s,'soldier',0,12,i*2-5,{damage:0}));
 const targets=[...order(s,a,12,0),...order(s,b,-12,0)];advance(s,40);const copy=S.restore(s);advance(s,220);advance(copy,220);arrived(s,targets);assert.deepEqual(s.units,copy.units,'crowd decisions survive a mid-crossing save exactly');
}
{
 const s=game(),u=S.spawn(s,'soldier',0,-8,0,{damage:0}),v=S.spawn(s,'soldier',0,0,0,{damage:0});S.command(s,0,{type:'hold',ids:[v.id]});const targets=order(s,[u],8,0);advance(s,120);arrived(s,targets);assert.deepEqual([v.x,v.z],[0,0],'hold is never pushed by traffic');
 const goals=order(s,[u],0,0);assert.ok(S.distance(goals[0],v)>1.29,'a held ally reserves its occupied destination');advance(s,100);arrived(s,goals);
}
{
 const s=game();for(let z=0;z<32;z++)for(let x=14;x<=17;x++)if(z!==16)s.map.terrain[z*32+x]=1;
 const us=Array.from({length:8},(_,i)=>S.spawn(s,'soldier',0,-12-i%4*2,-1+Math.floor(i/4)*2,{damage:0}));const targets=order(s,us,12,1);advance(s,450);arrived(s,targets);
}
{
 const s=game(),a=S.spawn(s,'dragon',0,-9,0,{damage:0}),b=S.spawn(s,'dragon',0,9,0,{damage:0}),ground=S.spawn(s,'soldier',0,0,0,{damage:0});S.command(s,0,{type:'hold',ids:[ground.id]});const goals=[...order(s,[a],9,0),...order(s,[b],-9,0)];advance(s,100);arrived(s,goals);assert.deepEqual([ground.x,ground.z],[0,0]);
}
{
 const s=game(),target=S.spawn(s,'soldier',1,0,0,{damage:0,hp:100000,maxHp:100000}),us=Array.from({length:10},(_,i)=>S.spawn(s,'soldier',0,-10+i*2,-8));S.command(s,1,{type:'hold',ids:[target.id]});S.visibility(s);assert.equal(S.command(s,0,{type:'attack',ids:us.map(u=>u.id),target:target.id}),null);
 const hit=new Set();for(let i=0;i<200;i++){advance(s,1);for(const u of us)if(u.cd>.9)hit.add(u.id);}assert.equal(hit.size,us.length,'each melee attacker finds room to strike');assert.deepEqual([target.x,target.z],[0,0]);
}
{
 const s=game();for(let z=0;z<32;z++)for(let x=14;x<=17;x++)if(z!==16)s.map.terrain[z*32+x]=1;
 const a=S.spawn(s,'soldier',0,-10,1,{damage:0}),b=S.spawn(s,'soldier',0,10,1,{damage:0}),goals=[...order(s,[a],10,1),...order(s,[b],-10,1)];advance(s,200);arrived(s,goals);
}
{
 const s=game(),u=S.spawn(s,'worker',0,-24,24,{damage:0}),enemy=S.spawn(s,'soldier',1,24,-24,{damage:0});S.command(s,1,{type:'hold',ids:[enemy.id]});S.visibility(s);const copy=S.restore(s);copy.units=copy.units.filter(v=>v.id!==enemy.id);order(s,[u],20,-20);order(copy,copy.units,20,-20);for(let i=0;i<15;i++){S.tick(s);S.tick(copy);assert.deepEqual(S.publicState(s,0).units,S.publicState(copy,0).units,'unseen traffic does not alter public paths');}
}
{
 const s=game();s.mode='td';s.nextWave=10000;const us=Array.from({length:7},(_,i)=>S.spawn(s,'creep',1,-25-i*.25,-24,{damage:0,route:S.tdPath,waypoint:1,td:true}));
 for(let i=0;i<100;i++)S.tick(s);assert.ok(us.every(u=>u.x>-5),'old tightly stacked TD waves escape their initial overlap');separate(us,s.frame);
}
{
 const s=game(),base=S.spawn(s,'hall',0,0,0,{damage:0}),u=S.spawn(s,'hero',0,0,0,{damage:0});const goals=order(s,[u],10,0);advance(s,90);arrived(s,goals);assert.equal(base.hp,base.maxHp,'respawned hero can leave its base footprint');
}
{
 const s=game(),us=Array.from({length:12},(_,i)=>S.spawn(s,'soldier',0,-20+i%4*1.2,-20+Math.floor(i/4)*1.2,{damage:0}));order(s,us,10,10);
 for(let i=0;i<150;i++){const before=us.map(u=>({x:u.x,z:u.z}));advance(s,1);us.forEach((u,j)=>assert.ok(S.distance(u,before[j])<=u.speed*S.DT+.00001,'avoidance respects movement speed'));}
}
{
 const s=game(),us=Array.from({length:6},(_,i)=>S.spawn(s,'soldier',0,-12,12+i*1.6)),copy=S.restore(s),a=order(s,us,-2,16),b=order(copy,copy.units,-2+1e-12,16-1e-12);assert.ok(a.every((p,i)=>S.distance(p,b[i])<1e-6),'subpixel picking noise does not reverse a tied marching row');
}
{
 const s=game(),a=Array.from({length:4},(_,i)=>S.spawn(s,'soldier',0,-10,i*2,{damage:0})),b=Array.from({length:4},(_,i)=>S.spawn(s,'soldier',0,10,i*2,{damage:0}));order(s,a,0,0);order(s,b,0,0);advance(s,200);assert.ok(s.units.every(u=>!u.order&&Math.hypot(u.x,u.z)<6),'separate squads resolve newly occupied goals and both finish');
}
{
 const s=game();s.mode=s.map.mode='td';s.map.waves=30;s.wave=29;s.nextWave=0;advance(s,1);assert.equal(s.units.length+s.tdPending.length,65);const copy=S.restore(s);advance(s,100);advance(copy,100);assert.deepEqual(s.units,copy.units);assert.deepEqual(s.tdPending,copy.tdPending);assert.ok(s.units.every(u=>Math.abs(u.x)<=30&&Math.abs(u.z)<=30),'largest authored wave stays inside the map');const invalid=S.clone(s);invalid.tdPending=[{hp:100,speed:-1,tdBoss:false}];assert.throws(()=>S.restore(invalid),/entrance queue/);const old=S.clone(game());delete old.tdPending;assert.deepEqual(S.restore(old).tdPending,[]);
}
{
 const s=game(),hall=S.spawn(s,'hall',0,0,0),workers=Array.from({length:12},(_,i)=>S.spawn(s,'worker',0,Math.cos(i*Math.PI/6)*4,Math.sin(i*Math.PI/6)*4));S.spawn(s,'farm',0,20,20);S.command(s,0,{type:'hold',ids:workers.map(u=>u.id)});assert.equal(S.command(s,0,{type:'train',ids:[hall.id],kind:'worker'}),null);advance(s,45);assert.equal(hall.queue.length,1,'blocked exit waits without stacking the trained unit');assert.equal(s.units.length,14);order(s,[workers[0]],12,0);advance(s,45);assert.equal(hall.queue.length,0);assert.equal(s.units.length,15,'production finishes once an exit is clear');
}
console.log('PASS: opposing traffic, hold, narrow passage/head-on, flying layers, exact saves, melee surround, fog privacy, stacked TD recovery, base exit and speed limits');

if(process.argv.includes('--benchmark')){
 const rows=[];for(const count of [20,40,80]){const timings=[];for(let run=0;run<13;run++){const s=game(),us=Array.from({length:count},(_,i)=>S.spawn(s,'soldier',0,-20+i%10*1.2,-20+Math.floor(i/10)*1.2,{damage:0}));for(let i=0;i<count;i+=40)order(s,us.slice(i,i+40),20,20);const start=performance.now();S.tick(s);if(run>=3)timings.push(performance.now()-start);}timings.sort((a,b)=>a-b);rows.push({units:count,medianMs:(timings[4]+timings[5])/2,maxMs:timings[9]});}
 const report={scope:'Node CPU, first dense marching tick; 3 warmups and 10 independent scenes per size. Not native frame time.',node:process.version,checkedAt:new Date().toISOString(),rows};const fs=await import('node:fs');fs.writeFileSync(new URL('../docs/designs/frostbound-realms/avoidance-cpu.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
