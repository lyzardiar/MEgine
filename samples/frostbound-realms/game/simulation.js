/* Author: MiYu. Shared fixed-step rules for the native client and authoritative server. */
var Frost = (() => {
  const DT = 0.1, LIMIT = 160, SIZE = 32;
  const factions = ['Kingdom', 'Warclans', 'Wildwood', 'Revenant'];
  const types = {
    worker: {label:'Worker',hp:100,damage:6,range:1.7,speed:4,cooldown:1.2,gold:60,wood:0,food:1,time:4,model:'worker'},
    soldier: {label:'Footman',hp:260,damage:23,range:1.8,speed:3.8,cooldown:1,gold:100,wood:20,food:2,time:6,model:'soldier'},
    archer: {label:'Ranger',hp:150,damage:20,range:8,speed:4,cooldown:1.2,gold:120,wood:35,food:2,time:7,model:'archer'},
    knight: {label:'Champion',hp:500,damage:38,range:2,speed:4.8,cooldown:1.3,gold:200,wood:60,food:3,time:10,model:'knight'},
    mage: {label:'Arcanist',hp:160,damage:40,range:7,speed:3.6,cooldown:1.5,gold:180,wood:50,food:3,time:9,model:'mage'},
    hero: {label:'Frost Warden',hp:700,damage:38,range:5,speed:4.5,cooldown:1,gold:300,wood:80,food:4,time:14,model:'hero'},
    hall: {label:'Stronghold',hp:2200,damage:20,range:8,speed:0,cooldown:1.5,gold:350,wood:150,food:0,time:15,radius:2.5,model:'hall'},
    barracks: {label:'Barracks',hp:950,damage:0,range:0,speed:0,gold:180,wood:80,food:0,time:9,radius:2,model:'barracks'},
    farm: {label:'Supply lodge',hp:500,damage:0,range:0,speed:0,gold:80,wood:40,food:0,time:6,radius:1.5,model:'farm'},
    tower: {label:'Guard tower',hp:800,damage:45,range:11,speed:0,cooldown:1.2,gold:140,wood:40,food:0,time:8,radius:1,model:'tower'},
    altar: {label:'Altar',hp:700,damage:0,range:0,speed:0,gold:180,wood:100,food:0,time:10,radius:1.5,model:'altar'},
    creep: {label:'Raider',hp:140,damage:15,range:1.8,speed:3.5,cooldown:1.2,gold:0,wood:0,food:0,model:'soldier'},
    neutral: {label:'Ancient guardian',hp:450,damage:25,range:2,speed:2.8,cooldown:1.4,gold:0,wood:0,food:0,model:'knight'}
  };
  const items = [{name:'Runic blade',gold:180,damage:18},{name:'Heartstone',gold:160,hp:220},{name:'Wayfarer boots',gold:140,speed:.8}];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const clone = v => JSON.parse(JSON.stringify(v));
  const cell = (x,z) => [clamp(Math.floor((x+32)/2),0,31),clamp(Math.floor((z+32)/2),0,31)];
  const index = (x,z) => {const p=cell(x,z);return p[1]*32+p[0];};
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  function defaultMap(mode='skirmish') {
    const map={version:1,name:mode==='moba'?'Ancients of the Vale':mode==='td'?'Serpentine Watch':'Winterfall Basin',mode,terrain:Array(1024).fill(0),props:[],spawns:[[-23,23],[23,-23]],startingGold:mode==='td'?650:500,waveInterval:mode==='td'?18:24,waves:12};
    for(let z=0;z<32;z++)for(let x=0;x<32;x++)if((x<2||x>29||z<2||z>29)&&((x+z)%5!==0))map.terrain[z*32+x]=1;
    if(mode!=='td')for(let z=9;z<23;z++)if(z<14||z>18)map.terrain[z*32+15]=map.terrain[z*32+16]=1;
    for(const team of [0,1]){const [x,z]=map.spawns[team];map.props.push({kind:'mine',x:x+(team?-6:6),z,amount:9000});for(let i=0;i<8;i++)map.props.push({kind:'tree',x:x+(team?-1:1)*(2+i%4*2),z:z+(team?1:-1)*(6+Math.floor(i/4)*2),amount:600});}
    for(let i=0;i<24;i++){const x=((i*17)%50)-25,z=((i*29)%48)-24;if(Math.hypot(x,z)>12&&map.spawns.every(p=>Math.hypot(p[0]-x,p[1]-z)>12))map.props.push({kind:'tree',x,z,amount:600});}
    return map;
  }
  function validateMap(raw) {
    if(!raw||raw.version!==1||!['skirmish','moba','td'].includes(raw.mode)||!Array.isArray(raw.terrain)||raw.terrain.length!==1024||raw.terrain.some(v=>!Number.isInteger(v)||v<0||v>2))throw Error('Invalid map terrain or mode');
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=27);
    if(!Array.isArray(raw.spawns)||raw.spawns.length!==2||!raw.spawns.every(point)||Math.hypot(raw.spawns[0][0]-raw.spawns[1][0],raw.spawns[0][1]-raw.spawns[1][1])<20)throw Error('Two separated spawn points are required');
    if(!Array.isArray(raw.props)||raw.props.length>100||raw.props.some(p=>!p||!['tree','mine','camp'].includes(p.kind)||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>29||Math.abs(p.z)>29))throw Error('Invalid map objects');
    const map={version:1,name:String(raw.name||'Custom battlefield').slice(0,40),mode:raw.mode,terrain:[...raw.terrain],spawns:raw.spawns.map(p=>[...p]),props:raw.props.map(p=>({kind:p.kind,x:p.x,z:p.z,amount:clamp(Number.isFinite(p.amount)?p.amount:1000,100,10000)})),startingGold:clamp(Number.isFinite(raw.startingGold)?Math.round(raw.startingGold):500,100,2000),waveInterval:clamp(Number.isFinite(raw.waveInterval)?raw.waveInterval:24,10,60),waves:clamp(Number.isFinite(raw.waves)?Math.round(raw.waves):12,3,30)};
    if(raw.triggers!==undefined&&(!Array.isArray(raw.triggers)||raw.triggers.length>24))throw Error('At most 24 map triggers are allowed');
    map.triggers=(raw.triggers||[]).map(t=>{
      if(!t||!['time','kills','enter','gold'].includes(t.event)||!['message','gold','spawn','victory'].includes(t.action)||![0,1].includes(t.team)||!Number.isFinite(t.threshold)||t.threshold<1||t.threshold>7200||!Number.isFinite(t.value)||t.value<1||t.value>2000||!point([t.x,t.z]))throw Error('Invalid map trigger');
      return {event:t.event,action:t.action,team:t.team,threshold:Math.round(t.threshold),value:Math.round(t.value),x:t.x,z:t.z,text:String(t.text||'Objective updated').slice(0,100)};
    });
    map.objective=String(raw.objective||'').slice(0,140);
    for(const p of map.spawns){const c=cell(...p);for(let z=c[1]-2;z<=c[1]+2;z++)for(let x=c[0]-2;x<=c[0]+2;x++)if(x>=0&&z>=0&&x<32&&z<32)map.terrain[z*32+x]=0;}
    const roads=map.mode==='td'?[defensePath(map)]:map.mode==='moba'?[0,1,2].map(lane=>lanePath(0,lane,map)):[];
    for(let i=0;i<1024;i++)if(roads.some(route=>route.slice(1).some((p,j)=>segmentDistance(i%32*2-31,Math.floor(i/32)*2-31,route[j],p)<2.5)))map.terrain[i]=2;
    return map;
  }
  function spawn(s,kind,team,x,z,extra={}) {
    if(s.units.length>=LIMIT)return null;
    const d=types[kind],f=s.teams[team]?.faction||0,hp=d.hp*(f===1?1.12:1),speed=d.speed*(f===2?1.12:1);
    const u={id:++s.serial,kind,team,x,z,hp,maxHp:hp,damage:d.damage*(f===3?1.1:1),speed,cd:0,order:null,path:[],pathAt:-100,built:1,queue:[],level:1,xp:0,mana:150,spell:[0,0,0,0],inventory:[],cargo:0,respawn:0,...extra};s.units.push(u);return u;
  }
  function create(mode='skirmish',options={}) {
    const map=validateMap(options.map||defaultMap(mode));mode=map.mode;
    const s={version:1,map,mode,frame:0,serial:0,units:[],resources:clone(map.props),teams:[0,1].map(i=>({gold:map.startingGold,wood:250,faction:clamp(options.factions?.[i]||0,0,3),ai:options.ai?.[i]??(i===1),upgrade:0,kills:0})),events:[],winner:null,wave:0,nextWave:40,lives:20,explored:[Array(1024).fill(0),Array(1024).fill(0)],visible:[[],[]]};
    for(const team of [0,1]){
      if(mode==='td'&&team===1)continue;
      const [x,z]=map.spawns[team];spawn(s,'hall',team,x,z);
      if(mode==='skirmish'){
        spawn(s,'barracks',team,x+(team?-6:6),z+(team?-5:5));spawn(s,'farm',team,x+(team?5:-5),z);
        for(let i=0;i<4;i++){const u=spawn(s,'worker',team,x+(i-1.5)*1.5,z+(team?4:-4));u.order={type:'gather',resource:s.resources.findIndex(p=>p.kind===(i<2?'mine':'tree')&&Math.hypot(p.x-x,p.z-z)<12)};}
        spawn(s,'hero',team,x+(team?-4:4),z+(team?2:-2));spawn(s,'soldier',team,x,z+(team?6:-6));
      }else if(mode==='moba'){
        spawn(s,'hero',team,x,z+(team?4:-4));
        for(let lane=0;lane<3;lane++){const route=lanePath(team,lane,map);for(const j of [1,2]){const p=route[j];spawn(s,'tower',team,p[0],p[1],{lane});}}
      }else{spawn(s,'worker',0,-18,18);spawn(s,'hero',0,-22,17);}
    }
    if(mode!=='td')for(const p of [{x:-8,z:-6},{x:8,z:6},...map.props.filter(p=>p.kind==='camp')])spawn(s,'neutral',-1,p.x,p.z,{home:[p.x,p.z]});
    visibility(s);return s;
  }
  function lanePath(team,lane,map){const paths=[[[-23,23],[-24,7],[-24,-18],[-7,-24],[23,-23]],[[-23,23],[-13,13],[-5,5],[5,-5],[13,-13],[23,-23]],[[-23,23],[-7,24],[18,24],[24,7],[23,-23]]],route=paths[lane];if(map){route[0]=[...map.spawns[0]];route[route.length-1]=[...map.spawns[1]];}return team?route.reverse():route;}
  const tdPath=[[-25,-24],[23,-24],[23,-8],[-21,-8],[-21,7],[20,7],[20,20],[-23,23]];
  function defensePath(map){return [...tdPath.slice(0,-1),map.spawns[0]];}
  function solid(s,x,z,ignore=0){if(Math.abs(x)>30||Math.abs(z)>30||s.map.terrain[index(x,z)]===1)return true;return s.units.some(u=>u.id!==ignore&&u.hp>0&&!types[u.kind].speed&&Math.hypot(u.x-x,u.z-z)<(types[u.kind].radius||1)+.35);}
  function path(s,u,tx,tz){
    const start=index(u.x,u.z),goal=index(tx,tz),prev=new Int16Array(1024);prev.fill(-1);prev[start]=start;const queue=[start];let found=start,best=Infinity;
    for(let k=0;k<queue.length;k++){const n=queue[k],x=n%32,z=Math.floor(n/32),d=Math.hypot(x-goal%32,z-Math.floor(goal/32));if(d<best){best=d;found=n;}if(n===goal)break;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,j=nz*32+nx;if(nx<1||nz<1||nx>30||nz>30||prev[j]!==-1||solid(s,nx*2-31,nz*2-31,u.id))continue;prev[j]=n;queue.push(j);}}
    const result=[];for(let n=found;n!==start;n=prev[n])result.push([n%32*2-31,Math.floor(n/32)*2-31]);return result.reverse();
  }
  function move(s,u,x,z,stop=.5){
    if(!u.speed||Math.hypot(u.x-x,u.z-z)<=stop)return true;
    if(s.frame-u.pathAt>15||!u.path.length||Math.hypot((u.dest?.[0]||0)-x,(u.dest?.[1]||0)-z)>3){u.path=path(s,u,x,z);u.pathAt=s.frame;u.dest=[x,z];}
    const p=u.path[0];if(!p)return false;const d=Math.hypot(p[0]-u.x,p[1]-u.z),step=Math.min(d,u.speed*DT);if(d>.001){const nx=u.x+(p[0]-u.x)/d*step,nz=u.z+(p[1]-u.z)/d*step;if(!solid(s,nx,nz,u.id)){u.x=nx;u.z=nz;}else u.path=[];}if(d<.5)u.path.shift();return false;
  }
  function population(s,team){const us=s.units.filter(u=>u.team===team&&u.hp>0);return {used:us.reduce((n,u)=>n+types[u.kind].food+u.queue.reduce((a,q)=>a+types[q.kind].food,0),0),cap:Math.min(80,us.reduce((n,u)=>n+(u.built===1?(u.kind==='hall'?14:u.kind==='farm'?8:0):0),0))};}
  function pay(s,team,gold,wood=0){const t=s.teams[team];if(!t||t.gold<gold||t.wood<wood)return false;t.gold-=gold;t.wood-=wood;return true;}
  function command(s,team,c){
    if(s.winner!==null||!c||![0,1].includes(team))return 'Match is finished';
    const own=s.units.filter(u=>u.team===team&&u.hp>0&&Array.isArray(c.ids)&&c.ids.slice(0,40).includes(u.id)),u=own[0],point=Number.isFinite(c.x)&&Number.isFinite(c.z)&&Math.abs(c.x)<=30&&Math.abs(c.z)<=30;
    if(['move','attackMove','attack','gather','stop'].includes(c.type)){
      if(['move','attackMove'].includes(c.type)&&!point)return 'Invalid destination';
      const target=s.units.find(v=>v.id===c.target&&v.hp>0);if(c.type==='attack'&&(!target||target.team===team||!isVisible(s,team,target)))return 'Target is not visible';
      if(c.type==='gather'&&(!Number.isInteger(c.resource)||!s.resources[c.resource]||s.resources[c.resource].kind==='camp'||!s.visible[team][index(s.resources[c.resource].x,s.resources[c.resource].z)]))return 'Select a visible resource';
      own.forEach((v,i)=>{v.path=[];v.pathAt=-100;v.order=c.type==='stop'?null:{type:c.type,x:point?clamp(c.x+(i%5-(Math.min(own.length,5)-1)/2)*1.1,-29,29):0,z:point?clamp(c.z+Math.floor(i/5)*1.1,-29,29):0,target:c.target,resource:c.resource};});return null;
    }
    if(c.type==='build'){
      if(s.mode==='moba'||!u||u.kind!=='worker'||!['farm','barracks','tower','altar'].includes(c.kind)||!point)return 'Select a worker and a building site';
      const d=types[c.kind];if(distance(u,c)>15||solid(s,c.x,c.z)||s.units.some(v=>v.hp>0&&!types[v.kind].speed&&distance(v,c)<(types[v.kind].radius||1)+d.radius+.8))return 'Site blocked or too far from worker';
      if(s.mode==='td'&&defensePath(s.map).slice(1).some((p,i)=>segmentDistance(c.x,c.z,defensePath(s.map)[i],p)<2.5+d.radius))return 'Keep the creep road clear';
      if(s.units.length>=LIMIT||!pay(s,team,d.gold,d.wood))return 'Not enough resources or unit capacity';
      spawn(s,c.kind,team,c.x,c.z,{built:.01});return null;
    }
    if(c.type==='train'){
      const allowed={hall:['worker'],barracks:['soldier','archer','knight','mage'],altar:['hero']};
      if(s.mode!=='skirmish'||!u||u.built<1||!allowed[u.kind]?.includes(c.kind)||u.queue.length>=3)return 'Select the appropriate completed production building';
      const d=types[c.kind],p=population(s,team);if(p.used+d.food>p.cap)return 'Build more supply lodges';if(s.units.length>=LIMIT)return 'Unit capacity reached';
      if(c.kind==='hero'&&s.units.some(v=>v.team===team&&(v.kind==='hero'||v.queue.some(q=>q.kind==='hero'))))return 'One hero per faction';
      if(!pay(s,team,d.gold,d.wood))return 'Not enough resources';u.queue.push({kind:c.kind,left:d.time});return null;
    }
    if(c.type==='upgrade'){if(!u||u.kind!=='barracks'||u.built<1)return 'Select a completed barracks';if(s.teams[team].upgrade>=3)return 'Maximum weapon upgrade';if(!pay(s,team,180+s.teams[team].upgrade*100,100))return 'Not enough resources';s.teams[team].upgrade++;return null;}
    if(c.type==='buy'){
      if(!Number.isInteger(c.item)||c.item<0||c.item>=items.length)return 'Invalid shop item';
      const item=items[c.item];if(!u||u.kind!=='hero'||!item||u.inventory.length>=6)return 'Select a hero with an empty inventory slot';if(!s.units.some(v=>v.team===team&&v.kind==='hall'&&v.hp>0&&distance(v,u)<10))return 'Visit your stronghold shop';
      if(!pay(s,team,item.gold))return 'Not enough gold';u.inventory.push(c.item);u.damage+=item.damage||0;u.maxHp+=item.hp||0;u.hp=Math.min(u.maxHp,u.hp+(item.hp||0));u.speed+=item.speed||0;return null;
    }
    if(c.type==='spell'){
      if(!u||u.kind!=='hero'||!Number.isInteger(c.slot)||c.slot<0||c.slot>3||!point)return 'Select your hero';const cost=[35,45,30,90][c.slot];
      if(u.spell[c.slot]>0||u.mana<cost)return 'Spell is not ready';if(c.slot===3&&u.level<3)return 'Ultimate requires level 3';if(distance(u,c)>14)return 'Target outside spell range';if(c.slot===2&&solid(s,c.x,c.z))return 'Blink destination is blocked';
      u.mana-=cost;u.spell[c.slot]=[5,9,7,25][c.slot];
      if(c.slot===2){u.x=c.x;u.z=c.z;u.path=[];u.order=null;}
      else for(const v of s.units){if(v.hp<=0||distance(v,c)>(c.slot===3?7:5))continue;if(c.slot===1&&v.team===team)v.hp=Math.min(v.maxHp,v.hp+180+u.level*20);else if(c.slot!==1&&v.team!==team)damage(s,u,v,(c.slot===3?240:85)+u.level*15);}
      s.events.push({type:'spell',x:c.x,z:c.z,slot:c.slot,team});return null;
    }
    return 'Unknown command';
  }
  function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
  function damage(s,a,b,value){
    if(b.hp<=0)return;b.hp-=value;
    if(b.hp<=0){b.hp=0;s.events.push({type:'death',x:b.x,z:b.z,team:b.team});if(a.team>=0){s.teams[a.team].gold+=b.kind==='hero'?140:!types[b.kind].speed?80:25;s.teams[a.team].kills++;for(const h of s.units.filter(u=>u.team===a.team&&u.kind==='hero'&&u.hp>0&&distance(u,b)<18)){h.xp+=b.kind==='hero'?100:35;while(h.xp>=h.level*90&&h.level<10){h.xp-=h.level*90;h.level++;h.maxHp+=90;h.hp=Math.min(h.maxHp,h.hp+150);h.damage+=6;}}}
      if(b.kind==='hero'&&s.mode==='moba')b.respawn=12+b.level*2;
      if(b.kind==='hall'&&s.mode!=='td')s.winner=1-b.team;
    }
  }
  function isVisible(s,team,u){return u.team===team||!!s.visible[team]?.[index(u.x,u.z)];}
  function visibility(s){
    for(let t=0;t<2;t++){const vis=Array(1024).fill(0);for(const u of s.units)if(u.team===t&&u.hp>0){const [cx,cz]=cell(u.x,u.z),r=u.kind==='tower'?7:6;for(let z=Math.max(0,cz-r);z<=Math.min(31,cz+r);z++)for(let x=Math.max(0,cx-r);x<=Math.min(31,cx+r);x++)if((x-cx)**2+(z-cz)**2<=r*r)vis[z*32+x]=1;}s.visible[t]=vis;for(let i=0;i<1024;i++)if(vis[i])s.explored[t][i]=1;}
  }
  function gather(s,u){const r=s.resources[u.order.resource];if(!r||r.amount<=0){u.order=null;return;}const hall=s.units.find(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0);if(!hall)return;const target=u.cargo>=20?hall:r;
    const reach=u.cargo>=20?4:3;if(distance(u,target)>reach){move(s,u,target.x,target.z,reach-.1);return;}if(u.cargo>=20){s.teams[u.team][r.kind==='mine'?'gold':'wood']+=u.cargo;u.cargo=0;}else if(u.cd<=0){const take=Math.min(5,r.amount);u.cargo+=take;r.amount-=take;u.cd=.65;}
  }
  function ai(s,t){
    const team=s.teams[t],us=s.units.filter(u=>u.team===t&&u.hp>0),base=s.map.spawns[t],foe=s.map.spawns[1-t],worker=us.find(u=>u.kind==='worker');
    if(s.mode==='skirmish'){
      const pop=population(s,t);if(pop.used+3>pop.cap&&worker){const i=Math.floor(s.frame/40)%12,a=i*Math.PI/6;command(s,t,{type:'build',ids:[worker.id],kind:'farm',x:clamp(base[0]+Math.cos(a)*10,-27,27),z:clamp(base[1]+Math.sin(a)*10,-27,27)});}
      for(const b of us.filter(u=>u.kind==='barracks'))command(s,t,{type:'train',ids:[b.id],kind:s.frame%120===0?'archer':'soldier'});
      for(const w of us.filter(u=>u.kind==='worker'&&!u.order)){const ri=s.resources.findIndex(r=>r.amount>0&&r.kind!=='camp'&&distance(w,r)<16);if(ri>=0)w.order={type:'gather',resource:ri};}
      if(s.frame>200)for(const u of us.filter(u=>u.speed&&u.kind!=='worker'&&!u.order))u.order={type:'attackMove',x:foe[0],z:foe[1]};
    }else if(s.mode==='moba'){for(const h of us.filter(u=>u.kind==='hero')){if(!h.order)h.order={type:'attackMove',x:foe[0],z:foe[1]};const e=s.units.find(u=>u.team!==t&&u.hp>0&&distance(u,h)<9);if(e)command(s,t,{type:'spell',ids:[h.id],slot:h.hp<h.maxHp*.4?1:0,x:h.hp<h.maxHp*.4?h.x:e.x,z:h.hp<h.maxHp*.4?h.z:e.z});}}
    if(team.faction===3)for(const u of us)u.hp=Math.min(u.maxHp,u.hp+2);
  }
  function tick(s){
    if(s.winner!==null)return;s.frame++;s.events=[];
    s.fired??=[];
    for(let i=0;i<s.map.triggers.length;i++){
      const t=s.map.triggers[i];if(s.fired.includes(i))continue;
      const ready=t.event==='time'?s.frame*DT>=t.threshold:t.event==='kills'?s.teams[t.team].kills>=t.threshold:t.event==='gold'?s.teams[t.team].gold>=t.threshold:s.units.some(u=>u.team===t.team&&u.kind==='hero'&&u.hp>0&&Math.hypot(u.x-t.x,u.z-t.z)<3);
      if(!ready)continue;s.fired.push(i);s.objectiveNotice=t.text;s.events.push({type:'objective',x:t.x,z:t.z,team:t.team,text:t.text});
      if(t.action==='gold')s.teams[t.team].gold+=t.value;
      if(t.action==='spawn')for(let n=0;n<Math.min(12,t.value);n++){const u=spawn(s,'soldier',t.team,t.x+(n%3)*.5,t.z+Math.floor(n/3)*.5);if(u)u.order={type:'attackMove',x:s.map.spawns[1-t.team][0],z:s.map.spawns[1-t.team][1]};}
      if(t.action==='victory'){s.winner=t.team;return;}
    }
    if(s.mode!=='skirmish'&&s.frame>=s.nextWave){
      s.wave++;s.nextWave=s.frame+Math.round(s.map.waveInterval/DT);
      if(s.mode==='moba')for(let t=0;t<2;t++)for(let lane=0;lane<3;lane++)for(let i=0;i<3;i++){const route=lanePath(t,lane,s.map),p=route[0];spawn(s,'creep',t,p[0]+i*.7,p[1],{route,waypoint:1,lane});}
      else if(s.wave<=s.map.waves)for(let i=0;i<5+s.wave*2;i++)spawn(s,'creep',1,tdPath[0][0]-(i%5)*.25,tdPath[0][1],{hp:100+s.wave*40,maxHp:100+s.wave*40,speed:3+s.wave*.12,route:defensePath(s.map),waypoint:1,td:true});
    }
    if(s.frame%40===0)for(let t=0;t<2;t++)if(s.teams[t].ai)ai(s,t);
    if(s.frame%10===0&&s.mode==='moba')for(const t of s.teams)t.gold+=3;
    for(const u of s.units){
      if(u.hp<=0){if(u.respawn>0){u.respawn-=DT;if(u.respawn<=0){[u.x,u.z]=s.map.spawns[u.team];u.hp=u.maxHp;u.mana=150;u.order=null;u.path=[];}}continue;}
      u.cd=Math.max(0,u.cd-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));u.mana=Math.min(150+u.level*10,u.mana+DT*2);
      if(u.built<1){u.built=Math.min(1,u.built+DT/types[u.kind].time);continue;}
      if(u.queue.length){u.queue[0].left-=DT;if(u.queue[0].left<=0&&s.units.length<LIMIT){const q=u.queue.shift();let p=[u.x,u.z+4];for(let a=0;a<12;a++){const x=u.x+Math.cos(a*Math.PI/6)*4,z=u.z+Math.sin(a*Math.PI/6)*4;if(!solid(s,x,z)){p=[x,z];break;}}spawn(s,q.kind,u.team,p[0],p[1]);}}
      if(u.kind==='worker'&&u.order?.type==='gather'){gather(s,u);continue;}
      if(u.td){const p=u.route[u.waypoint];if(!p){u.hp=0;s.lives--;if(s.lives<=0)s.winner=1;continue;}if(move(s,u,p[0],p[1],u.waypoint===u.route.length-1?4.5:1.3))u.waypoint++;continue;}
      let target=u.order?.type==='attack'?s.units.find(v=>v.id===u.order.target&&v.hp>0&&isVisible(s,u.team,v)):null;
      if(u.order?.type==='attack'&&!target)u.order=null;
      if(u.order?.type!=='move'&&u.damage>0&&!target){let best=Infinity;for(const v of s.units){if(v.team===u.team||v.hp<=0||(u.team>=0&&!isVisible(s,u.team,v)))continue;const d=distance(u,v);if(d<best&&d<Math.max(types[u.kind].range,8)){target=v;best=d;}}}
      if(target){const range=types[u.kind].range+(types[target.kind].radius||.3);if(distance(u,target)<=range){if(u.cd<=0){damage(s,u,target,u.damage+(s.teams[u.team]?.upgrade||0)*6);u.cd=types[u.kind].cooldown||1;s.events.push({type:'hit',x:target.x,z:target.z,fromX:u.x,fromZ:u.z,team:u.team,ranged:range>4});}}else move(s,u,target.x,target.z,range*.8);}
      else if(u.order&&['move','attackMove'].includes(u.order.type)){if(move(s,u,u.order.x,u.order.z,1))u.order=null;}
      else if(u.route){const p=u.route[u.waypoint];if(p&&move(s,u,p[0],p[1],1.5))u.waypoint++;}
      else if(u.home&&distance(u,{x:u.home[0],z:u.home[1]})>3)move(s,u,...u.home,2);
      if(u.kind==='hero'&&s.units.some(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&distance(u,v)<8))u.hp=Math.min(u.maxHp,u.hp+DT*12);
    }
    s.units=s.units.filter(u=>u.hp>0||u.respawn>0);
    if(s.mode==='td'&&s.wave>=s.map.waves&&!s.units.some(u=>u.td)&&s.frame>s.nextWave-Math.round(s.map.waveInterval/DT)+10)s.winner=0;
    if(s.frame%3===0)visibility(s);
  }
  function publicState(s,team){const state=clone(s);state.units=state.units.filter(u=>isVisible(s,team,u));for(const u of state.units)if(u.team!==team){u.order=null;u.queue=[];u.cargo=0;}
    state.teams=state.teams.map((t,i)=>i===team?t:{faction:t.faction,kills:t.kills});state.resources=state.resources.map(r=>s.visible[team][index(r.x,r.z)]?r:{kind:r.kind,x:r.x,z:r.z,amount:null});
    state.events=state.events.filter(e=>s.visible[team][index(e.x,e.z)]);state.visible=[team===0?s.visible[0]:[],team===1?s.visible[1]:[]];state.explored=[team===0?s.explored[0]:[],team===1?s.explored[1]:[]];return state;}
  return {DT,LIMIT,SIZE,types,factions,items,clamp,clone,cell,index,distance,defaultMap,validateMap,create,spawn,command,tick,population,isVisible,visibility,path,solid,publicState,lanePath,tdPath,defensePath};
})();
if(typeof module!=='undefined')module.exports=Frost;
