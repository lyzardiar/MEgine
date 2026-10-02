/* Author: MiYu. Shared fixed-step rules for the native client and authoritative server. */
var Frost = (() => {
  const DT = 0.1, LIMIT = 160, PROJECTILE_LIMIT = 256, CORPSE_LIMIT = 64, CORPSE_LIFETIME = 20, SIZE = 32;
  const simulating = new WeakSet();
  const cannibalize={gold:75,time:30,duration:33,range:6,reach:1.7,healing:{ghoul:10,abomination:15}};
  const feeding=u=>u.order?.type==='cannibalize'&&u.order.active?u.order.left:u.feeding||0;
  const corpseClaimed=(s,c)=>s.units.some(u=>u.hp>0&&!u.inside&&u.order?.type==='cannibalize'&&u.order.target===c.id);
  const raiseDead = {cost:75,cooldown:8,duration:40,range:6,count:2};
  const maxMana = u => ['necromancer','shaman'].includes(u.kind)?200+100*(u.casterRank||0):150+u.level*10;
  const casterSpells={frenzy:{name:'Unholy Frenzy',caster:'necromancer',rank:1,cost:50,cooldown:1,range:5,duration:45},cripple:{name:'Cripple',caster:'necromancer',rank:2,cost:175,cooldown:10,range:6,duration:60},purge:{name:'Purge',caster:'shaman',rank:0,cost:75,cooldown:1,range:7,duration:15},lightningShield:{name:'Lightning Shield',caster:'shaman',rank:1,cost:100,cooldown:0,range:6,duration:20,radius:1.6,power:20},bloodlust:{name:'Bloodlust',caster:'shaman',rank:2,cost:40,cooldown:1,range:6,duration:60}};
  const casterTraining={temple:{field:'necromancy',unit:'necromancer',faction:3,times:[30,45]},spiritlodge:{field:'shamanism',unit:'shaman',faction:1,times:[60,75]}};
  const skeletonResearch={longevity:{field:'skeletalLongevity',name:'Skeletal Longevity',gold:50,wood:75,time:15,tier:2},mastery:{field:'skeletalMastery',name:'Skeletal Mastery',gold:200,wood:100,time:30,tier:3}};
  const attackRate=u=>Math.max(.2,1+(u.frenzy>0?.75:0)+(u.bloodlust>0?.4:0)-(u.cripple>0?.5:0));
  const moveRate=u=>(u.slow>0?.55:1)*(1+(u.haste>0?.6:0)+(u.bloodlust>0?.25:0))*(u.cripple>0?.25:1)*(u.purgeLeft>0?Math.max(.2,1-.8*Math.ceil(u.purgeLeft/(u.kind==='hero'?1:3))/5):1);
  const factions = ['Kingdom', 'Warclans', 'Wildwood', 'Revenant'];
  const types = {
    worker: {label:'Worker',hp:100,damage:6,range:1.7,speed:4,cooldown:1.2,gold:60,wood:0,food:1,time:4,model:'worker'},
    soldier: {label:'Footman',hp:260,damage:23,range:1.8,speed:3.8,cooldown:1,gold:100,wood:20,food:2,time:6,model:'soldier'},
    archer: {label:'Ranger',hp:150,damage:20,range:8,speed:4,cooldown:1.2,gold:120,wood:35,food:2,time:7,model:'archer'},
    knight: {label:'Knight',hp:500,damage:38,range:2,speed:4.8,cooldown:1.3,gold:200,wood:60,food:3,time:10,model:'knight'},
    mage: {label:'Arcanist',hp:160,damage:40,range:7,speed:3.6,cooldown:1.5,gold:180,wood:50,food:3,time:9,model:'mage'},
    hero: {label:'Frost Warden',hp:700,damage:38,range:5,speed:4.5,cooldown:1,gold:425,wood:100,food:5,time:55,model:'hero'},
    hall: {label:'Stronghold',hp:2200,damage:20,range:8,speed:0,cooldown:1.5,gold:350,wood:150,food:0,time:15,radius:2.5,model:'hall'},
    barracks: {label:'Barracks',hp:950,damage:0,range:0,speed:0,gold:180,wood:80,food:0,time:9,radius:2,model:'barracks'},
    farm: {label:'Supply lodge',hp:500,damage:0,range:0,speed:0,gold:80,wood:40,food:0,time:6,radius:1.5,model:'farm'},
    tower: {label:'Guard tower',hp:800,damage:45,range:11,speed:0,cooldown:1.2,gold:140,wood:40,food:0,time:8,radius:1,model:'tower'},
    altar: {label:'Altar',hp:700,damage:0,range:0,speed:0,gold:180,wood:100,food:0,time:10,radius:1.5,model:'altar'},
    creep: {label:'Melee creep',laneCreep:true,hp:140,damage:15,range:1.8,speed:3.5,cooldown:1.2,gold:0,wood:0,food:0,model:'soldier'},
    neutral: {label:'Frostfang wolf',hp:450,damage:25,range:2,speed:2.8,cooldown:1.4,gold:0,wood:0,food:0,model:'knight'}
  };
  const items = [{name:'Runic blade',gold:180,damage:18},{name:'Heartstone',gold:160,hp:220},{name:'Wayfarer boots',gold:140,speed:.8}];
  items.push({name:'Covenant edge',gold:120,damage:28,hp:120,recipe:[0,1]},{name:'Stormstride',gold:100,damage:16,speed:.6,recipe:[0,2]},{name:'Sanctuary charm',gold:100,hp:240,speed:.3,recipe:[1,2]});
  items.push({name:'Healing potion',gold:80,restoreHp:250},{name:'Mana potion',gold:90,restoreMana:100});
  items.push({name:'Town Portal Scroll',gold:350,townPortal:true,icon:'Assets/Art/town-portal-scroll.png'});
  const townPortal={item:8,time:5,radius:12,baseRange:10};
  const itemValue=i=>items[i].gold+(items[i].recipe||[]).reduce((n,p)=>n+itemValue(p),0);
  types.frosttower={...types.tower,label:'Frost spire',damage:28,slow:2.5,gold:170,model:'tower'};
  types.flametower={...types.tower,label:'Ember bastion',damage:34,splash:3,gold:210,cooldown:1.8,model:'tower'};
  const armies = [
    {units:['soldier','archer','paladin','rifleman','knight'],names:['Footman','Ranger','Paladin','Rifleman','Knight']},
    {units:['raider','hunter','berserker','shaman'],names:['Raider','Spear hunter','Berserker','Shaman']},
    {units:['sentinel','huntress','treant','druid'],names:['Sentinel','Huntress','Treant','Druid']},
    {units:['ghoul','bonearcher','abomination','necromancer'],names:['Ghoul','Bone archer','Abomination','Necromancer']}
  ];
  const variants = {
    paladin:['knight',{damage:34,heal:6}],rifleman:['mage',{range:10,damage:48}],
    raider:['soldier',{speed:4.5,hp:230}],hunter:['archer',{damage:25,range:7}],berserker:['knight',{hp:420,damage:54}],shaman:['mage',{slow:1.5,damage:28}],
    sentinel:['soldier',{speed:4.6}],huntress:['archer',{speed:5.3,range:7}],treant:['knight',{hp:680,speed:2.5}],druid:['mage',{heal:10,damage:26}],
    ghoul:['soldier',{lifesteal:.25,hp:210}],bonearcher:['archer',{range:9}],abomination:['knight',{hp:650,speed:3}],necromancer:['mage',{lifesteal:.4,damage:42}]
  };
  for(const [kind,[base,extra]] of Object.entries(variants))types[kind]={...types[base],...extra};
  types.skeletonwarrior={...types.soldier,label:'Skeleton warrior',hp:180,damage:14,speed:3.8,cooldown:1.2,gold:0,wood:0,food:0};
  types.skeletonmage={...types.archer,label:'Skeletal mage',hp:230,damage:11.5,range:5,speed:2.7,cooldown:1.5,gold:0,wood:0,food:0,armor:'medium',attack:'pierce'};
  for(const army of armies)army.units.forEach((kind,i)=>types[kind].label=army.names[i]);
  types.hauntedmine={label:'Haunted Gold Mine',hp:950,damage:0,range:0,speed:0,gold:225,wood:210,food:0,time:30,radius:1.3,model:'hauntedmine'};
  types.temple={...types.barracks,label:'Temple of the Damned',hp:1100,gold:155,wood:140,time:60,model:'temple'};
  types.spiritlodge={...types.barracks,label:'Spirit Lodge',hp:800,gold:150,wood:150,time:70,model:'spiritlodge'};
  types.workshop={...types.barracks,label:'Siege workshop',gold:220,wood:120,time:12,model:'workshop'};
  types.ballista={label:'Royal ballista',hp:340,damage:58,range:13,speed:2.6,cooldown:2.4,gold:200,wood:100,food:3,time:14,model:'ballista',attack:'siege',armor:'heavy'};
  types.catapult={...types.ballista,label:'Warclan catapult',damage:65,range:12,splash:2.5,model:'catapult'};
  types.trebuchet={...types.ballista,label:'Wildwood trebuchet',range:16,damage:80,cooldown:3.4,speed:2,model:'trebuchet'};
  types.ram={...types.ballista,label:'Revenant siege ram',hp:800,damage:75,range:2,speed:2.8,cooldown:2,model:'ram'};
  types.rangedcreep={...types.creep,label:'Ranged creep',hp:90,damage:18,range:8,cooldown:1.4,model:'archer'};
  types.siegecreep={...types.catapult,label:'Siege creep',laneCreep:true,hp:320,damage:30,speed:3.5,gold:0,wood:0,food:0};
  const siege=['ballista','catapult','trebuchet','ram'];
  types.dragon={label:'Royal drake',hp:480,damage:46,range:7,speed:6,cooldown:1.7,gold:260,wood:140,food:4,time:18,model:'dragon',flying:true,attack:'magic',armor:'light'};
  types.emberdrake={...types.dragon,label:'Ember drake',damage:54,speed:5.5};
  types.grovewyrm={...types.dragon,label:'Grove wyrm',damage:36,heal:5};
  types.spectralwyrm={...types.dragon,label:'Spectral wyrm',hp:420,slow:1.5};
  const flyers=['dragon','emberdrake','grovewyrm','spectralwyrm'];
  for(const d of Object.values(types)){d.attack??=d.range>4?'pierce':'normal';d.armor??=!d.speed?'fortified':d.model==='knight'?'heavy':d.model==='archer'||d.model==='mage'?'light':'medium';}
  types.hero.attack='normal';types.hero.armor='hero';types.mage.attack='magic';
  for(const kind of ['shaman','druid','necromancer'])types[kind].attack='magic';
  for(const d of Object.values(types))d.antiAir=d.range>4&&d.attack!=='siege';
  for(const d of Object.values(types))d.organic=!!d.speed&&d.attack!=='siege';
  const heroes=[
    {...types.hero,label:'Frost Warden',art:'RealFrostWarden',color:[.25,.7,1,1],role:'Control / healing',spells:[
      {name:'Frost nova',kind:'blast',cost:35,cooldown:5,range:14,radius:5,power:100,growth:45,slow:3,description:'Damage and slow enemies in an area.'},
      {name:'Restoration',kind:'heal',cost:45,cooldown:9,range:14,radius:5,power:200,growth:100,description:'Restore nearby allied units.'},
      {name:'Blink',kind:'blink',cost:30,cooldown:7,range:14,description:'Teleport to clear, visible ground.'},
      {name:'Blizzard',kind:'zone',cost:90,cooldown:25,range:14,radius:6,power:70,duration:5,slow:1.5,description:'Five pulses of frost damage and slow.'}]},
    {...types.hero,label:'Ember Sage',art:'RealEmberSage',color:[1,.3,.08,1],role:'Area damage / summons',hp:560,damage:30,range:7,attack:'magic',spells:[
      {name:'Fireball',kind:'blast',cost:40,cooldown:6,range:14,radius:3,power:130,growth:55,description:'Explode at the target area.'},
      {name:'Ember ward',kind:'shield',cost:45,cooldown:12,range:12,radius:4,power:150,growth:90,duration:6,description:'Absorb damage on nearby allies for six seconds.'},
      {name:'Flame field',kind:'zone',cost:60,cooldown:12,range:14,radius:4,power:35,growth:20,duration:4,description:'Four pulses of fire damage.'},
      {name:'Summon drake',kind:'summon',cost:110,cooldown:35,range:10,duration:25,description:'Summon a flying drake for 25 seconds; no supply cost.'}]},
    {...types.hero,label:'Sylvan Ranger',art:'RealSylvanRanger',color:[.3,.85,.3,1],role:'Ranged damage / mobility',hp:600,damage:34,range:9,speed:5.3,attack:'pierce',spells:[
      {name:'Piercing volley',kind:'cone',cost:30,cooldown:5,range:14,radius:11,power:95,growth:40,description:'Piercing arrows in a cone toward the target.'},
      {name:'Entangling roots',kind:'blast',cost:40,cooldown:9,range:14,radius:2.5,power:35,growth:20,root:2.5,description:'Damage and immobilize enemies; they may still attack.'},
      {name:'Windstep',kind:'haste',cost:35,cooldown:12,range:0,duration:5,description:'Move 60% faster for five seconds.'},
      {name:'Arrow storm',kind:'zone',cost:100,cooldown:25,range:14,radius:7,power:85,duration:4,description:'Four waves of arrows over a wide area.'}]},
    {...types.hero,label:'Dawn Paladin',art:'RealDawnPaladin',color:[1,.8,.25,1],role:'Melee tank / support',hp:900,damage:46,range:2,speed:3.8,antiAir:false,spells:[
      {name:'Judgment',kind:'blast',cost:40,cooldown:7,range:10,radius:2,power:95,growth:45,stun:1.5,description:'Strike and stun enemies in a small area.'},
      {name:'Holy light',kind:'heal',cost:45,cooldown:8,range:12,radius:5,power:230,growth:110,description:'Restore a large amount of allied health.'},
      {name:'Divine guard',kind:'shield',cost:50,cooldown:14,range:0,radius:0,power:250,growth:125,duration:7,description:'Absorb incoming damage for seven seconds.'},
      {name:'Avatar',kind:'avatar',cost:100,cooldown:35,range:0,duration:12,description:'Gain 60% attack damage and take 40% less damage for 12 seconds.'}]}
  ];
  const skillLevel=(slot,rank)=>slot===3?6:rank*2-1;
  const validHero=v=>Number.isInteger(v)&&v>=0&&v<heroes.length;
  const heroRoster=(s,team)=>s.units.filter(u=>u.kind==='hero'&&u.team===team&&!u.summoned);
  const heroQueued=(s,team)=>s.units.filter(u=>u.team===team&&u.hp>0).flatMap(u=>u.queue.filter(q=>q.kind==='hero'&&!q.revive));
  const heroRecruitment=(s,team)=>({gold:heroRoster(s,team).length+heroQueued(s,team).length?types.hero.gold:0,wood:heroRoster(s,team).length+heroQueued(s,team).length?types.hero.wood:0,food:types.hero.food,time:types.hero.time});
  const heroRevival=u=>({gold:Math.min(550,Math.round(types.hero.gold*(u.level+3)/10)),wood:0,time:Math.min(110,types.hero.time*u.level*.65)});
  const unitType=u=>u.kind==='hero'?heroes[u.heroClass??0]:types[u.kind];
  const projectileSpeed=u=>unitType(u).range>4&&u.kind!=='rifleman'?(unitType(u).attack==='siege'?12:20):0;
  const projectileArt=u=>['catapult','trebuchet','siegecreep'].includes(u.kind)?'stone':u.kind==='ballista'?'ballista':u.kind==='bonearcher'?'quarrel':u.kind==='hunter'?'javelin':['dragon','emberdrake','flametower'].includes(u.kind)||u.kind==='hero'&&u.heroClass===1?'fire':['frosttower','spectralwyrm','shaman'].includes(u.kind)||u.kind==='hero'&&!u.heroClass?'frost':['druid','grovewyrm'].includes(u.kind)?'nature':['necromancer','skeletonmage'].includes(u.kind)?'shadow':unitType(u).attack==='magic'?'arcane':'arrow';
  const canAttack=(a,b)=>!a.inside&&!b.inside&&b.order?.type!=='townPortal'&&unitType(a).damage>0&&(!types[b.kind].flying||unitType(a).antiAir);
  const timeOfDay=s=>((s.frame+(s.map.startingHour??8)*200)%4800)/200;
  const isNight=s=>{const h=timeOfDay(s);return h<6||h>=18;};
  const daylight=s=>{const h=timeOfDay(s);return clamp((h-5)/2,0,1)*clamp((19-h)/2,0,1);};
  const asleep=(s,u)=>u.team===-1&&!!u.home&&!u.order&&u.hp>0&&!u.inside&&u.cd<=0&&isNight(s)&&s.frame>=(u.awakeUntil||0)&&distance(u,{x:u.home[0],z:u.home[1]})<=3;
  const canControl=(s,team,u)=>u.team===team&&(s.mode!=='moba'||u.kind==='hero'||u.summoned===true);
  const canDeny=(s,team,u)=>s.mode==='moba'&&u.team===team&&!!types[u.kind].laneCreep&&!u.inside&&u.hp>0&&u.hp<=u.maxHp*.5;
  const canTarget=(s,a,b)=>b.hp>0&&canAttack(a,b)&&(a.team!==b.team||canDeny(s,a.team,b)&&(a.source??a.id)!==b.id);
  const damageTable={normal:{fortified:.5},pierce:{light:1.35,heavy:.75,fortified:.35},siege:{light:.65,medium:.65,heavy:.65,hero:.5,fortified:3},magic:{heavy:1.5,fortified:.5}};
  const weaponDamage=(a,b,value)=>value*(damageTable[unitType(a).attack]?.[unitType(b).armor]??1);
  const questNames=['Clear the three Frostfang scouts','Recover the relic from the ruined shrine','Defeat the Frostbound sovereign','Return to the sanctuary'];
  const trainable=(s,u)=>s.mode==='moba'||!s.teams[u.team]?[]:u.kind==='hall'?['worker']:u.kind==='altar'?['hero',flyers[s.teams[u.team].faction]]:casterTraining[u.kind]?(s.teams[u.team].faction===casterTraining[u.kind].faction?[casterTraining[u.kind].unit]:[]):u.kind==='barracks'?armies[s.teams[u.team].faction].units.filter(k=>!['necromancer','shaman'].includes(k)):u.kind==='workshop'?[siege[s.teams[u.team].faction]]:[];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const clone = v => JSON.parse(JSON.stringify(v));
  const cell = (x,z) => [clamp(Math.floor((x+32)/2),0,31),clamp(Math.floor((z+32)/2),0,31)];
  const index = (x,z) => {const p=cell(x,z);return p[1]*32+p[0];};
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const tierHeight=(map,i,x,z)=>{const h=(map.heights?.[i]||0)*2,r=map.ramps?.[i]||0;return h+(r===1?x:r===2?2-x:r===3?z:r===4?2-z:0);};
  function reliefHeight(map,x,z){if(!map.relief)return 0;const px=clamp((x+32)/2,0,32),pz=clamp((z+32)/2,0,32),cx=Math.min(31,Math.floor(px)),cz=Math.min(31,Math.floor(pz)),u=px-cx,v=pz-cz,i=cz*33+cx;return (map.relief[i]*(1-u)+map.relief[i+1]*u)*(1-v)+(map.relief[i+33]*(1-u)+map.relief[i+34]*u)*v;}
  const tileHeight=(map,i,x,z)=>tierHeight(map,i,x,z)+reliefHeight(map,i%32*2-32+x,Math.floor(i/32)*2-32+z);
  function sculptRelief(map,x,z,tool,radius=4,strength=.25,target){
    if(!['raise','lower','smooth','flatten'].includes(tool)||![x,z,radius,strength].every(Number.isFinite)||Math.abs(x)>30||Math.abs(z)>30||![2,4,6].includes(radius)||![.125,.25,.5].includes(strength)||target!==undefined&&(!Number.isFinite(target)||Math.abs(target)>1))throw Error('Invalid sculpt brush');
    map.relief??=Array(1089).fill(0);const before=[...map.relief],cx=Math.round((x+32)/2),cz=Math.round((z+32)/2);target??=before[cz*33+cx];
    for(let vz=Math.max(1,cz-radius/2);vz<=Math.min(31,cz+radius/2);vz++)for(let vx=Math.max(1,cx-radius/2);vx<=Math.min(31,cx+radius/2);vx++){
      if([0,1].some(dz=>[0,1].some(dx=>map.terrain[(vz-dz)*32+vx-dx]===1)))continue;
      const d=Math.hypot(vx-cx,vz-cz)*2/radius;if(d>=1)continue;const weight=1-d*d*(3-2*d),i=vz*33+vx;
      let value=before[i];if(tool==='smooth'){let sum=0;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)sum+=before[(vz+dz)*33+vx+dx];value+=(sum/9-value)*weight;}
      else if(tool==='flatten')value+=(target-value)*weight;else value+=(tool==='raise'?strength:-strength)*weight;
      map.relief[i]=clamp(Math.round(value*16)/16,-1,1)||0;
    }
    return map;
  }
  function elevation(map,x,z){const [cx,cz]=cell(x,z);return tileHeight(map,cz*32+cx,clamp(x-(cx*2-32),0,2),clamp(z-(cz*2-32),0,2));}
  function terrainEdge(map,a,b){
    if(a===b)return true;const dx=b%32-a%32,dz=Math.floor(b/32)-Math.floor(a/32);if(Math.abs(dx)+Math.abs(dz)!==1)return false;
    for(const t of [0,2]){const x=dx?dx>0?2:0:t,z=dz?dz>0?2:0:t;if(Math.abs(tileHeight(map,a,x,z)-tileHeight(map,b,x-dx*2,z-dz*2))>.01)return false;}return true;
  }
  function traversable(map,ax,az,bx,bz){
    const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.2));let previous=index(ax,az);
    for(let k=1;k<=n;k++){const next=index(ax+(bx-ax)*k/n,az+(bz-az)*k/n);if(next!==previous){const dx=next%32-previous%32,dz=Math.floor(next/32)-Math.floor(previous/32);if(dx&&dz){const mid=previous+dx,other=previous+dz*32;if(!terrainEdge(map,previous,mid)||!terrainEdge(map,mid,next)||!terrainEdge(map,previous,other)||!terrainEdge(map,other,next))return false;}else if(!terrainEdge(map,previous,next))return false;}previous=next;}return true;
  }
  function flatSite(map,x,z,radius){
    const level=map.heights?.[index(x,z)]||0,a=cell(x-radius,z-radius),b=cell(x+radius,z+radius);if(Math.abs(x)+radius>30||Math.abs(z)+radius>30)return false;let low=Infinity,high=-Infinity;
    for(let cz=a[1];cz<=b[1];cz++)for(let cx=a[0];cx<=b[0];cx++){const i=cz*32+cx;if(map.terrain[i]===1||map.ramps?.[i]||(map.heights?.[i]||0)!==level)return false;for(const [dx,dz] of [[0,0],[2,0],[2,2],[0,2]]){const h=tileHeight(map,i,dx,dz);low=Math.min(low,h);high=Math.max(high,h);}}return high-low<=.25;
  }
  const unitHeight=(s,u)=>elevation(s.map,u.x,u.z)+(types[u.kind]?.flying?4:0);
  function attackClear(s,u,v){
    if(unitType(u).range<=2&&!types[u.kind].flying&&!traversable(s.map,u.x,u.z,v.x,v.z))return false;
    const ay=unitHeight(s,u)+1.6,by=unitHeight(s,v)+1.6,dx=v.x-u.x,dz=v.z-u.z,cuts=[0,1];
    for(let i=1;i<32;i++)for(const [a,d] of [[u.x,dx],[u.z,dz]])if(d){const t=(i*2-32-a)/d;if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
    // MiYu: bilinear relief along a ray is quadratic; include its interior peak and both cliff endpoints.
    for(let k=1;k<cuts.length;k++){const first=cuts[k-1],last=cuts[k],mid=(first+last)/2,[cx,cz]=cell(u.x+dx*mid,u.z+dz*mid),i=cz*32+cx,difference=t=>tileHeight(s.map,i,u.x+dx*t-(cx*2-32),u.z+dz*t-(cz*2-32))-(ay+(by-ay)*t),start=difference(first),end=difference(last),center=difference(mid),a=2*(start+end-2*center),b=end-start-a,peak=a<0?-b/(2*a):-1;if(start>.001||end>.001||peak>0&&peak<1&&difference(first+(last-first)*peak)>.001)return false;}return true;
  }
  function highlandMap(){
    const map=defaultMap();map.name='Winterfall Highland Pass';map.players[1].ai=false;map.heights=Array(1024).fill(0);map.ramps=Array(1024).fill(0);
    for(let z=7;z<=23;z++)for(let x=10;x<=21;x++){if(Math.hypot(x-clamp(x,13,18),z-clamp(z,11,19))>4)continue;const i=z*32+x;map.heights[i]=1;map.terrain[i]=0;}
    for(let z=10;z<=16;z++)for(let x=15;x<=20;x++)if(Math.hypot(x-clamp(x,16,19),z-clamp(z,11,15))<=1)map.heights[z*32+x]=2;
    for(let z=18;z<=21;z++){map.ramps[z*32+9]=1;map.terrain[z*32+9]=2;for(let x=10;x<=21;x++)map.terrain[z*32+x]=2;map.ramps[z*32+22]=2;map.terrain[z*32+22]=2;}
    for(let z=12;z<=14;z++){map.ramps[z*32+14]=1;map.terrain[z*32+14]=2;}
    map.units=[{kind:'tower',team:1,x:5,z:-5},{kind:'archer',team:1,x:7,z:-7},{kind:'ballista',team:0,x:-19,z:11}];
    map.regions=[{name:'Highland outpost',x:5,z:-5,width:8,height:8}];return validateMap(map);
  }
  function defaultMap(mode='skirmish') {
    const map={version:1,name:mode==='moba'?'Ancients of the Vale':mode==='td'?'Serpentine Watch':'Winterfall Basin',mode,startingHour:8,terrain:Array(1024).fill(0),surfaces:Array(1024).fill(0),heights:Array(1024).fill(0),ramps:Array(1024).fill(0),props:[],spawns:[[-23,23],[23,-23]],startingGold:mode==='td'?650:500,startingWood:mode==='skirmish'?150:250,waveInterval:mode==='td'?18:mode==='moba'?30:24,waves:12};
    for(let z=0;z<32;z++)for(let x=0;x<32;x++)if((x<2||x>29||z<2||z>29)&&((x+z)%5!==0))map.terrain[z*32+x]=1;
    if(mode==='skirmish'){
      for(let z=4;z<28;z++)if(z<13||z>18){const center=15.5+1.1*Math.sin((z-15.5)*.36),width=1.05+.25*Math.cos((z-15.5)*.63);for(let x=13;x<=18;x++)if(Math.abs(x-center)<=width)map.terrain[z*32+x]=1;}
    }else if(mode!=='td')for(let z=9;z<23;z++)if(z<14||z>18)map.terrain[z*32+15]=map.terrain[z*32+16]=1;
    if(mode==='skirmish')for(let z=3;z<29;z++)for(let x=3;x<29;x++)if(Math.abs(x+z-31)<1.5&&map.terrain[z*32+x]===0)map.terrain[z*32+x]=2;
    if(mode==='moba')for(let z=3;z<29;z++)for(let x=3;x<29;x++)if(map.terrain[z*32+x]===0&&[0,1,2].some(lane=>{const route=lanePath(0,lane);return route.slice(1).some((p,i)=>segmentDistance(x*2-31,z*2-31,route[i],p)<1.8);}))map.terrain[z*32+x]=2;
    if(mode==='skirmish'){
      // MiYu: two mirrored wooded ridges retain flat bases, roads and the central crossing.
      const ridge=(x,z,h,r=0)=>{const i=z*32+x,j=(31-z)*32+31-x;map.heights[i]=map.heights[j]=h;map.ramps[i]=r;map.ramps[j]=r===1?2:r===2?1:r===3?4:r===4?3:0;};
      for(let z=8;z<=15;z++)for(let x=5;x<=11;x++)if(((x-8.5)/3.5)**2+((z-11.5)/4)**2<=1.3)ridge(x,z,1);
      for(let z=7;z<=16;z++)for(let x=4;x<=12;x++){const i=z*32+x;if(map.heights[i]||map.terrain[i]===1)continue;for(const [dx,dz,r] of [[1,0,1],[-1,0,2],[0,1,3],[0,-1,4]])if(map.heights[(z+dz)*32+x+dx]===1&&!map.ramps[(z+dz)*32+x+dx]){ridge(x,z,0,r);break;}}
      for(let z=10;z<=12;z++)for(let x=7;x<=9;x++)ridge(x,z,2);
      for(let z=11;z<=13;z++)ridge(12,z,0,2);
      ridge(10,11,1,2);
    }
    for(const team of [0,1]){const [x,z]=map.spawns[team];map.props.push({kind:'mine',x:x+(team?-6:6),z,amount:9000});for(let i=0;i<8;i++)map.props.push({kind:'tree',x:x+(team?-1:1)*(2+i%4*2),z:z+(team?1:-1)*(6+Math.floor(i/4)*2),amount:600});}
    for(let i=0;i<24;i++){const x=((i*17)%50)-25,z=((i*29)%48)-24;if(Math.hypot(x,z)>12&&map.spawns.every(p=>Math.hypot(p[0]-x,p[1]-z)>12))map.props.push({kind:'tree',x,z,amount:600});}
    if(mode==='moba')map.props=map.props.filter(p=>p.kind!=='mine'&&[0,1,2].every(lane=>{const route=lanePath(0,lane);return route.slice(1).every((v,i)=>segmentDistance(p.x,p.z,route[i],v)>3.5);}));
    map.players=[{faction:0,ai:false},{faction:1,ai:true}];map.units=[];map.triggers=[];map.regions=[];
    if(mode==='rpg'){
      map.name='The Shattered Covenant';map.startingGold=180;map.props=map.props.filter(p=>p.kind==='tree');
      map.units=[{kind:'neutral',team:1,x:-12,z:14,tag:'scout'},{kind:'neutral',team:1,x:-7,z:10,tag:'scout'},{kind:'neutral',team:1,x:-13,z:5,tag:'scout'},{kind:'neutral',team:1,x:5,z:0,tag:'keeper'},{kind:'neutral',team:1,x:20,z:-18,tag:'boss'}];
      for(let z=0;z<32;z++)for(let x=0;x<32;x++)if(Math.abs(x+z-31)<2&&map.terrain[z*32+x]!==1)map.terrain[z*32+x]=2;
    }
    map.relief=Array(1089).fill(0);if(mode==='skirmish')for(let vz=1;vz<32;vz++)for(let vx=1;vx<32;vx++){
      const x=vx*2-32,z=vz*2-32,baseDistance=Math.min(...map.spawns.map(p=>Math.hypot(x-p[0],z-p[1])));if(baseDistance<16||[0,1].some(dz=>[0,1].some(dx=>map.terrain[(vz-dz)*32+vx-dx]===1)))continue;
      const edge=Math.min(vx,vz,32-vx,32-vz)/2,weight=clamp((baseDistance-16)/6,0,1)*Math.min(1,edge);map.relief[vz*33+vx]=Math.round((Math.cos(x*.33+z*.17)+Math.cos(z*.31-x*.21))*.375*weight*16)/16||0;
    }
    return map;
  }
  function validateMap(raw) {
    if(!raw||raw.version!==1||!['skirmish','moba','td','rpg'].includes(raw.mode)||!Array.isArray(raw.terrain)||raw.terrain.length!==1024||raw.terrain.some(v=>!Number.isInteger(v)||v<0||v>2))throw Error('Invalid map terrain or mode');
    for(const [key,max] of [['heights',3],['ramps',4],['surfaces',2]])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].length!==1024||raw[key].some(v=>!Number.isInteger(v)||v<0||v>max)))throw Error('Invalid terrain '+key);
    if(raw.relief!==undefined&&(!Array.isArray(raw.relief)||raw.relief.length!==1089||Array.from(raw.relief).some(v=>!Number.isFinite(v)||Math.abs(v)>1||!Number.isInteger(v*16))))throw Error('Invalid terrain relief');
    if(raw.startingHour!==undefined&&(!Number.isInteger(raw.startingHour)||raw.startingHour<0||raw.startingHour>23))throw Error('Invalid starting hour');
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=27);
    if(!Array.isArray(raw.spawns)||raw.spawns.length!==2||!raw.spawns.every(point)||Math.hypot(raw.spawns[0][0]-raw.spawns[1][0],raw.spawns[0][1]-raw.spawns[1][1])<20)throw Error('Two separated spawn points are required');
    if(!Array.isArray(raw.props)||raw.props.length>100||raw.props.some(p=>!p||!['tree','mine','camp'].includes(p.kind)||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>29||Math.abs(p.z)>29))throw Error('Invalid map objects');
    const map={version:1,name:Array.from(String(raw.name||'Custom battlefield')).slice(0,40).join(''),mode:raw.mode,startingHour:raw.startingHour??8,terrain:[...raw.terrain],surfaces:raw.surfaces?[...raw.surfaces]:Array(1024).fill(0),heights:raw.heights?[...raw.heights]:Array(1024).fill(0),ramps:raw.ramps?[...raw.ramps]:Array(1024).fill(0),relief:raw.relief?raw.relief.map(v=>v||0):Array(1089).fill(0),spawns:raw.spawns.map(p=>[...p]),props:raw.props.map(p=>({kind:p.kind,x:p.x,z:p.z,amount:clamp(Number.isFinite(p.amount)?p.amount:1000,100,10000)})),startingGold:clamp(Number.isFinite(raw.startingGold)?Math.round(raw.startingGold):500,100,2000),startingWood:clamp(Number.isFinite(raw.startingWood)?Math.round(raw.startingWood):raw.mode==='skirmish'?150:250,0,2000),waveInterval:clamp(Number.isFinite(raw.waveInterval)?raw.waveInterval:raw.mode==='moba'?30:24,10,60),waves:clamp(Number.isFinite(raw.waves)?Math.round(raw.waves):12,3,30)};
    const at=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=27&&Math.abs(p.z)<=27;
    if(raw.players!==undefined&&(!Array.isArray(raw.players)||raw.players.length!==2||raw.players.some(p=>!p||!Number.isInteger(p.faction)||p.faction<0||p.faction>3||typeof p.ai!=='boolean'||p.heroClass!==undefined&&!validHero(p.heroClass))))throw Error('Invalid player settings');
    map.players=clone(raw.players||[{faction:0,ai:false},{faction:1,ai:true}]);for(const p of map.players)p.heroClass??=0;
    if(raw.units!==undefined&&(!Array.isArray(raw.units)||raw.units.length>64||raw.units.some(u=>!at(u)||!Object.hasOwn(types,u.kind)||![-1,0,1].includes(u.team)||u.heroClass!==undefined&&(u.kind!=='hero'||!validHero(u.heroClass))||u.tag!==undefined&&!['scout','keeper','boss'].includes(u.tag))))throw Error('Invalid placed units');
    map.units=(raw.units||[]).map(u=>({kind:u.kind,team:u.team,x:u.x,z:u.z,...(u.heroClass!==undefined?{heroClass:u.heroClass}:{}),...(u.tag?{tag:u.tag}:{})}));
    if(map.units.some((u,i)=>u.kind==='hauntedmine'&&(map.mode!=='skirmish'||map.players[u.team]?.faction!==3||!map.props.some(r=>r.kind==='mine'&&distance(r,u)<.01)||map.units.some((v,j)=>j<i&&v.kind==='hauntedmine'&&distance(u,v)<.01))))throw Error('Place one Haunted Mine on a gold deposit for a Revenant player');
    if(map.mode==='rpg'&&(map.units.filter(u=>u.tag==='scout'&&u.team===1).length<3||!map.units.some(u=>u.tag==='keeper'&&u.team===1)||!map.units.some(u=>u.tag==='boss'&&u.team===1)))throw Error('RPG requires three enemy scouts, a relic keeper and a boss');
    if(raw.regions!==undefined&&(!Array.isArray(raw.regions)||raw.regions.length>32||raw.regions.some(r=>!at(r)||![r.width,r.height].every(v=>Number.isFinite(v)&&v>=2&&v<=54)||Math.abs(r.x)+r.width/2>29||Math.abs(r.z)+r.height/2>29)))throw Error('Invalid map regions');
    map.regions=(raw.regions||[]).map((r,i)=>({name:Array.from(String(r.name||'Region '+(i+1))).slice(0,40).join(''),x:r.x,z:r.z,width:r.width,height:r.height}));
    const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max,region=v=>integer(v,-1,map.regions.length-1);
    if(raw.triggers!==undefined&&(!Array.isArray(raw.triggers)||raw.triggers.length>32))throw Error('Invalid map triggers');
    map.triggers=(raw.triggers||[]).map((t,i)=>{
      if(!at(t)||!integer(t.after,-1,i-1))throw Error('Invalid trigger position or dependency');
      const conditions=t.conditions||[{when:t.when,team:t.team,value:t.value,region:-1,kind:'*'}],actions=t.actions||[{action:t.action,team:t.team,value:t.action==='spawn'?1:t.value,region:-1,kind:t.kind||'soldier',text:t.text||'Map objective activated'}];
      if(!Array.isArray(conditions)||!conditions.length||conditions.length>8||conditions.some(c=>!c||!['timer','delay','enter','kills','gold','wood','units','clear'].includes(c.when)||!integer(c.team,0,1)||!integer(c.value,1,600)||!region(c.region)||c.kind!=='*'&&!Object.hasOwn(types,c.kind)))throw Error('Invalid trigger conditions');
      if(!Array.isArray(actions)||!actions.length||actions.length>8||actions.some(a=>!a||!['spawn','gold','wood','message','victory','attackMove','heal'].includes(a.action)||!integer(a.team,0,1)||!integer(a.value,1,a.action==='spawn'?32:600)||!region(a.region)||!Object.hasOwn(types,a.kind)))throw Error('Invalid trigger actions');
      const logic=t.logic??'all',limit=t.limit??1,interval=t.interval??10;if(!['all','any'].includes(logic)||!integer(limit,1,99)||!integer(interval,1,600))throw Error('Invalid trigger repetition');
      return {name:Array.from(String(t.name||'Trigger '+(i+1))).slice(0,40).join(''),x:t.x,z:t.z,after:t.after,logic,limit,interval,conditions:conditions.map(c=>({when:c.when,team:c.team,value:c.value,region:c.region,kind:c.kind})),actions:actions.map(a=>({action:a.action,team:a.team,value:a.value,region:a.region,kind:a.kind,text:Array.from(String(a.text||'Map objective activated')).slice(0,120).join('')}))};
    });
    for(const p of map.spawns){const c=cell(...p);for(let z=c[1]-2;z<=c[1]+2;z++)for(let x=c[0]-2;x<=c[0]+2;x++)if(x>=0&&z>=0&&x<32&&z<32)map.terrain[z*32+x]=0;}
    for(let i=0;i<1024;i++)if(map.ramps[i]&&(map.heights[i]>=3||map.terrain[i]===1))throw Error('Ramp requires dry ground below maximum height');
    return map;
  }
  function eventMap(){
    const map=defaultMap();map.name='Winterfall Supply Road';map.players[1].ai=false;map.regions=[{name:'Reinforcements',x:-12,z:18,width:8,height:8},{name:'Mountain pass',x:-8,z:4,width:10,height:10}];
    const condition=(when,value,region=-1,kind='*')=>({when,value,region,kind,team:0}),action=(action,value,region=-1,kind='archer',text='')=>({action,value,region,kind,text,team:0});
    map.triggers=[
      {name:'Supply arrival',x:-12,z:18,after:-1,conditions:[condition('timer',3)],actions:[action('spawn',3,0),action('wood',80),action('message',1,-1,'archer','A supply escort has arrived. Lead your hero to the mountain pass.')]},
      {name:'Escort marches',x:-8,z:4,after:0,conditions:[condition('delay',2)],actions:[action('attackMove',1,1),action('message',1,-1,'archer','The escort is moving to the pass.')]},
      {name:'Pass secured',x:-8,z:4,after:1,conditions:[condition('enter',1,1,'hero'),condition('units',2,1,'archer')],actions:[action('gold',250),action('message',1,-1,'archer','Escort complete. Winterfall receives 250 gold.')]}
    ];return validateMap(map);
  }
  function siegeMap(){const map=defaultMap();map.name='Siege of Winterfall';map.startingGold=1500;map.units=[{kind:'ballista',team:0,x:-17,z:13},{kind:'trebuchet',team:0,x:-22,z:12},{kind:'catapult',team:0,x:-25,z:17},{kind:'ram',team:0,x:-13,z:18},{kind:'workshop',team:0,x:-10,z:26},{kind:'farm',team:0,x:-27,z:27},{kind:'farm',team:0,x:-27,z:8},{kind:'dragon',team:0,x:-15,z:9},{kind:'archer',team:1,x:-6,z:2},{kind:'tower',team:1,x:-8,z:0},{kind:'tower',team:1,x:0,z:0}];return map;}
  function spawn(s,kind,team,x,z,extra={}) {
    if(s.units.length>=LIMIT)return null;
    const heroClass=kind==='hero'?(extra.heroClass??s.teams[team]?.heroClass??0):0,d=kind==='hero'?heroes[heroClass]:types[kind],f=s.mode==='moba'?0:s.teams[team]?.faction||0,hp=d.hp*(f===1?1.12:1),speed=d.speed*(f===2?1.12:1);
    const u={id:++s.serial,kind,team,x,z,hp,maxHp:hp,damage:d.damage*(f===3?1.1:1),speed,cd:0,order:null,waypoints:[],path:[],pathAt:-100,built:1,queue:[],level:1,xp:0,mana:150,spell:[0,0,0,0],inventory:[],cargo:0,respawn:0,...(['worker','ghoul'].includes(kind)?{gatherCd:0}:{}),...(kind==='necromancer'?{raiseDeadAuto:false,raiseDeadCd:0,casterRank:s.teams[team]?.necromancy||0}:{}),...(kind==='shaman'?{bloodlustAuto:true,casterRank:s.teams[team]?.shamanism||0}:{}),...(kind==='hero'?{heroClass,skills:[0,0,0,0],skillPoints:1,itemCooldown:0}:{}),...extra};if(['necromancer','shaman'].includes(kind)&&u.casterRank){u.maxHp+=40*u.casterRank;u.hp+=40*u.casterRank;}s.units.push(u);return u;
  }
  function create(mode='skirmish',options={}) {
    const map=validateMap(options.map||defaultMap(mode));mode=map.mode;if(options.heroes&&(!Array.isArray(options.heroes)||options.heroes.length!==2||!options.heroes.every(validHero)))throw Error('Invalid hero selection');
    const s={version:1,heroLifecycleVersion:1,economyVersion:1,map,mode,frame:0,serial:0,units:[],corpses:[],resources:clone(map.props),teams:[0,1].map(i=>({gold:map.startingGold,wood:map.startingWood,faction:clamp(options.factions?.[i]??map.players[i].faction,0,3),ai:options.ai?.[i]??map.players[i].ai,upgrade:0,kills:0,tier:1,research:0,necromancy:0,shamanism:0,skeletalLongevity:0,skeletalMastery:0,cannibalize:0,portalGranted:false,heroClass:options.heroes?.[i]??map.players[i].heroClass})),events:[],pendingEvents:[],zones:[],winner:null,wave:0,tdPending:[],nextWave:40,lives:20,loot:[],quest:{stage:0,scouts:0,relic:false,boss:false},triggered:[],triggerState:map.triggers.map(()=>({count:0,last:-1,next:0})),announcement:'',announcements:['',''],explored:[Array(1024).fill(0),Array(1024).fill(0)],visible:[[],[]]};
    for(const team of [0,1]){
      if((mode==='td'||mode==='rpg')&&team===1)continue;
      const [x,z]=map.spawns[team];spawn(s,'hall',team,x,z);
      if(mode==='skirmish'){
        const undead=s.teams[team].faction===3,mine=undead&&s.resources.filter(r=>r.kind==='mine'&&r.amount>0&&distance(r,{x,z})<12&&!hauntedMine(s,r)&&!map.units.some(u=>u.kind==='hauntedmine'&&u.team!==team&&distance(u,r)<.01)).sort((a,b)=>distance(a,{x,z})-distance(b,{x,z}))[0];if(mine)spawn(s,'hauntedmine',team,mine.x,mine.z);
        for(let i=0;i<(undead?3:5);i++){const p=undead&&mine?minePoint(mine,i):{x:x+(team?-1:1)*(4.5-[0,.7,.7,1.4,1.4][i]),z:z+[0,1.4,-1.4,.7,-.7][i]};spawn(s,'worker',team,p.x,p.z);}
        if(undead)spawn(s,'ghoul',team,x,z+(team?4:-4));
      }else if(mode==='moba'){
        spawn(s,'hero',team,x,z+(team?4:-4));
        for(let lane=0;lane<3;lane++){const route=lanePath(team,lane);for(const j of [1,2]){const p=route[j];spawn(s,'tower',team,p[0],p[1],{lane});}}
      }else if(mode==='rpg'){spawn(s,'hero',0,x+3,z-3,{maxHp:heroes[s.teams[0].heroClass].hp+250,hp:heroes[s.teams[0].heroClass].hp+250,damage:heroes[s.teams[0].heroClass].damage+17});}
      else{spawn(s,'worker',0,-16,-17);spawn(s,'hero',0,-22,-18);spawn(s,'tower',0,-12,-20);s.nextWave=120;}
    }
    if(mode==='skirmish'||mode==='moba')for(const p of [{x:-8,z:-6},{x:8,z:6},...map.props.filter(p=>p.kind==='camp')])spawn(s,'neutral',-1,p.x,p.z,{home:[p.x,p.z]});
    for(const p of map.units){if(p.kind==='hauntedmine'){if(mode!=='skirmish'||s.teams[p.team]?.faction!==3)continue;const r=s.resources.find(r=>r.kind==='mine'&&distance(r,p)<.01);if(!r)throw Error('Haunted Mine must cover a gold deposit');const existing=hauntedMine(s,r);if(existing){if(existing.team!==p.team)throw Error('Gold deposit is already haunted');continue;}}const extra={...(p.heroClass!==undefined?{heroClass:p.heroClass}:{}),...(p.team===-1||p.tag?{home:[p.x,p.z]}:{}),...(p.tag?{tag:p.tag}:{})};if(mode==='rpg'){const hp=p.tag==='boss'?1900:p.tag==='keeper'?700:260;Object.assign(extra,{hp,maxHp:hp,damage:p.tag==='boss'?60:18,speed:2});}spawn(s,p.kind,p.team,p.x,p.z,extra);}
    s.projectiles=[];s.projectileSerial=0;visibility(s);return s;
  }
  function lanePath(team,lane){const paths=[[[-23,23],[-24,7],[-24,-18],[-7,-24],[23,-23]],[[-23,23],[-13,13],[-5,5],[5,-5],[13,-13],[23,-23]],[[-23,23],[-7,24],[18,24],[24,7],[23,-23]]];return team?[...paths[lane]].reverse():paths[lane];}
  function spawnLaneWave(s){
    const roster=['creep','creep','creep','rangedcreep',...((s.wave+1)%7===0?['siegecreep']:[])],planned=[];
    if(s.units.length+roster.length*6>LIMIT)return false;
    for(let team=0;team<2;team++)for(let lane=0;lane<3;lane++){
      const route=lanePath(team,lane),[x,z]=route[0],dx=route[1][0]-x,dz=route[1][1]-z,d=Math.hypot(dx,dz),fx=dx/d,fz=dz/d;
      const members=roster.map((kind,i)=>({id:s.serial+planned.length+i+1,kind,team,x:x+fx*7.6,z:z+fz*7.6,hp:types[kind].hp,speed:types[kind].speed,route,waypoint:1,lane}));
      const slots=formation({...s,units:[...s.units,...planned]},members,x+fx*8.6,z+fz*8.6);if(!slots||[...slots.values()].some(([px,pz])=>Math.hypot(px-x-fx*8.6,pz-z-fz*8.6)>6||solid(s,px,pz)))return false;
      for(const u of members){[u.x,u.z]=slots.get(u.id);planned.push(u);}
    }
    for(const u of planned)spawn(s,u.kind,u.team,u.x,u.z,{route:u.route,waypoint:1,lane:u.lane});return true;
  }
  const tdPath=[[-25,-24],[23,-24],[23,-8],[-21,-8],[-21,7],[20,7],[20,20],[-23,23]];
  function solid(s,x,z,ignore=0,team=-1){if(Math.abs(x)>30||Math.abs(z)>30||s.map.terrain[index(x,z)]===1)return true;return s.units.some(u=>u.id!==ignore&&u.hp>0&&!types[u.kind].speed&&(team<0||isVisible(s,team,u))&&Math.hypot(u.x-x,u.z-z)<(types[u.kind].radius||1)+.35);}
  const navigationCache=new WeakMap();
  function navigation(s,team=-1){
    let cache=navigationCache.get(s);if(!cache||cache.frame!==s.frame||cache.serial!==s.serial){cache={frame:s.frame,serial:s.serial,blocked:[]};navigationCache.set(s,cache);}if(cache.blocked[team+1])return cache.blocked[team+1];
    const blocked=Uint8Array.from(s.map.terrain,v=>v===1?1:0);
    for(const u of s.units)if(u.hp>0&&!types[u.kind].speed&&(team<0||isVisible(s,team,u))){const radius=(types[u.kind].radius||1)+.35,[cx,cz]=cell(u.x,u.z),r=Math.ceil(radius/2)+1;for(let z=Math.max(0,cz-r);z<=Math.min(31,cz+r);z++)for(let x=Math.max(0,cx-r);x<=Math.min(31,cx+r);x++)if(Math.hypot(x*2-31-u.x,z*2-31-u.z)<radius)blocked[z*32+x]=1;}
    cache.blocked[team+1]=blocked;return blocked;
  }
  function routeSearch(s,u,goal=-1){
    const start=index(u.x,u.z),blocked=navigation(s,u.team),prev=new Int16Array(1024);prev.fill(-1);prev[start]=start;const cells=[start];
    for(let k=0;k<cells.length;k++){const n=cells[k],x=n%32,z=Math.floor(n/32);if(n===goal)break;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,j=nz*32+nx;if(nx<1||nz<1||nx>30||nz>30||prev[j]!==-1||blocked[j]||!terrainEdge(s.map,n,j))continue;prev[j]=n;cells.push(j);}}
    return {start,prev,cells};
  }
  function path(s,u,tx,tz){
    const goal=index(tx,tz),{start,prev,cells}=routeSearch(s,u,goal);let found=start,best=Infinity;
    for(const n of cells){const d=Math.hypot(n%32-goal%32,Math.floor(n/32)-Math.floor(goal/32));if(d<best){best=d;found=n;}}
    const result=[];for(let n=found;n!==start;n=prev[n])result.push([n%32*2-31,Math.floor(n/32)*2-31]);return result.reverse();
  }
  function movementRadius(u){return types[u.kind].flying?1:types[u.kind].attack==='siege'?.9:types[u.kind].model==='knight'?.7:.5;}
  // ponytail: each selected unit scans the 32x32 grid (max 40); share reachability fields when maps grow.
  function orderPoint(s,u,o){return o?.type==='gather'?s.resources[o.resource]||u:['construct','repair'].includes(o?.type)?s.units.find(b=>b.id===o.target)||u:Number.isFinite(o?.x)&&Number.isFinite(o?.z)?o:u;}
  function queueable(u,o){return ['move','attackMove'].includes(o?.type)||u.kind==='ghoul'&&o?.type==='gather'||u.kind==='worker'&&['build','construct','repair','gather'].includes(o?.type);}
  function queueError(us){return us.some(u=>u.consumed||u.order&&!queueable(u,u.order))?'Finish this order before queuing work':us.some(u=>(u.waypoints?.length||0)>=8)?'Waypoint queue is full (8 waiting)':null;}
  function formation(s,units,x,z,append=false){
    const orders=new Map();
    for(const flying of [false,true]){
      const members=units.filter(u=>!!types[u.kind].flying===flying).map(u=>{const p=append&&orderPoint(s,u,u.waypoints?.at(-1)||u.order);return p?{...u,x:p.x,z:p.z}:u;});if(!members.length)continue;
      const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cz=members.reduce((n,u)=>n+u.z,0)/members.length,d=Math.hypot(x-cx,z-cz),fx=d>.01?(x-cx)/d:0,fz=d>.01?(z-cz)/d:-1,columns=Math.ceil(Math.sqrt(members.length)),rows=Math.ceil(members.length/columns),spacing=Math.max(...members.map(movementRadius))*2+.6;
      members.sort((a,b)=>unitType(a).range-unitType(b).range||Math.round((((b.x-cx)*fx+(b.z-cz)*fz)-((a.x-cx)*fx+(a.z-cz)*fz))*1e6)||a.id-b.id);
      const reserved=s.units.filter(u=>u.hp>0&&!u.inside&&u.speed&&u.team===members[0].team&&!units.some(v=>v.id===u.id)&&!!types[u.kind].flying===flying).map(u=>{const p=orderPoint(s,u,u.waypoints?.at(-1)||(['move','attackMove','patrol'].includes(u.order?.type)?u.order:u));return {x:p.x,z:p.z,r:movementRadius(u)};});
      for(let i=0;i<members.length;i++){
        const u=members[i],row=Math.floor(i/columns),width=Math.min(columns,members.length-row*columns),side=(i%columns-(width-1)/2)*spacing,forward=((rows-1)/2-row)*spacing,ideal=[clamp(x+fz*side+fx*forward,-30,30),clamp(z-fx*side+fz*forward,-30,30)],r=movementRadius(u),search=flying?null:routeSearch(s,u),cells=flying?Array.from({length:1024},(_,j)=>j):search.cells;
        const available=(px,pz)=>Math.abs(px)<=30&&Math.abs(pz)<=30&&(flying||!solid(s,px,pz,u.id,u.team))&&reserved.every(v=>Math.hypot(px-v.x,pz-v.z)>=r+v.r+.3);
        let dest=null,best=Infinity;
        const consider=(px,pz)=>{const score=(px-ideal[0])**2+(pz-ideal[1])**2;if(score<best&&available(px,pz)){dest=[px,pz];best=score;}};
        const cellX=cell(...ideal)[0]*2-31,cellZ=cell(...ideal)[1]*2-31;
        if(flying||search.prev[index(...ideal)]!==-1&&traversable(s.map,cellX,cellZ,...ideal))consider(...ideal);
        for(const j of cells)consider(j%32*2-31,Math.floor(j/32)*2-31);
        if(!dest)return null;
        reserved.push({x:dest[0],z:dest[1],r});orders.set(u.id,dest);
      }
    }
    return orders;
  }
  function walkClear(s,u,x,z){
    if(Math.abs(x)>30||Math.abs(z)>30)return false;if(types[u.kind].flying)return true;
    if(!traversable(s.map,u.x,u.z,x,z)||s.map.terrain[index(x,z)]===1)return false;
    const dx=x-u.x,dz=z-u.z,cuts=[0,1];for(let i=1;i<32;i++)for(const [a,d] of [[u.x,dx],[u.z,dz]])if(d){const t=(i*2-32-a)/d;if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(s.map.terrain[index(u.x+dx*t,u.z+dz*t)]===1)return false;}
    return !s.units.some(v=>v.id!==u.id&&v.hp>0&&!types[v.kind].speed&&(u.team<0||isVisible(s,u.team,v))&&(distance(u,v)<(types[v.kind].radius||1)+.35?Math.hypot(x-v.x,z-v.z)<=distance(u,v)+.0001:segmentDistance(v.x,v.z,[u.x,u.z],[x,z])<(types[v.kind].radius||1)+.35));
  }
  function traffic(s,u){return s.units.filter(v=>v.id!==u.id&&v.hp>0&&!v.inside&&types[v.kind].speed&&!!types[v.kind].flying===!!types[u.kind].flying&&(u.team<0||v.team===u.team||isVisible(s,u.team,v))&&(types[u.kind].flying||Math.abs(unitHeight(s,u)-unitHeight(s,v))<1.5||traversable(s.map,u.x,u.z,v.x,v.z)));}
  function trafficClear(u,near,x,z){
    const r=movementRadius(u);return near.every(v=>{if(v.id===u.id)return true;const radius=r+movementRadius(v),before=distance(u,v),after=Math.hypot(x-v.x,z-v.z);return before<radius-.0001?after>before+.0001:segmentDistance(v.x,v.z,[u.x,u.z],[x,z])>=radius-.0001;});
  }
  const trafficCache=new WeakMap();
  function trafficGrid(s,u){
    let cache=trafficCache.get(s);if(!cache||cache.frame!==s.frame||cache.serial!==s.serial){cache={frame:s.frame,serial:s.serial,teams:[],edges:new Uint8Array(121*121*8)};trafficCache.set(s,cache);}const key=types[u.kind].flying?3:u.team+1;if(cache.teams[key])return cache.teams[key];
    const grid=new Uint8Array(121*121);if(!types[u.kind].flying){for(let z=0;z<=120;z++)for(let x=0;x<=120;x++)if(s.map.terrain[Math.floor((z+4)/4)*32+Math.floor((x+4)/4)]===1)grid[z*121+x]=1;
      for(const v of s.units)if(v.hp>0&&!types[v.kind].speed&&(u.team<0||isVisible(s,u.team,v))){const r=(types[v.kind].radius||1)+.4;for(let z=Math.max(0,Math.floor((v.z-r)*2)+60);z<=Math.min(120,Math.ceil((v.z+r)*2)+60);z++)for(let x=Math.max(0,Math.floor((v.x-r)*2)+60);x<=Math.min(120,Math.ceil((v.x+r)*2)+60);x++)if(Math.hypot(x/2-30-v.x,z/2-30-v.z)<r)grid[z*121+x]=1;}}
    return cache.teams[key]=grid;
  }
  // Share only identical visible obstacle sets and radii; update moved members within the tick.
  function trafficField(s,u,near){
    const r=movementRadius(u),members=[u,...near].sort((a,b)=>a.id-b.id),key=r+':'+members.map(v=>v.id).join(','),cache=trafficCache.get(s);cache.fields??=new Map();let field=cache.fields.get(key);
    if(!field){field={counts:new Uint16Array(121*121),occupants:[],positions:new Map()};cache.fields.set(key,field);}
    const raster=(v,x,z,delta)=>{const reach=r+movementRadius(v),margin=reach+.8;for(let iz=Math.max(0,Math.floor((z-margin)*2)+60);iz<=Math.min(120,Math.ceil((z+margin)*2)+60);iz++)for(let ix=Math.max(0,Math.floor((x-margin)*2)+60);ix<=Math.min(120,Math.ceil((x+margin)*2)+60);ix++){const d=Math.hypot(ix/2-30-x,iz/2-30-z),j=iz*121+ix;if(d<reach-.0001)field.counts[j]+=delta;if(d<margin){const list=field.occupants[j]??=[];if(delta>0)list.push(v);else list.splice(list.indexOf(v),1);}}};
    for(const v of members){const p=field.positions.get(v.id);if(p&&p[0]===v.x&&p[1]===v.z)continue;if(p)raster(v,p[0],p[1],-1);raster(v,v.x,v.z,1);field.positions.set(v.id,[v.x,v.z]);}
    return field;
  }
  const trafficDirections=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
  function trafficPath(s,u,x,z,near,stop){
    const size=121,start=(Math.round(u.z*2)+60)*size+Math.round(u.x*2)+60,blocked=trafficGrid(s,u).slice(),field=trafficField(s,u,near),prev=new Int16Array(size*size),cost=new Float64Array(size*size);prev.fill(-1);cost.fill(Infinity);cost[start]=0;prev[start]=start;
    // Fixed grid edges depend only on this frame's map; each caller subtracts its own body below.
    const r=movementRadius(u),edges=trafficCache.get(s).edges;
    const heap=[];
    const push=(node,score)=>{let i=heap.length;heap.push([node,score]);while(i){const p=(i-1)>>1;if(heap[p][1]<=score)break;heap[i]=heap[p];i=p;}heap[i]=[node,score];};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[i]=heap[c];i=c;}heap[i]=last;}return first[0];};
    push(start,0);let found=start,best=Math.hypot(u.x-x,u.z-z);
    // Bound one search; partial routes are continued from the next position.
    for(let visited=0;heap.length&&visited<2048;visited++){
      const n=pop();if(blocked[n]===2)continue;blocked[n]=2;const cx=(n%size)/2-30,cz=Math.floor(n/size)/2-30,point=n===start?u:{id:u.id,kind:u.kind,team:u.team,x:cx,z:cz},d=Math.hypot(point.x-x,point.z-z);if(d<best){best=d;found=n;}if(d<=stop&&(types[u.kind].flying||traversable(s.map,point.x,point.z,x,z))||d<=.75&&walkClear(s,point,x,z)&&trafficClear(point,near,x,z)){found=n;break;}
      for(let direction=0;direction<8;direction++){
        const [dx,dz]=trafficDirections[direction],nx=cx+dx/2,nz=cz+dz/2,j=(nz*2+60)*size+nx*2+60,next=cost[n]+Math.hypot(dx,dz)/2;if(nx<-30||nz<-30||nx>30||nz>30||blocked[j]||field.counts[j]>(Math.hypot(nx-u.x,nz-u.z)<r*2-.0001?1:0)||next>=cost[j])continue;
        if(n===start){if(!walkClear(s,point,nx,nz)||!trafficClear(point,near,nx,nz))continue;}else{if(!types[u.kind].flying){const edge=n*8+direction;edges[edge]||=traversable(s.map,cx,cz,nx,nz)?1:2;if(edges[edge]===2)continue;}if(!trafficClear(point,field.occupants[n]||[],nx,nz))continue;}prev[j]=n;cost[j]=next;push(j,next+Math.max(0,Math.hypot(nx-x,nz-z)-stop));
      }
    }
    const result=[];for(let n=found;n!==start;n=prev[n])result.push([n%size/2-30,Math.floor(n/size)/2-30]);result.reverse();const last=result.at(-1),end=last?{...u,x:last[0],z:last[1]}:u;if(walkClear(s,end,x,z)&&trafficClear(end,near,x,z))result.push([x,z]);return result.slice(0,1024);
  }
  function move(s,u,x,z,stop=.5){
    if(u.root>0||u.stun>0)return false;
    if(!u.speed||Math.hypot(u.x-x,u.z-z)<=stop&&(types[u.kind].flying||traversable(s.map,u.x,u.z,x,z)))return true;
    const near=traffic(s,u);
    if(near.some(v=>distance(u,v)<movementRadius(u)+movementRadius(v)-.0001)||!types[u.kind].flying&&s.units.some(v=>v.id!==u.id&&v.hp>0&&!types[v.kind].speed&&(u.team<0||isVisible(s,u.team,v))&&distance(u,v)<(types[v.kind].radius||1)+.35)){
      const angle=Math.atan2(z-u.z,x-u.x),step=u.speed*moveRate(u)*DT;let best=null,score=-Infinity;
      for(const turn of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI*3/4,-Math.PI*3/4,Math.PI]){const nx=u.x+Math.cos(angle+turn)*step,nz=u.z+Math.sin(angle+turn)*step;if(!walkClear(s,u,nx,nz)||!trafficClear(u,near,nx,nz))continue;const value=near.reduce((sum,v)=>sum+Math.min(0,Math.hypot(nx-v.x,nz-v.z)-movementRadius(u)-movementRadius(v)),0)-Math.hypot(x-nx,z-nz)*.01;if(value>score){score=value;best=[nx,nz];}}
      if(best){u.yaw=Math.atan2(best[0]-u.x,best[1]-u.z);[u.x,u.z]=best;u.path=[];}return false;
    }
    const direct=walkClear(s,u,x,z)&&trafficClear(u,near,x,z);
    if(direct)u.path=[];else if(s.frame-u.pathAt>15||!u.path.length||Math.hypot((u.dest?.[0]||0)-x,(u.dest?.[1]||0)-z)>1){u.path=trafficPath(s,u,x,z,near,stop);u.pathAt=s.frame;u.dest=[x,z];}
    while(u.path.length>1&&walkClear(s,u,...u.path[1])&&trafficClear(u,near,...u.path[1]))u.path.shift();
    const p=direct?[x,z]:u.path[0];if(!p)return false;const dx=p[0]-u.x,dz=p[1]-u.z,d=Math.hypot(dx,dz),step=Math.min(d,u.speed*moveRate(u)*DT);
    if(d>.001){const nx=u.x+dx/d*step,nz=u.z+dz/d*step;if(walkClear(s,u,nx,nz)&&trafficClear(u,near,nx,nz)){u.yaw=Math.atan2(nx-u.x,nz-u.z);u.x=nx;u.z=nz;}else u.path=[];}
    if(d<.12)u.path.shift();return false;
  }
  function population(s,team){const us=s.units.filter(u=>u.team===team&&(u.hp>0||s.mode==='skirmish'&&u.kind==='hero')&&!u.consumed);return {used:us.reduce((n,u)=>n+(u.summoned?0:types[u.kind].food)+u.queue.reduce((a,q)=>a+(q.revive?0:types[q.kind].food),0),0),cap:Math.min(s.mode==='skirmish'?100:80,us.reduce((n,u)=>n+(u.built===1?(u.kind==='hall'?(s.mode==='skirmish'?[12,10,10,10][s.teams[team].faction]:14):u.kind==='farm'?(s.mode==='skirmish'?[6,10,10,10][s.teams[team].faction]:8):0):0),0))};}
  function pay(s,team,gold,wood=0){const t=s.teams[team];if(!t||t.gold<gold||t.wood<wood)return false;t.gold-=gold;t.wood-=wood;return true;}
  function raise(s,u,corpseId){
    if(!u||u.kind!=='necromancer'||u.hp<=0||u.inside||u.built!==1||u.team<0)return 'Select a living necromancer';
    if(u.stun>0)return 'Necromancer is stunned';
    if(u.raiseDeadCd>0)return 'Raise Dead is cooling down';
    if(u.mana<raiseDead.cost)return 'Raise Dead requires 75 mana';
    if(s.units.length+raiseDead.count>LIMIT)return 'Unit limit reached';
    const candidates=s.corpses.filter(c=>c.kind!=='hero'&&!corpseClaimed(s,c)&&c.age<CORPSE_LIFETIME&&s.visible[u.team][index(c.x,c.z)]&&distance(u,c)<=raiseDead.range&&traversable(s.map,u.x,u.z,c.x,c.z)&&(corpseId===undefined||c.id===corpseId)).sort((a,b)=>distance(u,a)-distance(u,b)||a.id-b.id);
    for(const corpse of candidates){
      const positions=[],radius=movementRadius({kind:'skeletonwarrior'});
      for(const ring of [.8,1.6,2.4])for(let i=0;i<12&&positions.length<raiseDead.count;i++){
        const x=corpse.x+Math.cos(i*Math.PI/6)*ring,z=corpse.z+Math.sin(i*Math.PI/6)*ring;
        if(Math.abs(x)>30||Math.abs(z)>30||solid(s,x,z)||!traversable(s.map,corpse.x,corpse.z,x,z)||!s.visible[u.team][index(x,z)]||positions.some(p=>Math.hypot(p[0]-x,p[1]-z)<radius*2+.05)||s.units.some(v=>v.hp>0&&!v.inside&&types[v.kind].speed&&!types[v.kind].flying&&Math.hypot(v.x-x,v.z-z)<movementRadius(v)+radius+.05))continue;
        positions.push([x,z]);
      }
      if(positions.length!==raiseDead.count)continue;
      s.corpses.splice(s.corpses.indexOf(corpse),1);u.mana-=raiseDead.cost;u.raiseDeadCd=raiseDead.cooldown;u.castLeft=.8;u.castYaw=Math.atan2(corpse.x-u.x,corpse.z-u.z);
      for(const [i,[x,z]] of positions.entries())spawn(s,i===1&&s.teams[u.team].skeletalMastery?'skeletonmage':'skeletonwarrior',u.team,x,z,{summoned:true,expires:s.frame+Math.round((raiseDead.duration+(s.teams[u.team].skeletalLongevity?15:0))/DT)});
      const event={type:'spell',art:'shadow',x:corpse.x,z:corpse.z,team:u.team};(simulating.has(s)?s.events:(s.pendingEvents??=[])).push(event);return null;
    }
    return 'No visible non-hero corpse with room nearby';
  }
  function castUnit(s,u,c){
    const spell=casterSpells[c.spell];if(!spell||!u||u.kind!==spell.caster||u.hp<=0||u.built!==1||u.inside||u.stun>0)return 'Select an available caster';
    if((u.casterRank||0)<spell.rank)return 'Requires '+(spell.rank===1?'Adept':'Master')+' Training at the '+(u.kind==='shaman'?'Spirit Lodge':'Temple of the Damned');
    if((u[c.spell+'Cd']||0)>0)return spell.name+' is cooling down';if(u.mana<spell.cost)return 'Not enough mana';
    const v=s.units.find(v=>v.id===c.target&&v.hp>0&&!v.inside&&v.built===1);if(!v||!isVisible(s,u.team,v)||distance(u,v)>spell.range||!attackClear(s,u,v))return 'Select a visible unit in range';
    if(!types[v.kind].speed||v.order?.type==='townPortal'&&v.team!==u.team||['frenzy','cripple','bloodlust'].includes(c.spell)&&!types[v.kind].organic||c.spell==='cripple'&&v.team===u.team||c.spell==='bloodlust'&&v.team!==u.team||c.spell==='lightningShield'&&types[v.kind].flying||types[v.kind].magicImmune)return 'Invalid spell target';
    const eventStart=s.events.length;u.mana-=spell.cost;u[c.spell+'Cd']=spell.cooldown;u.castLeft=.8;u.castYaw=Math.atan2(v.x-u.x,v.z-u.z);
    if(c.spell==='frenzy'){v.frenzy=spell.duration;v.frenzySource={id:u.id,kind:u.kind,team:u.team,x:u.x,z:u.z};}
    if(c.spell==='cripple')v.cripple=v.kind==='hero'?10:spell.duration;
    if(c.spell==='bloodlust')v.bloodlust=spell.duration;
    if(c.spell==='lightningShield'){v.lightningShield=spell.duration;v.lightningSource={id:u.id,kind:u.kind,team:u.team,x:u.x,z:u.z};}
    if(c.spell==='purge'){
      for(const key of ['frenzy','cripple','slow','haste','root','shield','shieldLeft','purgeLeft','bloodlust','lightningShield'])v[key]=0;delete v.frenzySource;delete v.lightningSource;
      if(v.team!==u.team){v.purgeLeft=v.kind==='hero'?5:spell.duration;v.root=.2;}
      if(v.summoned&&v.team!==u.team)damage(s,u,v,400,'spell');
    }
    s.events.push({type:'spell',art:c.spell==='purge'?'nature':c.spell==='lightningShield'?'arcane':c.spell==='bloodlust'?'fire':'shadow',x:v.x,z:v.z,team:u.team});if(!simulating.has(s))(s.pendingEvents??=[]).push(...s.events.slice(eventStart));return null;
  }
  function command(s,team,c){
    if(s.winner!==null||!c||![0,1].includes(team))return 'Match is finished';
    if(c.append!==undefined&&typeof c.append!=='boolean'||c.append&&!['move','attackMove','build','construct','repair','gather'].includes(c.type))return 'Only movement and worker jobs can be queued';
    const selected=s.units.filter(u=>canControl(s,team,u)&&u.hp>0&&(!u.inside||c.append&&u.kind==='worker'&&!u.consumed)&&Array.isArray(c.ids)&&c.ids.slice(0,40).includes(u.id));if(selected.length&&selected.every(u=>u.order?.type==='townPortal')&&c.type!=='stop')return 'Town Portal is channeling; Stop cancels it';
    const own=selected.filter(u=>u.order?.type!=='townPortal'||c.type==='stop'),u=own[0],point=Number.isFinite(c.x)&&Number.isFinite(c.z)&&Math.abs(c.x)<=30&&Math.abs(c.z)<=30;
    if(s.mode==='moba'&&!own.length)return 'Control your hero or summoned units';
    if(c.type==='cannibalizeResearch'){
      const t=s.teams[team];if(s.mode!=='skirmish'||t.faction!==3||u?.kind!=='barracks'||u.built!==1||u.queue.length||t.cannibalize||s.units.some(v=>v.team===team&&v.hp>0&&v.cannibalizeResearch))return 'Select an idle Crypt to research Cannibalize';
      if(!pay(s,team,cannibalize.gold))return 'Not enough gold';u.cannibalizeResearch=cannibalize.time;return null;
    }
    if(c.type==='cancelCannibalizeResearch'){if(!u?.cannibalizeResearch)return 'No Cannibalize research to cancel';s.teams[team].gold+=cannibalize.gold;delete u.cannibalizeResearch;return null;}
    if(c.type==='cannibalize'){
      if(!s.teams[team].cannibalize)return 'Research Cannibalize at the Crypt';let assigned=0;
      for(const v of own.filter(v=>Object.hasOwn(cannibalize.healing,v.kind)&&v.hp<v.maxHp&&!v.stun&&v.order?.type!=='cannibalize').sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id)){
        const body=s.corpses.filter(b=>b.kind!=='hero'&&!corpseClaimed(s,b)&&s.visible[team][index(b.x,b.z)]&&distance(v,b)<=cannibalize.range&&traversable(s.map,v.x,v.z,b.x,b.z)).sort((a,b)=>distance(v,a)-distance(v,b)||a.id-b.id)[0];if(!body)continue;
        v.order={type:'cannibalize',target:body.id,left:cannibalize.duration,active:false};v.path=[];v.pathAt=-100;v.waypoints=[];delete v.workResume;assigned++;
      }
      return assigned?null:'Select injured ghouls or abominations near unclaimed visible corpses';
    }
    if(c.type==='casterSpell')return castUnit(s,u,c);
    if(c.type==='bloodlustAuto'){if(!u||u.kind!=='shaman'||typeof c.enabled!=='boolean')return 'Select a shaman';u.bloodlustAuto=c.enabled;return null;}
    if(c.type==='raiseDead')return c.corpse!==undefined&&(!Number.isSafeInteger(c.corpse)||c.corpse<1)?'Invalid corpse':raise(s,u,c.corpse);
    if(c.type==='raiseDeadAuto'){const casters=own.filter(v=>v.kind==='necromancer');if(!casters.length||typeof c.enabled!=='boolean')return 'Select a necromancer and an autocast setting';for(const v of casters)v.raiseDeadAuto=c.enabled;return null;}
    if(['move','attackMove','patrol','hold','attack','gather','stop'].includes(c.type)){
      if(['move','attackMove','patrol'].includes(c.type)&&!point)return 'Invalid destination';
      const target=s.units.find(v=>v.id===c.target&&v.hp>0);if(c.type==='attack'&&(!target||!isVisible(s,team,target)))return 'Target is not visible';
      if(c.type==='attack'&&target.team===team&&!canDeny(s,team,target))return 'Only allied creeps at half health can be denied in MOBA';
      if(c.type==='attack'&&!own.some(v=>canTarget(s,v,target)))return 'Selected units cannot attack this target';
      if(c.type==='gather'&&(!Number.isInteger(c.resource)||!s.resources[c.resource]||s.resources[c.resource].kind==='camp'))return 'Select a resource';
      const moving=['move','attackMove','patrol'].includes(c.type),eligible=(own.length>1?own.filter(v=>!feeding(v)):own),members=c.type==='gather'?eligible.filter(v=>canGather(s,v,s.resources[c.resource])):moving||c.type==='hold'?eligible.filter(v=>v.speed&&v.built===1):eligible;if(c.type==='gather'&&!members.length)return 'Acolytes mine gold; ghouls harvest lumber';
      if(c.type==='gather'){
        const r=s.resources[c.resource],mine=hauntedMine(s,r);if(r.amount<=0)return 'Resource is depleted';
        if(mine&&mine.team!==team||mine&&!members.some(v=>acolyte(s,v)))return 'Gold mine is haunted';
        if(members.some(v=>acolyte(s,v))){if(!mine||mine.team!==team)return 'Summon a Haunted Gold Mine first';if(!c.append&&mineWorkers(s,r).filter(w=>!members.includes(w)).length+members.length>5)return 'Haunted Gold Mine supports five acolytes';}
      }
      if(c.append){const error=queueError(members);if(error)return error;}
      const slots=moving?formation(s,members,c.x,c.z,c.append):null;
      if(moving&&!slots)return 'No reachable space for this formation';
      members.forEach(v=>{
        if(c.type==='attack'&&!canTarget(s,v,target))return;
        const next=c.type==='stop'?null:{type:c.type,x:slots?.get(v.id)?.[0]??0,z:slots?.get(v.id)?.[1]??0,...(c.type==='attack'?{target:c.target}:c.type==='gather'?{resource:c.resource}:c.type==='patrol'?{fromX:clamp(v.x,-30,30),fromZ:clamp(v.z,-30,30)}:{})};
        if(c.append&&v.order){(v.waypoints??=[]).push(next);return;}
        if(c.type==='gather'&&acolyte(s,v)){const occupied=mineWorkers(s,s.resources[c.resource]).filter(w=>w.id!==v.id);next.mineSlot=[0,1,2,3,4].find(i=>!occupied.some(w=>w.order.mineSlot===i));}
        delete v.workResume;v.path=[];v.pathAt=-100;v.waypoints=[];v.order=next;
      });return null;
    }
    if(c.type==='build'){
      if(s.mode==='moba'||!u||u.kind!=='worker'||!['hall','farm','barracks','tower','frosttower','flametower','altar','workshop','temple','spiritlodge','hauntedmine'].includes(c.kind)||!point)return 'Select a worker and a building site';
      if(c.kind==='hauntedmine'){
        if(s.economyVersion!==1)return 'Start a new match to use Haunted Gold Mines';
        if(s.mode!=='skirmish'||s.teams[team].faction!==3)return 'Only Revenant acolytes can haunt a gold mine';
        const r=s.resources.find(r=>r.kind==='mine'&&r.amount>0&&distance(r,c)<2.8&&s.visible[team][index(r.x,r.z)]);if(!r)return 'Choose a visible gold deposit';c={...c,x:r.x,z:r.z};if(hauntedMine(s,r))return 'Gold deposit already has a Haunted Mine';
        if([0,1,2,3,4].some(i=>{const p=minePoint(r,i);return solid(s,p.x,p.z)||!flatSite(s.map,p.x,p.z,.5);}))return 'Keep all five mining stations clear';
      }else if(s.resources.some(r=>r.kind==='mine'&&r.amount>0&&distance(r,c)<types[c.kind].radius+(hauntedMine(s,r)?2.9:2)))return 'Keep gold deposits clear';
      if(casterTraining[c.kind]&&(s.mode!=='skirmish'||s.teams[team].faction!==casterTraining[c.kind].faction||s.teams[team].tier<2))return types[c.kind].label+' requires its faction stronghold tier 2';
      if(c.append){const error=queueError([u]);if(error)return error;if(!flatSite(s.map,c.x,c.z,types[c.kind].radius))return 'Building footprint requires flat dry ground';const next={type:'build',kind:c.kind,x:c.x,z:c.z};if(u.order)u.waypoints.push(next);else{u.order=next;u.path=[];u.pathAt=-100;}return null;}
      if(c.kind==='workshop'&&(s.mode!=='skirmish'||s.teams[team].tier<2))return 'Siege workshop requires stronghold tier 2';
      if(s.mode==='skirmish'&&s.teams[team].faction===3&&!['hall','hauntedmine'].includes(c.kind)&&!s.units.some(v=>v.team===team&&v.hp>0&&v.built===1&&['hall','altar'].includes(v.kind)&&distance(v,c)<=(v.kind==='hall'?18:12)))return 'Summon inside stronghold or altar territory';
      const d=types[c.kind];if(!flatSite(s.map,c.x,c.z,d.radius))return 'Building footprint requires flat dry ground';if(distance(u,c)>15||solid(s,c.x,c.z)||s.units.some(v=>v.hp>0&&!types[v.kind].speed&&distance(v,c)<(types[v.kind].radius||1)+d.radius+.8))return 'Site blocked or too far from worker';
      if(s.mode==='td'&&(d.model!=='tower'||s.units.filter(v=>v.team===team&&types[v.kind].model==='tower'&&v.hp>0).length>=40))return 'Defense supports up to 40 towers';
      if(s.mode==='td'&&tdPath.slice(1).some((p,i)=>segmentDistance(c.x,c.z,tdPath[i],p)<2.5))return 'Keep the creep road clear';
      if(s.units.length>=LIMIT||!pay(s,team,d.gold,s.mode==='td'?0:d.wood))return 'Not enough resources or unit capacity';
      const b=spawn(s,c.kind,team,c.x,c.z,{built:.01});b.hp=b.maxHp*.1;b.construction={style:s.mode==='skirmish'?['work','inside','growth','summon'][s.teams[team].faction]:'legacy',started:s.mode!=='skirmish',paidGold:d.gold,paidWood:s.mode==='td'?0:d.wood};if(s.mode==='skirmish')assignWork(u,b,'construct');else{u.order=null;u.waypoints=[];u.path=[];}return null;
    }
    if(c.type==='construct'||c.type==='repair'){
      const b=s.units.find(v=>v.id===c.target&&v.team===team&&v.hp>0&&!types[v.kind].speed),workers=own.filter(v=>v.kind==='worker');
      if(!b||!workers.length||c.type==='construct'&&(b.built===1||b.construction?.started&&b.construction.style!=='work')||c.type==='repair'&&(b.built<1||b.hp>=b.maxHp))return 'Select workers and a friendly construction site or damaged completed building';
      if(c.append){const error=queueError(workers);if(error)return error;}
      for(const w of workers)if(c.append&&w.order)w.waypoints.push({type:c.type,target:b.id});else assignWork(w,b,c.type);return null;
    }
    if(c.type==='cancelBuild'){
      if(!u||u.built===1||!u.construction)return 'Select an unfinished building';const c=u.construction;s.teams[team].gold+=Math.floor(c.paidGold*.75);s.teams[team].wood+=Math.floor(c.paidWood*.75);u.hp=0;finishWork(s,u,true);hallDefeat(s,u);return null;
    }
    if(c.type==='train'){
      if(s.mode!=='skirmish'||!u||u.built<1||!trainable(s,u).includes(c.kind)||u.queue.length>=3||u.casterResearch||u.cannibalizeResearch)return 'Select the appropriate completed production building';
      if((u.kind==='workshop'||u.kind==='barracks'&&trainable(s,u).indexOf(c.kind)>=2)&&s.teams[team].tier<2)return 'Upgrade your stronghold to tier 2';
      if(types[c.kind].flying&&s.teams[team].tier<3)return 'Flying creatures require stronghold tier 3';
      const heroClass=c.heroClass===undefined?s.teams[team].heroClass??0:c.heroClass;
      if(c.kind==='hero'){if(!validHero(heroClass))return 'Invalid hero type';const roster=heroRoster(s,team),queued=heroQueued(s,team);if(roster.some(v=>v.heroClass===heroClass)||queued.some(q=>q.heroClass===heroClass))return 'Only one hero of each type';if(roster.length+queued.length>=3)return 'Maximum three heroes';if(roster.length+queued.length>=s.teams[team].tier)return 'Advance your stronghold to tier '+(roster.length+queued.length+1);}
      const d=c.kind==='hero'?heroRecruitment(s,team):types[c.kind],p=population(s,team);if(p.used+d.food>p.cap)return 'Build more supply lodges';if(s.units.length>=LIMIT)return 'Unit capacity reached';
      if(!pay(s,team,d.gold,d.wood))return 'Not enough resources';u.queue.push({kind:c.kind,left:d.time,...(c.kind==='hero'?{heroClass,paidGold:d.gold,paidWood:d.wood}:{})});return null;
    }
    if(c.type==='revive'){
      const h=heroRoster(s,team).find(v=>v.id===c.target&&v.hp<=0),queued=s.units.some(v=>v.hp>0&&v.queue.some(q=>q.revive===c.target));
      if(s.mode!=='skirmish'||u?.kind!=='altar'||u.built!==1||u.queue.length>=3||!h||queued)return 'Select a completed altar and a fallen hero awaiting revival';
      const d=heroRevival(h);if(!pay(s,team,d.gold))return 'Not enough gold';u.queue.push({kind:'hero',heroClass:h.heroClass,revive:h.id,left:d.time,paidGold:d.gold,paidWood:0});return null;
    }
    if(c.type==='rally'){if(!u||!trainable(s,u).length||!point)return 'Select a production building and rally destination';u.rally={x:c.x,z:c.z};return null;}
    if(c.type==='cancelTrain'){if(!u||!Number.isInteger(c.index)||c.index<0||c.index>=u.queue.length)return 'Select a queued unit';const q=u.queue.splice(c.index,1)[0],d=types[q.kind];s.teams[team].gold+=q.paidGold??d.gold;s.teams[team].wood+=q.paidWood??d.wood;return null;}
    if(c.type==='skeletonResearch'){
      const t=s.teams[team],r=typeof c.upgrade==='string'&&Object.hasOwn(skeletonResearch,c.upgrade)?skeletonResearch[c.upgrade]:null;if(s.mode!=='skirmish'||!r||t.faction!==3||u?.kind!=='temple'||u.built!==1||u.queue.length||u.casterResearch||t[r.field]||t.tier<r.tier||s.units.some(v=>v.team===team&&v.hp>0&&v.casterResearch?.upgrade===c.upgrade))return 'Select an idle Temple with the required tier and unfinished research';
      if(!pay(s,team,r.gold,r.wood))return 'Not enough resources';u.casterResearch={upgrade:c.upgrade,left:r.time};return null;
    }
    if(c.type==='casterResearch'){
      const t=s.teams[team],school=casterTraining[u?.kind],rank=(t[school?.field]||0)+1;if(s.mode!=='skirmish'||!school||t.faction!==school.faction||u.built!==1||u.queue.length||u.casterResearch||rank>2||s.units.some(v=>v.team===team&&v.kind===u.kind&&v.hp>0&&v.casterResearch?.rank))return 'Select an idle caster building ready to research';
      if(rank===2&&t.tier<3)return 'Master Training requires stronghold tier 3';const wood=rank===1?50:150;if(!pay(s,team,100,wood))return 'Not enough resources';u.casterResearch={rank,left:school.times[rank-1]};return null;
    }
    if(c.type==='cancelCasterResearch'){if(!u?.casterResearch)return 'No caster research to cancel';const r=skeletonResearch[u.casterResearch.upgrade];s.teams[team].gold+=r?r.gold:100;s.teams[team].wood+=r?r.wood:u.casterResearch.rank===1?50:150;delete u.casterResearch;return null;}
    if(c.type==='tech'){const t=s.teams[team];if(!u||u.kind!=='hall'||u.built<1||t.tier>=3||t.research>0)return 'Select a stronghold ready to advance';if(!pay(s,team,250*t.tier,120*t.tier))return 'Not enough resources';t.research=20*t.tier;return null;}
    if(c.type==='towerUpgrade'){if(!u||types[u.kind].model!=='tower'||u.built<1||u.level>=3)return 'Select a completed tower below level 3';if(!pay(s,team,100*u.level))return 'Not enough gold';u.level++;u.damage+=types[u.kind].damage*.65;u.maxHp+=200;u.hp=Math.min(u.maxHp,u.hp+200);return null;}
    if(c.type==='sell'){if(s.mode!=='td'||!u||types[u.kind].model!=='tower')return 'Select a defense tower';s.teams[team].gold+=Math.floor((types[u.kind].gold+100*(u.level-1)*u.level/2)*.65);u.hp=0;return null;}
    if(c.type==='upgrade'){if(!u||u.kind!=='barracks'||u.built<1)return 'Select a completed barracks';if(s.teams[team].upgrade>=s.teams[team].tier)return 'Advance your stronghold for more research';if(!pay(s,team,180+s.teams[team].upgrade*100,100))return 'Not enough resources';s.teams[team].upgrade++;return null;}
    if(c.type==='buy'){
      const item=Number.isInteger(c.item)?items[c.item]:null;if(!u||u.kind!=='hero'||!item)return 'Select a hero and an item';if(!atShop(s,u))return 'Visit your stronghold shop';
      const next=[...u.inventory];for(const part of item.recipe||[]){const slot=next.indexOf(part);if(slot<0)return 'Requires '+item.recipe.map(i=>items[i].name).join(' + ');next.splice(slot,1);}if(next.length>=6)return 'Inventory is full';
      if(!pay(s,team,item.gold))return 'Not enough gold';setInventory(u,[...next,c.item]);return null;
    }
    if(['dropItem','sellItem','useItem'].includes(c.type)){
      if(!u||u.kind!=='hero'||!Number.isInteger(c.slot)||c.slot<0||c.slot>=u.inventory.length||!Number.isInteger(c.item)||u.inventory[c.slot]!==c.item)return 'Select a current inventory slot';
      const item=items[c.item],next=u.inventory.filter((_,i)=>i!==c.slot);
      if(c.type==='sellItem'){if(!atShop(s,u))return 'Visit your stronghold shop';s.teams[team].gold+=Math.floor(itemValue(c.item)/2);}
      if(c.type==='dropItem'){if(s.loot.length>=LIMIT-64)return 'Too many items on the ground';s.loot.push({id:++s.serial,x:u.x,z:u.z,item:c.item,relic:false,manual:true});}
      if(c.type==='useItem'){
        if(item.townPortal){
          if(u.stun>0||u.root>0)return 'Hero cannot use Town Portal while disabled';
          const bases=s.units.filter(v=>v.kind==='hall'&&v.team===team&&v.hp>0&&v.built===1),base=c.target!==undefined?bases.find(v=>v.id===c.target):point?bases.filter(v=>distance(v,c)<=townPortal.baseRange).sort((a,b)=>distance(a,c)-distance(b,c)||a.id-b.id)[0]:bases.sort((a,b)=>b.level-a.level||a.id-b.id)[0];
          if(!base||c.target!==undefined&&!Number.isSafeInteger(c.target)||point&&distance(base,c)>townPortal.baseRange||!point&&(c.x!==undefined||c.z!==undefined))return 'Select a completed friendly main base';
          u.order={type:'townPortal',target:base.id,x:point?c.x:base.x,z:point?c.z:base.z,left:townPortal.time};u.path=[];u.pathAt=-100;u.waypoints=[];delete u.dest;setInventory(u,next);const e={type:'spell',slot:2,heroClass:u.heroClass,x:u.x,z:u.z,team};s.events.push(e);if(!simulating.has(s))(s.pendingEvents??=[]).push(e);return null;
        }
        if(!item.restoreHp&&!item.restoreMana)return 'This item grants a passive bonus';if(u.stun>0||u.itemCooldown>0)return 'Item is not ready';if(item.restoreHp&&u.hp>=u.maxHp||item.restoreMana&&u.mana>=150+u.level*10)return 'Already at full health or mana';
        if(item.restoreHp)u.hp=Math.min(u.maxHp,u.hp+item.restoreHp);if(item.restoreMana)u.mana=Math.min(150+u.level*10,u.mana+item.restoreMana);u.itemCooldown=10;const event={type:'spell',slot:1,heroClass:u.heroClass,x:u.x,z:u.z,team};s.events.push(event);if(!simulating.has(s))(s.pendingEvents??=[]).push(event);
      }
      setInventory(u,next);return null;
    }
    if(c.type==='pickup'){
      const loot=Number.isSafeInteger(c.loot)?s.loot.find(d=>d.id===c.loot):null;if(!u||u.kind!=='hero'||!loot||!s.visible[team][index(loot.x,loot.z)])return 'Select a hero and a visible dropped item';if(u.inventory.length>=6&&!loot.relic)return 'Inventory is full';if(loot.relic&&(s.mode!=='rpg'||team!==0))return 'Quest relic belongs to the expedition';
      u.order={type:'pickup',target:loot.id};u.waypoints=[];u.path=[];u.pathAt=-100;return null;
    }
    if(c.type==='learn'){
      if(!u||u.kind!=='hero'||!Number.isInteger(c.slot)||c.slot<0||c.slot>3)return 'Select your hero and a skill';
      const rank=u.skills[c.slot],required=skillLevel(c.slot,rank+1);if(u.skillPoints<1||rank>=(c.slot===3?1:3))return 'No skill point or maximum rank';if(u.level<required)return 'Skill requires hero level '+required;
      u.skills[c.slot]++;u.skillPoints--;return null;
    }
    if(c.type==='spell'){
      if(!u||u.kind!=='hero'||!Number.isInteger(c.slot)||c.slot<0||c.slot>3||!point)return 'Select your hero';const spell=unitType(u).spells[c.slot],rank=u.skills[c.slot];
      if(!rank)return 'Learn this skill first';if(u.stun>0||u.spell[c.slot]>0||u.mana<spell.cost)return 'Spell is not ready';const target=spell.range===0?u:c;
      if(distance(u,target)>spell.range)return 'Target outside spell range';if(spell.kind==='blink'&&(u.root>0||solid(s,c.x,c.z)))return 'Blink destination is blocked or hero is rooted';
      if(!s.visible[team][index(target.x,target.z)])return 'Spell target is not visible';if(spell.kind==='summon'&&s.units.length>=LIMIT)return 'Unit capacity reached';
      const eventStart=s.events.length,power=(spell.power||0)+(rank-1)*(spell.growth||0);u.mana-=spell.cost;u.spell[c.slot]=spell.cooldown;
      if(distance(u,target)>.01)u.yaw=u.castYaw=Math.atan2(target.x-u.x,target.z-u.z);else delete u.castYaw;
      if(spell.kind==='blink'){u.x=c.x;u.z=c.z;u.path=[];u.order=null;u.waypoints=[];}
      else if(spell.kind==='haste')u.haste=spell.duration+(rank-1);
      else if(spell.kind==='avatar')u.avatar=spell.duration;
      else if(spell.kind==='summon')spawn(s,'dragon',team,c.x,c.z,{summoned:true,expires:s.frame+Math.round(spell.duration/DT),order:{type:'attackMove',x:c.x,z:c.z}});
      else if(spell.kind==='zone')s.zones.push({team,heroClass:u.heroClass,x:c.x,z:c.z,radius:spell.radius,damage:power,slow:spell.slow||0,left:spell.duration,pulse:0,slot:c.slot});
      else for(const v of s.units){
        if(v.hp<=0||distance(v,target)>(spell.radius||0)&&spell.kind!=='cone')continue;
        if(spell.kind==='heal'&&v.team===team)v.hp=Math.min(v.maxHp,v.hp+power);
        else if(spell.kind==='shield'&&v.team===team){v.shield=Math.max(v.shield||0,power);v.shieldLeft=spell.duration;}
        else if(['blast','cone'].includes(spell.kind)&&v.team!==team){
          if(!isVisible(s,team,v)||v.order?.type==='townPortal')continue;if(spell.kind==='cone'){const dx=c.x-u.x,dz=c.z-u.z,dist=distance(u,v);if(dist>spell.radius||dist>.01&&(dx*(v.x-u.x)+dz*(v.z-u.z))/(Math.max(.01,Math.hypot(dx,dz))*dist)<.65)continue;}
          damage(s,u,v,power);if(v.hp>0){if(spell.slow)v.slow=spell.slow;if(spell.root)v.root=spell.root+(rank-1)*.5;if(spell.stun)v.stun=spell.stun+(rank-1)*.25;}
        }
      }
      if(spell.kind!=='zone')s.events.push({type:'spell',x:target.x,z:target.z,slot:c.slot,heroClass:u.heroClass,team});if(!simulating.has(s))(s.pendingEvents??=[]).push(...s.events.slice(eventStart));return null;
    }
    return 'Unknown command';
  }
  function hallDefeat(s,b){if(b.kind==='hall'&&s.mode!=='td'&&(s.mode!=='skirmish'||!s.units.some(v=>v.team===b.team&&v.kind==='hall'&&v.hp>0)))s.winner=1-b.team;}
  function assignWork(w,b,type){if(!w.workResume&&w.order?.type==='gather'){w.workResume=clone(w.order);delete w.workResume.mineSlot;}w.order={type,target:b.id};w.waypoints=[];w.path=[];w.pathAt=-100;}
  function advanceOrder(s,u){
    u.order=null;u.path=[];u.pathAt=-100;
    while(u.hp>0&&u.waypoints.length){const next=u.waypoints.shift();if(['move','attackMove','build'].includes(next.type)){u.order=next;return;}const pending=u.waypoints,error=command(s,u.team,{...next,ids:[u.id]});u.waypoints=pending;if(!error)return;s.announcements[u.team]='Queued '+next.type+' skipped: '+error;}
  }
  function releaseWorker(s,w){delete w.inside;delete w.consumed;w.order=w.hp>0?w.workResume||null:null;delete w.workResume;w.path=[];w.pathAt=-100;if(w.hp<=0)w.waypoints=[];else if(w.waypoints.length)advanceOrder(s,w);}
  function finishWork(s,b,cancel=false){for(const w of s.units)if(w.inside===b.id||['construct','repair'].includes(w.order?.type)&&w.order.target===b.id){if(w.consumed&&!cancel)w.hp=0;releaseWorker(s,w);}delete b.construction;}
  function repairCost(b){const d=types[b.kind],hp=Math.min(b.maxHp-b.hp,b.maxHp*DT/(d.time*1.5));return {hp,gold:d.gold*hp/b.maxHp*.5,wood:d.wood*hp/b.maxHp*.5};}
  function work(s,w){
    const b=s.units.find(v=>v.id===w.order.target&&v.team===w.team&&v.hp>0&&!types[v.kind].speed);if(!b||w.order.type==='construct'&&b.built===1||w.order.type==='repair'&&(b.built<1||b.hp>=b.maxHp)){releaseWorker(s,w);return;}
    if(!move(s,w,b.x,b.z,types[b.kind].radius+1.1))return;
    if(w.order.type==='repair'){const cost=repairCost(b);if(pay(s,w.team,cost.gold,cost.wood))b.hp+=cost.hp;return;}
    const c=b.construction;if(!c){releaseWorker(s,w);return;}if(c.started&&c.style!=='work'){releaseWorker(s,w);return;}
    c.started=true;if(c.style==='inside'||c.style==='growth'&&!['farm','altar'].includes(b.kind)){w.inside=b.id;w.consumed=c.style==='growth';if(w.consumed){if(w.waypoints.length)s.announcements[w.team]='Worker consumed by living construction; queued work cleared';w.waypoints=[];}}else if(c.style!=='work')releaseWorker(s,w);
  }
  function construct(s,b){
    const c=b.construction;if(!c?.started)return;let rate=1;
    if(c.style==='work'){const workers=s.units.filter(w=>w.hp>0&&w.order?.type==='construct'&&w.order.target===b.id&&!w.stun&&!w.root&&distance(w,b)<=types[b.kind].radius+1.1&&traversable(s.map,w.x,w.z,b.x,b.z));if(!workers.length)return;const extra=.6*(workers.length-1),d=types[b.kind];if(extra&&pay(s,b.team,d.gold*DT/d.time*extra,d.wood*DT/d.time*extra))rate+=extra;}
    const progress=Math.min(1-b.built,DT/types[b.kind].time*rate);b.built=Math.min(1,b.built+progress);b.hp=Math.min(b.maxHp,b.hp+b.maxHp*progress*.9/.99);if(s.frame%10===0)s.events.push({type:'construction',x:b.x,z:b.z,team:b.team});if(b.built===1)finishWork(s,b);
  }
  function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
  function atShop(s,u){return s.units.some(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1&&distance(v,u)<10&&traversable(s.map,u.x,u.z,v.x,v.z));}
  function setInventory(u,next){
    const sum=(list,key)=>list.reduce((n,i)=>n+(items[i][key]||0),0),ratio=u.hp/u.maxHp;u.damage+=sum(next,'damage')-sum(u.inventory,'damage');u.maxHp+=sum(next,'hp')-sum(u.inventory,'hp');u.speed+=sum(next,'speed')-sum(u.inventory,'speed');u.hp=Math.min(u.maxHp,u.maxHp*ratio);u.inventory=next;
  }
  function equip(u,i){setInventory(u,[...u.inventory,i]);}
  function pickup(s,u,d){if(d.relic)s.quest.relic=true;else equip(u,d.item);s.loot.splice(s.loot.indexOf(d),1);}

  function experience(h,xp){h.xp+=xp;while(h.xp>=h.level*90&&h.level<10){h.xp-=h.level*90;h.level++;h.skillPoints++;h.maxHp+=90;h.hp=Math.min(h.maxHp,h.hp+150);h.damage+=6;}}
  function meleeSlot(s,u,target){
    if(u.order?.type!=='attack'||unitType(u).range>2||!u.speed)return null;
    const group=s.units.filter(v=>v.hp>0&&!v.inside&&v.team===u.team&&v.speed&&v.order?.type==='attack'&&v.order.target===target.id&&unitType(v).range<=2).sort((a,b)=>a.id-b.id);if(group.length<2)return null;
    const radius=unitType(u).range+(types[target.kind].radius||.3)-.12,spacing=Math.max(...group.map(movementRadius))*2+.1,count=Math.max(1,Math.min(group.length,Math.floor(Math.PI*2*radius/spacing))),slot=group.findIndex(v=>v.id===u.id),angle=slot%count*Math.PI*2/count-Math.PI/2,ring=radius+Math.floor(slot/count)*spacing,x=target.x+Math.cos(angle)*ring,z=target.z+Math.sin(angle)*ring;
    return Math.abs(x)<=30&&Math.abs(z)<=30&&(types[u.kind].flying||!solid(s,x,z,u.id,u.team)&&traversable(s.map,x,z,target.x,target.z))?{x,z}:null;
  }
  function attackInRange(s,u,v){return Math.hypot(distance(u,v),unitHeight(s,u)-unitHeight(s,v))<=unitType(u).range+(types[v.kind].radius||.3)&&attackClear(s,u,v);}
  function leavesCorpse(kind){return kind!=='hero'&&Object.hasOwn(types,kind)&&types[kind].speed>0&&types[kind].attack!=='siege';}
  function damage(s,a,b,value,mode='attack'){
    if(b.hp<=0||b.inside||b.order?.type==='townPortal'||a.team===b.team&&!['drain','lightning'].includes(mode)&&!canDeny(s,a.team,b))return;const denied=!['drain','lightning'].includes(mode)&&a.team===b.team;if(b.avatar>0&&mode!=='drain')value*=.6;const absorbed=mode==='drain'?0:Math.min(b.shield||0,value);b.shield=Math.max(0,(b.shield||0)-absorbed);value-=absorbed;if(value<=0)return;s.events.push({type:denied&&value>=b.hp?'deny':'damage',x:b.x,z:b.z,y:unitHeight(s,b),amount:Math.ceil(Math.min(b.hp,value)),team:b.team});b.hp-=value;
    if(b.team===-1&&b.home)for(const guard of s.units)if(guard.team===-1&&guard.home&&guard.hp>0&&Math.hypot(guard.home[0]-b.home[0],guard.home[1]-b.home[1])<=8)guard.awakeUntil=s.frame+100;
    if(mode==='attack'&&!denied&&types[a.kind].lifesteal&&a.hp>0)a.hp=Math.min(a.maxHp,a.hp+value*types[a.kind].lifesteal);
    if(mode==='attack'&&!denied&&types[a.kind].slow)b.slow=types[a.kind].slow;
    if(b.hp<=0){b.hp=0;b.waypoints=[];if(!types[b.kind].speed)finishWork(s,b);s.events.push({type:'death',x:b.x,z:b.z,team:b.team});if(leavesCorpse(b.kind)&&!b.summoned){s.corpses=s.corpses.filter(c=>c.id!==b.id);s.corpses.push({id:b.id,kind:b.kind,heroClass:b.heroClass??0,team:b.team,x:b.x,y:unitHeight(s,b),z:b.z,yaw:b.yaw??(Number.isFinite(a.x)&&Number.isFinite(a.z)?Math.atan2(a.x-b.x,a.z-b.z):0),age:0,boss:b.tag==='boss',large:!!b.tdBoss});if(s.corpses.length>CORPSE_LIMIT)s.corpses.shift();}if(a.team>=0&&(a.team!==b.team||denied)){
        if(!denied){s.teams[a.team].gold+=b.kind==='hero'?140:!types[b.kind].speed?80:25;s.teams[a.team].kills++;}
        const recipients=s.units.filter(u=>u.team===(denied?1-a.team:a.team)&&u.kind==='hero'&&u.hp>0&&!u.inside&&distance(u,b)<18),xp=(b.kind==='hero'?100:35)*(denied?.5:1);
        for(const h of recipients)experience(h,xp/recipients.length);
      }
      if(s.mode==='rpg'&&a.team===0&&b.team!==a.team){if(b.tag==='scout')s.quest.scouts++;if(b.tag==='boss')s.quest.boss=true;if(b.tag){if(s.loot.length>=LIMIT&&b.tag==='keeper'){const old=s.loot.findIndex(d=>!d.manual&&!d.relic);if(old>=0)s.loot.splice(old,1);}if(s.loot.length<LIMIT)s.loot.push({id:++s.serial,x:b.x,z:b.z,relic:b.tag==='keeper',item:b.tag==='boss'?0:b.id%3});}}
      if(b.kind==='hero'&&(s.mode==='moba'||s.mode==='rpg')){b.respawn=12+b.level*2;if(s.mode==='rpg')s.teams[b.team].gold=Math.max(0,s.teams[b.team].gold-50);}
      if(b.kind==='hero'&&b.team>=0&&s.mode==='skirmish'){b.order=null;b.path=[];delete b.dest;s.announcements[b.team]=unitType(b).label+' (level '+b.level+') has fallen. Revive at an altar.';}
      hallDefeat(s,b);
    }
  }
  function isVisible(s,team,u){return !u.inside&&(u.team===team||u.hp>0&&!!s.visible[team]?.[index(u.x,u.z)]);}
  function fire(s,u,target){
    const speed=projectileSpeed(u),value=(u.damage*(u.avatar>0?1.6:1)+(u.kind==='hero'?0:s.teams[u.team]?.upgrade||0)*6)*(u.cripple>0?.5:1);
    if(speed){
      if(s.projectiles.length>=PROJECTILE_LIMIT)return false;
      const y=unitHeight(s,u)+1.6,toY=unitHeight(s,target)+1.6,dx=target.x-u.x,dy=toY-y,dz=target.z-u.z,d=Math.hypot(dx,dy,dz)||1;
      s.projectiles.push({id:++s.projectileSerial,source:u.id,kind:u.kind,heroClass:u.heroClass??0,team:u.team,target:target.id,x:u.x,y,z:u.z,baseY:y,toX:target.x,toY,toZ:target.z,travel:0,age:0,born:s.frame,damage:value,splashDamage:u.damage*.6*(u.cripple>0?.5:1),vx:dx/d*speed,vy:dy/d*speed,vz:dz/d*speed,art:projectileArt(u)});
    }else{
      damage(s,u,target,weaponDamage(u,target,value));if(types[u.kind].splash)for(const v of s.units)if(v.id!==target.id&&v.team!==u.team&&v.hp>0&&canAttack(u,v)&&distance(v,target)<types[u.kind].splash)damage(s,u,v,weaponDamage(u,v,u.damage*.6*(u.cripple>0?.5:1)));
    }
    u.yaw=Math.atan2(target.x-u.x,target.z-u.z);u.cd=unitType(u).cooldown||1;s.events.push({type:speed?'launch':'hit',x:target.x,z:target.z,fromX:u.x,fromZ:u.z,fromY:unitHeight(s,u)+1.6,toY:unitHeight(s,target)+1.6,team:u.team,ranged:unitType(u).range>4,...(u.kind==='rifleman'?{art:'musket'}:{})});return true;
  }
  function advanceProjectiles(s){
    s.projectiles=s.projectiles.filter(p=>{
      if(p.born===s.frame)return true;p.age+=DT;if(p.age>6)return false;
      const target=s.units.find(u=>u.id===p.target&&canTarget(s,p,u)),ballistic=unitType(p).attack==='siege';
      if(!ballistic&&!target)return false;if(!ballistic){p.toX=target.x;p.toY=unitHeight(s,target)+1.6;p.toZ=target.z;}
      const dx=p.toX-p.x,dy=p.toY-p.baseY,dz=p.toZ-p.z,d=Math.hypot(dx,dy,dz),step=projectileSpeed(p)*DT;
      if(d<=step){
        const attacker=s.units.find(u=>u.id===p.source&&u.team===p.team)||p,point={x:p.toX,z:p.toZ},direct=target&&(!ballistic||distance(target,point)<(types[target.kind].radius||.3)+.6);
        if(direct)damage(s,attacker,target,weaponDamage(p,target,p.damage));
        if(types[p.kind].splash)for(const v of s.units)if(v.team!==p.team&&v.hp>0&&(!direct||v.id!==target.id)&&canAttack(p,v)&&distance(v,point)<types[p.kind].splash)damage(s,attacker,v,weaponDamage(p,v,p.splashDamage));
        s.events.push({type:'impact',x:p.toX,y:p.toY,z:p.toZ,team:p.team,art:p.art});return false;
      }
      const oldY=p.y;p.x+=dx/d*step;p.baseY+=dy/d*step;p.z+=dz/d*step;p.travel+=step;
      p.y=p.baseY+Math.sin(Math.PI*p.travel/(p.travel+d-step))*(ballistic?2.5:p.art==='arrow'?.6:.2);p.vx=dx/d*projectileSpeed(p);p.vy=(p.y-oldY)/DT;p.vz=dz/d*projectileSpeed(p);return true;
    });
  }
  function visibility(s){
    for(let t=0;t<2;t++){const vis=Array(1024).fill(0);for(const u of s.units)if(u.team===t&&u.hp>0&&!u.inside){const [cx,cz]=cell(u.x,u.z),r=isNight(s)?(types[u.kind].model==='tower'?5:3):(u.kind==='tower'?7:6);for(let z=Math.max(0,cz-r);z<=Math.min(31,cz+r);z++)for(let x=Math.max(0,cx-r);x<=Math.min(31,cx+r);x++)if((x-cx)**2+(z-cz)**2<=r*r)vis[z*32+x]=1;}s.visible[t]=vis;for(let i=0;i<1024;i++)if(vis[i])s.explored[t][i]=1;}
  }
  const acolyte=(s,u)=>s.economyVersion===1&&s.mode==='skirmish'&&u.kind==='worker'&&s.teams[u.team]?.faction===3;
  const canGather=(s,u,r)=>!!r&&(u.kind==='worker'?(acolyte(s,u)?r.kind==='mine':['mine','tree'].includes(r.kind)):u.kind==='ghoul'&&s.economyVersion===1&&s.mode==='skirmish'&&s.teams[u.team]?.faction===3&&r.kind==='tree');
  const hauntedMine=(s,r)=>r&&s.units.find(b=>b.kind==='hauntedmine'&&b.hp>0&&distance(b,r)<.01);
  const mineWorkers=(s,r)=>s.units.filter(w=>w.hp>0&&!w.inside&&acolyte(s,w)&&w.order?.type==='gather'&&w.order.resource===s.resources.indexOf(r));
  const minePoint=(r,slot)=>({x:r.x+Math.cos(slot*Math.PI*2/5)*2.4,z:r.z+Math.sin(slot*Math.PI*2/5)*2.4});
  function miningTarget(s,u){const r=s.resources[u.order?.resource],mine=hauntedMine(s,r);return acolyte(s,u)&&u.hp>0&&!u.stun&&!u.inside&&!u.cargo&&u.order?.type==='gather'&&Number.isInteger(u.order.mineSlot)&&mine?.team===u.team&&mine.built===1&&r.amount>0&&distance(u,minePoint(r,u.order.mineSlot))<=.16?r:null;}
  function mineGold(s,u,r){
    const mine=hauntedMine(s,r);if(!mine||mine.team!==u.team||r.amount<=0){advanceOrder(s,u);return;}
    const occupied=mineWorkers(s,r).filter(w=>w.id!==u.id);let slot=u.order.mineSlot;
    if(!Number.isInteger(slot)||occupied.some(w=>w.order.mineSlot===slot)){slot=[0,1,2,3,4].find(i=>!occupied.some(w=>w.order.mineSlot===i));if(slot===undefined){advanceOrder(s,u);return;}u.order.mineSlot=slot;}
    const target=minePoint(r,slot);if(!move(s,u,target.x,target.z,.15)||mine.built<1)return;
    if(u.gatherCd<=1e-6){const take=Math.min(10,r.amount);r.amount-=take;s.teams[u.team].gold+=take;u.gatherCd=5;if(u.waypoints.length)advanceOrder(s,u);}
  }
  function gather(s,u){let r=s.resources[u.order.resource];if(!canGather(s,u,r)){advanceOrder(s,u);return;}if(acolyte(s,u)&&!u.cargo){mineGold(s,u,r);return;}if(!u.cargo&&hauntedMine(s,r)){advanceOrder(s,u);return;}if(r.amount<=0&&!u.cargo){const next=s.resources.filter(v=>v.kind===r.kind&&v.amount>0&&!hauntedMine(s,v)).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(!next){advanceOrder(s,u);return;}u.order.resource=s.resources.indexOf(next);r=next;}const hall=s.units.filter(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(!hall){if(u.waypoints.length){s.announcements[u.team]='Queued gathering skipped: no completed stronghold';advanceOrder(s,u);}return;}const returning=!!hauntedMine(s,r)||acolyte(s,u)&&u.cargo>0||u.cargo>=20||u.cargo>0&&(r.amount<=0||u.cargoKind&&u.cargoKind!==r.kind),target=returning?hall:r;
    const reach=returning?4:3;if(distance(u,target)>reach||!traversable(s.map,u.x,u.z,target.x,target.z)){move(s,u,target.x,target.z,reach-.1);return;}if(returning){s.teams[u.team][(u.cargoKind||r.kind)==='mine'?'gold':'wood']+=u.cargo;u.cargo=0;delete u.cargoKind;if(u.waypoints.length)advanceOrder(s,u);}else if(u.gatherCd<=0){const take=Math.min(5,r.amount);u.cargo+=take;u.cargoKind=r.kind;r.amount-=take;u.gatherCd=.65;}
  }
  function ai(s,t){
    const team=s.teams[t],us=s.units.filter(u=>u.team===t&&u.hp>0),base=s.map.spawns[t],foe=s.map.spawns[1-t],worker=us.find(u=>u.kind==='worker'&&!u.inside&&!['construct','repair'].includes(u.order?.type));
    if(s.mode==='skirmish'){
      const pending=us.find(u=>u.built<1&&u.construction&&(!u.construction.started||u.construction.style==='work')&&!us.some(w=>w.order?.type==='construct'&&w.order.target===u.id));if(worker&&pending){command(s,t,{type:'construct',ids:[worker.id],target:pending.id});return;}
      if(s.economyVersion===1&&team.faction===3&&worker){const r=s.resources.filter(r=>r.kind==='mine'&&r.amount>0&&!hauntedMine(s,r)&&distance(r,{x:base[0],z:base[1]})<16).sort((a,b)=>distance(worker,a)-distance(worker,b))[0];if(r&&command(s,t,{type:'build',ids:[worker.id],kind:'hauntedmine',x:r.x,z:r.z})===null)return;}
      const build=kind=>{if(!worker||['construct','repair'].includes(worker.order?.type))return false;for(const radius of [8,11])for(let i=0;i<12;i++){const a=(i+s.frame/40)*Math.PI/6;if(command(s,t,{type:'build',ids:[worker.id],kind,x:clamp(base[0]+Math.cos(a)*radius,-27,27),z:clamp(base[1]+Math.sin(a)*radius,-27,27)})===null)return true;}return false;};
      const opening=['altar','farm','barracks'].find(kind=>!us.some(u=>u.kind===kind));if(opening&&build(opening))return;
      const pop=population(s,t);if(pop.used+3>pop.cap&&!us.some(u=>u.kind==='farm'&&u.built<1))build('farm');
      const hall=us.find(u=>u.kind==='hall'&&u.built===1);if(hall&&us.filter(u=>u.kind==='worker'&&!u.consumed).length<5&&!hall.queue.length)command(s,t,{type:'train',ids:[hall.id],kind:'worker'});if(hall&&s.frame>350&&team.gold>600)command(s,t,{type:'tech',ids:[hall.id]});
      for(const b of us.filter(u=>u.kind==='altar'&&u.built===1)){const dead=heroRoster(s,t).find(h=>h.hp<=0&&!us.some(v=>v.queue.some(q=>q.revive===h.id)));if(dead){if(command(s,t,{type:'revive',ids:[b.id],target:dead.id})===null)continue;}const roster=heroRoster(s,t),queued=heroQueued(s,t),heroClass=[team.heroClass,...heroes.map((_,i)=>i)].find(i=>!roster.some(h=>h.heroClass===i)&&!queued.some(q=>q.heroClass===i));if(roster.length+queued.length<team.tier&&command(s,t,{type:'train',ids:[b.id],kind:'hero',heroClass})===null)continue;command(s,t,{type:'train',ids:[b.id],kind:flyers[team.faction]});}
      if(worker&&!['construct','repair'].includes(worker.order?.type)&&team.tier>=2&&!us.some(u=>u.kind==='workshop')){const a=(s.frame/40%12)*Math.PI/6;command(s,t,{type:'build',ids:[worker.id],kind:'workshop',x:clamp(base[0]+Math.cos(a)*11,-27,27),z:clamp(base[1]+Math.sin(a)*11,-27,27)});}
      if(worker&&!['construct','repair'].includes(worker.order?.type)&&[1,3].includes(team.faction)&&team.tier>=2&&!us.some(u=>u.kind===(team.faction===1?'spiritlodge':'temple'))){const a=(s.frame/40%12)*Math.PI/6;command(s,t,{type:'build',ids:[worker.id],kind:team.faction===1?'spiritlodge':'temple',x:clamp(base[0]+Math.cos(a)*13,-27,27),z:clamp(base[1]+Math.sin(a)*13,-27,27)});}
      for(const b of us.filter(u=>casterTraining[u.kind])){const school=casterTraining[b.kind],upgrade=b.kind==='temple'&&Object.keys(skeletonResearch).find(k=>!team[skeletonResearch[k].field]&&team.tier>=skeletonResearch[k].tier);if(b.casterResearch)continue;if(!b.queue.length&&upgrade&&command(s,t,{type:'skeletonResearch',ids:[b.id],upgrade})===null)continue;if(!b.queue.length&&(team[school.field]||0)<(team.tier>=3?2:1)&&command(s,t,{type:'casterResearch',ids:[b.id]})===null)continue;command(s,t,{type:'train',ids:[b.id],kind:school.unit});}
      for(const b of us.filter(u=>u.kind==='workshop')){command(s,t,{type:'rally',ids:[b.id],x:foe[0],z:foe[1]});command(s,t,{type:'train',ids:[b.id],kind:trainable(s,b)[0]});}
      for(const b of us.filter(u=>u.kind==='barracks')){if(team.faction===3&&team.gold>200&&!team.cannibalize)command(s,t,{type:'cannibalizeResearch',ids:[b.id]});const roster=trainable(s,b);command(s,t,{type:'train',ids:[b.id],kind:roster[Math.floor(s.frame/40)%(team.tier>=2?roster.length:2)]});if(team.gold>500)command(s,t,{type:'upgrade',ids:[b.id]});}
      for(const w of us.filter(u=>(u.kind==='worker'||u.kind==='ghoul'&&team.faction===3&&us.filter(v=>v.kind==='ghoul'&&v.order?.type==='gather').length<2)&&!u.inside&&!u.order)){const mining=us.filter(v=>v.kind==='worker'&&v.order?.type==='gather'&&s.resources[v.order.resource]?.kind==='mine').length,kind=w.kind==='ghoul'?'tree':acolyte(s,w)||mining<3?'mine':'tree',ri=s.resources.findIndex(r=>r.amount>0&&r.kind===kind&&canGather(s,w,r)&&distance(w,r)<16&&(!acolyte(s,w)||hauntedMine(s,r)?.team===t&&mineWorkers(s,r).length<5));if(ri>=0&&(w.kind!=='ghoul'||us.filter(v=>v.kind==='ghoul'&&v.order?.type==='gather').length<2))command(s,t,{type:'gather',ids:[w.id],resource:ri});}
      if(s.frame>200)for(const u of us.filter(u=>u.speed&&u.kind!=='worker'&&!u.order))u.order={type:'attackMove',x:foe[0],z:foe[1]};
    }
    for(const h of us.filter(u=>u.kind==='hero')){if(s.mode==='skirmish'&&h.hp<h.maxHp*.3&&h.inventory.includes(townPortal.item)&&distance(h,{x:base[0],z:base[1]})>12&&command(s,t,{type:'useItem',ids:[h.id],slot:h.inventory.indexOf(townPortal.item),item:townPortal.item})===null)continue;for(let n=0;n<10&&h.skillPoints;n++){const slot=[3,0,1,2].find(i=>h.skills[i]<(i===3?1:3)&&h.level>=(i===3?6:h.skills[i]*2+1));if(slot===undefined)break;command(s,t,{type:'learn',ids:[h.id],slot});}if(s.mode==='moba'&&!h.order)h.order={type:'attackMove',x:foe[0],z:foe[1]};const e=s.units.find(u=>u.team!==t&&u.hp>0&&!asleep(s,u)&&isVisible(s,t,u)&&distance(u,h)<9);if(e)for(const slot of [3,0,1,2]){const spell=unitType(h).spells[slot],self=['heal','shield','haste','avatar'].includes(spell.kind),target=self?h:e;if(spell.kind==='heal'&&h.hp>h.maxHp*.75)continue;command(s,t,{type:'spell',ids:[h.id],slot,x:target.x,z:target.z});}}
    for(const u of us.filter(u=>u.kind==='necromancer'||u.kind==='shaman')){
      const enemies=s.units.filter(v=>v.hp>0&&v.team!==t&&isVisible(s,t,v)&&distance(u,v)<=6);
      if(u.kind==='necromancer'){if(enemies.length)u.raiseDeadAuto=true;const enemy=enemies.find(v=>types[v.kind].organic&&!v.cripple);if(enemy)command(s,t,{type:'casterSpell',ids:[u.id],spell:'cripple',target:enemy.id});const ally=enemies.length&&us.filter(v=>types[v.kind].organic&&v.damage>0&&v.hp>180&&!v.frenzy&&distance(u,v)<=5).sort((a,b)=>b.damage-a.damage)[0];if(ally)command(s,t,{type:'casterSpell',ids:[u.id],spell:'frenzy',target:ally.id});}
      else {const target=us.find(v=>(v.cripple>0||v.purgeLeft>0||v.lightningShield>0&&us.some(w=>w.id!==v.id&&distance(w,v)<=1.6))&&distance(u,v)<=7)||enemies.find(v=>v.summoned||v.frenzy>0||v.shield>0||v.haste>0||v.bloodlust>0);if(target)command(s,t,{type:'casterSpell',ids:[u.id],spell:'purge',target:target.id});else {const carrier=enemies.find(v=>!types[v.kind].flying&&!v.lightningShield&&distance(u,v)<=6&&enemies.some(w=>w.id!==v.id&&!types[w.kind].flying&&distance(w,v)<=1.6)&&!us.some(w=>distance(w,v)<=1.6));if(carrier)command(s,t,{type:'casterSpell',ids:[u.id],spell:'lightningShield',target:carrier.id});}}
    }
    if(team.cannibalize)for(const u of us.filter(u=>Object.hasOwn(cannibalize.healing,u.kind)&&u.hp<u.maxHp*.75&&!s.units.some(v=>v.team!==t&&v.hp>0&&!v.inside&&isVisible(s,t,v)&&distance(u,v)<8)))command(s,t,{type:'cannibalize',ids:[u.id]});
    if(s.mode!=='moba'&&team.faction===3)for(const u of us)u.hp=Math.min(u.maxHp,u.hp+2);
  }
  const portalLeft=u=>u.order?.type==='townPortal'?u.order.left:u.portalLeft||0;
  function finishPortal(s,u){
    const o=u.order,base=s.units.find(v=>v.id===o.target&&v.kind==='hall'&&v.team===u.team&&v.hp>0&&v.built===1);if(!base){u.order=null;s.announcements[u.team]='Town Portal cancelled: destination base was destroyed';return;}
    const passengers=[u,...s.units.filter(v=>v.id!==u.id&&v.team===u.team&&v.hp>0&&!v.inside&&v.built===1&&types[v.kind].speed&&(!v.summoned||s.frame<v.expires)&&!v.root&&distance(u,v)<=townPortal.radius&&(!['worker','ghoul'].includes(v.kind)||!['gather','build','construct','repair'].includes(v.order?.type)))],slots=new Map(),reserved=s.units.filter(v=>v.hp>0&&!v.inside&&types[v.kind].speed&&!passengers.includes(v)).map(v=>({x:v.x,z:v.z,r:movementRadius(v),flying:!!types[v.kind].flying}));
    const cells=[{x:o.x,z:o.z},...Array.from({length:1024},(_,i)=>({x:i%32*2-31,z:Math.floor(i/32)*2-31}))].filter(p=>Math.abs(p.x)<=30&&Math.abs(p.z)<=30).sort((a,b)=>distance(a,o)-distance(b,o)||a.z-b.z||a.x-b.x);
    for(const v of passengers){const flying=!!types[v.kind].flying,r=movementRadius(v),p=cells.find(p=>(flying||!solid(s,p.x,p.z))&&reserved.every(b=>b.flying!==flying||distance(p,b)>=r+b.r+.1));if(!p){if(v===u){u.order=null;s.announcements[u.team]='Town Portal failed: no free arrival space';return;}continue;}slots.set(v.id,p);reserved.push({...p,r,flying});}
    const from={x:u.x,z:u.z};for(const v of passengers){const p=slots.get(v.id);if(!p)continue;v.x=p.x;v.z=p.z;v.order=null;v.waypoints=[];v.path=[];v.pathAt=-100;delete v.dest;delete v.workResume;}
    s.announcements[u.team]='Town Portal transported '+slots.size+' units';s.events.push({type:'spell',slot:2,heroClass:u.heroClass,...from,team:u.team},{type:'spell',slot:2,heroClass:u.heroClass,x:u.x,z:u.z,team:u.team});visibility(s);
  }
  function tick(s){
    s.corpses=s.corpses.filter(c=>{if(s.winner!==null||!s.units.some(u=>u.hp>0&&!u.inside&&u.order?.type==='cannibalize'&&u.order.active&&u.order.target===c.id))c.age+=DT;return c.age<CORPSE_LIFETIME;});
    if(s.winner!==null)return;simulating.add(s);const night=isNight(s);s.frame++;s.events=s.pendingEvents||[];s.pendingEvents=[];if(night!==isNight(s))visibility(s);
    for(const t of s.teams)if(t.research>0){t.research=Math.max(0,t.research-DT);if(t.research===0)t.tier++;}
    if(s.mode==='moba'&&s.frame>=s.nextWave&&spawnLaneWave(s)){s.wave++;s.nextWave=s.frame+Math.round(s.map.waveInterval/DT);}
    if(s.mode==='td'&&s.frame>=s.nextWave&&s.units.length+s.tdPending.length+5+(s.wave+1)*2<=LIMIT){
      s.wave++;s.nextWave=s.frame+Math.round(s.map.waveInterval/DT);
      if(s.wave<=s.map.waves)for(let i=0;i<5+s.wave*2;i++){const boss=s.wave%4===0&&i===0,hp=(100+s.wave*40)*(boss?5:s.wave%3===2?1.4:1);s.tdPending.push({hp,speed:(3+s.wave*.12)*(s.wave%3===0?1.45:1),tdBoss:boss});}
    }
    if(s.mode==='td'&&s.tdPending.length&&s.units.length<LIMIT&&!solid(s,...tdPath[0])&&s.units.every(u=>u.hp<=0||u.inside||types[u.kind].flying||!types[u.kind].speed||Math.hypot(u.x-tdPath[0][0],u.z-tdPath[0][1])>=movementRadius(u)+.55)){const next=s.tdPending.shift();spawn(s,'creep',1,...tdPath[0],{...next,maxHp:next.hp,route:tdPath,waypoint:1,td:true});}
    if(s.frame%40===0)for(let t=0;t<2;t++)if(s.teams[t].ai)ai(s,t);
    if(s.frame%10===0&&s.mode==='moba')for(const t of s.teams)t.gold+=3;
    for(const u of s.units){if(u.hp<=0||!(u.lightningShield>0))continue;const elapsed=Math.min(DT,u.lightningShield);if(!u.inside&&!(u.summoned&&s.frame>=u.expires))for(const v of s.units)if(v.id!==u.id&&v.hp>0&&!v.inside&&types[v.kind].speed&&!types[v.kind].flying&&!types[v.kind].magicImmune&&distance(u,v)<=casterSpells.lightningShield.radius)damage(s,u.lightningSource,v,casterSpells.lightningShield.power*elapsed,'lightning');u.lightningShield=Math.max(0,u.lightningShield-DT);if(!u.lightningShield)delete u.lightningSource;}
    for(const u of s.units){
      if(u.hp<=0){if(u.kind==='hero'&&s.mode==='skirmish'){u.cd=Math.max(0,u.cd-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));u.itemCooldown=Math.max(0,(u.itemCooldown||0)-DT);}if(u.respawn>0){u.respawn-=DT;if(u.respawn<=0){s.corpses=s.corpses.filter(c=>c.id!==u.id);[u.x,u.z]=s.map.spawns[u.team];u.hp=u.maxHp;u.mana=150;u.order=null;u.waypoints=[];u.path=[];for(const effect of ['stun','root','haste','avatar','shieldLeft','shield','frenzy','cripple','purgeLeft','castLeft','bloodlust','lightningShield'])u[effect]=0;delete u.frenzySource;delete u.lightningSource;}}continue;}
      if(u.inside)continue;
      if(u.summoned&&s.frame>=u.expires){u.hp=0;continue;}
      for(const effect of ['stun','root','haste','avatar','shieldLeft'])if(u[effect]>0)u[effect]=Math.max(0,u[effect]-DT);if(!u.shieldLeft)u.shield=0;
      if(u.kind==='hero')u.itemCooldown=Math.max(0,(u.itemCooldown||0)-DT);
      u.cd=Math.max(0,u.cd-DT*attackRate(u));if(['worker','ghoul'].includes(u.kind))u.gatherCd=Math.max(0,(u.gatherCd||0)-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));u.mana=Math.min(maxMana(u),u.mana+DT*(['necromancer','shaman'].includes(u.kind)?.667+.25*(u.casterRank||0):2));if(u.kind==='necromancer')u.raiseDeadCd=Math.max(0,u.raiseDeadCd-DT);
      u.slow=Math.max(0,(u.slow||0)-DT);
      if(u.frenzy>0){const elapsed=Math.min(DT,u.frenzy);u.frenzy=Math.max(0,u.frenzy-DT);damage(s,u.frenzySource,u,4*elapsed,'drain');if(!u.frenzy)delete u.frenzySource;if(u.hp<=0)continue;}
      for(const effect of ['cripple','purgeLeft','castLeft','frenzyCd','crippleCd','purgeCd','bloodlust','bloodlustCd','lightningShieldCd'])if(u[effect]>0)u[effect]=Math.max(0,u[effect]-DT);
      if(u.order?.type==='townPortal'){u.order.left=Math.max(0,u.order.left-DT);if(u.order.left<1e-8)finishPortal(s,u);continue;}
      if(types[u.kind].heal&&s.frame%10===0)for(const ally of s.units)if(ally.team===u.team&&ally.hp>0&&distance(ally,u)<6)ally.hp=Math.min(ally.maxHp,ally.hp+types[u.kind].heal);
      if(u.built<1){construct(s,u);continue;}
      if(u.cannibalizeResearch){u.cannibalizeResearch=Math.max(0,u.cannibalizeResearch-DT);if(!u.cannibalizeResearch){s.teams[u.team].cannibalize=1;delete u.cannibalizeResearch;}}
      if(u.casterResearch){const r=u.casterResearch;r.left=Math.max(0,r.left-DT);if(!r.left){if(r.upgrade)s.teams[u.team][skeletonResearch[r.upgrade].field]=1;else{const school=casterTraining[u.kind];s.teams[u.team][school.field]=r.rank;for(const v of s.units)if(v.team===u.team&&v.kind===school.unit){const extra=40*(r.rank-(v.casterRank||0));v.casterRank=r.rank;v.maxHp+=extra;if(v.hp>0)v.hp+=extra;}}delete u.casterResearch;}}
      if(u.queue.length){
        const q=u.queue[0];q.left=Math.max(0,q.left-DT);
        if(q.left===0&&(q.revive||s.units.length<LIMIT)){
          let p=null;for(let a=0;a<12;a++){const x=u.x+Math.cos(a*Math.PI/6)*4,z=u.z+Math.sin(a*Math.PI/6)*4;if(Math.abs(x)<=30&&Math.abs(z)<=30&&(types[q.kind].flying||!solid(s,x,z))&&s.units.every(v=>v.hp<=0||v.inside||!types[v.kind].speed||!!types[v.kind].flying!==!!types[q.kind].flying||Math.hypot(x-v.x,z-v.z)>=movementRadius(v)+movementRadius({kind:q.kind})+.05)){p=[x,z];break;}}
          if(p){const v=q.revive?s.units.find(v=>v.id===q.revive&&v.team===u.team&&v.kind==='hero'&&v.hp<=0):spawn(s,q.kind,u.team,...p,q.kind==='hero'?{heroClass:q.heroClass}:{});if(v){u.queue.shift();if(q.kind==='hero'&&!q.revive&&!s.teams[u.team].portalGranted){setInventory(v,[...v.inventory,townPortal.item]);s.teams[u.team].portalGranted=true;}if(q.revive){[v.x,v.z]=p;v.hp=v.maxHp;v.mana=100;v.respawn=0;v.order=null;v.waypoints=[];v.path=[];v.pathAt=-100;delete v.dest;for(const effect of ['stun','root','slow','haste','avatar','shieldLeft','shield','frenzy','cripple','purgeLeft','castLeft','bloodlust','lightningShield'])v[effect]=0;delete v.frenzySource;delete v.lightningSource;delete v.castYaw;delete v.workResume;s.announcements[v.team]=unitType(v).label+' (level '+v.level+') has been revived.';s.events.push({type:'spell',slot:1,heroClass:v.heroClass,x:v.x,z:v.z,team:v.team});}if(u.rally)v.order={type:v.kind==='worker'?'move':'attackMove',...u.rally};}}
        }
      }
      if(u.order?.type==='cannibalize'){
        const o=u.order,body=s.corpses.find(c=>c.id===o.target);if(!body||u.stun>0||u.hp>=u.maxHp||!s.visible[u.team][index(body.x,body.z)]){if(body&&o.active&&u.hp>=u.maxHp)s.corpses=s.corpses.filter(c=>c.id!==body.id);u.order=null;u.path=[];}
        else if(distance(u,body)>cannibalize.reach){o.active=false;move(s,u,body.x,body.z,cannibalize.reach-.1);}
        else {o.active=true;body.age=Math.max(body.age,2);u.yaw=Math.atan2(body.x-u.x,body.z-u.z);u.hp=Math.min(u.maxHp,u.hp+cannibalize.healing[u.kind]*Math.min(DT,o.left));o.left=Math.max(0,o.left-DT);if(o.left<1e-8||u.hp>=u.maxHp){s.corpses=s.corpses.filter(c=>c.id!==body.id);u.order=null;}}
        continue;
      }
      if(u.stun>0||asleep(s,u))continue;
      if(u.kind==='necromancer'){if(u.raiseDeadAuto&&!['move','patrol'].includes(u.order?.type))raise(s,u);if(u.castLeft>0||u.raiseDeadCd>raiseDead.cooldown-.8)continue;}
      if(u.kind==='shaman'){if(u.bloodlustAuto&&(u.casterRank||0)>=2&&!u.castLeft&&!['move','patrol'].includes(u.order?.type)&&s.units.some(v=>v.team!==u.team&&v.hp>0&&!v.inside&&isVisible(s,u.team,v)&&distance(u,v)<=8)){const target=s.units.filter(v=>v.team===u.team&&v.hp>0&&!v.inside&&v.damage>0&&types[v.kind].organic&&!types[v.kind].magicImmune&&!v.bloodlust&&distance(u,v)<=6&&attackClear(s,u,v)).sort((a,b)=>b.damage-a.damage||a.id-b.id)[0];if(target)castUnit(s,u,{spell:'bloodlust',target:target.id});}if(u.castLeft>0)continue;}
      if(u.order?.type==='pickup'){const d=s.loot.find(d=>d.id===u.order.target);if(!d||!s.visible[u.team][index(d.x,d.z)]||u.inventory.length>=6&&!d.relic){u.order=null;u.path=[];}else if(distance(u,d)<=2.5&&traversable(s.map,u.x,u.z,d.x,d.z)){pickup(s,u,d);u.order=null;u.path=[];}else move(s,u,d.x,d.z,2.25);continue;}
      if(u.kind==='worker'&&u.order?.type==='build'){
        const o=u.order;if(distance(u,o)>15){move(s,u,o.x,o.z,types[o.kind].radius+1.1);continue;}const pending=u.waypoints,error=command(s,u.team,{...o,ids:[u.id]});u.waypoints=pending;if(error){s.announcements[u.team]='Queued build skipped: '+error;advanceOrder(s,u);}else if(!u.order)advanceOrder(s,u);continue;
      }
      if(u.kind==='worker'&&['construct','repair'].includes(u.order?.type)){work(s,u);continue;}
      if(['worker','ghoul'].includes(u.kind)&&u.order?.type==='gather'){gather(s,u);continue;}
      if(u.td){const p=u.route[u.waypoint];if(!p){u.hp=0;s.lives-=u.tdBoss?5:1;if(s.lives<=0)s.winner=1;continue;}if(move(s,u,p[0],p[1],u.waypoint===u.route.length-1?4.5:1.3))u.waypoint++;continue;}
      let target=u.order?.type==='attack'?s.units.find(v=>v.id===u.order.target&&canTarget(s,u,v)&&isVisible(s,u.team,v)):null;
      if(u.order?.type==='attack'&&!target)u.order=null;
      if(u.order?.type!=='move'&&u.damage>0&&!target){let best=Infinity;for(const v of s.units){if(v.team===u.team||v.hp<=0||asleep(s,v)||!canAttack(u,v)||(u.team>=0&&!isVisible(s,u.team,v))||u.order?.type==='hold'&&!attackInRange(s,u,v))continue;const d=distance(u,v);if(d<best&&(u.order?.type==='hold'||d<Math.max(unitType(u).range,8))){target=v;best=d;}}}
      if(target&&u.team===-1&&u.home)u.awakeUntil=s.frame+100;
      if(target){const range=unitType(u).range+(types[target.kind].radius||.3),inRange=attackInRange(s,u,target),slot=meleeSlot(s,u,target);
        if(inRange&&u.cd<=0)fire(s,u,target);
        if(target.hp>0&&u.order?.type!=='hold'){if(slot)move(s,u,slot.x,slot.z,.12);else if(!inRange)move(s,u,target.x,target.z,range*.98);}
      }
      else if(u.order&&['move','attackMove','patrol'].includes(u.order.type)){
        if(!types[u.kind].flying&&solid(s,u.order.x,u.order.z,u.id,u.team)||s.units.some(v=>v.id!==u.id&&v.team===u.team&&v.hp>0&&!v.inside&&types[v.kind].speed&&(!v.order||v.order.type==='hold')&&!!types[v.kind].flying===!!types[u.kind].flying&&Math.hypot(v.x-u.order.x,v.z-u.order.z)<movementRadius(u)+movementRadius(v)+.1)){const p=formation(s,[u],u.order.x,u.order.z)?.get(u.id);if(p){u.order.x=p[0];u.order.z=p[1];u.path=[];u.pathAt=-100;}}
        if(move(s,u,u.order.x,u.order.z,.12)){if(u.order.type==='patrol'){const o=u.order;[o.x,o.z,o.fromX,o.fromZ]=[o.fromX,o.fromZ,o.x,o.z];}else advanceOrder(s,u);u.path=[];u.pathAt=-100;}
      }
      else if(!u.order&&u.route){const p=u.route[u.waypoint];if(p&&move(s,u,p[0],p[1],1.5))u.waypoint++;}
      else if(!u.order&&u.home&&distance(u,{x:u.home[0],z:u.home[1]})>3)move(s,u,...u.home,2);
      if(s.mode!=='skirmish'&&u.kind==='hero'&&s.units.some(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1&&distance(u,v)<8))u.hp=Math.min(u.maxHp,u.hp+DT*12);
    }
    advanceProjectiles(s);
    for(const zone of s.zones){zone.left-=DT;zone.pulse-=DT;if(zone.pulse<=0){zone.pulse+=1;for(const v of s.units)if(v.team!==zone.team&&v.hp>0&&v.order?.type!=='townPortal'&&distance(v,zone)<=zone.radius){damage(s,{kind:'hero',heroClass:zone.heroClass,team:zone.team},v,zone.damage);if(zone.slow)v.slow=zone.slow;}s.events.push({type:'spell',x:zone.x,z:zone.z,slot:zone.slot,heroClass:zone.heroClass,team:zone.team});}}s.zones=s.zones.filter(z=>z.left>0);
    for(const b of s.units)if(b.hp<=0&&!types[b.kind].speed)finishWork(s,b);
    for(const u of s.units)if(u.order?.type==='townPortal'&&!s.units.some(b=>b.id===u.order.target&&b.kind==='hall'&&b.team===u.team&&b.hp>0&&b.built===1))finishPortal(s,u);
    s.units=s.units.filter(u=>u.hp>0||u.respawn>0||s.mode==='skirmish'&&u.kind==='hero'&&u.team>=0);
    if(s.mode==='rpg'){
      const h=s.units.find(u=>u.kind==='hero'&&u.team===0&&u.hp>0);
      if(h){s.loot=s.loot.filter(d=>{if(d.manual||distance(h,d)>2.5||!traversable(s.map,h.x,h.z,d.x,d.z)||!d.relic&&h.inventory.length>=6)return true;if(d.relic)s.quest.relic=true;else equip(h,d.item);return false;});
        const q=s.quest,done=[q.scouts>=3,q.relic,q.boss,distance(h,{x:s.map.spawns[0][0],z:s.map.spawns[0][1]})<7];
        if(q.stage<4&&done[q.stage]){q.stage++;experience(h,180);s.teams[0].gold+=150;s.announcement=q.stage===4?'The covenant is restored.':questNames[q.stage];s.events.push({type:'spell',slot:1,x:h.x,z:h.z,team:0});if(q.stage===4)s.winner=0;}
      }
    }
    runTriggers(s);
    if(s.mode==='td'&&s.wave>=s.map.waves&&!s.tdPending.length&&!s.units.some(u=>u.td)&&s.frame>s.nextWave-Math.round(s.map.waveInterval/DT)+10)s.winner=0;
    if(s.frame%3===0)visibility(s);simulating.delete(s);
  }
  function inRegion(map,region,u,t){const r=map.regions[region];return r?Math.abs(u.x-r.x)<=r.width/2&&Math.abs(u.z-r.z)<=r.height/2:distance(u,t)<4;}
  function triggerReady(s,t,c){
    if(c.when==='timer')return s.frame*DT>=c.value;
    if(c.when==='delay')return (s.frame-(t.after>=0?s.triggerState[t.after].last:0))*DT>=c.value;
    if(['kills','gold','wood'].includes(c.when))return s.teams[c.team][c.when]>=c.value;
    const units=s.units.filter(u=>u.hp>0&&!u.inside&&u.team===c.team&&(c.kind==='*'||u.kind===c.kind)&&(c.region>=0?inRegion(s.map,c.region,u,t):c.when!=='enter'||inRegion(s.map,-1,u,t)));
    return c.when==='clear'?units.length===0:c.when==='units'?units.length>=c.value:units.some(u=>types[u.kind].speed);
  }
  function runTriggers(s){
    for(const [i,t] of s.map.triggers.entries()){
      const clock=s.triggerState[i];if(clock.count>=t.limit||s.frame<clock.next||t.after>=0&&!s.triggerState[t.after].count||!(t.logic==='all'?t.conditions.every(c=>triggerReady(s,t,c)):t.conditions.some(c=>triggerReady(s,t,c))))continue;
      const plan=[];let blocked=false;
      for(const a of t.actions)if(a.action==='spawn'){
        const center=s.map.regions[a.region]||t,d=types[a.kind];for(let n=0;n<a.value;n++){
          let pos=null;for(let j=0;j<160;j++){const radius=j===0?0:Math.sqrt(j)*.65,angle=j*2.399963,p={x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius};if(Math.abs(p.x)>29||Math.abs(p.z)>29||a.region>=0&&!inRegion(s.map,a.region,p,t)||!d.flying&&solid(s,p.x,p.z)||plan.some(v=>distance(v,p)<(types[v.kind].radius||.4)+(d.radius||.4)+.3)||!d.speed&&s.units.some(v=>v.hp>0&&!types[v.kind].speed&&distance(v,p)<(types[v.kind].radius||1)+(d.radius||1)+.8))continue;pos=p;break;}
          if(!pos){blocked=true;break;}plan.push({...pos,kind:a.kind,team:a.team,source:a});
        }if(blocked)break;
      }
      if(blocked||s.units.length+plan.length>LIMIT)continue;
      for(const a of t.actions){
        if(a.action==='spawn'){for(const p of plan)if(p.source===a)spawn(s,p.kind,p.team,p.x,p.z);}
        else if(a.action==='gold'||a.action==='wood')s.teams[a.team][a.action]+=a.value;
        else if(a.action==='message')s.announcements[a.team]=a.text;
        else if(a.action==='victory')s.winner=a.team;
        else if(a.action==='attackMove'){const p=s.map.regions[a.region]||t;for(const u of s.units)if(u.team===a.team&&u.kind===a.kind&&u.hp>0&&u.speed&&!u.inside){u.order={type:'attackMove',x:p.x,z:p.z};u.waypoints=[];u.path=[];u.pathAt=-100;delete u.workResume;}}
        else if(a.action==='heal')for(const u of s.units)if(u.team===a.team&&u.hp>0&&!u.inside&&(a.region<0||inRegion(s.map,a.region,u,t)))u.hp=Math.min(u.maxHp,u.hp+a.value);
      }
      clock.count++;clock.last=s.frame;clock.next=s.frame+Math.round(t.interval/DT);if(!s.triggered.includes(i))s.triggered.push(i);if(s.winner!==null)break;
    }
  }
  function removeTrigger(map,index){if(map.triggers.some(t=>t.after===index))throw Error('Reassign dependent triggers before deleting this trigger');map.triggers.splice(index,1);for(const t of map.triggers)t.after=t.after===index?-1:t.after>index?t.after-1:t.after;}
  function removeRegion(map,index){if(map.triggers.some(t=>[...t.conditions,...t.actions].some(e=>e.region===index)))throw Error('Reassign trigger regions before deleting this region');map.regions.splice(index,1);for(const t of map.triggers)for(const entry of [...t.conditions,...t.actions])entry.region=entry.region===index?-1:entry.region>index?entry.region-1:entry.region;}
  function restore(raw){
    const finite=v=>Number.isFinite(v)&&Math.abs(v)<=1000000,point=p=>Array.isArray(p)&&p.length===2&&p.every(finite);
    if(!raw||raw.version!==1||!Number.isSafeInteger(raw.frame)||raw.frame<0||!Number.isSafeInteger(raw.serial)||!Array.isArray(raw.units)||raw.units.length>LIMIT||!Array.isArray(raw.teams)||raw.teams.length!==2)throw Error('Invalid save header');
    const s=clone(raw),legacyHeroes=s.heroLifecycleVersion===undefined;if(!legacyHeroes&&s.heroLifecycleVersion!==1)throw Error('Invalid saved hero lifecycle');s.heroLifecycleVersion=1;s.economyVersion??=0;if(![0,1].includes(s.economyVersion))throw Error('Invalid saved economy version');s.map=validateMap(s.map);if(s.mode!==s.map.mode)throw Error('Save mode mismatch');
    s.tdPending??=[];if(!Array.isArray(s.tdPending)||s.tdPending.length>LIMIT||s.mode!=='td'&&s.tdPending.length||s.tdPending.some(v=>!v||!Number.isFinite(v.hp)||v.hp<=0||v.hp>20000||!Number.isFinite(v.speed)||v.speed<=0||v.speed>15||typeof v.tdBoss!=='boolean'))throw Error('Invalid saved entrance queue');
    if(s.teams.some(t=>!t||![t.gold,t.wood,t.faction,t.upgrade,t.kills].every(finite)||!Number.isInteger(t.faction)||t.faction<0||t.faction>3))throw Error('Invalid saved teams');
    if(s.projectiles===undefined)s.projectiles=[];if(s.projectileSerial===undefined)s.projectileSerial=0;
    if(!Array.isArray(s.projectiles)||s.projectiles.length>PROJECTILE_LIMIT||!Number.isSafeInteger(s.projectileSerial)||s.projectileSerial<0)throw Error('Invalid saved projectiles');
    const shots=new Set();for(const p of s.projectiles){
      if(!p||!Object.hasOwn(types,p.kind)||!validHero(p.heroClass)||![-1,0,1].includes(p.team)||!Number.isSafeInteger(p.id)||p.id<1||p.id>s.projectileSerial||shots.has(p.id)||!Number.isSafeInteger(p.source)||p.source<1||p.source>s.serial||!Number.isSafeInteger(p.target)||p.target<1||p.target>s.serial||p.source===p.target||!Number.isSafeInteger(p.born)||p.born<0||p.born>s.frame||![p.x,p.y,p.z,p.baseY,p.toX,p.toY,p.toZ,p.travel,p.age,p.damage,p.splashDamage,p.vx,p.vy,p.vz].every(finite)||!projectileSpeed(p)||p.age<0||p.age>6||Math.abs(p.age-(s.frame-p.born)*DT)>1e-6||p.travel<0||p.travel>projectileSpeed(p)*p.age+1e-6||p.damage<0||p.splashDamage<0||p.art!==projectileArt(p)&&!(p.art==='bolt'&&p.kind!=='archer'))throw Error('Invalid saved projectile');p.art=projectileArt(p);shots.add(p.id);
    }
    s.corpses??=[];if(legacyHeroes&&Array.isArray(s.corpses))s.corpses=s.corpses.filter(c=>c?.kind!=='hero');if(!Array.isArray(s.corpses)||s.corpses.length>CORPSE_LIMIT)throw Error('Invalid saved corpses');const bodies=new Set();
    for(const c of s.corpses){if(!c||!leavesCorpse(c.kind)||![-1,0,1].includes(c.team)||!Number.isSafeInteger(c.id)||c.id<1||c.id>s.serial||bodies.has(c.id)||!validHero(c.heroClass)||c.kind!=='hero'&&c.heroClass!==0||![c.x,c.y,c.z,c.yaw,c.age].every(finite)||Math.abs(c.x)>32||Math.abs(c.z)>32||c.y< -1||c.y>32||Math.abs(c.yaw)>Math.PI||c.age<0||c.age>=CORPSE_LIFETIME||typeof c.boss!=='boolean'||typeof c.large!=='boolean'||s.units.some(u=>u.id===c.id&&(u.hp>0||u.kind!==c.kind||u.team!==c.team)))throw Error('Invalid saved corpse');bodies.add(c.id);}
    if(legacyHeroes)for(const u of s.units)if(Array.isArray(u?.queue))for(const q of u.queue)if(q?.kind==='hero'){q.heroClass??=s.teams[u.team]?.heroClass??0;q.paidGold??=300;q.paidWood??=80;}
    const ids=new Set();for(const u of s.units){
      if(!u||!Object.hasOwn(types,u.kind)||![-1,0,1].includes(u.team)||!Number.isSafeInteger(u.id)||u.id<1||u.id>s.serial||ids.has(u.id)||![u.x,u.z,u.hp,u.maxHp,u.damage,u.speed,u.cd,u.built,u.level,u.xp,u.mana,u.cargo,u.respawn,u.pathAt].every(finite)||u.maxHp<=0||!Array.isArray(u.path)||u.path.length>1024||!u.path.every(point)||!Array.isArray(u.spell)||u.spell.length!==4||!u.spell.every(finite)||!Array.isArray(u.queue)||u.queue.length>3||u.queue.some(q=>!q||!Object.hasOwn(types,q.kind)||!finite(q.left))||!Array.isArray(u.inventory)||u.inventory.length>6||u.inventory.some(i=>!Number.isInteger(i)||!items[i])||u.route!==undefined&&(!Array.isArray(u.route)||!u.route.every(point))||u.home!==undefined&&!point(u.home))throw Error('Invalid saved units');ids.add(u.id);
      delete u.feeding;delete u.portalLeft;
      if(u.kind==='necromancer'){if(u.raiseDeadAuto===undefined)u.raiseDeadAuto=false;if(u.raiseDeadCd===undefined)u.raiseDeadCd=0;if(u.casterRank===undefined)u.casterRank=s.teams[u.team]?.necromancy||0;if(!Number.isInteger(u.casterRank)||u.casterRank<0||u.casterRank>2)throw Error('Invalid saved caster rank');if(typeof u.raiseDeadAuto!=='boolean'||!finite(u.raiseDeadCd)||u.raiseDeadCd<0||u.raiseDeadCd>raiseDead.cooldown||u.mana<0||u.mana>maxMana(u))throw Error('Invalid saved Raise Dead');}
      if(u.kind==='shaman'){u.casterRank??=s.teams[u.team]?.shamanism||0;u.bloodlustAuto??=true;if(!Number.isInteger(u.casterRank)||u.casterRank<0||u.casterRank>2||typeof u.bloodlustAuto!=='boolean'||u.mana<0||u.mana>maxMana(u))throw Error('Invalid saved shaman');}
      if(['worker','ghoul'].includes(u.kind)){if(u.gatherCd===undefined){u.gatherCd=u.order?.type==='gather'?Math.max(0,u.cd):0;}if(!finite(u.gatherCd)||u.gatherCd<0||u.gatherCd>(acolyte(s,u)?5:Math.max(.65,types.worker.cooldown||1)))throw Error('Invalid saved gathering cooldown');}
      for(const [field,max] of Object.entries({frenzy:45,cripple:u.kind==='hero'?10:60,purgeLeft:u.kind==='hero'?5:15,castLeft:.8,frenzyCd:1,crippleCd:10,purgeCd:1,bloodlust:60,bloodlustCd:1,lightningShield:20,lightningShieldCd:0}))if(u[field]!==undefined&&(!finite(u[field])||u[field]<0||u[field]>max))throw Error('Invalid saved caster effect');
      if(u.frenzy>0){const a=u.frenzySource;if(!a||a.kind!=='necromancer'||![0,1].includes(a.team)||!Number.isSafeInteger(a.id)||a.id<1||a.id>s.serial||![a.x,a.z].every(v=>finite(v)&&Math.abs(v)<=32))throw Error('Invalid saved frenzy source');}else if(u.frenzySource!==undefined)throw Error('Unexpected saved frenzy source');
      if(u.lightningShield>0){const a=u.lightningSource;if(!a||a.kind!=='shaman'||![0,1].includes(a.team)||!Number.isSafeInteger(a.id)||a.id<1||a.id>s.serial||![a.x,a.z].every(v=>finite(v)&&Math.abs(v)<=32)||types[u.kind].flying||!types[u.kind].speed)throw Error('Invalid saved lightning source');}else if(u.lightningSource!==undefined)throw Error('Unexpected saved lightning source');
      if(u.casterResearch){const r=u.casterResearch,school=casterTraining[u.kind],upgrade=typeof r.upgrade==='string'&&Object.hasOwn(skeletonResearch,r.upgrade)?skeletonResearch[r.upgrade]:null;if(!school||u.built!==1||u.team<0||s.teams[u.team].faction!==school.faction||u.queue.length||!finite(r.left)||r.left<=0||(r.upgrade!==undefined?(!upgrade||u.kind!=='temple'||r.rank!==undefined||s.teams[u.team][upgrade.field]||s.teams[u.team].tier<upgrade.tier||r.left>upgrade.time):(![1,2].includes(r.rank)||r.rank!==(s.teams[u.team][school.field]||0)+1||r.left>school.times[r.rank-1])))throw Error('Invalid saved caster research');}
      if(u.order?.type==='cannibalize'){const o=u.order;if(!Object.hasOwn(cannibalize.healing,u.kind)||u.team<0||!s.teams[u.team].cannibalize||!Number.isSafeInteger(o.target)||o.target<1||o.target>s.serial||!finite(o.left)||o.left<=0||o.left>cannibalize.duration||typeof o.active!=='boolean'||s.corpses.some(c=>c.id===o.target&&(c.kind==='hero'||o.active&&distance(u,c)>cannibalize.reach+.01))||u.hp>0&&s.units.some(v=>v.id!==u.id&&v.hp>0&&v.order?.type==='cannibalize'&&v.order.target===o.target))throw Error('Invalid saved Cannibalize');}
      if(u.cannibalizeResearch!==undefined&&(!finite(u.cannibalizeResearch)||u.cannibalizeResearch<=0||u.cannibalizeResearch>cannibalize.time||u.kind!=='barracks'||u.built!==1||u.team<0||s.teams[u.team].faction!==3||s.teams[u.team].cannibalize||u.queue.length))throw Error('Invalid saved Cannibalize research');
      if(u.order?.type==='townPortal'){const o=u.order,b=s.units.find(v=>v.id===o.target&&v.kind==='hall'&&v.team===u.team);if(u.kind!=='hero'||u.hp<=0||u.inside||!b||b.hp<=0||b.built!==1||![o.x,o.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||!finite(o.left)||o.left<=0||o.left>townPortal.time||distance(b,o)>townPortal.baseRange||u.path.length||u.waypoints?.length)throw Error('Invalid saved Town Portal channel');}
      if(u.order?.type==='pickup'&&(u.kind!=='hero'||!Number.isSafeInteger(u.order.target)||u.order.target<1||u.order.target>s.serial))throw Error('Invalid saved pickup order');
      if(u.order?.type==='patrol'&&(!types[u.kind].speed||![u.order.x,u.order.z,u.order.fromX,u.order.fromZ].every(v=>Number.isFinite(v)&&Math.abs(v)<=30))||u.order?.type==='hold'&&!types[u.kind].speed)throw Error('Invalid saved patrol or hold order');
      if(u.waypoints===undefined)u.waypoints=[];if(u.order?.type==='gather'&&u.order.resource===-1){u.order=null;u.path=[];u.waypoints=[];}
      const waypoint=p=>p&&(['move','attackMove'].includes(p.type)?[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30):p.type==='gather'?['worker','ghoul'].includes(u.kind)&&Number.isInteger(p.resource)&&p.resource>=0&&raw.resources?.[p.resource]&&raw.resources[p.resource].kind!=='camp':u.kind==='worker'&&(p.type==='build'?['hall','farm','barracks','tower','frosttower','flametower','altar','workshop','temple','spiritlodge','hauntedmine'].includes(p.kind)&&[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30):p.type==='gather'?Number.isInteger(p.resource)&&p.resource>=0&&raw.resources?.[p.resource]&&raw.resources[p.resource].kind!=='camp':['construct','repair'].includes(p.type)&&Number.isSafeInteger(p.target)&&p.target>0&&p.target<=s.serial));
      if(!Array.isArray(u.waypoints)||u.waypoints.length>8||!u.waypoints.every(waypoint)||u.order?.type==='build'&&!waypoint(u.order)||u.waypoints.length&&(!types[u.kind].speed||u.hp<=0||u.consumed||!waypoint(u.order)))throw Error('Invalid saved waypoint queue');
      if(u.built<0||u.built>1)throw Error('Invalid saved construction progress');
      if(u.built<1&&!u.construction)u.construction={style:'legacy',started:true,paidGold:0,paidWood:0};
      if(u.construction){const c=u.construction,d=types[u.kind];if(u.built===1||d.speed||!['work','inside','growth','summon','legacy'].includes(c.style)||typeof c.started!=='boolean'||![c.paidGold,c.paidWood].every(v=>finite(v)&&v>=0)||c.paidGold>d.gold||c.paidWood>d.wood)throw Error('Invalid saved construction');}
      if(u.workResume&&!(u.workResume.type==='gather'&&Number.isInteger(u.workResume.resource)&&raw.resources?.[u.workResume.resource]))throw Error('Invalid saved work resume');
      if(u.kind==='hero'){u.itemCooldown??=0;if(!finite(u.itemCooldown)||u.itemCooldown<0||u.itemCooldown>10)throw Error('Invalid saved item cooldown');u.heroClass??=0;if(u.skills===undefined){u.skills=[1,0,0,0];u.skillPoints=u.level-1;}if(!validHero(u.heroClass)||!Number.isInteger(u.level)||u.level<1||u.level>10||!Array.isArray(u.skills)||u.skills.length!==4||u.skills.some((r,i)=>!Number.isInteger(r)||r<0||r>(i===3?1:3)||r>0&&u.level<skillLevel(i,r))||!Number.isInteger(u.skillPoints)||u.skillPoints<0||u.skills.reduce((n,r)=>n+r,0)+u.skillPoints!==u.level)throw Error('Invalid saved hero skills');}
      for(const key of ['stun','root','haste','avatar','shieldLeft','shield'])if(u[key]!==undefined&&(!finite(u[key])||u[key]<0))throw Error('Invalid saved combat effect');
      if(u.yaw!==undefined&&(!finite(u.yaw)||Math.abs(u.yaw)>Math.PI))throw Error('Invalid saved facing');
      if(u.castYaw!==undefined&&(!['hero','necromancer','shaman'].includes(u.kind)||!finite(u.castYaw)||Math.abs(u.castYaw)>Math.PI))throw Error('Invalid saved cast direction');
      if(u.awakeUntil!==undefined&&(u.team!==-1||!u.home||!Number.isSafeInteger(u.awakeUntil)||u.awakeUntil<0))throw Error('Invalid saved camp wake time');
      if(u.summoned&&(!Number.isSafeInteger(u.expires)||u.expires<0))throw Error('Invalid saved summon');
      if(u.rally!==undefined&&(!u.rally||![u.rally.x,u.rally.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||u.team<0||!trainable(s.mode==='moba'?{...s,mode:'skirmish'}:s,u).length))throw Error('Invalid saved rally');
      if(u.queue.length&&(u.team<0||u.queue.some(q=>!trainable(s,u).includes(q.kind)&&!(u.kind==='barracks'&&(s.teams[u.team].faction===3&&q.kind==='necromancer'||s.teams[u.team].faction===1&&q.kind==='shaman')))))throw Error('Invalid saved production');
    }
    for(const u of s.units){
      if(u.inside!==undefined||u.consumed){const b=s.units.find(v=>v.id===u.inside&&v.team===u.team&&v.hp>0&&v.built<1);if(u.kind!=='worker'||u.hp<=0||!b||!b.construction.started||!['inside','growth'].includes(b.construction.style)||!!u.consumed!==(b.construction.style==='growth')||u.order?.type!=='construct'||u.order.target!==b.id||s.units.filter(w=>w.inside===b.id).length!==1)throw Error('Invalid saved construction occupant');}
      if(['construct','repair'].includes(u.order?.type)){const b=s.units.find(v=>v.id===u.order.target&&v.team===u.team&&v.hp>0&&!types[v.kind].speed);if(u.kind!=='worker'||!b||u.order.type==='construct'&&b.built===1||u.order.type==='repair'&&b.built<1)throw Error('Invalid saved work target');}
      if((u.construction?.style==='inside'||u.construction?.style==='growth'&&!['farm','altar'].includes(u.kind))&&u.construction.started&&!s.units.some(w=>w.inside===u.id))throw Error('Missing saved construction occupant');
    }
    if(!Array.isArray(s.resources)||s.resources.length>100||s.resources.some(r=>!r||!['mine','tree','camp'].includes(r.kind)||![r.x,r.z,r.amount].every(finite)))throw Error('Invalid saved resources');
    for(const u of s.units){
      if(u.kind==='hauntedmine'&&(s.economyVersion!==1||s.mode!=='skirmish'||s.teams[u.team]?.faction!==3||!s.resources.some(r=>r.kind==='mine'&&distance(r,u)<.01)||s.units.some(v=>v.id!==u.id&&v.hp>0&&u.hp>0&&v.kind==='hauntedmine'&&distance(u,v)<.01)))throw Error('Invalid saved Haunted Mine');
      if(u.order?.type==='gather'){
        const r=s.resources[u.order.resource];if(!Number.isInteger(u.order.resource)||!r||!['worker','ghoul'].includes(u.kind)||r.kind==='camp')throw Error('Invalid saved gathering order');
        if(u.order.mineSlot!==undefined&&(!acolyte(s,u)||r.kind!=='mine'||!Number.isInteger(u.order.mineSlot)||u.order.mineSlot<0||u.order.mineSlot>4||u.hp>0&&mineWorkers(s,r).some(w=>w.id!==u.id&&w.order.mineSlot===u.order.mineSlot)))throw Error('Invalid saved mining station');
        if(!canGather(s,u,r)){u.order=null;u.path=[];u.waypoints=[];}
      }
    }
    s.zones??=[];if(!Array.isArray(s.zones)||s.zones.length>LIMIT*4||s.zones.some(z=>!z||![0,1].includes(z.team)||!validHero(z.heroClass)||![z.x,z.z,z.radius,z.damage,z.slow,z.left,z.pulse].every(finite)||z.radius<0||z.radius>14||z.damage<0||z.left<0||z.left>30||!Number.isInteger(z.slot)||z.slot<0||z.slot>3))throw Error('Invalid saved spell zones');
    const defaults=create(s.mode,{map:s.map});for(const key of ['loot','quest','triggered','announcement','announcements'])s[key]??=defaults[key];
    if(!Array.isArray(s.loot)||s.loot.length>LIMIT||new Set(s.loot.map(d=>d?.id)).size!==s.loot.length||s.loot.some(d=>!d||!Number.isSafeInteger(d.id)||d.id<1||d.id>s.serial||![d.x,d.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||!Number.isInteger(d.item)||!items[d.item]||d.manual!==undefined&&typeof d.manual!=='boolean'||d.relic!==undefined&&typeof d.relic!=='boolean')||!Array.isArray(s.triggered)||new Set(s.triggered).size!==s.triggered.length||s.triggered.some(i=>!Number.isInteger(i)||i<0||i>=s.map.triggers.length)||!Number.isInteger(s.quest.stage)||s.quest.stage<0||s.quest.stage>4)throw Error('Invalid saved objectives');
    if(!Array.isArray(s.announcements)||s.announcements.length!==2||s.announcements.some(text=>typeof text!=='string'||text.length>120))throw Error('Invalid saved player announcements');
    if(s.triggerState===undefined)s.triggerState=s.map.triggers.map((t,i)=>({count:s.triggered.includes(i)?1:0,last:s.triggered.includes(i)?s.frame:-1,next:0}));
    if(!Array.isArray(s.triggerState)||s.triggerState.length!==s.map.triggers.length||s.triggerState.some((c,i)=>!c||!Number.isInteger(c.count)||c.count<0||c.count>s.map.triggers[i].limit||!Number.isSafeInteger(c.last)||c.last < -1||c.last>s.frame||!Number.isSafeInteger(c.next)||c.next<0||c.next>s.frame+600/DT||!!c.count!==s.triggered.includes(i)||c.count===0&&c.last!==-1||c.count>0&&c.last<0))throw Error('Invalid saved trigger clock');
    for(const t of s.teams){t.portalGranted??=heroRoster(s,s.teams.indexOf(t)).length>0;if(typeof t.portalGranted!=='boolean')throw Error('Invalid saved Town Portal grant');t.cannibalize??=0;if(![0,1].includes(t.cannibalize)||t.cannibalize&&t.faction!==3||s.units.filter(u=>u.team===s.teams.indexOf(t)&&u.hp>0&&u.cannibalizeResearch).length>1)throw Error('Invalid saved Cannibalize research');for(const [key,r] of Object.entries(skeletonResearch)){t[r.field]??=0;if(![0,1].includes(t[r.field])||s.units.filter(u=>u.team===s.teams.indexOf(t)&&u.hp>0&&u.casterResearch?.upgrade===key).length>1)throw Error('Invalid saved skeleton research');}for(const [kind,school] of Object.entries(casterTraining)){t[school.field]??=0;if(!Number.isInteger(t[school.field])||t[school.field]<0||t[school.field]>2||s.units.filter(u=>u.team===s.teams.indexOf(t)&&u.kind===kind&&u.hp>0&&u.casterResearch?.rank).length>1)throw Error('Invalid saved caster training');}t.tier??=1;t.research??=0;t.heroClass??=0;if(!validHero(t.heroClass)||!Number.isInteger(t.tier)||t.tier<1||t.tier>3||!Number.isFinite(t.research)||t.research<0||t.research>40)throw Error('Invalid saved technology');}
    const reviving=new Set();for(const u of s.units)for(const q of u.queue){
      if(q.left<0||q.left>(q.revive?110:types[q.kind].time)||q.kind!=='hero'&&['heroClass','revive','paidGold','paidWood'].some(k=>q[k]!==undefined))throw Error('Invalid saved production time or metadata');
      if(q.kind!=='hero')continue;
      if(s.mode!=='skirmish'||u.kind!=='altar'||u.hp<=0||u.built!==1||!validHero(q.heroClass)||!Number.isInteger(q.paidGold)||!Number.isInteger(q.paidWood))throw Error('Invalid saved hero production');
      if(q.revive!==undefined){const h=s.units.find(v=>v.id===q.revive&&v.kind==='hero'&&v.team===u.team&&v.hp===0),d=h&&heroRevival(h);if(!Number.isSafeInteger(q.revive)||!h||h.heroClass!==q.heroClass||reviving.has(h.id)||q.paidGold!==d.gold||q.paidWood!==0||q.left>d.time)throw Error('Invalid saved hero revival');reviving.add(h.id);}
      else if(![[0,0],[425,100],[300,80]].some(([g,w])=>q.paidGold===g&&q.paidWood===w)||heroRoster(s,u.team).some(v=>v.heroClass===q.heroClass)||heroQueued(s,u.team).filter(v=>v.heroClass===q.heroClass).length!==1)throw Error('Invalid saved hero recruitment');
    }
    for(let team=0;team<2;team++){const queued=heroQueued(s,team);if(queued.length&&heroRoster(s,team).length+queued.length>Math.min(3,s.teams[team].tier))throw Error('Invalid saved hero limit');}
    s.events=[];s.pendingEvents=[];s.visible=[[],[]];if(!Array.isArray(s.explored)||s.explored.length!==2||s.explored.some(a=>!Array.isArray(a)||a.length!==1024))throw Error('Invalid saved fog');visibility(s);return s;
  }
  function publicState(s,team){const state=clone(s);for(const u of state.units){u.sleeping=asleep(s,u);u.feeding=feeding(u);u.portalLeft=portalLeft(u);delete u.frenzySource;delete u.lightningSource;}state.corpses=s.corpses.filter(c=>c.team===team||s.visible[team][index(c.x,c.z)]).map(({id,kind,heroClass,team,x,y,z,yaw,age,boss,large})=>({id,kind,heroClass,team,x,y,z,yaw,age,boss,large}));state.projectiles=s.projectiles.filter(p=>s.visible[team][index(p.x,p.z)]).map(({id,x,y,z,vx,vy,vz,team,art})=>({id,x,y,z,vx,vy,vz,team,art}));delete state.projectileSerial;delete state.pendingEvents;delete state.tdPending;state.zones=state.zones.filter(z=>s.visible[team][index(z.x,z.z)]);state.map.units=[];state.map.triggers=[];state.map.regions=[];state.triggered=[];delete state.triggerState;state.announcements[1-team]='';state.units=state.units.filter(u=>u.team===team||isVisible(s,team,u));for(const u of state.units)if(u.kind==='hall')u.upgradeTier=s.teams[u.team]?.tier||1;for(const u of state.units)if(u.team!==team){const r=miningTarget(s,u);if(r)u.miningTarget={x:r.x,z:r.z};u.queue=[];delete u.rally;delete u.construction;delete u.workResume;delete u.inside;delete u.consumed;delete u.casterResearch;delete u.cannibalizeResearch;u.order=null;delete u.waypoints;u.path=[];delete u.dest;}state.events=state.events.filter(e=>s.visible[team][index(e.x,e.z)]&&(e.fromX===undefined||s.visible[team][index(e.fromX,e.fromZ)]));state.teams[1-team]={faction:s.teams[1-team].faction};state.resources=state.resources.map(r=>({...r,amount:s.visible[team][index(r.x,r.z)]?r.amount:1}));state.loot=state.loot.filter(r=>s.visible[team][index(r.x,r.z)]);state.visible=[team===0?s.visible[0]:[],team===1?s.visible[1]:[]];state.explored=[team===0?s.explored[0]:[],team===1?s.explored[1]:[]];return state;}
  return {sculptRelief,reliefHeight,tierHeight,townPortal,portalLeft,heroRoster,heroQueued,heroRecruitment,heroRevival,cannibalize,feeding,acolyte,canGather,hauntedMine,mineWorkers,minePoint,miningTarget,skeletonResearch,casterSpells,casterTraining,attackRate,moveRate,raiseDead,maxMana,DT,LIMIT,PROJECTILE_LIMIT,CORPSE_LIMIT,CORPSE_LIFETIME,SIZE,projectileSpeed,projectileArt,types,heroes,validHero,unitType,factions,items,itemValue,armies,siege,flyers,orderPoint,timeOfDay,isNight,daylight,asleep,canAttack,canControl,canDeny,weaponDamage,trainable,repairCost,questNames,clamp,clone,cell,index,distance,elevation,tileHeight,terrainEdge,traversable,flatSite,unitHeight,attackClear,highlandMap,defaultMap,siegeMap,eventMap,validateMap,removeTrigger,removeRegion,create,restore,spawn,command,tick,population,isVisible,visibility,path,solid,publicState,lanePath,tdPath};
})();
if(typeof module!=='undefined')module.exports=Frost;
