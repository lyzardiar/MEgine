/** Astral Thunder — deterministic arcade bullet patterns, combat and batched presentation. */
type FlightMode = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';
type Bullet = { x: number; y: number; px: number; py: number; vx: number; vy: number; age: number; radius: number; color: number; needle: boolean; grazed: boolean; curve: number };
type Shot = { x: number; y: number; oldY: number; vx: number; vy: number; damage: number; missile: boolean };
type Enemy = { x: number; y: number; origin: number; hp: number; maxHp: number; kind: number; age: number; fire: number; phase: number; hurt: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number };
type Pickup = { x: number; y: number; age: number };
const TAU = Math.PI * 2, MAX_BULLETS = 900, MAX_SPARKS = 240;
const COLORS = [[1,.08,.38,1],[.45,.12,1,1],[.08,.75,1,1],[1,.54,.06,1],[.25,1,.68,1]];
const MENU = ['Menu shade','Menu accent','Menu title','Menu copy','Menu button','Menu action','Menu footer'];
let mode: FlightMode = 'title', entities: Record<string, any> = {}, authored: Record<string, any> = {}, sent: Record<string,string> = {}, ready = false;
let bullets: Bullet[] = [], shots: Shot[] = [], enemies: Enemy[] = [], sparks: Spark[] = [], drops: Pickup[] = [], rings: { x:number;y:number;age:number;size:number;color:number }[] = [];
let lasers: { x:number;age:number }[] = [], stars: {x:number;y:number;s:number}[] = [];
let px = 0, py = -6.5, armor = 5, bombs = 3, energy = 0, level = 1, cores = 0, score = 0, kills = 0, graze = 0, chain = 1, peak = 0, damageTaken = 0, novas = 0;
let time = 0, displayTime = 0, stage = 0, stageTime = 0, wave = 0, spawnTimer = 0, fireTimer = 0, missileTimer = 0, invincible = 0, overdrive = 0, nova = 0, shake = 0, chainTimer = 0, accumulator = 0, hudTimer = 0, muted = false;
let announcement = '', announcementTime = 0, randomState = 11371, bossPhases = 0, lastFireSound = 0;
const clamp = (x:number,lo:number,hi:number):number => Math.max(lo,Math.min(hi,x));
function random(): number { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; }
function set(name:string, component:string, value:any):void {
  if (!entities[name]) return;
  const key=name+'/'+component, data=JSON.stringify(value); if(sent[key]===data)return; sent[key]=data;
  engine.pushCommandJson(`{"op":"setComponent","entity":${entities[name].entity},"component":${JSON.stringify(component)},"value":${data}}`);
}
function label(name:string,text:string):void { set(name,'Text',{...authored[name].Text,text}); }
function show(name:string,visible:boolean):void { const r=authored[name].RectTransform; set(name,'RectTransform',{...r,anchored_position:visible?r.anchored_position:[12000,12000]}); }
function bar(name:string,value:number):void {
  const r=authored[name].RectTransform,w=r.size_delta[0],size=Math.max(.1,w*clamp(value,0,1));
  set(name,'RectTransform',{...r,size_delta:[size,r.size_delta[1]],anchored_position:[r.anchored_position[0]-(w-size)/2,r.anchored_position[1]]});
}
function sound(name:string):void { if(!muted)engine.playAudio(entities[name].entity); }
function announce(text:string,seconds=2.2):void { announcement=text;announcementTime=seconds; }
function changeMode(next:FlightMode):void {
  mode=next; for(const name of MENU)show(name,next!=='playing');
  if(next==='title') {label('Menu title','READY, PILOT?');label('Menu copy','A storm of light. A single clear path.');label('Menu action','ENTER / LAUNCH');}
  if(next==='paused') {label('Menu title','SIGNAL HELD');label('Menu copy','Breathe. Find your next opening.');label('Menu action','ENTER / RESUME');}
  if(next==='victory'||next==='defeat') {
    label('Menu title',next==='victory'?'SKY RECLAIMED':'SIGNAL LOST');
    label('Menu copy',`${score.toString().padStart(8,'0')} POINTS  /  ${graze} GRAZES`);label('Menu action','ENTER / FLY AGAIN');label('Menu footer',`${kills} HOSTILES  /  ${Math.floor(time)}s  /  PEAK ${peak} BULLETS`);
  }
}
function reset():void {
  bullets=[];shots=[];enemies=[];sparks=[];drops=[];rings=[];lasers=[];
  px=0;py=-6.5;armor=5;bombs=3;energy=0;level=1;cores=0;score=0;kills=0;graze=0;chain=1;peak=0;damageTaken=0;novas=0;
  time=stageTime=wave=spawnTimer=fireTimer=missileTimer=overdrive=nova=shake=chainTimer=accumulator=hudTimer=bossPhases=lastFireSound=0;
  stage=0;invincible=2;randomState=11371;announce('ION FRONT\nWEAPONS FREE',2.6);
}
function start():void { reset();changeMode('playing');sound('Music'); }
function emit(x:number,y:number,angle:number,speed:number,color=0,needle=false,curve=0):void {
  if(bullets.length>=MAX_BULLETS)return;
  bullets.push({x,y,px:x,py:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,radius:needle?.11:.12,color,needle,grazed:false,curve});
}
function ring(x:number,y:number,count:number,angle:number,speed:number,color:number,curve=0):void { for(let i=0;i<count;i++)emit(x,y,angle+i*TAU/count,speed,color,i%3===0,curve); }
function burst(x:number,y:number,color=3,size=1):void {
  for(let i=0;i<18*size;i++){const a=random()*TAU,v=1+random()*4; sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.25+random()*.6,max:.85,color});}
  sparks=sparks.slice(-MAX_SPARKS); rings.push({x,y,age:0,size:size*2.6,color});rings=rings.slice(-24);
}
function hit():void {
  if(invincible>0||mode!=='playing')return;
  armor--;damageTaken++;invincible=2.4;shake=.38;chain=1;chainTimer=0;burst(px,py,0,1.2);sound('Hit sound');
  for(const b of bullets)if(Math.hypot(b.x-px,b.y-py)<1.6)b.age=20;
  announce(armor>0?'SHIELD BREACH':'MISSION LOST',1.3);
  if(armor<=0)changeMode('defeat');
}
function bomb():void {
  if(mode!=='playing'||bombs<=0)return;
  bombs--;novas++;nova=1.4;invincible=Math.max(invincible,2.1);shake=.35;score+=bullets.length*8;bullets=[];lasers=[];
  for(const e of enemies){e.hp-=e.kind>=3?600:100;e.hurt=.2;}
  burst(px,py,2,3);rings.push({x:px,y:py,age:0,size:25,color:2});sound('Nova sound');announce('NOVA / SKYBREAK',1.5);
}
function spawnWave():void {
  const kind=wave%3, count=kind===1?3:5;
  for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*(kind===1?3:1.8), hp=kind===1?70:kind===2?45:28;
    enemies.push({x,y:8.8+i*.55,origin:x,hp,maxHp:hp,kind,age:0,fire:.8+i*.15,phase:0,hurt:0});
  }
  wave++;spawnTimer=stage===2?2.4:3.3;
}
function spawnBoss(kind:number):void {
  bullets=[];enemies=[];lasers=[];stage=kind===3?1:3;stageTime=0;
  const hp=kind===3?20000:36000;
  enemies.push({x:0,y:9.5,origin:0,hp,maxHp:hp,kind,age:0,fire:2.5,phase:-1,hurt:0});
  announce(kind===3?'WARNING\nDREADNOUGHT INBOUND':'WARNING\nASTRAL CROWN',3);sound('Nova sound');
}
function enemyFire(e:Enemy):void {
  const aim=Math.atan2(py-e.y,px-e.x);
  if(e.kind===0){for(let i=-1;i<=1;i++)emit(e.x,e.y,aim+i*.16,2.5,0);e.fire=1.3;}
  else if(e.kind===1){ring(e.x,e.y,14,e.age*.33,1.9,3,.08);e.fire=1.7;}
  else if(e.kind===2){for(let i=-2;i<=2;i++)emit(e.x,e.y,aim+i*.19,2.7,1,true);e.fire=1.1;}
  else if(e.kind===3){
    const phase=e.hp/e.maxHp>.5?0:1;
    if(e.phase!==phase){e.phase=phase;bossPhases++;announce(phase?'DREADNOUGHT / CROSSFIRE':'DREADNOUGHT / BLOSSOM');}
    if(!phase){for(let i=0;i<28;i++){const a=i*TAU/28+e.age*.42;emit(e.x,e.y,a,1.9+Math.sin(a*5+e.age)*.45,i%2?0:1,false,.1);}e.fire=.6;}
    else {for(const side of [-1,1])for(let i=0;i<7;i++)emit(e.x+side*1.65,e.y-.5,-Math.PI/2+(i-3)*.2+Math.sin(e.age*1.8)*.55,2.6,side<0?2:0,true);e.fire=.24;}
  } else {
    const ratio=e.hp/e.maxHp,phase=ratio>.66?0:ratio>.32?1:2;
    if(e.phase!==phase){e.phase=phase;bossPhases++;bullets=bullets.filter((_,i)=>i%2===0);announce(['CROWN / PRISM SPIRAL','CROWN / LASER LATTICE','CROWN / EVENT HORIZON'][phase]);}
    if(phase===0){for(let a=0;a<6;a++){const angle=e.age*.85+a*TAU/6;for(let j=0;j<3;j++)emit(e.x,e.y,angle+j*.1,2.1+j*.1,a%2?1:2,false,.13);}e.fire=.2;}
    else if(phase===1){
      ring(e.x,e.y,28,-e.age*.27,2.05,0,-.09);
      if(lasers.length===0)for(const x of [-3.3,0,3.3])lasers.push({x:x+Math.sin(e.age)*.5,age:0});
      e.fire=.65;
    } else {
      for(let i=0;i<32;i++){const a=i*TAU/32+e.age*.7;emit(e.x,e.y,a,1.9+Math.cos(a*6)*.65,i%2?3:1,i%2===0,-.1);}
      for(let i=-2;i<=2;i++)emit(e.x,e.y,aim+i*.13,3.2,0,true);
      e.fire=.38;
    }
  }
}
function distanceToSegment(x:number,y:number,ax:number,ay:number,bx:number,by:number):number {
  const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/Math.max(.000001,dx*dx+dy*dy),0,1);
  return Math.hypot(x-ax-dx*t,y-ay-dy*t);
}
function simulate(dt:number,keys:string[]):void {
  time+=dt;stageTime+=dt;invincible=Math.max(0,invincible-dt);overdrive=Math.max(0,overdrive-dt);nova=Math.max(0,nova-dt);shake=Math.max(0,shake-dt);chainTimer=Math.max(0,chainTimer-dt);
  if(!chainTimer)chain=1;
  const held=(...k:string[]):boolean=>k.some(v=>keys.includes(v));
  const dx=Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft')),dy=Number(held('KeyW','ArrowUp'))-Number(held('KeyS','ArrowDown'));
  const speed=held('ShiftLeft','ShiftRight')?2.3:5.3,length=Math.hypot(dx,dy)||1;
  px=clamp(px+dx/length*speed*dt,-5.3,5.3);py=clamp(py+dy/length*speed*dt,-7.8,7.4);
  fireTimer-=dt;missileTimer-=dt;spawnTimer-=dt;
  if(fireTimer<=0){
    const count=level*2+1;
    for(let i=0;i<count;i++){const lane=i-(count-1)/2;shots.push({x:px+lane*.16,y:py+.5,oldY:py+.5,vx:lane*.2,vy:17,damage:overdrive>0?18:10,missile:false});}
    fireTimer=overdrive>0?.065:.11;
    if(time-lastFireSound>.15){sound('Shot sound');lastFireSound=time;}
  }
  if(missileTimer<=0&&level>1){for(const side of [-1,1])shots.push({x:px+side*.42,y:py,oldY:py,vx:side*.9,vy:9,damage:55,missile:true});missileTimer=.65;}
  if(stage===0&&stageTime>30)spawnBoss(3);
  else if(stage===2&&stageTime>10)spawnBoss(4);
  else if((stage===0||stage===2)&&spawnTimer<=0)spawnWave();
  for(const e of enemies){
    e.age+=dt;e.hurt=Math.max(0,e.hurt-dt);
    if(e.kind>=3){e.y+=(5.5-e.y)*Math.min(1,dt*1.5);e.x=Math.sin(e.age*.6)*(e.kind===3?1.6:1.1);}
    else {e.y-=(e.kind===1?.8:1.15)*dt;e.x=e.origin+Math.sin(e.age*(e.kind===0?1.5:.8))*(e.kind===0?.45:.7);}
    e.fire-=dt;if(e.y<7.8&&e.fire<=0)enemyFire(e);
    if(distanceToSegment(px,py,e.x,e.y,e.x,e.y)<(e.kind>=3?1.25:.48))hit();
  }
  for(const s of shots){
    s.oldY=s.y;
    if(s.missile&&enemies.length){const target=enemies.reduce((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)<Math.hypot(b.x-s.x,b.y-s.y)?a:b);s.vx=clamp((target.x-s.x)*4,-6,6);}
    s.x+=s.vx*dt;s.y+=s.vy*dt;
    for(const e of enemies){if(e.hp<=0)continue;const radius=e.kind>=3?1.65:e.kind===1?.7:.47;
      if(distanceToSegment(e.x,e.y,s.x,s.oldY,s.x,s.y)<radius){e.hp-=s.damage;e.hurt=.075;s.y=99;if(s.missile)burst(e.x,e.y,2,.4);break;}
    }
  }
  shots=shots.filter(s=>s.y<9.5);
  for(const e of enemies)if(e.hp<=0){
    kills++;chain=Math.min(10,chain+1);chainTimer=4;score+=(e.kind>=3?5000:100)*chain;energy=clamp(energy+4,0,100);burst(e.x,e.y,e.kind>=3?1:3,e.kind>=3?3:1);sound('Explosion sound');
    for(let i=0;i<(e.kind>=3?14:3);i++)drops.push({x:e.x+(random()-.5)*1.4,y:e.y+(random()-.5),age:0});
    if(e.kind>=3){bullets=[];lasers=[];armor=Math.min(5,armor+1);bombs=Math.min(3,bombs+1);shake=.5;
      if(e.kind===3){stage=2;stageTime=0;spawnTimer=2;announce('DREADNOUGHT DOWN\nSHIELD + NOVA RESTORED',3);}
      else {changeMode('victory');sound('Victory sound');}
    }
  }
  enemies=enemies.filter(e=>e.hp>0&&e.y>-10);
  for(const b of bullets){
    b.px=b.x;b.py=b.y;b.age+=dt;
    if(b.curve){const a=b.curve*dt,c=Math.cos(a),s=Math.sin(a),vx=b.vx;b.vx=vx*c-b.vy*s;b.vy=vx*s+b.vy*c;}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    const distance=distanceToSegment(px,py,b.px,b.py,b.x,b.y);
    if(distance<b.radius+.085){hit();}
    else if(distance<.48&&!b.grazed){b.grazed=true;graze++;score+=25*chain;energy=Math.min(100,energy+1.3);}
  }
  bullets=bullets.filter(b=>b.age<14&&Math.abs(b.x)<6.4&&b.y>-9&&b.y<10);
  for(const l of lasers){l.age+=dt;if(l.age>1.3&&l.age<2.2&&Math.abs(px-l.x)<.21)hit();}lasers=lasers.filter(l=>l.age<2.5);
  for(const d of drops){d.age+=dt;const distance=Math.hypot(px-d.x,py-d.y);if(distance<2.8||py>2.8){d.x+=(px-d.x)*Math.min(1,dt*5);d.y+=(py-d.y)*Math.min(1,dt*5);}else d.y-=1.7*dt;
    if(Math.hypot(px-d.x,py-d.y)<.45){cores++;score+=80;energy=Math.min(100,energy+2);d.age=99;if(cores%10===0&&level<3){level++;announce('PULSE ARRAY / MK '+['I','II','III'][level-1]);sound('Pickup sound');}}
  }
  drops=drops.filter(d=>d.age<15&&d.y>-9);peak=Math.max(peak,bullets.length);
}
function batch(name:string,instances:number[][],colors:number[][]=[]):void {
  if(typeof engine.setSpriteBatchData==='function') engine.setSpriteBatchData(entities[name].entity,instances,colors);
  else set(name,'SpriteBatch2D',{...authored[name].SpriteBatch2D,instances,colors});
}
function effects(dt:number):void {
  displayTime+=dt;announcementTime=Math.max(0,announcementTime-dt);
  for(const s of sparks){s.life-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=Math.exp(-2*dt);s.vy*=Math.exp(-2*dt);}sparks=sparks.filter(s=>s.life>0);
  for(const r of rings)r.age+=dt;rings=rings.filter(r=>r.age<1.1);
  for(const s of stars){s.y-=dt*(.5+s.s*1.5);if(s.y<-8.5)s.y+=17;}
}
function render(dt:number,keys:string[]):void {
  const orb:number[][]=[],orbColors:number[][]=[],needle:number[][]=[],needleColors:number[][]=[];
  for(const b of bullets){const list=b.needle?needle:orb,col=b.needle?needleColors:orbColors;list.push([b.x,b.y,Math.atan2(b.vy,b.vx)-Math.PI/2,1]);col.push(COLORS[b.color]);}
  batch('Enemy bullets',orb,orbColors);batch('Needle bullets',needle,needleColors);
  for(let kind=0;kind<5;kind++){const group=enemies.filter(e=>e.kind===kind);batch('Fleet '+kind,group.map(e=>[e.x,e.y,e.kind===4?Math.sin(e.age*.7)*.13:Math.PI,e.kind===4?4.5:e.kind===3?5:e.kind===1?1.8:1.25]),group.map(e=>e.hurt>0?[1.8,1.8,1.8,1]:[1,1,1,1]));}
  batch('Player fire',shots.filter(s=>!s.missile).map(s=>[s.x,s.y,-Math.atan2(s.vx,s.vy),overdrive>0?1.6:1]),shots.filter(s=>!s.missile).map(()=>COLORS[2]));
  batch('Missiles',shots.filter(s=>s.missile).map(s=>[s.x,s.y,-Math.atan2(s.vx,s.vy),1.4]),shots.filter(s=>s.missile).map(()=>COLORS[3]));
  batch('Sparks',sparks.map(s=>[s.x,s.y,Math.atan2(s.vy,s.vx)-Math.PI/2,.4+s.life]),sparks.map(s=>[...COLORS[s.color].slice(0,3),s.life/s.max]));
  batch('Shockwaves',rings.map(r=>[r.x,r.y,0,r.size*(.15+r.age)]),rings.map(r=>[...COLORS[r.color].slice(0,3),(1-r.age/1.1)*.8]));
  batch('Pickups',drops.map(d=>[d.x,d.y,Math.sin(d.age*4)*.15,1]),drops.map(()=>COLORS[2]));
  const warnings=lasers.filter(l=>l.age<1.3),beams=lasers.filter(l=>l.age>=1.3);
  batch('Laser warnings',warnings.map(l=>[l.x,0,0,1]),warnings.map(l=>[1,.15,.45,.5+Math.sin(l.age*20)*.2]));
  batch('Lasers',beams.map(l=>[l.x,0,0,1]),beams.map(l=>[1,.15,.45,l.age<2.2?.95:(2.5-l.age)/.3]));
  const exhaust=mode==='playing'||mode==='title';const glow:number[][]=[],gc:number[][]=[];
  if(exhaust)for(const side of [-1,1]){glow.push([px+side*.25,py-.52,0,.8+Math.sin(displayTime*30)*.12]);gc.push([.04,.5,1,.9]);}
  if(invincible>0){glow.push([px,py,0,1.8]);gc.push([.05,.38,1,.27]);}
  if(overdrive>0){glow.push([px,py,0,2.5]);gc.push([.3,.07,1,.45]);}
  if(nova>0){glow.push([px,py,0,28*(1-nova/1.4)]);gc.push([.1,.45,1,nova/1.4*.65]);}
  for(const e of enemies)if(e.kind>=3){glow.push([e.x,e.y,0,3+Math.sin(displayTime*4)*.3]);gc.push([.3,.035,.7,.3]);}
  batch('Glow',glow,gc);batch('Stars',stars.map(s=>[s.x,s.y,0,s.s]),stars.map(s=>[.2,.5,1,.25+s.s*.2]));
  const roll=(Number(keys.includes('KeyD'))-Number(keys.includes('KeyA')))*-.14;
  set('Player','Transform',{position:[px,py,0],rotation:[0,0,Math.sin(roll/2),Math.cos(roll/2)],scale:[1,1,1]});
  set('Player','SpriteRenderer',{...authored['Player'].SpriteRenderer,color:[1,1,1,invincible>0&&Math.sin(displayTime*35)<0?.4:1]});
  const focus=keys.includes('ShiftLeft')||keys.includes('ShiftRight');set('Hit point','Transform',{position:[px,py,0],rotation:[0,0,0,1],scale:[1,1,1]});set('Hit point','SpriteRenderer',{...authored['Hit point'].SpriteRenderer,color:[1,1,1,focus||invincible>0?1:.35]});
  set('Main Camera','Transform',{...authored['Main Camera'].Transform,position:[Math.sin(displayTime*65)*shake*.08,Math.cos(displayTime*79)*shake*.06,20]});
  for(const name of ['Nebula','Arena'])set(name,'MaterialPropertyBlock',{custom_parameter_names:['clock'],custom_parameter_values:[[displayTime,0,0,0]]});
  hudTimer-=dt;if(hudTimer<=0){hudTimer=.1;
    label('Score',score.toString().padStart(8,'0'));label('Chain',`CHAIN  x${chain}      GRAZE  ${graze.toString().padStart(3,'0')}`);label('Armor',`ARMOR  ${armor} / 5`);bar('Armor fill',armor/5);bar('Drive fill',overdrive>0?overdrive/5:energy/100);
    label('Drive label',overdrive>0?'OVERDRIVE ACTIVE':energy>=100?'OVERDRIVE READY / E':'OVERDRIVE / E');label('Bombs',`NOVA  ${bombs} / 3`);label('Weapon','PULSE ARRAY / MK '+['I','II','III'][level-1]);label('Render count',`${enemies.length.toString().padStart(2,'0')} HOSTILES / ${bullets.length.toString().padStart(3,'0')} BULLETS`);
    label('Stage',stage<2?'01 / ION FRONT':'02 / CROWN OF LIGHT');label('Sector',stage<2?'ION FRONT / 01':'CROWN OF LIGHT / 02');
    label('Announcement',announcementTime>0?announcement:'');label('Status',lasers.some(l=>l.age<1.3)?'LASER LOCK / LEAVE THE RED LANES':focus?'PRECISION FLIGHT / HITBOX VISIBLE':overdrive>0?'OVERDRIVE / AMPLIFIED FIRE':'');
    const boss=enemies.find(e=>e.kind>=3);label('Boss name',boss?boss.kind===3?'VX-09 / DREADNOUGHT':'ASTRAL CROWN / REACTOR':'');bar('Boss fill',boss?boss.hp/boss.maxHp:0);show('Boss rail',Boolean(boss));
  }
}
function telemetry():void {
  set('Flight telemetry','Text',{enabled:false,text:JSON.stringify({mode,time,stage,stageTime,px,py,armor,bombs,energy,level,cores,score,kills,graze,chain,peak,damageTaken,novas,bossPhases,overdrive,invincible,bullets:bullets.length,shots:shots.length,enemies:enemies.map(e=>({x:e.x,y:e.y,kind:e.kind,hp:e.hp,maxHp:e.maxHp,phase:e.phase})),lasers:lasers.map(l=>({x:l.x,age:l.age})),threats:bullets.filter(b=>Math.abs(b.x-px)<3&&Math.abs(b.y-py)<3.5).slice(0,120).map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.radius})),muted})});
}
function onSceneLoaded():void { ready=false; }
function onTick(dt:number):void {
  if(!ready){entities={};authored={};sent={};for(const e of engine.snapshot.entities)if(e.name){entities[e.name]=e;authored[e.name]=e.components;}reset();stars=Array.from({length:90},()=>({x:(random()-.5)*11.2,y:(random()-.5)*17,s:.4+random()*1.1}));changeMode('title');announcementTime=0;ready=true;}
  dt=clamp(dt,0,.1);const input=engine.input,keys=input.keys,pressed=(key:string):boolean=>input.pressedKeys.includes(key);
  if(pressed('KeyM')){muted=!muted;set('Audio mixer','AudioMixer',{...authored['Audio mixer'].AudioMixer,muted});}
  if(pressed('KeyR')&&mode!=='title')start();
  if(pressed('Escape')||pressed('KeyP')){if(mode==='playing')changeMode('paused');else if(mode==='paused')changeMode('playing');}
  const scale=Math.sqrt(Math.max(1,input.viewport[0])/1280*Math.max(1,input.viewport[1])/720),mx=(input.pointer[0]-input.viewport[0]/2)/scale+640,my=(input.pointer[1]-input.viewport[1]/2)/scale+360;
  if(pressed('Enter')||(input.pressedButtons.includes(0)&&mx>475&&mx<805&&my>409&&my<455)){if(mode==='paused')changeMode('playing');else if(mode!=='playing')start();}
  if(mode==='paused'||mode==='defeat'||mode==='victory'){telemetry();return;}
  if(mode==='playing'){
    if(pressed('Space'))bomb();
    if(pressed('KeyE')&&energy>=100){energy=0;overdrive=5;invincible=Math.max(invincible,.7);sound('Nova sound');announce('OVERDRIVE / LIMIT BREAK');}
    accumulator+=dt;while(accumulator>=1/120&&mode==='playing'){simulate(1/120,keys);accumulator-=1/120;}
  }else{
    px=Math.sin(displayTime*.4)*.6;py=-6.4;
    if(!enemies.length)enemies.push({x:0,y:5.6,origin:0,hp:5400,maxHp:5400,kind:4,age:4,fire:0,phase:0,hurt:0});
    const e=enemies[0];e.age+=dt;e.fire-=dt;if(e.fire<=0){ring(0,5.6,32,displayTime*.7,1.8,1,.09);e.fire=.38;}
    for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.age+=dt;}bullets=bullets.filter(b=>b.age<12&&Math.abs(b.x)<5.6&&b.y>-8.4);
  }
  effects(dt);render(dt,keys);telemetry();
}
