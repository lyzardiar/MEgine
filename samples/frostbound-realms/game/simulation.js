/* Author: MiYu. Shared fixed-step rules for the native client and authoritative server. */
var Frost = (() => {
  const DT = 0.1, LIMIT = 160, SIZE = 32;
  const simulating = new WeakSet();
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
  items.push({name:'Covenant edge',gold:120,damage:28,hp:120,recipe:[0,1]},{name:'Stormstride',gold:100,damage:16,speed:.6,recipe:[0,2]},{name:'Sanctuary charm',gold:100,hp:240,speed:.3,recipe:[1,2]});
  types.frosttower={...types.tower,label:'Frost spire',damage:28,slow:2.5,gold:170,model:'tower'};
  types.flametower={...types.tower,label:'Ember bastion',damage:34,splash:3,gold:210,cooldown:1.8,model:'tower'};
  const armies = [
    {units:['soldier','archer','paladin','rifleman'],names:['Footman','Ranger','Paladin','Rifleman']},
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
  for(const army of armies)army.units.forEach((kind,i)=>types[kind].label=army.names[i]);
  types.workshop={...types.barracks,label:'Siege workshop',gold:220,wood:120,time:12,model:'workshop'};
  types.ballista={label:'Royal ballista',hp:340,damage:58,range:13,speed:2.6,cooldown:2.4,gold:200,wood:100,food:3,time:14,model:'ballista',attack:'siege',armor:'heavy'};
  types.catapult={...types.ballista,label:'Warclan catapult',damage:65,range:12,splash:2.5,model:'catapult'};
  types.trebuchet={...types.ballista,label:'Wildwood trebuchet',range:16,damage:80,cooldown:3.4,speed:2,model:'trebuchet'};
  types.ram={...types.ballista,label:'Revenant siege ram',hp:800,damage:75,range:2,speed:2.8,cooldown:2,model:'ram'};
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
  const heroes=[
    {...types.hero,label:'Frost Warden',art:'Cleric',color:[.25,.7,1,1],role:'Control / healing',spells:[
      {name:'Frost nova',kind:'blast',cost:35,cooldown:5,range:14,radius:5,power:100,growth:45,slow:3,description:'Damage and slow enemies in an area.'},
      {name:'Restoration',kind:'heal',cost:45,cooldown:9,range:14,radius:5,power:200,growth:100,description:'Restore nearby allied units.'},
      {name:'Blink',kind:'blink',cost:30,cooldown:7,range:14,description:'Teleport to clear, visible ground.'},
      {name:'Blizzard',kind:'zone',cost:90,cooldown:25,range:14,radius:6,power:70,duration:5,slow:1.5,description:'Five pulses of frost damage and slow.'}]},
    {...types.hero,label:'Ember Sage',art:'Wizard',color:[1,.3,.08,1],role:'Area damage / summons',hp:560,damage:30,range:7,attack:'magic',spells:[
      {name:'Fireball',kind:'blast',cost:40,cooldown:6,range:14,radius:3,power:130,growth:55,description:'Explode at the target area.'},
      {name:'Ember ward',kind:'shield',cost:45,cooldown:12,range:12,radius:4,power:150,growth:90,duration:6,description:'Absorb damage on nearby allies for six seconds.'},
      {name:'Flame field',kind:'zone',cost:60,cooldown:12,range:14,radius:4,power:35,growth:20,duration:4,description:'Four pulses of fire damage.'},
      {name:'Summon drake',kind:'summon',cost:110,cooldown:35,range:10,duration:25,description:'Summon a flying drake for 25 seconds; no supply cost.'}]},
    {...types.hero,label:'Sylvan Ranger',art:'Ranger',color:[.3,.85,.3,1],role:'Ranged damage / mobility',hp:600,damage:34,range:9,speed:5.3,attack:'pierce',spells:[
      {name:'Piercing volley',kind:'cone',cost:30,cooldown:5,range:14,radius:11,power:95,growth:40,description:'Piercing arrows in a cone toward the target.'},
      {name:'Entangling roots',kind:'blast',cost:40,cooldown:9,range:14,radius:2.5,power:35,growth:20,root:2.5,description:'Damage and immobilize enemies; they may still attack.'},
      {name:'Windstep',kind:'haste',cost:35,cooldown:12,range:0,duration:5,description:'Move 60% faster for five seconds.'},
      {name:'Arrow storm',kind:'zone',cost:100,cooldown:25,range:14,radius:7,power:85,duration:4,description:'Four waves of arrows over a wide area.'}]},
    {...types.hero,label:'Dawn Paladin',art:'Warrior',color:[1,.8,.25,1],role:'Melee tank / support',hp:900,damage:46,range:2,speed:3.8,antiAir:false,spells:[
      {name:'Judgment',kind:'blast',cost:40,cooldown:7,range:10,radius:2,power:95,growth:45,stun:1.5,description:'Strike and stun enemies in a small area.'},
      {name:'Holy light',kind:'heal',cost:45,cooldown:8,range:12,radius:5,power:230,growth:110,description:'Restore a large amount of allied health.'},
      {name:'Divine guard',kind:'shield',cost:50,cooldown:14,range:0,radius:0,power:250,growth:125,duration:7,description:'Absorb incoming damage for seven seconds.'},
      {name:'Avatar',kind:'avatar',cost:100,cooldown:35,range:0,duration:12,description:'Gain 60% attack damage and take 40% less damage for 12 seconds.'}]}
  ];
  const skillLevel=(slot,rank)=>slot===3?6:rank*2-1;
  const validHero=v=>Number.isInteger(v)&&v>=0&&v<heroes.length;
  const unitType=u=>u.kind==='hero'?heroes[u.heroClass??0]:types[u.kind];
  const canAttack=(a,b)=>!a.inside&&!b.inside&&unitType(a).damage>0&&(!types[b.kind].flying||unitType(a).antiAir);
  const damageTable={normal:{fortified:.5},pierce:{light:1.35,heavy:.75,fortified:.35},siege:{light:.65,medium:.65,heavy:.65,hero:.5,fortified:3},magic:{heavy:1.5,fortified:.5}};
  const weaponDamage=(a,b,value)=>value*(damageTable[unitType(a).attack]?.[unitType(b).armor]??1);
  const questNames=['Clear the three Frostfang scouts','Recover the relic from the ruined shrine','Defeat the Frostbound sovereign','Return to the sanctuary'];
  const trainable=(s,u)=>!s.teams[u.team]?[]:u.kind==='hall'?['worker']:u.kind==='altar'?['hero',flyers[s.teams[u.team].faction]]:u.kind==='barracks'?armies[s.teams[u.team].faction].units:u.kind==='workshop'?[siege[s.teams[u.team].faction]]:[];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const clone = v => JSON.parse(JSON.stringify(v));
  const cell = (x,z) => [clamp(Math.floor((x+32)/2),0,31),clamp(Math.floor((z+32)/2),0,31)];
  const index = (x,z) => {const p=cell(x,z);return p[1]*32+p[0];};
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const tileHeight=(map,i,x,z)=>{const h=(map.heights?.[i]||0)*2,r=map.ramps?.[i]||0;return h+(r===1?x:r===2?2-x:r===3?z:r===4?2-z:0);};
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
    const level=elevation(map,x,z),a=cell(x-radius,z-radius),b=cell(x+radius,z+radius);if(Math.abs(x)+radius>30||Math.abs(z)+radius>30)return false;
    for(let cz=a[1];cz<=b[1];cz++)for(let cx=a[0];cx<=b[0];cx++){const i=cz*32+cx;if(map.terrain[i]===1||map.ramps?.[i]||Math.abs((map.heights?.[i]||0)*2-level)>.01)return false;}return true;
  }
  const unitHeight=(s,u)=>elevation(s.map,u.x,u.z)+(types[u.kind]?.flying?4:0);
  function attackClear(s,u,v){
    if(unitType(u).range<=2&&!types[u.kind].flying&&!traversable(s.map,u.x,u.z,v.x,v.z))return false;
    const ay=unitHeight(s,u)+1.6,by=unitHeight(s,v)+1.6,dx=v.x-u.x,dz=v.z-u.z,cuts=[0,1];
    for(let i=1;i<32;i++)for(const [a,d] of [[u.x,dx],[u.z,dz]])if(d){const t=(i*2-32-a)/d;if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
    // Each tile is a plane. Both ends of every crossed interval also test vertical cliff faces.
    for(let k=1;k<cuts.length;k++){const mid=(cuts[k-1]+cuts[k])/2,[cx,cz]=cell(u.x+dx*mid,u.z+dz*mid),i=cz*32+cx;for(const t of [cuts[k-1],cuts[k]])if(tileHeight(s.map,i,u.x+dx*t-(cx*2-32),u.z+dz*t-(cz*2-32))>ay+(by-ay)*t+.001)return false;}return true;
  }
  function highlandMap(){
    const map=defaultMap();map.name='Winterfall Highland Pass';map.players[1].ai=false;map.heights=Array(1024).fill(0);map.ramps=Array(1024).fill(0);
    for(let z=7;z<=23;z++)for(let x=10;x<=21;x++){const i=z*32+x;map.heights[i]=1;map.terrain[i]=0;}
    for(let z=10;z<=16;z++)for(let x=15;x<=20;x++)map.heights[z*32+x]=2;
    for(let z=18;z<=21;z++){map.ramps[z*32+9]=1;map.terrain[z*32+9]=2;for(let x=10;x<=21;x++)map.terrain[z*32+x]=2;map.ramps[z*32+22]=2;map.terrain[z*32+22]=2;}
    for(let z=12;z<=14;z++){map.ramps[z*32+14]=1;map.terrain[z*32+14]=2;}
    map.units=[{kind:'tower',team:1,x:5,z:-5},{kind:'archer',team:1,x:7,z:-7},{kind:'ballista',team:0,x:-19,z:11}];
    map.regions=[{name:'Highland outpost',x:5,z:-5,width:8,height:8}];return validateMap(map);
  }
  function defaultMap(mode='skirmish') {
    const map={version:1,name:mode==='moba'?'Ancients of the Vale':mode==='td'?'Serpentine Watch':'Winterfall Basin',mode,terrain:Array(1024).fill(0),heights:Array(1024).fill(0),ramps:Array(1024).fill(0),props:[],spawns:[[-23,23],[23,-23]],startingGold:mode==='td'?650:500,waveInterval:mode==='td'?18:24,waves:12};
    for(let z=0;z<32;z++)for(let x=0;x<32;x++)if((x<2||x>29||z<2||z>29)&&((x+z)%5!==0))map.terrain[z*32+x]=1;
    if(mode!=='td')for(let z=9;z<23;z++)if(z<14||z>18)map.terrain[z*32+15]=map.terrain[z*32+16]=1;
    if(mode==='skirmish')for(let z=3;z<29;z++)for(let x=3;x<29;x++)if(Math.abs(x+z-31)<1.5&&map.terrain[z*32+x]===0)map.terrain[z*32+x]=2;
    if(mode==='moba')for(let z=3;z<29;z++)for(let x=3;x<29;x++)if(map.terrain[z*32+x]===0&&[0,1,2].some(lane=>{const route=lanePath(0,lane);return route.slice(1).some((p,i)=>segmentDistance(x*2-31,z*2-31,route[i],p)<1.8);}))map.terrain[z*32+x]=2;
    for(const team of [0,1]){const [x,z]=map.spawns[team];map.props.push({kind:'mine',x:x+(team?-6:6),z,amount:9000});for(let i=0;i<8;i++)map.props.push({kind:'tree',x:x+(team?-1:1)*(2+i%4*2),z:z+(team?1:-1)*(6+Math.floor(i/4)*2),amount:600});}
    for(let i=0;i<24;i++){const x=((i*17)%50)-25,z=((i*29)%48)-24;if(Math.hypot(x,z)>12&&map.spawns.every(p=>Math.hypot(p[0]-x,p[1]-z)>12))map.props.push({kind:'tree',x,z,amount:600});}
    map.players=[{faction:0,ai:false},{faction:1,ai:true}];map.units=[];map.triggers=[];map.regions=[];
    if(mode==='rpg'){
      map.name='The Shattered Covenant';map.startingGold=180;map.props=map.props.filter(p=>p.kind==='tree');
      map.units=[{kind:'neutral',team:1,x:-12,z:14,tag:'scout'},{kind:'neutral',team:1,x:-7,z:10,tag:'scout'},{kind:'neutral',team:1,x:-13,z:5,tag:'scout'},{kind:'neutral',team:1,x:5,z:0,tag:'keeper'},{kind:'neutral',team:1,x:20,z:-18,tag:'boss'}];
      for(let z=0;z<32;z++)for(let x=0;x<32;x++)if(Math.abs(x+z-31)<2&&map.terrain[z*32+x]!==1)map.terrain[z*32+x]=2;
    }
    return map;
  }
  function validateMap(raw) {
    if(!raw||raw.version!==1||!['skirmish','moba','td','rpg'].includes(raw.mode)||!Array.isArray(raw.terrain)||raw.terrain.length!==1024||raw.terrain.some(v=>!Number.isInteger(v)||v<0||v>2))throw Error('Invalid map terrain or mode');
    for(const [key,max] of [['heights',3],['ramps',4]])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].length!==1024||raw[key].some(v=>!Number.isInteger(v)||v<0||v>max)))throw Error('Invalid terrain '+key);
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=27);
    if(!Array.isArray(raw.spawns)||raw.spawns.length!==2||!raw.spawns.every(point)||Math.hypot(raw.spawns[0][0]-raw.spawns[1][0],raw.spawns[0][1]-raw.spawns[1][1])<20)throw Error('Two separated spawn points are required');
    if(!Array.isArray(raw.props)||raw.props.length>100||raw.props.some(p=>!p||!['tree','mine','camp'].includes(p.kind)||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>29||Math.abs(p.z)>29))throw Error('Invalid map objects');
    const map={version:1,name:Array.from(String(raw.name||'Custom battlefield')).slice(0,40).join(''),mode:raw.mode,terrain:[...raw.terrain],heights:raw.heights?[...raw.heights]:Array(1024).fill(0),ramps:raw.ramps?[...raw.ramps]:Array(1024).fill(0),spawns:raw.spawns.map(p=>[...p]),props:raw.props.map(p=>({kind:p.kind,x:p.x,z:p.z,amount:clamp(Number.isFinite(p.amount)?p.amount:1000,100,10000)})),startingGold:clamp(Number.isFinite(raw.startingGold)?Math.round(raw.startingGold):500,100,2000),waveInterval:clamp(Number.isFinite(raw.waveInterval)?raw.waveInterval:24,10,60),waves:clamp(Number.isFinite(raw.waves)?Math.round(raw.waves):12,3,30)};
    const at=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=27&&Math.abs(p.z)<=27;
    if(raw.players!==undefined&&(!Array.isArray(raw.players)||raw.players.length!==2||raw.players.some(p=>!p||!Number.isInteger(p.faction)||p.faction<0||p.faction>3||typeof p.ai!=='boolean'||p.heroClass!==undefined&&!validHero(p.heroClass))))throw Error('Invalid player settings');
    map.players=clone(raw.players||[{faction:0,ai:false},{faction:1,ai:true}]);for(const p of map.players)p.heroClass??=0;
    if(raw.units!==undefined&&(!Array.isArray(raw.units)||raw.units.length>64||raw.units.some(u=>!at(u)||!Object.hasOwn(types,u.kind)||![-1,0,1].includes(u.team)||u.heroClass!==undefined&&(u.kind!=='hero'||!validHero(u.heroClass))||u.tag!==undefined&&!['scout','keeper','boss'].includes(u.tag))))throw Error('Invalid placed units');
    map.units=(raw.units||[]).map(u=>({kind:u.kind,team:u.team,x:u.x,z:u.z,...(u.heroClass!==undefined?{heroClass:u.heroClass}:{}),...(u.tag?{tag:u.tag}:{})}));
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
    const heroClass=kind==='hero'?(extra.heroClass??s.teams[team]?.heroClass??0):0,d=kind==='hero'?heroes[heroClass]:types[kind],f=s.teams[team]?.faction||0,hp=d.hp*(f===1?1.12:1),speed=d.speed*(f===2?1.12:1);
    const u={id:++s.serial,kind,team,x,z,hp,maxHp:hp,damage:d.damage*(f===3?1.1:1),speed,cd:0,order:null,waypoints:[],path:[],pathAt:-100,built:1,queue:[],level:1,xp:0,mana:150,spell:[0,0,0,0],inventory:[],cargo:0,respawn:0,...(kind==='hero'?{heroClass,skills:[0,0,0,0],skillPoints:1}:{}),...extra};s.units.push(u);return u;
  }
  function create(mode='skirmish',options={}) {
    const map=validateMap(options.map||defaultMap(mode));mode=map.mode;if(options.heroes&&(!Array.isArray(options.heroes)||options.heroes.length!==2||!options.heroes.every(validHero)))throw Error('Invalid hero selection');
    const s={version:1,map,mode,frame:0,serial:0,units:[],resources:clone(map.props),teams:[0,1].map(i=>({gold:map.startingGold,wood:250,faction:clamp(options.factions?.[i]??map.players[i].faction,0,3),ai:options.ai?.[i]??map.players[i].ai,upgrade:0,kills:0,tier:1,research:0,heroClass:options.heroes?.[i]??map.players[i].heroClass})),events:[],zones:[],winner:null,wave:0,nextWave:40,lives:20,loot:[],quest:{stage:0,scouts:0,relic:false,boss:false},triggered:[],triggerState:map.triggers.map(()=>({count:0,last:-1,next:0})),announcement:'',announcements:['',''],explored:[Array(1024).fill(0),Array(1024).fill(0)],visible:[[],[]]};
    for(const team of [0,1]){
      if((mode==='td'||mode==='rpg')&&team===1)continue;
      const [x,z]=map.spawns[team];spawn(s,'hall',team,x,z);
      if(mode==='skirmish'){
        spawn(s,'barracks',team,x+(team?-6:6),z+(team?-5:5));spawn(s,'farm',team,x+(team?5:-5),z);
        for(let i=0;i<4;i++){const u=spawn(s,'worker',team,x+(i-1.5)*1.5,z+(team?4:-4));u.order={type:'gather',resource:s.resources.findIndex(p=>p.kind===(i<2?'mine':'tree')&&Math.hypot(p.x-x,p.z-z)<12)};}
        spawn(s,'hero',team,x+(team?-4:4),z+(team?2:-2));spawn(s,armies[s.teams[team].faction].units[0],team,x,z+(team?6:-6));
      }else if(mode==='moba'){
        spawn(s,'hero',team,x,z+(team?4:-4));
        for(let lane=0;lane<3;lane++){const route=lanePath(team,lane);for(const j of [1,2]){const p=route[j];spawn(s,'tower',team,p[0],p[1],{lane});}}
      }else if(mode==='rpg'){spawn(s,'hero',0,x+3,z-3,{maxHp:heroes[s.teams[0].heroClass].hp+250,hp:heroes[s.teams[0].heroClass].hp+250,damage:heroes[s.teams[0].heroClass].damage+17});}
      else{spawn(s,'worker',0,-16,-17);spawn(s,'hero',0,-22,-18);spawn(s,'tower',0,-12,-20);s.nextWave=120;}
    }
    if(mode==='skirmish'||mode==='moba')for(const p of [{x:-8,z:-6},{x:8,z:6},...map.props.filter(p=>p.kind==='camp')])spawn(s,'neutral',-1,p.x,p.z,{home:[p.x,p.z]});
    for(const p of map.units){const extra={...(p.heroClass!==undefined?{heroClass:p.heroClass}:{}),...(p.team===-1||p.tag?{home:[p.x,p.z]}:{}),tag:p.tag};if(mode==='rpg'){const hp=p.tag==='boss'?1900:p.tag==='keeper'?700:260;Object.assign(extra,{hp,maxHp:hp,damage:p.tag==='boss'?60:18,speed:2});}spawn(s,p.kind,p.team,p.x,p.z,extra);}
    visibility(s);return s;
  }
  function lanePath(team,lane){const paths=[[[-23,23],[-24,7],[-24,-18],[-7,-24],[23,-23]],[[-23,23],[-13,13],[-5,5],[5,-5],[13,-13],[23,-23]],[[-23,23],[-7,24],[18,24],[24,7],[23,-23]]];return team?[...paths[lane]].reverse():paths[lane];}
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
  function formation(s,units,x,z,append=false){
    const orders=new Map();
    for(const flying of [false,true]){
      const members=units.filter(u=>!!types[u.kind].flying===flying).map(u=>{const p=append&&(u.waypoints?.at(-1)||u.order);return p?{...u,x:p.x,z:p.z}:u;});if(!members.length)continue;
      const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cz=members.reduce((n,u)=>n+u.z,0)/members.length,d=Math.hypot(x-cx,z-cz),fx=d>.01?(x-cx)/d:0,fz=d>.01?(z-cz)/d:-1,columns=Math.ceil(Math.sqrt(members.length)),rows=Math.ceil(members.length/columns),spacing=Math.max(...members.map(movementRadius))*2+.6;
      members.sort((a,b)=>unitType(a).range-unitType(b).range||((b.x-cx)*fx+(b.z-cz)*fz)-((a.x-cx)*fx+(a.z-cz)*fz)||a.id-b.id);
      const reserved=s.units.filter(u=>u.hp>0&&!u.inside&&u.speed&&u.team===members[0].team&&!u.order&&!units.some(v=>v.id===u.id)&&!!types[u.kind].flying===flying).map(u=>({x:u.x,z:u.z,r:movementRadius(u)}));
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
  function move(s,u,x,z,stop=.5){
    if(u.root>0||u.stun>0)return false;
    if(!u.speed||Math.hypot(u.x-x,u.z-z)<=stop&&(types[u.kind].flying||traversable(s.map,u.x,u.z,x,z)))return true;
    if(types[u.kind].flying){const d=Math.hypot(x-u.x,z-u.z),step=Math.min(d,u.speed*(u.slow>0?.55:1)*(u.haste>0?1.6:1)*DT);u.x=clamp(u.x+(x-u.x)/d*step,-30,30);u.z=clamp(u.z+(z-u.z)/d*step,-30,30);return false;}
    if(s.frame-u.pathAt>15||!u.path.length||Math.hypot((u.dest?.[0]||0)-x,(u.dest?.[1]||0)-z)>3){u.path=path(s,u,x,z);u.pathAt=s.frame;u.dest=[x,z];}
    const p=u.path[0]||[x,z],d=Math.hypot(p[0]-u.x,p[1]-u.z),step=Math.min(d,u.speed*(u.slow>0?.55:1)*(u.haste>0?1.6:1)*DT);if(d>.001){const nx=u.x+(p[0]-u.x)/d*step,nz=u.z+(p[1]-u.z)/d*step;if(!solid(s,nx,nz,u.id)&&traversable(s.map,u.x,u.z,nx,nz)){u.x=nx;u.z=nz;}else u.path=[];}if(d<.5)u.path.shift();return false;
  }
  function population(s,team){const us=s.units.filter(u=>u.team===team&&u.hp>0&&!u.consumed);return {used:us.reduce((n,u)=>n+(u.summoned?0:types[u.kind].food)+u.queue.reduce((a,q)=>a+types[q.kind].food,0),0),cap:Math.min(80,us.reduce((n,u)=>n+(u.built===1?(u.kind==='hall'?14:u.kind==='farm'?8:0):0),0))};}
  function pay(s,team,gold,wood=0){const t=s.teams[team];if(!t||t.gold<gold||t.wood<wood)return false;t.gold-=gold;t.wood-=wood;return true;}
  function command(s,team,c){
    if(s.winner!==null||!c||![0,1].includes(team))return 'Match is finished';
    if(c.append!==undefined&&typeof c.append!=='boolean'||c.append&&!['move','attackMove'].includes(c.type))return 'Only movement orders can be queued';
    const own=s.units.filter(u=>u.team===team&&u.hp>0&&!u.inside&&Array.isArray(c.ids)&&c.ids.slice(0,40).includes(u.id)),u=own[0],point=Number.isFinite(c.x)&&Number.isFinite(c.z)&&Math.abs(c.x)<=30&&Math.abs(c.z)<=30;
    if(['move','attackMove','patrol','hold','attack','gather','stop'].includes(c.type)){
      if(['move','attackMove','patrol'].includes(c.type)&&!point)return 'Invalid destination';
      const target=s.units.find(v=>v.id===c.target&&v.hp>0);if(c.type==='attack'&&(!target||target.team===team||!isVisible(s,team,target)))return 'Target is not visible';
      if(c.type==='attack'&&!own.some(v=>canAttack(v,target)))return 'Selected units cannot attack this target';
      if(c.type==='gather'&&(!Number.isInteger(c.resource)||!s.resources[c.resource]||s.resources[c.resource].kind==='camp'))return 'Select a resource';
      const moving=['move','attackMove','patrol'].includes(c.type),members=moving||c.type==='hold'?own.filter(v=>v.speed&&v.built===1):own;
      if(c.append&&members.some(v=>v.order&&!['move','attackMove'].includes(v.order.type)))return 'Issue a move before adding waypoints';
      if(c.append&&members.some(v=>(v.waypoints?.length||0)>=8))return 'Waypoint queue is full (8 waiting)';
      const slots=moving?formation(s,members,c.x,c.z,c.append):null;
      if(moving&&!slots)return 'No reachable space for this formation';
      members.forEach(v=>{
        if(c.type==='attack'&&!canAttack(v,target))return;
        const next=c.type==='stop'?null:{type:c.type,x:slots?.get(v.id)?.[0]??0,z:slots?.get(v.id)?.[1]??0,...(c.type==='attack'?{target:c.target}:c.type==='gather'?{resource:c.resource}:c.type==='patrol'?{fromX:clamp(v.x,-30,30),fromZ:clamp(v.z,-30,30)}:{})};
        if(c.append&&v.order){(v.waypoints??=[]).push(next);return;}
        delete v.workResume;v.path=[];v.pathAt=-100;v.waypoints=[];v.order=next;
      });return null;
    }
    if(c.type==='build'){
      if(s.mode==='moba'||!u||u.kind!=='worker'||!['hall','farm','barracks','tower','frosttower','flametower','altar','workshop'].includes(c.kind)||!point)return 'Select a worker and a building site';
      if(c.kind==='workshop'&&(s.mode!=='skirmish'||s.teams[team].tier<2))return 'Siege workshop requires stronghold tier 2';
      if(s.mode==='skirmish'&&s.teams[team].faction===3&&c.kind!=='hall'&&!s.units.some(v=>v.team===team&&v.hp>0&&v.built===1&&['hall','altar'].includes(v.kind)&&distance(v,c)<=(v.kind==='hall'?18:12)))return 'Summon inside stronghold or altar territory';
      const d=types[c.kind];if(!flatSite(s.map,c.x,c.z,d.radius))return 'Building footprint requires flat dry ground';if(distance(u,c)>15||solid(s,c.x,c.z)||s.units.some(v=>v.hp>0&&!types[v.kind].speed&&distance(v,c)<(types[v.kind].radius||1)+d.radius+.8))return 'Site blocked or too far from worker';
      if(s.mode==='td'&&(d.model!=='tower'||s.units.filter(v=>v.team===team&&types[v.kind].model==='tower'&&v.hp>0).length>=40))return 'Defense supports up to 40 towers';
      if(s.mode==='td'&&tdPath.slice(1).some((p,i)=>segmentDistance(c.x,c.z,tdPath[i],p)<2.5))return 'Keep the creep road clear';
      if(s.units.length>=LIMIT||!pay(s,team,d.gold,s.mode==='td'?0:d.wood))return 'Not enough resources or unit capacity';
      const b=spawn(s,c.kind,team,c.x,c.z,{built:.01});b.hp=b.maxHp*.1;b.construction={style:s.mode==='skirmish'?['work','inside','growth','summon'][s.teams[team].faction]:'legacy',started:s.mode!=='skirmish',paidGold:d.gold,paidWood:s.mode==='td'?0:d.wood};if(s.mode==='skirmish')assignWork(u,b,'construct');else{u.order=null;u.waypoints=[];u.path=[];}return null;
    }
    if(c.type==='construct'||c.type==='repair'){
      const b=s.units.find(v=>v.id===c.target&&v.team===team&&v.hp>0&&!types[v.kind].speed),workers=own.filter(v=>v.kind==='worker');
      if(!b||!workers.length||c.type==='construct'&&(b.built===1||b.construction?.started&&b.construction.style!=='work')||c.type==='repair'&&(b.built<1||b.hp>=b.maxHp))return 'Select workers and a friendly construction site or damaged completed building';
      for(const w of workers)assignWork(w,b,c.type);return null;
    }
    if(c.type==='cancelBuild'){
      if(!u||u.built===1||!u.construction)return 'Select an unfinished building';const c=u.construction;s.teams[team].gold+=Math.floor(c.paidGold*.75);s.teams[team].wood+=Math.floor(c.paidWood*.75);u.hp=0;finishWork(s,u,true);hallDefeat(s,u);return null;
    }
    if(c.type==='train'){
      if(s.mode!=='skirmish'||!u||u.built<1||!trainable(s,u).includes(c.kind)||u.queue.length>=3)return 'Select the appropriate completed production building';
      if((u.kind==='workshop'||u.kind==='barracks'&&trainable(s,u).indexOf(c.kind)>=2)&&s.teams[team].tier<2)return 'Upgrade your stronghold to tier 2';
      if(types[c.kind].flying&&s.teams[team].tier<3)return 'Flying creatures require stronghold tier 3';
      const d=types[c.kind],p=population(s,team);if(p.used+d.food>p.cap)return 'Build more supply lodges';if(s.units.length>=LIMIT)return 'Unit capacity reached';
      if(c.kind==='hero'&&s.units.some(v=>v.team===team&&(v.kind==='hero'||v.queue.some(q=>q.kind==='hero'))))return 'One hero per faction';
      if(!pay(s,team,d.gold,d.wood))return 'Not enough resources';u.queue.push({kind:c.kind,left:d.time});return null;
    }
    if(c.type==='rally'){if(!u||!trainable(s,u).length||!point)return 'Select a production building and rally destination';u.rally={x:c.x,z:c.z};return null;}
    if(c.type==='cancelTrain'){if(!u||!Number.isInteger(c.index)||c.index<0||c.index>=u.queue.length)return 'Select a queued unit';const q=u.queue.splice(c.index,1)[0],d=types[q.kind];s.teams[team].gold+=d.gold;s.teams[team].wood+=d.wood;return null;}
    if(c.type==='tech'){const t=s.teams[team];if(!u||u.kind!=='hall'||u.built<1||t.tier>=3||t.research>0)return 'Select a stronghold ready to advance';if(!pay(s,team,250*t.tier,120*t.tier))return 'Not enough resources';t.research=20*t.tier;return null;}
    if(c.type==='towerUpgrade'){if(!u||types[u.kind].model!=='tower'||u.built<1||u.level>=3)return 'Select a completed tower below level 3';if(!pay(s,team,100*u.level))return 'Not enough gold';u.level++;u.damage+=types[u.kind].damage*.65;u.maxHp+=200;u.hp=Math.min(u.maxHp,u.hp+200);return null;}
    if(c.type==='sell'){if(s.mode!=='td'||!u||types[u.kind].model!=='tower')return 'Select a defense tower';s.teams[team].gold+=Math.floor((types[u.kind].gold+100*(u.level-1)*u.level/2)*.65);u.hp=0;return null;}
    if(c.type==='upgrade'){if(!u||u.kind!=='barracks'||u.built<1)return 'Select a completed barracks';if(s.teams[team].upgrade>=s.teams[team].tier)return 'Advance your stronghold for more research';if(!pay(s,team,180+s.teams[team].upgrade*100,100))return 'Not enough resources';s.teams[team].upgrade++;return null;}
    if(c.type==='buy'){
      const item=Number.isInteger(c.item)?items[c.item]:null;if(!u||u.kind!=='hero'||!item||u.inventory.length>=6&&!item.recipe)return 'Select a hero with an empty inventory slot';if(!s.units.some(v=>v.team===team&&v.kind==='hall'&&v.hp>0&&v.built===1&&distance(v,u)<10))return 'Visit your stronghold shop';
      if(item.recipe&&!item.recipe.every(i=>u.inventory.includes(i)))return 'Requires '+item.recipe.map(i=>items[i].name).join(' + ');
      if(item.recipe&&s.teams[team].gold>=item.gold)for(const i of item.recipe){u.inventory.splice(u.inventory.indexOf(i),1);const part=items[i];u.damage-=part.damage||0;u.maxHp-=part.hp||0;u.speed-=part.speed||0;u.hp=Math.min(u.hp,u.maxHp);}
      if(!pay(s,team,item.gold))return 'Not enough gold';equip(u,c.item);return null;
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
          if(!isVisible(s,team,v))continue;if(spell.kind==='cone'){const dx=c.x-u.x,dz=c.z-u.z,dist=distance(u,v);if(dist>spell.radius||dist>.01&&(dx*(v.x-u.x)+dz*(v.z-u.z))/(Math.max(.01,Math.hypot(dx,dz))*dist)<.65)continue;}
          damage(s,u,v,power);if(v.hp>0){if(spell.slow)v.slow=spell.slow;if(spell.root)v.root=spell.root+(rank-1)*.5;if(spell.stun)v.stun=spell.stun+(rank-1)*.25;}
        }
      }
      if(spell.kind!=='zone')s.events.push({type:'spell',x:target.x,z:target.z,slot:c.slot,heroClass:u.heroClass,team});if(!simulating.has(s))(s.pendingEvents??=[]).push(...s.events.slice(eventStart));return null;
    }
    return 'Unknown command';
  }
  function hallDefeat(s,b){if(b.kind==='hall'&&s.mode!=='td'&&(s.mode!=='skirmish'||!s.units.some(v=>v.team===b.team&&v.kind==='hall'&&v.hp>0)))s.winner=1-b.team;}
  function assignWork(w,b,type){if(!w.workResume&&w.order?.type==='gather')w.workResume=clone(w.order);w.order={type,target:b.id};w.waypoints=[];w.path=[];w.pathAt=-100;}
  function releaseWorker(w){delete w.inside;delete w.consumed;w.order=w.workResume||null;delete w.workResume;w.path=[];w.pathAt=-100;}
  function finishWork(s,b,cancel=false){for(const w of s.units)if(w.inside===b.id||['construct','repair'].includes(w.order?.type)&&w.order.target===b.id){if(w.consumed&&!cancel)w.hp=0;releaseWorker(w);}delete b.construction;}
  function work(s,w){
    const b=s.units.find(v=>v.id===w.order.target&&v.team===w.team&&v.hp>0&&!types[v.kind].speed);if(!b||w.order.type==='construct'&&b.built===1||w.order.type==='repair'&&(b.built<1||b.hp>=b.maxHp)){releaseWorker(w);return;}
    if(!move(s,w,b.x,b.z,types[b.kind].radius+1.1))return;
    if(w.order.type==='repair'){const d=types[b.kind],hp=Math.min(b.maxHp-b.hp,b.maxHp*DT/(d.time*1.5));if(pay(s,w.team,d.gold*hp/b.maxHp*.5,d.wood*hp/b.maxHp*.5))b.hp+=hp;return;}
    const c=b.construction;if(!c){releaseWorker(w);return;}if(c.started&&c.style!=='work'){releaseWorker(w);return;}
    c.started=true;if(c.style==='inside'||c.style==='growth'&&!['farm','altar'].includes(b.kind)){w.inside=b.id;w.consumed=c.style==='growth';}else if(c.style!=='work')releaseWorker(w);
  }
  function construct(s,b){
    const c=b.construction;if(!c?.started)return;let rate=1;
    if(c.style==='work'){const workers=s.units.filter(w=>w.hp>0&&w.order?.type==='construct'&&w.order.target===b.id&&!w.stun&&!w.root&&distance(w,b)<=types[b.kind].radius+1.1&&traversable(s.map,w.x,w.z,b.x,b.z));if(!workers.length)return;const extra=.6*(workers.length-1),d=types[b.kind];if(extra&&pay(s,b.team,d.gold*DT/d.time*extra,d.wood*DT/d.time*extra))rate+=extra;}
    const progress=Math.min(1-b.built,DT/types[b.kind].time*rate);b.built=Math.min(1,b.built+progress);b.hp=Math.min(b.maxHp,b.hp+b.maxHp*progress*.9/.99);if(s.frame%10===0)s.events.push({type:'construction',x:b.x,z:b.z,team:b.team});if(b.built===1)finishWork(s,b);
  }
  function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
  function equip(u,i){const item=items[i];u.inventory.push(i);u.damage+=item.damage||0;u.maxHp+=item.hp||0;u.hp=Math.min(u.maxHp,u.hp+(item.hp||0));u.speed+=item.speed||0;}
  function experience(h,xp){h.xp+=xp;while(h.xp>=h.level*90&&h.level<10){h.xp-=h.level*90;h.level++;h.skillPoints++;h.maxHp+=90;h.hp=Math.min(h.maxHp,h.hp+150);h.damage+=6;}}
  function attackInRange(s,u,v){return Math.hypot(distance(u,v),unitHeight(s,u)-unitHeight(s,v))<=unitType(u).range+(types[v.kind].radius||.3)&&attackClear(s,u,v);}
  function damage(s,a,b,value){
    if(b.hp<=0||b.inside)return;if(b.avatar>0)value*=.6;const absorbed=Math.min(b.shield||0,value);b.shield=Math.max(0,(b.shield||0)-absorbed);value-=absorbed;if(value<=0)return;s.events.push({type:'damage',x:b.x,z:b.z,y:unitHeight(s,b),amount:Math.ceil(Math.min(b.hp,value)),team:b.team});b.hp-=value;
    if(types[a.kind].lifesteal)a.hp=Math.min(a.maxHp,a.hp+value*types[a.kind].lifesteal);
    if(types[a.kind].slow)b.slow=types[a.kind].slow;
    if(b.hp<=0){b.hp=0;b.waypoints=[];if(!types[b.kind].speed)finishWork(s,b);s.events.push({type:'death',x:b.x,z:b.z,team:b.team});if(a.team>=0){s.teams[a.team].gold+=b.kind==='hero'?140:!types[b.kind].speed?80:25;s.teams[a.team].kills++;for(const h of s.units.filter(u=>u.team===a.team&&u.kind==='hero'&&u.hp>0&&distance(u,b)<18))experience(h,b.kind==='hero'?100:35);}
      if(s.mode==='rpg'&&a.team===0){if(b.tag==='scout')s.quest.scouts++;if(b.tag==='boss')s.quest.boss=true;if(b.tag)s.loot.push({id:b.id,x:b.x,z:b.z,relic:b.tag==='keeper',item:b.tag==='boss'?0:b.id%3});}
      if(b.kind==='hero'&&(s.mode==='moba'||s.mode==='rpg')){b.respawn=12+b.level*2;if(s.mode==='rpg')s.teams[b.team].gold=Math.max(0,s.teams[b.team].gold-50);}
      hallDefeat(s,b);
    }
  }
  function isVisible(s,team,u){return !u.inside&&(u.team===team||!!s.visible[team]?.[index(u.x,u.z)]);}
  function visibility(s){
    for(let t=0;t<2;t++){const vis=Array(1024).fill(0);for(const u of s.units)if(u.team===t&&u.hp>0&&!u.inside){const [cx,cz]=cell(u.x,u.z),r=u.kind==='tower'?7:6;for(let z=Math.max(0,cz-r);z<=Math.min(31,cz+r);z++)for(let x=Math.max(0,cx-r);x<=Math.min(31,cx+r);x++)if((x-cx)**2+(z-cz)**2<=r*r)vis[z*32+x]=1;}s.visible[t]=vis;for(let i=0;i<1024;i++)if(vis[i])s.explored[t][i]=1;}
  }
  function gather(s,u){let r=s.resources[u.order.resource];if(!r){u.order=null;return;}if(r.amount<=0&&!u.cargo){const next=s.resources.filter(v=>v.kind===r.kind&&v.amount>0).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(!next){u.order=null;return;}u.order.resource=s.resources.indexOf(next);r=next;}const hall=s.units.filter(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(!hall)return;const returning=u.cargo>=20||u.cargo>0&&(r.amount<=0||u.cargoKind&&u.cargoKind!==r.kind),target=returning?hall:r;
    const reach=returning?4:3;if(distance(u,target)>reach||!traversable(s.map,u.x,u.z,target.x,target.z)){move(s,u,target.x,target.z,reach-.1);return;}if(returning){s.teams[u.team][(u.cargoKind||r.kind)==='mine'?'gold':'wood']+=u.cargo;u.cargo=0;delete u.cargoKind;}else if(u.cd<=0){const take=Math.min(5,r.amount);u.cargo+=take;u.cargoKind=r.kind;r.amount-=take;u.cd=.65;}
  }
  function ai(s,t){
    const team=s.teams[t],us=s.units.filter(u=>u.team===t&&u.hp>0),base=s.map.spawns[t],foe=s.map.spawns[1-t],worker=us.find(u=>u.kind==='worker'&&!u.inside&&!['construct','repair'].includes(u.order?.type));
    if(s.mode==='skirmish'){
      const pending=us.find(u=>u.built<1&&u.construction&&(!u.construction.started||u.construction.style==='work')&&!us.some(w=>w.order?.type==='construct'&&w.order.target===u.id));if(worker&&pending){command(s,t,{type:'construct',ids:[worker.id],target:pending.id});return;}
      const pop=population(s,t);if(pop.used+3>pop.cap&&worker&&!us.some(u=>u.kind==='farm'&&u.built<1)){const i=Math.floor(s.frame/40)%12,a=i*Math.PI/6;command(s,t,{type:'build',ids:[worker.id],kind:'farm',x:clamp(base[0]+Math.cos(a)*10,-27,27),z:clamp(base[1]+Math.sin(a)*10,-27,27)});}
      const hall=us.find(u=>u.kind==='hall'&&u.built===1);if(hall&&us.filter(u=>u.kind==='worker'&&!u.consumed).length<4&&!hall.queue.length)command(s,t,{type:'train',ids:[hall.id],kind:'worker'});if(hall&&s.frame>350&&team.gold>600)command(s,t,{type:'tech',ids:[hall.id]});
      if(worker&&!['construct','repair'].includes(worker.order?.type)&&team.tier>=3&&!us.some(u=>u.kind==='altar')){const a=(s.frame/40%12)*Math.PI/6;command(s,t,{type:'build',ids:[worker.id],kind:'altar',x:clamp(base[0]+Math.cos(a)*11,-27,27),z:clamp(base[1]+Math.sin(a)*11,-27,27)});}
      for(const b of us.filter(u=>u.kind==='altar'))command(s,t,{type:'train',ids:[b.id],kind:flyers[team.faction]});
      if(worker&&!['construct','repair'].includes(worker.order?.type)&&team.tier>=2&&!us.some(u=>u.kind==='workshop')){const a=(s.frame/40%12)*Math.PI/6;command(s,t,{type:'build',ids:[worker.id],kind:'workshop',x:clamp(base[0]+Math.cos(a)*11,-27,27),z:clamp(base[1]+Math.sin(a)*11,-27,27)});}
      for(const b of us.filter(u=>u.kind==='workshop')){command(s,t,{type:'rally',ids:[b.id],x:foe[0],z:foe[1]});command(s,t,{type:'train',ids:[b.id],kind:trainable(s,b)[0]});}
      for(const b of us.filter(u=>u.kind==='barracks')){const roster=trainable(s,b);command(s,t,{type:'train',ids:[b.id],kind:roster[Math.floor(s.frame/40)%(team.tier>=2?4:2)]});if(team.gold>500)command(s,t,{type:'upgrade',ids:[b.id]});}
      for(const w of us.filter(u=>u.kind==='worker'&&!u.inside&&!u.order)){const ri=s.resources.findIndex(r=>r.amount>0&&r.kind!=='camp'&&distance(w,r)<16);if(ri>=0)w.order={type:'gather',resource:ri};}
      if(s.frame>200)for(const u of us.filter(u=>u.speed&&u.kind!=='worker'&&!u.order))u.order={type:'attackMove',x:foe[0],z:foe[1]};
    }
    for(const h of us.filter(u=>u.kind==='hero')){for(let n=0;n<10&&h.skillPoints;n++){const slot=[3,0,1,2].find(i=>h.skills[i]<(i===3?1:3)&&h.level>=(i===3?6:h.skills[i]*2+1));if(slot===undefined)break;command(s,t,{type:'learn',ids:[h.id],slot});}if(s.mode==='moba'&&!h.order)h.order={type:'attackMove',x:foe[0],z:foe[1]};const e=s.units.find(u=>u.team!==t&&u.hp>0&&isVisible(s,t,u)&&distance(u,h)<9);if(e)for(const slot of [3,0,1,2]){const spell=unitType(h).spells[slot],self=['heal','shield','haste','avatar'].includes(spell.kind),target=self?h:e;if(spell.kind==='heal'&&h.hp>h.maxHp*.75)continue;command(s,t,{type:'spell',ids:[h.id],slot,x:target.x,z:target.z});}}
    if(team.faction===3)for(const u of us)u.hp=Math.min(u.maxHp,u.hp+2);
  }
  function tick(s){
    if(s.winner!==null)return;simulating.add(s);s.frame++;s.events=s.pendingEvents||[];s.pendingEvents=[];
    for(const t of s.teams)if(t.research>0){t.research=Math.max(0,t.research-DT);if(t.research===0)t.tier++;}
    if((s.mode==='moba'||s.mode==='td')&&s.frame>=s.nextWave&&(s.mode!=='td'||s.units.length+5+(s.wave+1)*2<=LIMIT)){
      s.wave++;s.nextWave=s.frame+Math.round(s.map.waveInterval/DT);
      if(s.mode==='moba')for(let t=0;t<2;t++)for(let lane=0;lane<3;lane++)for(let i=0;i<3;i++){const route=lanePath(t,lane),p=route[0];spawn(s,'creep',t,p[0]+i*.7,p[1],{route,waypoint:1,lane});}
      else if(s.wave<=s.map.waves)for(let i=0;i<5+s.wave*2;i++){const boss=s.wave%4===0&&i===0,hp=(100+s.wave*40)*(boss?5:s.wave%3===2?1.4:1);spawn(s,'creep',1,tdPath[0][0]-i*.25,tdPath[0][1],{hp,maxHp:hp,speed:(3+s.wave*.12)*(s.wave%3===0?1.45:1),route:tdPath,waypoint:1,td:true,tdBoss:boss});}
    }
    if(s.frame%40===0)for(let t=0;t<2;t++)if(s.teams[t].ai)ai(s,t);
    if(s.frame%10===0&&s.mode==='moba')for(const t of s.teams)t.gold+=3;
    for(const u of s.units){
      if(u.hp<=0){if(u.respawn>0){u.respawn-=DT;if(u.respawn<=0){[u.x,u.z]=s.map.spawns[u.team];u.hp=u.maxHp;u.mana=150;u.order=null;u.waypoints=[];u.path=[];for(const effect of ['stun','root','haste','avatar','shieldLeft','shield'])u[effect]=0;}}continue;}
      if(u.inside)continue;
      if(u.summoned&&s.frame>=u.expires){u.hp=0;continue;}
      for(const effect of ['stun','root','haste','avatar','shieldLeft'])if(u[effect]>0)u[effect]=Math.max(0,u[effect]-DT);if(!u.shieldLeft)u.shield=0;
      u.cd=Math.max(0,u.cd-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));u.mana=Math.min(150+u.level*10,u.mana+DT*2);
      u.slow=Math.max(0,(u.slow||0)-DT);
      if(types[u.kind].heal&&s.frame%10===0)for(const ally of s.units)if(ally.team===u.team&&ally.hp>0&&distance(ally,u)<6)ally.hp=Math.min(ally.maxHp,ally.hp+types[u.kind].heal);
      if(u.built<1){construct(s,u);continue;}
      if(u.queue.length){u.queue[0].left=Math.max(0,u.queue[0].left-DT);if(u.queue[0].left===0&&s.units.length<LIMIT){let p=null;for(let a=0;a<12;a++){const x=u.x+Math.cos(a*Math.PI/6)*4,z=u.z+Math.sin(a*Math.PI/6)*4;if(Math.abs(x)<=30&&Math.abs(z)<=30&&(types[u.queue[0].kind].flying||!solid(s,x,z))){p=[x,z];break;}}if(p){const q=u.queue.shift(),v=spawn(s,q.kind,u.team,...p);if(u.rally)v.order={type:v.kind==='worker'?'move':'attackMove',...u.rally};}}}
      if(u.stun>0)continue;
      if(u.kind==='worker'&&['construct','repair'].includes(u.order?.type)){work(s,u);continue;}
      if(u.kind==='worker'&&u.order?.type==='gather'){gather(s,u);continue;}
      if(u.td){const p=u.route[u.waypoint];if(!p){u.hp=0;s.lives-=u.tdBoss?5:1;if(s.lives<=0)s.winner=1;continue;}if(move(s,u,p[0],p[1],u.waypoint===u.route.length-1?4.5:1.3))u.waypoint++;continue;}
      let target=u.order?.type==='attack'?s.units.find(v=>v.id===u.order.target&&v.hp>0&&canAttack(u,v)&&isVisible(s,u.team,v)):null;
      if(u.order?.type==='attack'&&!target)u.order=null;
      if(u.order?.type!=='move'&&u.damage>0&&!target){let best=Infinity;for(const v of s.units){if(v.team===u.team||v.hp<=0||!canAttack(u,v)||(u.team>=0&&!isVisible(s,u.team,v))||u.order?.type==='hold'&&!attackInRange(s,u,v))continue;const d=distance(u,v);if(d<best&&(u.order?.type==='hold'||d<Math.max(unitType(u).range,8))){target=v;best=d;}}}
      if(target){const range=unitType(u).range+(types[target.kind].radius||.3);if(attackInRange(s,u,target)){if(u.cd<=0){damage(s,u,target,weaponDamage(u,target,u.damage*(u.avatar>0?1.6:1)+(s.teams[u.team]?.upgrade||0)*6));if(types[u.kind].splash)for(const v of s.units)if(v.id!==target.id&&v.team!==u.team&&v.hp>0&&canAttack(u,v)&&distance(v,target)<types[u.kind].splash)damage(s,u,v,weaponDamage(u,v,u.damage*.6));u.cd=unitType(u).cooldown||1;s.events.push({type:'hit',x:target.x,z:target.z,fromX:u.x,fromZ:u.z,fromY:unitHeight(s,u)+1.6,toY:unitHeight(s,target)+1.6,team:u.team,ranged:range>4});}}else if(u.order?.type!=='hold')move(s,u,target.x,target.z,range*.8);}
      else if(u.order&&['move','attackMove','patrol'].includes(u.order.type)){
        if(!types[u.kind].flying&&solid(s,u.order.x,u.order.z,u.id,u.team)){const p=formation(s,[u],u.order.x,u.order.z)?.get(u.id);if(p){u.order.x=p[0];u.order.z=p[1];u.path=[];u.pathAt=-100;}}
        if(move(s,u,u.order.x,u.order.z,.12)){if(u.order.type==='patrol'){const o=u.order;[o.x,o.z,o.fromX,o.fromZ]=[o.fromX,o.fromZ,o.x,o.z];}else u.order=u.waypoints?.shift()||null;u.path=[];u.pathAt=-100;}
      }
      else if(!u.order&&u.route){const p=u.route[u.waypoint];if(p&&move(s,u,p[0],p[1],1.5))u.waypoint++;}
      else if(!u.order&&u.home&&distance(u,{x:u.home[0],z:u.home[1]})>3)move(s,u,...u.home,2);
      if(u.kind==='hero'&&s.units.some(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1&&distance(u,v)<8))u.hp=Math.min(u.maxHp,u.hp+DT*12);
    }
    for(const zone of s.zones){zone.left-=DT;zone.pulse-=DT;if(zone.pulse<=0){zone.pulse+=1;for(const v of s.units)if(v.team!==zone.team&&v.hp>0&&distance(v,zone)<=zone.radius){damage(s,{kind:'hero',heroClass:zone.heroClass,team:zone.team},v,zone.damage);if(zone.slow)v.slow=zone.slow;}s.events.push({type:'spell',x:zone.x,z:zone.z,slot:zone.slot,heroClass:zone.heroClass,team:zone.team});}}s.zones=s.zones.filter(z=>z.left>0);
    for(const b of s.units)if(b.hp<=0&&!types[b.kind].speed)finishWork(s,b);
    s.units=s.units.filter(u=>u.hp>0||u.respawn>0);
    if(s.mode==='rpg'){
      const h=s.units.find(u=>u.kind==='hero'&&u.team===0&&u.hp>0);
      if(h){s.loot=s.loot.filter(d=>{if(distance(h,d)>2.5)return true;if(d.relic)s.quest.relic=true;else if(h.inventory.length<6)equip(h,d.item);else s.teams[0].gold+=60;return false;});
        const q=s.quest,done=[q.scouts>=3,q.relic,q.boss,distance(h,{x:s.map.spawns[0][0],z:s.map.spawns[0][1]})<7];
        if(q.stage<4&&done[q.stage]){q.stage++;experience(h,180);s.teams[0].gold+=150;s.announcement=q.stage===4?'The covenant is restored.':questNames[q.stage];s.events.push({type:'spell',slot:1,x:h.x,z:h.z,team:0});if(q.stage===4)s.winner=0;}
      }
    }
    runTriggers(s);
    if(s.mode==='td'&&s.wave>=s.map.waves&&!s.units.some(u=>u.td)&&s.frame>s.nextWave-Math.round(s.map.waveInterval/DT)+10)s.winner=0;
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
    const s=clone(raw);s.map=validateMap(s.map);if(s.mode!==s.map.mode)throw Error('Save mode mismatch');
    if(s.teams.some(t=>!t||![t.gold,t.wood,t.faction,t.upgrade,t.kills].every(finite)||!Number.isInteger(t.faction)||t.faction<0||t.faction>3))throw Error('Invalid saved teams');
    const ids=new Set();for(const u of s.units){
      if(!u||!Object.hasOwn(types,u.kind)||![-1,0,1].includes(u.team)||!Number.isSafeInteger(u.id)||u.id<1||u.id>s.serial||ids.has(u.id)||![u.x,u.z,u.hp,u.maxHp,u.damage,u.speed,u.cd,u.built,u.level,u.xp,u.mana,u.cargo,u.respawn,u.pathAt].every(finite)||u.maxHp<=0||!Array.isArray(u.path)||u.path.length>1024||!u.path.every(point)||!Array.isArray(u.spell)||u.spell.length!==4||!u.spell.every(finite)||!Array.isArray(u.queue)||u.queue.length>3||u.queue.some(q=>!q||!Object.hasOwn(types,q.kind)||!finite(q.left))||!Array.isArray(u.inventory)||u.inventory.length>6||u.inventory.some(i=>!Number.isInteger(i)||!items[i])||u.route!==undefined&&(!Array.isArray(u.route)||!u.route.every(point))||u.home!==undefined&&!point(u.home))throw Error('Invalid saved units');ids.add(u.id);
      if(u.order?.type==='patrol'&&(!types[u.kind].speed||![u.order.x,u.order.z,u.order.fromX,u.order.fromZ].every(v=>Number.isFinite(v)&&Math.abs(v)<=30))||u.order?.type==='hold'&&!types[u.kind].speed)throw Error('Invalid saved patrol or hold order');
      if(u.waypoints===undefined)u.waypoints=[];
      const waypoint=p=>p&&['move','attackMove'].includes(p.type)&&[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30);
      if(!Array.isArray(u.waypoints)||u.waypoints.length>8||!u.waypoints.every(waypoint)||u.waypoints.length&&(!types[u.kind].speed||u.hp<=0||!waypoint(u.order)))throw Error('Invalid saved waypoint queue');
      if(u.built<0||u.built>1)throw Error('Invalid saved construction progress');
      if(u.built<1&&!u.construction)u.construction={style:'legacy',started:true,paidGold:0,paidWood:0};
      if(u.construction){const c=u.construction,d=types[u.kind];if(u.built===1||d.speed||!['work','inside','growth','summon','legacy'].includes(c.style)||typeof c.started!=='boolean'||![c.paidGold,c.paidWood].every(v=>finite(v)&&v>=0)||c.paidGold>d.gold||c.paidWood>d.wood)throw Error('Invalid saved construction');}
      if(u.workResume&&!(u.workResume.type==='gather'&&Number.isInteger(u.workResume.resource)&&raw.resources?.[u.workResume.resource]))throw Error('Invalid saved work resume');
      if(u.kind==='hero'){u.heroClass??=0;if(u.skills===undefined){u.skills=[1,0,0,0];u.skillPoints=u.level-1;}if(!validHero(u.heroClass)||!Number.isInteger(u.level)||u.level<1||u.level>10||!Array.isArray(u.skills)||u.skills.length!==4||u.skills.some((r,i)=>!Number.isInteger(r)||r<0||r>(i===3?1:3)||r>0&&u.level<skillLevel(i,r))||!Number.isInteger(u.skillPoints)||u.skillPoints<0||u.skills.reduce((n,r)=>n+r,0)+u.skillPoints!==u.level)throw Error('Invalid saved hero skills');}
      for(const key of ['stun','root','haste','avatar','shieldLeft','shield'])if(u[key]!==undefined&&(!finite(u[key])||u[key]<0))throw Error('Invalid saved combat effect');
      if(u.summoned&&(!Number.isSafeInteger(u.expires)||u.expires<0))throw Error('Invalid saved summon');
      if(u.rally!==undefined&&(!u.rally||![u.rally.x,u.rally.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||u.team<0||!trainable(s,u).length))throw Error('Invalid saved rally');
      if(u.queue.length&&(u.team<0||u.queue.some(q=>!trainable(s,u).includes(q.kind))))throw Error('Invalid saved production');
    }
    for(const u of s.units){
      if(u.inside!==undefined||u.consumed){const b=s.units.find(v=>v.id===u.inside&&v.team===u.team&&v.hp>0&&v.built<1);if(u.kind!=='worker'||u.hp<=0||!b||!b.construction.started||!['inside','growth'].includes(b.construction.style)||!!u.consumed!==(b.construction.style==='growth')||u.order?.type!=='construct'||u.order.target!==b.id||s.units.filter(w=>w.inside===b.id).length!==1)throw Error('Invalid saved construction occupant');}
      if(['construct','repair'].includes(u.order?.type)){const b=s.units.find(v=>v.id===u.order.target&&v.team===u.team&&v.hp>0&&!types[v.kind].speed);if(u.kind!=='worker'||!b||u.order.type==='construct'&&b.built===1||u.order.type==='repair'&&b.built<1)throw Error('Invalid saved work target');}
      if((u.construction?.style==='inside'||u.construction?.style==='growth'&&!['farm','altar'].includes(u.kind))&&u.construction.started&&!s.units.some(w=>w.inside===u.id))throw Error('Missing saved construction occupant');
    }
    if(!Array.isArray(s.resources)||s.resources.length>100||s.resources.some(r=>!r||!['mine','tree','camp'].includes(r.kind)||![r.x,r.z,r.amount].every(finite)))throw Error('Invalid saved resources');
    s.zones??=[];if(!Array.isArray(s.zones)||s.zones.length>LIMIT*4||s.zones.some(z=>!z||![0,1].includes(z.team)||!validHero(z.heroClass)||![z.x,z.z,z.radius,z.damage,z.slow,z.left,z.pulse].every(finite)||z.radius<0||z.radius>14||z.damage<0||z.left<0||z.left>30||!Number.isInteger(z.slot)||z.slot<0||z.slot>3))throw Error('Invalid saved spell zones');
    const defaults=create(s.mode,{map:s.map});for(const key of ['loot','quest','triggered','announcement','announcements'])s[key]??=defaults[key];
    if(!Array.isArray(s.loot)||s.loot.length>LIMIT||s.loot.some(d=>!d||![d.x,d.z].every(finite)||!items[d.item])||!Array.isArray(s.triggered)||new Set(s.triggered).size!==s.triggered.length||s.triggered.some(i=>!Number.isInteger(i)||i<0||i>=s.map.triggers.length)||!Number.isInteger(s.quest.stage)||s.quest.stage<0||s.quest.stage>4)throw Error('Invalid saved objectives');
    if(!Array.isArray(s.announcements)||s.announcements.length!==2||s.announcements.some(text=>typeof text!=='string'||text.length>120))throw Error('Invalid saved player announcements');
    if(s.triggerState===undefined)s.triggerState=s.map.triggers.map((t,i)=>({count:s.triggered.includes(i)?1:0,last:s.triggered.includes(i)?s.frame:-1,next:0}));
    if(!Array.isArray(s.triggerState)||s.triggerState.length!==s.map.triggers.length||s.triggerState.some((c,i)=>!c||!Number.isInteger(c.count)||c.count<0||c.count>s.map.triggers[i].limit||!Number.isSafeInteger(c.last)||c.last < -1||c.last>s.frame||!Number.isSafeInteger(c.next)||c.next<0||c.next>s.frame+600/DT||!!c.count!==s.triggered.includes(i)||c.count===0&&c.last!==-1||c.count>0&&c.last<0))throw Error('Invalid saved trigger clock');
    for(const t of s.teams){t.tier??=1;t.research??=0;t.heroClass??=0;if(!validHero(t.heroClass)||!Number.isInteger(t.tier)||t.tier<1||t.tier>3||!Number.isFinite(t.research)||t.research<0||t.research>40)throw Error('Invalid saved technology');}s.events=[];s.pendingEvents=[];s.visible=[[],[]];if(!Array.isArray(s.explored)||s.explored.length!==2||s.explored.some(a=>!Array.isArray(a)||a.length!==1024))throw Error('Invalid saved fog');visibility(s);return s;
  }
  function publicState(s,team){const state=clone(s);delete state.pendingEvents;state.zones=state.zones.filter(z=>s.visible[team][index(z.x,z.z)]);state.map.units=[];state.map.triggers=[];state.map.regions=[];state.triggered=[];delete state.triggerState;state.announcements[1-team]='';state.units=state.units.filter(u=>u.team===team||isVisible(s,team,u));for(const u of state.units)if(u.kind==='hall')u.upgradeTier=s.teams[u.team]?.tier||1;for(const u of state.units)if(u.team!==team){u.queue=[];delete u.rally;delete u.construction;delete u.workResume;delete u.inside;delete u.consumed;u.order=null;delete u.waypoints;u.path=[];delete u.dest;}state.events=state.events.filter(e=>s.visible[team][index(e.x,e.z)]);state.teams[1-team]={faction:s.teams[1-team].faction};state.resources=state.resources.map(r=>({...r,amount:s.visible[team][index(r.x,r.z)]?r.amount:1}));state.loot=state.loot.filter(r=>s.visible[team][index(r.x,r.z)]);state.visible=[team===0?s.visible[0]:[],team===1?s.visible[1]:[]];state.explored=[team===0?s.explored[0]:[],team===1?s.explored[1]:[]];return state;}
  return {DT,LIMIT,SIZE,types,heroes,validHero,unitType,factions,items,armies,siege,flyers,canAttack,weaponDamage,trainable,questNames,clamp,clone,cell,index,distance,elevation,tileHeight,terrainEdge,traversable,flatSite,unitHeight,attackClear,highlandMap,defaultMap,siegeMap,eventMap,validateMap,removeTrigger,removeRegion,create,restore,spawn,command,tick,population,isVisible,visibility,path,solid,publicState,lanePath,tdPath};
})();
if(typeof module!=='undefined')module.exports=Frost;
