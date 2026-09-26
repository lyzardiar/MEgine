/* Ion Outpost: shared fixed-step simulation. Server, offline game and prediction use this code. */
var Outpost = (() => {
  const HZ = 60, DT = 1 / HZ, LIMIT = 22, MAX_PLAYERS = 8;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // x, z, width, depth, height; the scene generator consumes the same collision geometry.
  const blocks = [[-7,-7,4,3,2.2], [7,7,4,3,2.2], [-7,7,4,3,2.2], [7,-7,4,3,2.2], [0,0,3.4,3.4,3.6], [-15,0,3,4,1.2], [15,0,3,4,1.2], [0,-15,4,2,1.2], [0,15,4,2,1.2], [-17,-12,2.4,2.4,1.8], [17,12,2.4,2.4,1.8]];
  const spawns = [[-18,18],[18,-18],[18,18],[-18,-18],[0,20],[0,-20],[-20,0],[20,0]];
  const pickups = [[-12,12],[12,-12],[-12,-12],[12,12]];
  const weapons = [
    {name:'PULSE CARBINE', capacity:24, cooldown:6, reload:96, damage:22, pellets:1, range:70},
    {name:'ARC SCATTER', capacity:6, cooldown:42, reload:125, damage:13, pellets:7, range:28},
  ];
  function neutral() { return {seq:0, frame:0, x:0, z:0, yaw:0, pitch:0, fire:false, reload:false, jump:false, sprint:false, weapon:0}; }
  function cleanInput(input) {
    if (!input || typeof input !== 'object') return null;
    if (!['seq','frame','x','z','yaw','pitch','weapon'].every(k => typeof input[k] === 'number' && Number.isFinite(input[k]))) return null;
    if (!Number.isSafeInteger(input.seq) || input.seq < 0 || !Number.isSafeInteger(input.frame)) return null;
    return {seq:input.seq, frame:input.frame, x:clamp(input.x,-1,1), z:clamp(input.z,-1,1), yaw:wrap(input.yaw), pitch:clamp(input.pitch,-1.35,1.35), fire:input.fire===true, reload:input.reload===true, jump:input.jump===true, sprint:input.sprint===true, weapon:input.weapon===1?1:0};
  }
  function create(seed=731) { return {frame:0, seed:seed>>>0, phase:'lobby', round:1, remaining:180*HZ, actors:[], pickups:pickups.map(()=>0), events:[], winner:null}; }
  function random(state) { state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0; return state.seed/4294967296; }
  function actor(id, name, bot=false, slot=0) {
    const p={id,name,bot,slot,x:0,y:0,z:0,vy:0,yaw:0,pitch:0,hp:100,shield:40,ammo:[24,6],weapon:0,cooldown:0,reloading:0,dead:0,protection:120,kills:0,deaths:0,ack:0,jumpHeld:false,connected:true,botPath:[],target:null};
    spawn(p, slot); return p;
  }
  function spawn(p, index) {
    [p.x,p.z]=spawns[index%spawns.length];p.y=0;p.vy=0;p.yaw=Math.atan2(p.x,p.z);p.pitch=0;p.hp=100;p.shield=40;p.ammo=[24,6];p.cooldown=0;p.reloading=0;p.dead=0;p.protection=180;p.botPath=[];p.jumpHeld=false;
  }
  function start(state) { state.phase='playing';state.remaining=180*HZ;state.winner=null;state.pickups=pickups.map(()=>0);state.actors.forEach((p,i)=>{p.kills=0;p.deaths=0;spawn(p,i);}); }
  function solid(x,z,y=0) { return blocks.some(b=>Math.abs(x-b[0])<b[2]/2+.36 && Math.abs(z-b[1])<b[3]/2+.36 && y<b[4]-.02); }
  function move(p, input) {
    if (p.dead) return;
    p.yaw=input.yaw;p.pitch=input.pitch;
    const length=Math.max(1,Math.hypot(input.x,input.z)), speed=input.sprint&&!input.fire?8.5:5.8;
    const dx=(Math.cos(p.yaw)*input.x-Math.sin(p.yaw)*input.z)*speed*DT/length;
    const dz=(-Math.sin(p.yaw)*input.x-Math.cos(p.yaw)*input.z)*speed*DT/length;
    const nx=clamp(p.x+dx,-LIMIT+.4,LIMIT-.4), nz=clamp(p.z+dz,-LIMIT+.4,LIMIT-.4);
    if(!solid(nx,p.z,p.y))p.x=nx;if(!solid(p.x,nz,p.y))p.z=nz;
    if(input.jump&&!p.jumpHeld&&p.vy===0)p.vy=7.6;p.jumpHeld=input.jump;
    const oldY=p.y;p.vy-=20*DT;p.y+=p.vy*DT;
    let floor=0;
    for(const b of blocks)if(Math.abs(p.x-b[0])<b[2]/2+.34&&Math.abs(p.z-b[1])<b[3]/2+.34&&oldY>=b[4]-.025)floor=Math.max(floor,b[4]);
    if(p.y<=floor){p.y=floor;p.vy=0;}
  }
  function rayBox(origin, direction, min, max) {
    let near=0,far=1e6;
    for(let i=0;i<3;i++){
      if(Math.abs(direction[i])<1e-8){if(origin[i]<min[i]||origin[i]>max[i])return Infinity;continue;}
      const a=(min[i]-origin[i])/direction[i],b=(max[i]-origin[i])/direction[i];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return Infinity;
    }
    return near;
  }
  function wallDistance(origin,direction) {
    let distance=100;
    for(const b of blocks)distance=Math.min(distance,rayBox(origin,direction,[b[0]-b[2]/2,0,b[1]-b[3]/2],[b[0]+b[2]/2,b[4],b[1]+b[3]/2]));
    return distance;
  }
  function visible(a,b) {
    const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,d=Math.hypot(dx,dy,dz);
    return d<.01||wallDistance([a.x,a.y+1.45,a.z],[dx/d,dy/d,dz/d])>d;
  }
  function event(state,value){state.events.push({frame:state.frame,...value});if(state.events.length>80)state.events.shift();}
  function shoot(state,p,input) {
    const gun=weapons[p.weapon];if(p.cooldown||p.reloading||p.ammo[p.weapon]<=0)return;
    p.ammo[p.weapon]--;p.cooldown=p.bot?Math.max(14,gun.cooldown):gun.cooldown;p.protection=0;
    const origin=[p.x,p.y+1.55,p.z];let firstEnd,hit=null,head=false;
    for(let pellet=0;pellet<gun.pellets;pellet++){
      const angle=pellet*2.399963,spread=pellet===0?0:.028+pellet*.006;
      const yaw=input.yaw+Math.cos(angle)*spread,pitch=input.pitch+Math.sin(angle)*spread;
      const dir=[-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
      let distance=Math.min(gun.range,wallDistance(origin,dir)),target=null,isHead=false;
      for(const q of state.actors){
        if(q.id===p.id||q.dead||!q.connected)continue;
        const h=rayBox(origin,dir,[q.x-.23,q.y+1.4,q.z-.23],[q.x+.23,q.y+1.91,q.z+.23]);
        const body=rayBox(origin,dir,[q.x-.36,q.y+.1,q.z-.3],[q.x+.36,q.y+1.42,q.z+.3]);
        const d=Math.min(h,body);if(d<distance){distance=d;target=q;isHead=h<=body;}
      }
      if(!firstEnd)firstEnd=origin.map((v,i)=>v+dir[i]*distance);
      if(target&&!target.protection){
        let amount=Math.round(gun.damage*(isHead?1.8:1));const shield=Math.min(target.shield,amount);target.shield-=shield;amount-=shield;target.hp=Math.max(0,target.hp-amount);hit=target.id;head=head||isHead;
        if(target.hp===0&&!target.dead){target.dead=180;target.deaths++;target.reloading=0;p.kills++;event(state,{type:'kill',killer:p.id,victim:target.id,head:isHead});}
      }
    }
    event(state,{type:'shot',actor:p.id,origin,end:firstEnd,hit,head,weapon:p.weapon});
  }
  // A small shared grid keeps bots out of collision solids; routes are recomputed at 5 Hz.
  const nodes=[];for(let z=-20;z<=20;z+=2)for(let x=-20;x<=20;x+=2)nodes.push([x,z]);
  function route(a,b){
    const index=p=>clamp(Math.round((p.z+20)/2),0,20)*21+clamp(Math.round((p.x+20)/2),0,20);
    const start=index(a),goal=index(b),queue=[start],previous=new Int16Array(441).fill(-1);previous[start]=start;
    for(let i=0;i<queue.length;i++){
      const at=queue[i];if(at===goal)break;
      for(const next of [at-21,at+21,at%21?at-1:-1,at%21<20?at+1:-1]){
        if(next<0||next>=441||previous[next]!==-1||solid(nodes[next][0],nodes[next][1]))continue;
        previous[next]=at;queue.push(next);
      }
    }
    if(previous[goal]===-1)return [];
    const path=[];for(let i=goal;i!==start;i=previous[i])path.unshift(nodes[i]);return path;
  }
  function botInput(state,p){
    const input={...neutral(),seq:state.frame,frame:state.frame,yaw:p.yaw,pitch:p.pitch,weapon:0};
    const enemies=state.actors.filter(q=>q.id!==p.id&&!q.dead&&q.connected);
    enemies.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
    const target=enemies.find(q=>visible(p,q))||enemies[0];if(!target)return input;
    const seen=visible(p,target),distance=Math.hypot(target.x-p.x,target.z-p.z);
    const desired=Math.atan2(p.x-target.x,p.z-target.z);
    const aim=desired+Math.sin(state.frame*.039+p.slot)*(.035+p.slot*.004);
    input.yaw=wrap(p.yaw+clamp(wrap(aim-p.yaw),-.035,.035));input.pitch=clamp(Math.atan2(target.y-p.y-.15,distance)+Math.sin(state.frame*.035+p.slot)*.028,-1.2,1.2);
    if(seen){
      p.botPath=[];input.z=distance>13?.8:distance<6?-.6:0;input.x=Math.sin(state.frame*.018+p.slot)>0?.65:-.65;
      input.fire=state.frame%150>65&&state.frame%150<125&&Math.abs(wrap(desired-input.yaw))<.08;
    }else{
      if(state.frame%12===p.slot%12||!p.botPath.length)p.botPath=route(p,target);
      if(p.botPath.length&&Math.hypot(p.botPath[0][0]-p.x,p.botPath[0][1]-p.z)<.5)p.botPath.shift();
      const goal=p.botPath[0];if(goal){const dx=goal[0]-p.x,dz=goal[1]-p.z,d=Math.max(.01,Math.hypot(dx,dz));input.x=(Math.cos(input.yaw)*dx-Math.sin(input.yaw)*dz)/d;input.z=(-Math.sin(input.yaw)*dx-Math.cos(input.yaw)*dz)/d;}
    }
    input.reload=p.ammo[0]===0||(!seen&&p.ammo[0]<12);return input;
  }
  function step(state,inputs={}) {
    state.frame++;if(state.phase!=='playing')return;
    if(--state.remaining<=0){finish(state);return;}
    state.pickups=state.pickups.map(t=>Math.max(0,t-1));
    for(const p of state.actors){
      if(!p.connected)continue;
      if(p.dead){if(--p.dead===0){
        let best=0,bestDistance=-1;
        spawns.forEach((s,i)=>{const d=Math.min(...state.actors.filter(q=>q.id!==p.id&&!q.dead).map(q=>Math.hypot(q.x-s[0],q.z-s[1])));if(d>bestDistance){best=i;bestDistance=d;}});spawn(p,best);
      }continue;}
      const input=p.bot?botInput(state,p):(inputs[p.id]||{...neutral(),yaw:p.yaw,pitch:p.pitch,weapon:p.weapon});
      p.ack=Math.max(p.ack,input.seq);move(p,input);p.protection=Math.max(0,p.protection-1);p.cooldown=Math.max(0,p.cooldown-1);
      if(p.reloading){if(--p.reloading===0)p.ammo[p.weapon]=weapons[p.weapon].capacity;}
      if(!p.reloading&&input.weapon!==p.weapon){p.weapon=input.weapon;p.cooldown=Math.max(p.cooldown,15);}
      if((input.reload||p.ammo[p.weapon]===0)&&!p.reloading&&p.ammo[p.weapon]<weapons[p.weapon].capacity)p.reloading=weapons[p.weapon].reload;
      if(input.fire)shoot(state,p,input);
      pickups.forEach((point,i)=>{if(!state.pickups[i]&&Math.hypot(p.x-point[0],p.z-point[1])<1.2&&(p.hp<100||p.shield<40)){p.hp=Math.min(100,p.hp+45);p.shield=40;state.pickups[i]=600;event(state,{type:'pickup',actor:p.id,index:i});}});
    }
    if(state.actors.some(p=>p.kills>=20))finish(state);
  }
  function finish(state){state.phase='finished';state.winner=[...state.actors].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)[0]?.id||null;}
  function snapshot(state){return {...state,actors:state.actors.map(p=>({...p,ammo:[...p.ammo],botPath:p.botPath.map(point=>[...point])})),pickups:[...state.pickups],events:state.events.slice(-30)};}
  function checksum(state){
    const values=[state.frame,state.phase,state.remaining,state.seed,...state.pickups];
    for(const p of state.actors)values.push(p.id,p.connected,...[p.x,p.y,p.z,p.vy,p.yaw,p.pitch].map(v=>Math.round(v*10000)),p.hp,p.shield,...p.ammo,p.weapon,p.cooldown,p.reloading,p.dead,p.protection,p.kills,p.deaths,p.ack,p.jumpHeld);
    const text=JSON.stringify(values);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return hash>>>0;
  }
  function replayFrames(checkpoint,frames){
    const replay=snapshot(checkpoint);replay.events=[...replay.events];
    for(const frame of frames){if(frame.frame<=replay.frame)continue;if(frame.frame!==replay.frame+1)return null;step(replay,frame.inputs);}
    return replay;
  }
  return {HZ,DT,LIMIT,MAX_PLAYERS,blocks,spawns,pickups,weapons,clamp,wrap,neutral,cleanInput,create,actor,start,spawn,move,step,route,visible,rayBox,wallDistance,snapshot,botInput,checksum,replayFrames};
})();
if(typeof module!=='undefined')module.exports=Outpost;
