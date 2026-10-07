/* Author: MiYu. Shared fixed-step rules for the native client and authoritative server. */
var Frost = (() => {
  const PROTOCOL = 48, DT = 0.1, LIMIT = 160, PROJECTILE_LIMIT = 256, CORPSE_LIMIT = 64, CORPSE_LIFETIME = 20, TREE_FALL_LIFETIME = 6, TREE_RADIUS = .8, SIZE = 32;
  const nightTechnology=typeof module!=='undefined'?require('../night-elf-technology.json'):FrostNightTechnology;
  const druidRules=typeof module!=='undefined'?require('../druid-rules.json'):FrostDruidRules;
  const druidUnit=u=>!!u&&Object.hasOwn(druidRules.units,u.kind);
  const druidProducer=(s,u)=>!!u&&s.druidVersion===1&&s.mode==='skirmish'&&s.teams[u.team]?.faction===2&&Object.hasOwn(druidRules.buildings,u.kind);
  const druidRank=(s,team,key)=>s.teams[team]?.druidResearch?.[key]||0;
  const ancientWarRules=typeof module!=='undefined'?require('../ancient-war.json'):FrostAncientWarRules;
  const productionAncientRules=typeof module!=='undefined'?require('../production-ancients.json'):FrostProductionAncientRules;
  const productionAncientUnits={...productionAncientRules.units,...druidRules.buildings};
  const natureRules=typeof module!=='undefined'?require('../natures-blessing.json'):FrostNatureRules;
  const entangledRules=typeof module!=='undefined'?require('../entangled-rules.json'):FrostEntangledRules;
  const DOODAD_LIMIT=128,doodads={rock:{label:'岩石',radius:1,height:1.6,width:1.8,variants:6},shrub:{label:'灌木',radius:0,height:1.2,width:1.8,variants:1}};
  const simulating = new WeakSet();
  const cannibalize={gold:75,time:30,duration:33,range:6,reach:1.7,healing:{ghoul:10,abomination:15}};
  const feeding=u=>u.order?.type==='cannibalize'&&u.order.active?u.order.left:u.feeding||0;
  const corpseClaimed=(s,c)=>s.units.some(u=>u.hp>0&&!u.inside&&u.order?.type==='cannibalize'&&u.order.target===c.id);
  const raiseDead = {cost:75,cooldown:8,duration:40,range:6,count:2};
  const maxMana = u => druidUnit(u)?druidRules.units[u.kind].maxMana+100*u.druidRank:u.moonWellRules===1?nightTechnology.units.emow.maxMana+nightTechnology.specialRules.wellSpring.maxManaBonus*(u.nightLevels?.Rews||0):['necromancer','shaman'].includes(u.kind)?200+100*(u.casterRank||0):150+u.level*10;
  const casterSpells={frenzy:{name:'Unholy Frenzy',caster:'necromancer',rank:1,cost:50,cooldown:1,range:5,duration:45},cripple:{name:'Cripple',caster:'necromancer',rank:2,cost:175,cooldown:10,range:6,duration:60},purge:{name:'Purge',caster:'shaman',rank:0,cost:75,cooldown:1,range:7,duration:15},lightningShield:{name:'Lightning Shield',caster:'shaman',rank:1,cost:100,cooldown:0,range:6,duration:20,radius:1.6,power:20},bloodlust:{name:'Bloodlust',caster:'shaman',rank:2,cost:40,cooldown:1,range:6,duration:60}};
  const casterTraining={temple:{field:'necromancy',unit:'necromancer',faction:3,times:[30,45]},spiritlodge:{field:'shamanism',unit:'shaman',faction:1,times:[60,75]}};
  const skeletonResearch={longevity:{field:'skeletalLongevity',name:'Skeletal Longevity',gold:50,wood:75,time:15,tier:2},mastery:{field:'skeletalMastery',name:'Skeletal Mastery',gold:200,wood:100,time:30,tier:3}};
  // MiYu: Classic guide values; completed grades belong to the individual main base.
  const mainBases=[
    [{name:'Town Hall',gold:385,wood:205,time:180,hp:1500},{name:'Keep',gold:320,wood:210,time:140,hp:2000},{name:'Castle',gold:360,wood:210,time:140,hp:2500}],
    [{name:'Great Hall',gold:385,wood:185,time:150,hp:1500},{name:'Stronghold',gold:315,wood:190,time:140,hp:1600},{name:'Fortress',gold:325,wood:190,time:140,hp:1800}],
    [{name:'Tree of Life',gold:340,wood:185,time:120,hp:1300},{name:'Tree of Ages',gold:320,wood:180,time:140,hp:1700},{name:'Tree of Eternity',gold:330,wood:200,time:140,hp:2000}],
    [{name:'Necropolis',gold:255,wood:0,time:100,hp:1500},{name:'Halls of the Dead',gold:320,wood:210,time:140,hp:1750},{name:'Black Citadel',gold:325,wood:230,time:140,hp:2000}]
  ];
  const mainBase=(s,u,tier=u.upgradeTier||1)=>mainBases[u.baseFaction??s.teams[u.team]?.faction??0][tier-1];
  const technologyTier=(s,team)=>Math.max(1,...s.units.filter(u=>u.team===team&&u.kind==='hall'&&u.hp>0&&u.built===1).map(u=>u.upgradeTier||1));
  function updateTechnology(s){if(s.mode==='skirmish'&&s.baseTechVersion===1)for(let team=0;team<2;team++)s.teams[team].tier=technologyTier(s,team);}
  const attackRate=u=>Math.max(.2,1+(u.frenzy>0?.75:0)+(u.bloodlust>0?.4:0)-(u.cripple>0?.5:0))*(u.cold>0?.75:1);
  const moveRate=u=>(u.speedScroll>0?2:1)*(u.cold>0?.5:u.slow>0?.55:1)*(1+(u.haste>0?.6:0)+(u.bloodlust>0?.25:0))*(u.cripple>0?.25:1)*(u.purgeLeft>0?Math.max(.2,1-.8*Math.ceil(u.purgeLeft/(u.kind==='hero'?1:3))/5):1);
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
  const racialCatalog=typeof FrostItemCatalog==='undefined'?require('./racial-items.json'):FrostItemCatalog;items.push(...racialCatalog.items);
  types.scouttower={label:'Scout Tower',hp:300,damage:0,range:0,speed:0,gold:30,wood:20,food:0,time:20,radius:1.2,model:'tower',armor:'fortified'};
  types.guardtower={...types.scouttower,label:'Guard Tower',hp:500,damage:23,range:7,cooldown:.9,gold:130,wood:90,time:30,attack:'pierce',antiAir:true};
  types.critter={mechanical:true,label:'Mechanical Critter',hp:15,damage:0,range:0,speed:4,cooldown:1,gold:0,wood:0,food:0,model:'neutral',armor:'light'};
  types.shop={label:'Item shop',hp:500,damage:0,range:0,speed:0,gold:130,wood:30,food:0,time:18,radius:1.5,model:'shop'};
  const itemShop={range:10,capacity:[1,1,1,1,1,1,3,2,2],restock:[60,60,60,60,60,60,30,45,120]};
  const canonicalShop=s=>s.mode==='skirmish'&&s.itemShopVersion===2;
  const shopOffers=(s,u)=>canonicalShop(s)?racialCatalog.shops[s.teams[u.team]?.faction||0]:itemShop.capacity.map((capacity,item)=>({item,tier:1,capacity,restock:itemShop.restock[item]}));
  function shopStock(s,team){const stock=items.map(()=>({count:0,left:0}));for(const o of shopOffers(s,{team}))stock[o.item].count=o.capacity;return stock;}
  const inventoryUses=u=>u.inventory.map((i,n)=>u.itemUses?.[n]??items[i].charges??0);
  const itemTimerKey=i=>items[i].cooldownGroup||String(i);
  const itemOrb=u=>u.orb||u.inventory?.reduce((orb,i)=>items[i].orb||orb,null);
  const attackRange=(u,v)=>types[v.kind].flying&&itemOrb(u)?Math.max(6,unitType(u).range):unitType(u).range+(u.kind==='hall'&&u.baseRules===1&&u.baseFaction===2?types.hall.radius:0);
  const townPortal={item:8,time:5,radius:12,baseRange:10};
  const itemValue=i=>items[i].gold+(items[i].recipe||[]).reduce((n,p)=>n+itemValue(p),0);
  types.frosttower={...types.tower,label:'Frost spire',damage:28,slow:2.5,gold:170,model:'tower'};
  types.flametower={...types.tower,label:'Ember bastion',damage:34,splash:3,gold:210,cooldown:1.8,model:'tower'};
  const zigguratUpgrades={spirittower:{gold:145,wood:40,time:35},nerubiantower:{gold:100,wood:20,time:30}};
  types.spirittower={...types.farm,label:'Spirit Tower',hp:550,damage:29.5,range:11,cooldown:1,gold:types.farm.gold+145,wood:types.farm.wood+40,time:types.farm.time+35,supply:10,model:'tower',attack:'pierce'};
  types.nerubiantower={...types.spirittower,label:'Nerubian Tower',damage:9.5,gold:types.farm.gold+100,wood:types.farm.wood+20,time:types.farm.time+30,attack:'normal',cold:5,antiAir:true};
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
  types.entangledmine={label:'Entangled Gold Mine',hp:entangledRules.hp,damage:0,range:0,speed:0,gold:entangledRules.gold,wood:entangledRules.wood,food:0,time:entangledRules.time,radius:entangledRules.mineCollision,model:'entangledmine',armor:'fortified',armorValue:entangledRules.armorValue};
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
  for(const [kind,r] of Object.entries({...ancientWarRules.units,...druidRules.units}))types[kind]={...r};
  for(const [kind,r] of Object.entries(druidRules.buildings))types[kind]={...r,speed:0,damage:0,range:0};
  const flyers=['dragon','emberdrake','grovewyrm','spectralwyrm'];
  for(const d of Object.values(types)){d.attack??=d.range>4?'pierce':'normal';d.armor??=!d.speed?'fortified':d.model==='knight'?'heavy':d.model==='archer'||d.model==='mage'?'light':'medium';}
  types.hero.attack='normal';types.hero.armor='hero';types.mage.attack='magic';
  for(const kind of ['shaman','druid','necromancer'])types[kind].attack='magic';
  for(const d of Object.values(types))d.antiAir??=d.range>4&&d.attack!=='siege';
  for(const d of Object.values(types))d.organic=!!d.speed&&d.attack!=='siege';
  const mainBaseTypes=mainBases.map((rows,faction)=>rows.map((r,i)=>{const frost=faction===3&&i>0,tree=faction===2;return {...types.hall,...r,label:r.name,damage:tree?[45.5,54.5,67][i]:frost?(i===1?11.5:14):0,range:tree?2:frost?8:0,cooldown:tree?2.5:1,attack:frost?'pierce':'normal',antiAir:frost,cold:frost?5:0,armorValue:tree?2:5};}));
  const ancientRules={morph:2.5,speed:.4,radius:1.2,eatReach:2.2,healing:500,duration:30};
  const ancientMain=u=>u?.kind==='hall'&&u.baseRules===1&&u.baseFaction===2;
  const productionAncient=u=>u?.ancientProduction===1&&Object.hasOwn(productionAncientUnits,u.kind);
  const ancient=u=>ancientMain(u)||productionAncient(u);
  const productionAncientTypes=Object.fromEntries(Object.entries(productionAncientUnits).map(([kind,r])=>[kind,Object.fromEntries(['rooted','uprooted'].map(form=>[form,{...types[kind],...r,...r.weapons[form],label:r.name,armor:form==='rooted'?'fortified':'heavy',speed:form==='rooted'?0:r.speed,organic:false}]))]));
  const ancientMoveSpeed=u=>ancientRules.speed+(u.natureBlessed?natureRules.speedBonus:0);
  function natureUnit(s,u){if(s.natureVersion!==1||s.mode!=='skirmish'||s.teams[u.team]?.faction!==2)return null;const source=ancientMain(u)?natureRules.bindings.hall[u.upgradeTier-1]:u.kind!=='hall'?(natureRules.bindings[u.kind]??druidRules.buildings[u.kind]?.sourceUnit):null;return typeof source==='string'?natureRules.units[source]:null;}
  const natureQueued=(s,team)=>s.units.some(u=>u.team===team&&u.hp>0&&u.queue.some(q=>q.research==='naturesBlessing'));
  const natureTechnology=(s,team)=>s.units.some(u=>u.team===team&&ancientMain(u)&&u.hp>0&&u.built===1&&u.upgradeTier>=natureRules.tier);
  const natureResearcher=(s,u)=>s.natureVersion===1&&s.mode==='skirmish'&&ancientMain(u)&&s.teams[u.team]?.faction===2;
  function blessUnit(s,u){const r=natureUnit(s,u);if(!r||!s.teams[u.team].naturesBlessing||u.natureBlessed)return;u.natureBlessed=1;u.armorValue=(u.armorValue??r.armorValue)+r.armorBonus;if(ancient(u))u.speed=u.ancientShift?0:u.uprooted?ancientMoveSpeed(u):0;else if(u.kind==='treant')u.speed+=natureRules.speedBonus;}
  const nightArmy=(s,team)=>s.nightElfTechVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2;
  const nightSource=(s,u)=>nightArmy(s,u.team)?ancientWarRules.units[u.kind]?.sourceUnit??druidRules.units[u.kind]?.sourceUnit??(u.moonWellRules===1?'emow':u.wispRules===1?'ewsp':u.kind==='treant'?'efon':null):null;
  const nightBuilding=(s,u)=>nightArmy(s,u?.team)?warProducer(s,u)?'eaom':u.huntersHallRules===1?'edob':null:null;
  const nightRank=(s,team,key)=>s.teams[team]?.nightResearch?.[key]||0;
  const nightQueued=(s,team,key)=>s.units.some(u=>u.team===team&&u.hp>0&&u.queue.some(q=>q.research===key));
  function nightRequirement(s,team,level){return level.requires.every(r=>r.id==='edob'?s.units.filter(u=>u.team===team&&u.huntersHallRules===1&&u.hp>0&&u.built===1).length>=r.amount:['etoa','etoe'].includes(r.id)&&s.units.filter(u=>u.team===team&&ancientMain(u)&&u.hp>0&&u.built===1&&u.upgradeTier>=(r.id==='etoa'?2:3)).length>=r.amount);}
  function nightResearchOption(s,u,key){
    const r=Object.hasOwn(nightTechnology.research,key)?nightTechnology.research[key]:null,rank=nightRank(s,u?.team,key),level=r?.levels[rank];
    return r&&level&&r.building===nightBuilding(s,u)?{...level,id:key,slot:r.slot,enabled:u.hp>0&&u.built===1&&!u.uprooted&&!u.ancientShift&&!u.baseUpgrade&&!u.entangleCast&&u.queue.length<3&&!nightQueued(s,u.team,key)&&nightRequirement(s,u.team,level)&&s.teams[u.team].gold>=level.gold&&s.teams[u.team].wood>=level.wood}:null;
  }
  const nightResearchOptions=(s,u)=>u?.uprooted||u?.ancientShift?[]:nightTechnology.buildings[nightBuilding(s,u)]?.researches.map(key=>nightResearchOption(s,u,key)).filter(Boolean)||[];
  function druidTrainingBonus(kind,rank){const effects=druidRules.research[druidRules.units[kind].research].effects;return {hp:effects.rhpx[0]*rank,damage:effects.ratd[0]*rank*nightTechnology.units[druidRules.units[kind].sourceUnit].weapons['1'].averageDiceDamage};}
  const druidBuildingRequirement=(s,team,kind)=>druidRules.buildings[kind].requires.every(id=>id==='etoa'?technologyTier(s,team)>=2:id==='edob'&&s.units.some(v=>v.team===team&&v.huntersHallRules===1&&v.hp>0&&v.built===1));
  function druidRequirement(s,team,level){return level.requires.every(r=>r.id==='etoe'?technologyTier(s,team)>=3:druidRank(s,team,r.id)>=r.amount);}
  function druidResearchOption(s,u,key){const r=Object.hasOwn(druidRules.research,key)?druidRules.research[key]:null,level=r?.levels[druidRank(s,u?.team,key)];return r&&level&&druidProducer(s,u)&&r.building===u.kind?{...level,id:key,slot:r.slot,enabled:u.hp>0&&u.built===1&&!u.uprooted&&!u.ancientShift&&u.queue.length<3&&!nightQueued(s,u.team,key)&&druidRequirement(s,u.team,level)&&s.teams[u.team].gold>=level.gold&&s.teams[u.team].wood>=level.wood}:null;}
  const druidResearchOptions=(s,u)=>u?.uprooted||u?.ancientShift?[]:Object.keys(druidRules.research).map(key=>druidResearchOption(s,u,key)).filter(Boolean);
  function druidResearchComplete(s,u,q){s.teams[u.team].druidResearch[q.research]=q.rank;for(const v of s.units)if(v.team===u.team&&druidUnit(v)&&druidRules.units[v.kind].research===q.research){const before=druidTrainingBonus(v.kind,v.druidRank),after=druidTrainingBonus(v.kind,q.rank);v.druidRank=q.rank;v.maxHp+=after.hp-before.hp;if(v.hp>0)v.hp=Math.min(v.maxHp,v.hp+after.hp-before.hp);v.damage+=after.damage-before.damage;}s.announcements[u.team]=druidRules.research[q.research].levels[q.rank-1].name+' research complete';}
  const druidSpellIds={roar:['Aroa','Ara2'],rejuvenation:['Arej'],faerieFire:['Afae','Afa2'],cyclone:['Acyc']};
  function druidSpellOption(s,u,spell){
    if(!druidUnit(u)||!Object.hasOwn(druidSpellIds,spell))return null;
    const id=druidSpellIds[spell].find(id=>druidRules.units[u.kind].sourceRows.UnitAbilities.abilList.split(',').includes(id)),r=druidRules.commands[id];if(!r)return null;
    const required=r.sourceFunc.Requires,rank=Number(r.sourceFunc.Requiresamount||1),available=!required||druidRank(s,u.team,required)>=rank;
    return {...r,id,spell,available,enabled:available&&u.hp>0&&u.built===1&&!u.inside&&!u.druidShift&&!u.cyclone&&!u.stun&&!u.sanctuary&&!(u[spell+'Cd']>0)&&u.mana>=r.cost};
  }
  const druidSpellOptions=(s,u)=>Object.keys(druidSpellIds).map(key=>druidSpellOption(s,u,key)).filter(Boolean);
  const armorValue=u=>(u.armorValue||0)-(u.corruption>0?5:0)-(u.faerieFire>0?Number(druidRules.commands.Afae.sourceRow.DataA1):0);
  const attackDamage=(u,value=u.damage)=>value*(u.roar>0?1+Number(druidRules.commands.Aroa.sourceRow.DataA1):1)*(u.cripple>0?.5:1);
  function druidSpellTarget(s,u,spell,target){
    const v=s.units.find(v=>v.id===target&&v.hp>0&&!v.inside&&v.built===1);if(!v||!isVisible(s,u.team,v))return null;
    if(spell==='roar')return v.id===u.id?v:null;
    if(!types[v.kind].speed||types[v.kind].magicImmune||v.itemMagicImmune>0)return null;
    if(spell==='rejuvenation')return (v.team===u.team||v.team===-1)&&types[v.kind].organic?v:null;
    if(v.team===u.team||v.cyclone>0||v.order?.type==='townPortal')return null;
    return spell==='faerieFire'||spell==='cyclone'&&types[v.kind].organic&&!types[v.kind].flying?v:null;
  }
  function orderDruidSpell(s,u,c){
    const r=druidSpellOption(s,u,c.spell);if(!r?.enabled)return 'Select an available Druid with required training, mana and cooldown';
    const target=c.spell==='roar'?u.id:c.target;if(!druidSpellTarget(s,u,c.spell,target))return 'Invalid visible Druid spell target';
    u.order={type:'druidSpell',spell:c.spell,target};u.waypoints=[];u.path=[];delete u.dest;delete u.weaponWindup;delete u.druidCastLeft;delete u.druidCastSpell;return null;
  }
  function finishDruidSpell(s,u,r,v){
    u.mana-=r.cost;u[r.spell+'Cd']=r.cooldown;u.druidCastSpell=r.spell;u.druidLastSpell=r.spell;u.druidCastLeft=Number(druidRules.units[u.kind].sourceRows.UnitWeapons.castbsw);u.druidCastFrame=s.frame;
    if(r.spell==='roar'){for(const ally of s.units)if(ally.team===u.team&&types[ally.kind].speed&&ally.hp>0&&!ally.inside&&ally.built===1&&distance(u,ally)<=Number(r.sourceRow.Area1)/100)ally.roar=ally.kind==='hero'?r.heroDuration:r.duration;}
    if(r.spell==='rejuvenation')v.rejuvenation=v.kind==='hero'?r.heroDuration:r.duration;
    if(r.spell==='faerieFire'){v.faerieFire=v.kind==='hero'?r.heroDuration:r.duration;v.faerieTeam=u.team;visibility(s);}
    if(r.spell==='cyclone'){v.cyclone=v.kind==='hero'?r.heroDuration:r.duration;v.order=null;v.path=[];v.waypoints=[];delete v.dest;delete v.weaponWindup;delete v.druidCastLeft;delete v.druidCastSpell;navigationCache.delete(s);trafficCache.delete(s);}
    s.events.push({type:'spell',spell:r.spell,art:r.spell,x:v.x,y:unitHeight(s,v),z:v.z,team:u.team});
  }
  function tickDruidSpell(s,u){
    const o=u.order,r=druidSpellOption(s,u,o.spell),v=druidSpellTarget(s,u,o.spell,o.target);
    if(!r?.enabled||!v){u.order=null;return;}
    if(distance(u,v)>r.range+1e-7||!attackClear(s,u,v)){delete o.castLeft;move(s,u,v.x,v.z,Math.max(.2,r.range*.9));return;}
    const point=Number(druidRules.units[u.kind].sourceRows.UnitWeapons.castpt);o.castLeft??=point;u.castYaw=Math.atan2(v.x-u.x,v.z-u.z);o.castLeft=Math.max(0,o.castLeft-DT);
    if(o.castLeft<1e-8){finishDruidSpell(s,u,r,v);u.order=o.resume||null;}
  }
  function autoDruidSpell(s,u){
    if(!u.faerieAuto||!druidSpellOption(s,u,'faerieFire')?.enabled||u.druidCastLeft>0||u.order&&!['hold','attack'].includes(u.order.type))return;
    const v=s.units.filter(v=>!v.faerieFire&&druidSpellTarget(s,u,'faerieFire',v.id)&&distance(u,v)<=druidRules.commands.Afae.range&&attackClear(s,u,v)).sort((a,b)=>distance(u,a)-distance(u,b)||a.id-b.id)[0];
    if(v)u.order={type:'druidSpell',spell:'faerieFire',target:v.id,...(u.order?{resume:clone(u.order)}:{})};
  }
  function validateDruidSpells(s,u){
    for(const spell of Object.keys(druidSpellIds)){const r=druidRules.commands[druidSpellIds[spell][0]],max=u.kind==='hero'?r.heroDuration:r.duration;
      for(const [field,limit] of [[spell,max],[spell+'Cd',r.cooldown]])if(u[field]!==undefined&&(!Number.isFinite(u[field])||u[field]<0||u[field]>limit||field.endsWith('Cd')&&(!druidUnit(u)||!(['druidclaw','druidbear'].includes(u.kind)?['roar','rejuvenation']:['faerieFire','cyclone']).includes(spell))))throw Error('Invalid saved Druid spell timer');
    }
    if(u.faerieFire>0?![0,1].includes(u.faerieTeam)||u.faerieTeam===u.team||types[u.kind].magicImmune:u.faerieTeam!==undefined)throw Error('Invalid saved Faerie Fire vision');
    if(u.faerieAuto!==undefined&&(typeof u.faerieAuto!=='boolean'||!['druidtalon','druidcrow'].includes(u.kind)))throw Error('Invalid saved Faerie Fire autocast');
    if(['druidtalon','druidcrow'].includes(u.kind))u.faerieAuto??=true;
    if(u.druidCastLeft!==undefined&&(!druidUnit(u)||!Number.isFinite(u.druidCastLeft)||u.druidCastLeft<0||u.druidCastLeft>2||!Object.hasOwn(druidSpellIds,u.druidCastSpell)||!Number.isSafeInteger(u.druidCastFrame)||u.druidCastFrame<0||u.druidCastFrame>s.frame))throw Error('Invalid saved Druid cast animation');
    if(u.druidLastSpell!==undefined&&(!druidUnit(u)||!Object.hasOwn(druidSpellIds,u.druidLastSpell)||!Number.isSafeInteger(u.druidCastFrame)||u.druidCastFrame<0||u.druidCastFrame>s.frame))throw Error('Invalid saved Druid last spell');
    if(u.cyclone>0&&(!types[u.kind].organic||types[u.kind].flying||u.order||u.path.length||u.waypoints.length))throw Error('Invalid saved Cyclone suspension');
    if(u.order?.type==='druidSpell'){const o=u.order,r=druidSpellOption(s,u,o.spell),point=Number(druidRules.units[u.kind]?.sourceRows.UnitWeapons.castpt);if(!r?.available||!Number.isSafeInteger(o.target)||o.target<1||o.target>s.serial||u.hp<=0||u.inside||u.druidShift||o.castLeft!==undefined&&(!Number.isFinite(o.castLeft)||o.castLeft<0||o.castLeft>point)||Object.keys(o).some(k=>!['type','spell','target','castLeft','resume'].includes(k))||o.resume&&(o.spell!=='faerieFire'||!['attack','hold'].includes(o.resume.type)||o.resume.type==='attack'&&(!Number.isSafeInteger(o.resume.target)||o.resume.target<1||o.resume.target>s.serial)))throw Error('Invalid saved Druid spell order');}
  }
  const druidMorphTarget=u=>({druidclaw:'druidbear',druidbear:'druidclaw',druidtalon:'druidcrow',druidcrow:'druidtalon'})[u.kind];
  const druidMorphAbility=u=>druidRules.commands[['druidclaw','druidbear'].includes(u.kind)?'Abrf':'Arav'];
  const druidMorphDuration=u=>druidMorphAbility(u).duration+Number(druidMorphAbility(u).sourceRow.Cast1);
  function druidLanding(s,u,kind){const radius=movementRadius({kind});return !solid(s,u.x,u.z,u.id,-1,radius)&&s.units.every(v=>v.id===u.id||v.hp<=0||v.inside||types[v.kind].flying||!mobile(v)||distance(u,v)>=radius+movementRadius(v)+.05);}
  function startDruidMorph(s,u){
    if(!druidUnit(u)||u.hp<=0||u.built!==1||u.stun>0||u.inside||u.sanctuary||u.druidShift)return 'Select an available Druid';
    const d=druidRules.units[u.kind],r=druidMorphAbility(u),target=druidMorphTarget(u),required=d.research==='Redc'?2:1;
    if(!d.alternate&&u.druidRank<required)return 'Requires '+(required===2?'Master':'Adept')+' Druid Training';
    if(u.mana<r.cost)return 'Not enough mana';if(u.kind==='druidcrow'&&!druidLanding(s,u,target))return 'Move the Storm Crow onto clear ground before landing';
    u.mana-=r.cost;u.druidShift={kind:target,left:druidMorphDuration(u)};u.speed=0;u.order=null;u.path=[];u.waypoints=[];delete u.dest;delete u.weaponWindup;return null;
  }
  function finishDruidMorph(s,u){
    const kind=u.druidShift.kind;if(u.kind==='druidcrow'&&!druidLanding(s,u,kind)){u.mana=Math.min(maxMana(u),u.mana+druidMorphAbility(u).cost);delete u.druidShift;u.speed=types[u.kind].speed;s.announcements[u.team]='Storm Crow landing canceled: ground became blocked';return;}
    const fraction=u.hp/u.maxHp,d=druidRules.units[kind],bonus=druidTrainingBonus(kind,u.druidRank);u.kind=kind;u.maxHp=d.hp+bonus.hp;u.hp=Math.max(1,u.maxHp*fraction);u.damage=d.damage+bonus.damage;u.armorValue=d.armorValue;u.speed=d.speed;delete u.nightLevels;delete u.druidShift;updateNightUnit(s,u);u.order={type:'hold'};navigationCache.delete(s);trafficCache.delete(s);visibility(s);
  }
  function validateDruidResearch(s){for(const t of s.teams){if(s.druidVersion===0)t.druidResearch??=Object.fromEntries(Object.keys(druidRules.research).map(k=>[k,0]));const r=t.druidResearch;if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==4||Object.entries(druidRules.research).some(([key,v])=>!Number.isInteger(r[key])||r[key]<0||r[key]>v.maxLevel||r[key]>0&&(s.druidVersion!==1||s.mode!=='skirmish'||t.faction!==2)))throw Error('Invalid saved Druid research');if(r.Reeb&&r.Redc<2||r.Reec&&r.Redt<2)throw Error('Invalid saved Druid Mark prerequisite');}}
  function validateDruidQueue(s,u,q){const r=druidRules.research[q.research],level=r.levels[q.rank-1];if(!druidProducer(s,u)||r.building!==u.kind||!level||q.rank!==druidRank(s,u.team,q.research)+1||u.hp<=0||u.built!==1||q.left<=0||q.left>level.time||Object.keys(q).some(k=>!['research','rank','left'].includes(k))||s.units.filter(v=>v.team===u.team&&v.hp>0).flatMap(v=>v.queue).filter(v=>v.research===q.research).length!==1)throw Error('Invalid saved Druid research queue');}
  function validateDruidUnit(s,u){
    if(!druidUnit(u)){if(u.druidRank!==undefined||u.druidShift!==undefined)throw Error('Unexpected saved Druid form');return;}
    const d=druidRules.units[u.kind],rank=u.druidRank,expected=druidRank(s,u.team,d.research),shift=u.druidShift;
    if(s.druidVersion!==1||!Number.isInteger(rank)||rank!==expected||rank<0||rank>2||u.maxHp!==d.hp+druidTrainingBonus(u.kind,rank).hp||u.mana<0||u.mana>maxMana(u)||u.speed!==(shift?0:d.speed))throw Error('Invalid saved Druid form');
    if(shift&&(shift.kind!==druidMorphTarget(u)||!Number.isFinite(shift.left)||shift.left<=0||shift.left>druidMorphDuration(u)||u.hp<=0||u.inside||u.order!==null||u.path.length||u.waypoints.length||Object.keys(shift).some(k=>!['kind','left'].includes(k))||!d.alternate&&rank<(d.research==='Redc'?2:1)))throw Error('Invalid saved Druid transformation');
  }
  function nightUnitLevels(s,u){const source=nightSource(s,u);return source?Object.fromEntries(nightTechnology.units[source].upgrades.filter(key=>Object.hasOwn(nightTechnology.research,key)).map(key=>[key,nightRank(s,u.team,key)])):null;}
  function nightBonuses(source,levels){const r=nightTechnology.units[source],attack=(levels?.Resm||0)+(levels?.Resw||0),armor=(levels?.Rema||0)+(levels?.Rerh||0);return {damage:attack*r.weapons['1'].averageDiceDamage+3*(levels?.Remk||0),armor:armor*(r.armorPerRank||0)};}
  function updateNightUnit(s,u){const source=nightSource(s,u),levels=nightUnitLevels(s,u);if(!source)return;const before=nightBonuses(source,u.nightLevels),after=nightBonuses(source,levels);u.damage+=after.damage-before.damage;u.armorValue=(u.armorValue??nightTechnology.units[source].armor)+after.armor-before.armor;u.nightLevels=levels;}
  function validateNightLevels(s,u,projectile=false){const expected=nightUnitLevels(s,u),levels=u.nightLevels;if(!expected){if(levels!==undefined)throw Error('Unexpected saved Night Elf unit research');return;}if(!levels||typeof levels!=='object'||Array.isArray(levels)||Object.keys(levels).length!==Object.keys(expected).length||Object.entries(expected).some(([key,rank])=>!Object.hasOwn(levels,key)||!Number.isInteger(levels[key])||levels[key]<0||(projectile?levels[key]>rank:levels[key]!==rank)))throw Error('Invalid saved Night Elf unit research');}
  function nightResearchComplete(s,u,q){s.teams[u.team].nightResearch[q.research]=q.rank;for(const v of s.units)if(v.team===u.team)updateNightUnit(s,v);s.announcements[u.team]=nightTechnology.research[q.research].levels[q.rank-1].name+' research complete';visibility(s);}
  const researchPrice=(s,q)=>q.research==='naturesBlessing'?natureRules:(druidRules.research[q.research]??nightTechnology.research[q.research]).levels[q.rank-1];
  function nightWeaponRoll(s,u){
    const source=nightSource(s,u),r=source&&nightTechnology.units[source]?.weapons['1'];if(!ancientWarRules.units[u.kind]&&!druidUnit(u)||!r)return u.damage;
    const dice=r.dice+(u.nightLevels?.Resm||0)+(u.nightLevels?.Resw||0)+(druidUnit(u)?druidRules.research[druidRules.units[u.kind].research].effects.ratd[0]*u.druidRank:0);let roll=0;
    for(let i=0;i<dice;i++){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;roll+=1+Math.floor(s.rng/4294967296*r.sides);}
    return u.damage-dice*r.averageDiceDamage+roll;
  }
  const moonWellType={...types.farm,label:'Moon Well',hp:Number(nightTechnology.units.emow.sourceRows.UnitBalance.HP),armorValue:nightTechnology.units.emow.armor,gold:Number(nightTechnology.units.emow.sourceRows.UnitBalance.goldcost),wood:Number(nightTechnology.units.emow.sourceRows.UnitBalance.lumbercost),time:Number(nightTechnology.units.emow.sourceRows.UnitBalance.bldtm)};
  const manaUser=u=>druidUnit(u)||u.kind==='hero'||['mage','druid','shaman','necromancer'].includes(u.kind);
  function moonRestore(s,well,target){
    const r=nightTechnology.specialRules.wellSpring;if(!target||target.team!==well.team||target.hp<=0||target.inside||!types[target.kind].organic||distance(well,target)>Number(r.sourceAbilityRow.Area1)/100||!isVisible(s,well.team,target))return false;
    const health=Math.min(target.maxHp-target.hp,well.mana*r.healthPerWellMana);target.hp+=health;well.mana-=health/r.healthPerWellMana;
    const mana=manaUser(target)?Math.min(maxMana(target)-target.mana,well.mana*r.targetManaPerWellMana):0;target.mana+=mana;well.mana-=mana/r.targetManaPerWellMana;
    return health>0||mana>0;
  }
  function updateMoonWell(s,u){if(u.moonWellRules!==1)return;const r=nightTechnology.specialRules.wellSpring;if(u.built===1&&isNight(s))u.mana=Math.min(maxMana(u),u.mana+DT*nightTechnology.units.emow.manaRegen*(u.nightLevels.Rews?r.manaRegenMultiplier:1));if(u.built===1&&u.rechargeAuto&&u.mana>=Number(r.sourceAbilityRow.DataC1))for(const v of s.units)moonRestore(s,u,v);}
  function updateSentinels(s){
    for(const tree of s.resources)if(tree.kind==='tree'&&tree.amount<=0&&s.nightElfTechVersion===1)tree.hp=0;
    s.sentinels=s.sentinels.filter(o=>{const tree=s.resources[o.resource];if(!tree||tree.amount<=0||tree.hp<o.anchorHp||tree.amount<o.anchorAmount)return false;const d=distance(o,tree),speed=nightTechnology.specialRules.sentinel.missileSpeed/100*DT;if(d<=speed){o.x=tree.x;o.z=tree.z;o.perched=true;}else{o.x+=(tree.x-o.x)/d*speed;o.z+=(tree.z-o.z)/d*speed;}return true;});
  }
  function castSentinel(s,u){const tree=s.resources[u.order.resource],r=nightTechnology.specialRules.sentinel;if(!tree||tree.amount<=0||!isVisiblePoint(s,u.team,tree)){u.order=null;return;}if(distance(u,tree)>r.range/100){move(s,u,tree.x,tree.z,r.range/100-.05);return;}u.sentinelUsed=true;s.sentinels.push({source:u.id,team:u.team,resource:u.order.resource,x:u.x,z:u.z,perched:false,anchorHp:tree.hp,anchorAmount:tree.amount});u.order=null;u.waypoints=[];delete u.hiding;visibility(s);}
  const isVisiblePoint=(s,team,point)=>!!s.visible[team]?.[index(point.x,point.z)];
  function damageTree(s,p,i,value){const tree=s.resources[i];if(!tree||tree.kind!=='tree'||tree.amount<=0||value<=0)return;tree.hp=Math.max(0,tree.hp-value);s.sentinels=s.sentinels.filter(o=>o.resource!==i);if(tree.hp===0){tree.amount=0;tree.felled={frame:s.frame,yaw:Math.atan2(tree.x-p.fromX,tree.z-p.fromZ),age:0};learnResources(s);treeFields.delete(s);trafficCache.delete(s);}s.events.push({type:'damage',x:tree.x,z:tree.z,amount:Math.ceil(value),team:-1});}
  function groundAttackOrder(s,u){
    const o=u.order,tree=o.type==='attackTree'?s.resources[o.resource]:null,point=tree||o;if(tree&&(tree.amount<=0||!isVisiblePoint(s,u.team,tree))){u.order=null;delete u.weaponWindup;return;}
    const proxy={id:0,kind:'soldier',team:-1,x:point.x,z:point.z,hp:50},d=distance(u,point),inRange=d>=unitType(u).minRange&&d<=unitType(u).range+(tree?TREE_RADIUS:0)&&attackClear(s,u,proxy);
    if(!inRange){delete u.weaponWindup;if(d>unitType(u).range)move(s,u,point.x,point.z,unitType(u).range-.05);return;}
    if(u.weaponWindup){u.weaponWindup.left=Math.max(0,u.weaponWindup.left-DT*attackRate(u));if(u.weaponWindup.left<1e-8&&fire(s,u,proxy,o.type==='attackTree'?{treeTarget:o.resource}:{groundAttack:true}))delete u.weaponWindup;}
    else if(u.cd<=0){u.weaponWindup={target:0,left:unitType(u).damagePoint};u.cd=unitType(u).cooldown;}
  }
  function glaiveImpact(s,p,point,attacker,target,direct){
    const type=unitType(p),weights=new Map();for(const v of s.units)if((type.splashEnemiesOnly===false||v.team!==p.team)&&v.hp>0&&!types[v.kind].flying&&canAttack(p,v)){const band=type.splashBands.find(([radius])=>distance(v,point)<=radius);if(band)weights.set(v,band[1]);}
    if(p.nightLevels?.Repb&&!p.groundAttack&&(direct||p.treeTarget!==undefined)){const dx=point.x-p.fromX,dz=point.z-p.fromZ,length=Math.hypot(dx,dz)||1,range=nightTechnology.specialRules.vorpalBlades.spillDistanceBonus/100,radius=nightTechnology.specialRules.vorpalBlades.spillRadius/100;for(const v of s.units){const x=v.x-point.x,z=v.z-point.z,along=(x*dx+z*dz)/length,lateral=Math.abs(x*dz-z*dx)/length;if(v.id!==target?.id&&v.team!==p.team&&v.hp>0&&canAttack(p,v)&&!types[v.kind].flying&&along>0&&along<=range&&lateral<=radius)weights.set(v,1);}}
    for(const [v,factor] of weights)damage(s,attacker,v,weaponDamage(p,v,p.damage*factor),'splash',undefined,p);
    if(p.nightLevels?.Repb)for(let i=0;i<s.resources.length;i++){const tree=s.resources[i];if(tree.kind!=='tree'||tree.amount<=0)continue;const band=type.splashBands.find(([radius])=>distance(tree,point)<=radius);if(band)damageTree(s,p,i,p.damage*band[1]);}
  }
  const uprootedTypes=mainBaseTypes[2].map(d=>({...d,speed:ancientRules.speed,armor:'heavy'}));
  const mobile=u=>!!unitType(u).speed&&!u.ancientShift;
  const rootedBase=u=>u.kind==='hall'&&!u.uprooted&&!u.ancientShift;
  const validBaseMetadata=u=>[0,1].includes(u.baseRules)&&Number.isInteger(u.baseFaction)&&u.baseFaction>=0&&u.baseFaction<4&&Number.isInteger(u.upgradeTier)&&u.upgradeTier>=1&&u.upgradeTier<=3;
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
  const wispRules=typeof module!=='undefined'?require('../wisp-rules.json'):FrostWispRules;
  const wispType={...types.worker,label:'Wisp',hp:wispRules.hp,damage:0,armor:wispRules.armor,armorValue:wispRules.armorValue,speed:wispRules.speed,gold:wispRules.gold,wood:wispRules.wood,food:wispRules.food,time:wispRules.time};
  const wisp=(s,u)=>s.wispHarvestVersion===1&&s.mode==='skirmish'&&u.kind==='worker'&&u.wispRules===1&&s.teams[u.team]?.faction===2;
  const detonateRules=(typeof module!=='undefined'?require('../detonate-catalog.json'):FrostDetonateArt).rules;
  const dispellable=['frenzy','cripple','purgeLeft','bloodlust','lightningShield','slow','cold','haste','root','shield','shieldLeft','speedScroll','roar','rejuvenation','faerieFire','cyclone'];
  function detonate(s,u){
    const start=s.events.length;
    s.sentinels=s.sentinels.filter(o=>!o.perched||distance(o,u)>detonateRules.radius);
    for(const v of s.units){
      if(v.id===u.id||v.hp<=0||v.inside||distance(u,v)>detonateRules.radius+1e-7)continue;
      for(const key of dispellable)if(v[key]>0)v[key]=0;delete v.frenzySource;delete v.lightningSource;delete v.faerieTeam;delete v.itemRegen;
      const audience=[0,1].reduce((mask,t)=>mask|(isVisible(s,t,v)?1<<t:0),0);
      v.mana=Math.max(0,v.mana-detonateRules.manaDrain);
      if(v.summoned)damage(s,u,v,detonateRules.summonDamage,'dispel');
      s.events.push({type:'spell',art:'dispel',x:v.x,y:unitHeight(s,v),z:v.z,team:u.team,audience});
    }
    // MiYu: consuming the caster creates neither a corpse nor kill, bounty or experience credit.
    u.hp=0;u.order=null;u.waypoints=[];u.path=[];u.gatherCd=0;delete u.dest;delete u.workResume;
    s.events.push({type:'spell',art:'detonate',x:u.x,y:unitHeight(s,u),z:u.z,team:u.team});
    if(!simulating.has(s))(s.pendingEvents??=[]).push(...s.events.slice(start));
  }
  const trainType=(s,kind,team)=>kind==='worker'&&s.wispHarvestVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2?wispType:types[kind];
  const warArmy=(s,team)=>s.ancientWarVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2;
  const warProducer=(s,u)=>!!u&&warArmy(s,u.team)&&u.kind==='barracks';
  const huntersHallType={...types.workshop,...ancientWarRules.huntersHall};
  const trainingRequirement=(s,kind,team)=>druidRules.units[kind]?.sourceFunc.Requires?.split(',').includes('etoa')&&technologyTier(s,team)<2?'Requires a completed Tree of Ages':warArmy(s,team)&&ancientWarRules.units[kind]?.requires&&!s.units.some(v=>v.kind==='workshop'&&v.huntersHallRules===1&&v.team===team&&v.hp>0&&v.built===1)?"Requires a completed Hunter's Hall":null;
  const shadowMeld=u=>!!u&&(['nightarcher','nighthuntress'].includes(u.kind)||u.kind==='archer');
  const unitBaseType=u=>u.moonWellRules===1?moonWellType:u.huntersHallRules===1?huntersHallType:productionAncient(u)?productionAncientTypes[u.kind][u.uprooted?'uprooted':'rooted']:u.kind==='worker'&&u.wispRules===1?wispType:u.kind==='hero'?(itemOrb(u)?{...heroes[u.heroClass??0],antiAir:true}:heroes[u.heroClass??0]):u.kind==='hall'&&u.baseRules===1?(ancient(u)&&u.uprooted?uprootedTypes[u.upgradeTier-1]:mainBaseTypes[u.baseFaction][u.upgradeTier-1]):types[u.kind];
  const buildingType=(s,kind,team)=>kind==='farm'&&nightArmy(s,team)?moonWellType:kind==='workshop'&&warArmy(s,team)?huntersHallType:kind==='hall'&&s.mode==='skirmish'&&s.baseRulesVersion===1?mainBaseTypes[s.teams[team].faction][0]:s.productionAncientVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2&&productionAncientTypes[kind]?productionAncientTypes[kind].rooted:types[kind];
  const projectileSpeed=(u,target)=>unitType(u).missileSpeed??(u.orb||target&&types[target.kind].flying&&itemOrb(u)?20:unitType(u).range>4&&u.kind!=='rifleman'?(unitType(u).attack==='siege'?12:20):0);
  const projectileArt=u=>unitType(u).projectile??(productionAncient(u)&&u.kind==='tower'&&!u.uprooted?'stone':u.kind==='hall'&&u.baseRules===1&&u.baseFaction===3?'frost':['catapult','trebuchet','siegecreep'].includes(u.kind)?'stone':u.kind==='ballista'?'ballista':u.kind==='bonearcher'?'quarrel':u.kind==='hunter'?'javelin':['dragon','emberdrake','flametower'].includes(u.kind)||u.kind==='hero'&&u.heroClass===1?'fire':['frosttower','nerubiantower','spectralwyrm','shaman'].includes(u.kind)||u.kind==='hero'&&!u.heroClass?'frost':['druid','grovewyrm'].includes(u.kind)?'nature':['necromancer','skeletonmage','spirittower'].includes(u.kind)?'shadow':unitType(u).attack==='magic'?'arcane':'arrow');
  const canAttack=(a,b)=>!a.inside&&!b.inside&&!(a.cyclone>0)&&!(b.cyclone>0)&&b.order?.type!=='townPortal'&&unitType(a).damage>0&&(!unitType(a).airOnly||!!types[b.kind].flying)&&(!types[b.kind].flying||unitType(a).antiAir);
  const timeOfDay=s=>s.frame<(s.moonUntil||0)?22:((s.frame+(s.map.startingHour??8)*200)%4800)/200;
  const isNight=s=>{const h=timeOfDay(s);return h<6||h>=18;};
  const daylight=s=>{const h=timeOfDay(s);return clamp((h-5)/2,0,1)*clamp((19-h)/2,0,1);};
  const asleep=(s,u)=>u.team===-1&&!!u.home&&!u.order&&u.hp>0&&!u.inside&&u.cd<=0&&isNight(s)&&s.frame>=(u.awakeUntil||0)&&distance(u,{x:u.home[0],z:u.home[1]})<=3;
  const canControl=(s,team,u)=>u.team===team&&(s.mode!=='moba'||u.kind==='hero'||u.summoned===true);
  const canDeny=(s,team,u)=>s.mode==='moba'&&u.team===team&&!!types[u.kind].laneCreep&&!u.inside&&u.hp>0&&u.hp<=u.maxHp*.5;
  const canTarget=(s,a,b)=>b.hp>0&&canAttack(a,b)&&(a.team!==b.team||canDeny(s,a.team,b)&&(a.source??a.id)!==b.id);
  const unitType=u=>{let d=unitBaseType(u);if(u.nightLevels)d={...d,range:d.range+2*(u.nightLevels.Reib||0),...(d.bounceTargets?{bounceTargets:d.bounceTargets+(u.nightLevels.Remg||0)}:{})};return u.natureBlessed?{...d,armorValue:u.armorValue,speed:d.speed>0?d.speed+natureRules.speedBonus:0}:d;};
  const damageTable={normal:{fortified:.5},pierce:{light:1.35,heavy:.75,fortified:.35},siege:{light:.65,medium:.65,heavy:.65,hero:.5,fortified:3},magic:{heavy:1.5,fortified:.5}};
  const weaponDamage=(a,b,value)=>{const armor=armorValue(b),factor=armor>=0?1/(1+.06*armor):2-Math.pow(.94,-armor),table=druidUnit(a)?druidRules.damageTable:ancientWarRules.units[a.kind]?ancientWarRules.damageTable:damageTable;return value*(table[unitType(a).attack]?.[unitType(b).armor]??1)*factor;};
  const questNames=['Clear the three Frostfang scouts','Recover the relic from the ruined shrine','Defeat the Frostbound sovereign','Return to the sanctuary'];
  const trainable=(s,u)=>s.mode==='moba'||!s.teams[u.team]||u.uprooted||u.ancientShift?[]:druidProducer(s,u)?druidRules.buildings[u.kind].training:warProducer(s,u)?Object.keys(ancientWarRules.units):u.kind==='hall'?['worker']:u.kind==='altar'?['hero',flyers[s.teams[u.team].faction]]:casterTraining[u.kind]?(s.teams[u.team].faction===casterTraining[u.kind].faction?[casterTraining[u.kind].unit]:[]):u.kind==='barracks'?armies[s.teams[u.team].faction].units.filter(k=>!['necromancer','shaman'].includes(k)):u.kind==='workshop'&&!warArmy(s,u.team)?[siege[s.teams[u.team].faction]]:[];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const clone = v => JSON.parse(JSON.stringify(v));
  const cell = (x,z) => [clamp(Math.floor((x+32)/2),0,31),clamp(Math.floor((z+32)/2),0,31)];
  const index = (x,z) => {const p=cell(x,z);return p[1]*32+p[0];};
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const tierHeight=(map,i,x,z)=>{const h=(map.heights?.[i]||0)*2,raw=map.ramps?.[i]||0,r=raw>4?raw-4:raw;return h+(r===1?x:r===2?2-x:r===3?z:r===4?2-z:0)*(raw>4?.5:1);};
  function reliefHeight(map,x,z){if(!map.relief)return 0;const px=clamp((x+32)/2,0,32),pz=clamp((z+32)/2,0,32),cx=Math.min(31,Math.floor(px)),cz=Math.min(31,Math.floor(pz)),u=px-cx,v=pz-cz,i=cz*33+cx;return (map.relief[i]*(1-u)+map.relief[i+1]*u)*(1-v)+(map.relief[i+33]*(1-u)+map.relief[i+34]*u)*v;}
  const tileHeight=(map,i,x,z)=>tierHeight(map,i,x,z)+reliefHeight(map,i%32*2-32+x,Math.floor(i/32)*2-32+z);
  function gradeRamp(map,i,gentle=true){
    const r=map.ramps?.[i],x=i%32,z=Math.floor(i/32),[dx,dz]=[[0,0],[1,0],[-1,0],[0,1],[0,-1]][r]||[0,0],nx=x+dx,nz=z+dz,j=nz*32+nx;
    const neighbor=nx>=0&&nz>=0&&nx<=31&&nz<=31,paired=neighbor&&map.ramps?.[j]===r+4&&map.heights?.[j]===map.heights?.[i]+.5;
    if(!Number.isInteger(i)||i<0||i>=1024||!Number.isInteger(r)||r<1||r>4)throw Error('Invalid ramp cell');
    if(!gentle){if(paired){map.ramps[j]=0;map.heights[j]=map.heights[i]+1;}return map;}
    if(!neighbor||map.terrain[i]===1||map.terrain[j]===1||!paired&&(map.ramps[j]||map.heights[j]!==map.heights[i]+1))throw Error('Gentle ramp requires a dry upper shelf');
    // MiYu: two matching one-unit rises replace a two-unit entrance; adjoining low ground keeps its height.
    map.ramps[i]=map.ramps[j]=r+4;map.heights[j]=map.heights[i]+.5;map.terrain[j]=map.terrain[i];return map;
  }
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
  const groundMeshes=new WeakMap(),groundFrames=new WeakMap(),groundGraphs=new WeakMap();
  const mix=(a,b,t)=>a+(b-a)*t;
  const tierCorners=(map,x,z)=>{const i=clamp(z,0,31)*32+clamp(x,0,31);return [[0,0],[2,0],[2,2],[0,2]].map(([u,v])=>tierHeight(map,i,u,v));};
  // MiYu: these boundaries and triangle subdivisions mirror mengine-assets/terrain_mesh.rs.
  function groundTile(map,cx,cz,trusted=false){
    let cache=groundMeshes.get(map);if(!cache){cache=[];groundMeshes.set(map,cache);}const i=cz*32+cx,heights=[];if(trusted&&cache[i])return cache[i];
    for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++)heights.push(...tierCorners(map,x,z));
    const relief=[];for(let z=cz-1;z<=cz+2;z++)for(let x=cx-1;x<=cx+2;x++)relief.push(map.relief?.[clamp(z,0,32)*33+clamp(x,0,32)]||0);
    const key=heights.join(',')+';'+relief.join(',');if(cache[i]?.key===key)return cache[i];
    const h=heights.slice(16,20),at=(x,z)=>heights.slice((z*3+x)*4,(z*3+x)*4+4),point=(x,y,z)=>{const wx=(cx+x)*2-32,wz=(cz+z)*2-32;return [wx+Math.sin(wx*1.13+wz*.71)*.12,y,wz+Math.sin(wz*1.07-wx*.83)*.12];};
    const levels=(x,z)=>[at(x,z)[2],at(x+1,z)[3],at(x,z+1)[1],at(x+1,z+1)[0]];
    const joints=new Map(),boundaries=new Map();
    const corner=(x,z,y)=>{
      const key=x+','+z+','+y;if(joints.has(key))return joints.get(key);const high=levels(x,z).map(v=>v>=y-.01),directions=[[-1,-1],[1,-1],[-1,1],[1,1]],offset=[0,0],rays=[];
      high.forEach((v,k)=>{if(!v){offset[0]-=directions[k][0];offset[1]-=directions[k][1];}});const ramp=[[x,z],[x+1,z],[x,z+1],[x+1,z+1]].some(([cx,cz])=>{const h=at(cx,cz);return h.some(v=>v!==h[0]);}),inset=ramp?.3:.42,length=Math.hypot(...offset),p=point(x,y,z);if(length){p[0]+=offset[0]/length*inset;p[2]+=offset[1]/length*inset;}
      if(!ramp)p[1]-=clamp(y-Math.min(y,...levels(x,z)),0,1)*.18;
      for(const [a,b,ray] of [[0,1,[0,-1]],[1,3,[1,0]],[3,2,[0,1]],[2,0,[-1,0]]])if(high[a]!==high[b])rays.push(ray);
      const result={p,rays:rays.length===2&&Math.abs(rays[0][0]*rays[1][0]+rays[0][1]*rays[1][1])<=.01?rays:[[0,0],[0,0]]};joints.set(key,result);return result;
    };
    const joint=(x,z,y)=>{const data=corner(x,z,y),p=[...data.p],rays=data.rays;p[0]+=(rays[0][0]+rays[1][0])*.2;p[2]+=(rays[0][1]+rays[1][1])*.2;return p;};
    const edgeDelta=(a,b)=>{let first,last;if(a[1]===b[1]){const x=Math.min(a[0],b[0]),z=a[1],upper=at(x+1,z),lower=at(x+1,z+1);[first,last]=[upper[3]-lower[0],upper[2]-lower[1]];if(a[0]>b[0])[first,last]=[last,first];}else{const x=a[0],z=Math.min(a[1],b[1]),left=at(x,z+1),right=at(x+1,z+1);[first,last]=[left[1]-right[0],left[2]-right[3]];if(a[1]>b[1])[first,last]=[last,first];}return [first,last];};
    const crossing=(a,b)=>{const [first,last]=edgeDelta(a,b);return first*last<0?first/(first-last):null;};
    const round=(rays,ray,f)=>{const sum=rays[0].map((v,k)=>v+rays[1][k]);if(rays.some(r=>r[0]*ray[0]+r[1]*ray[1]>.99)){if(f>=.4)return [0,0];const q=.5+f/.8;return sum.map((v,k)=>((v-ray[k])*(1-q)**2+ray[k]*q*q)*.8-ray[k]*f*2);}return sum.map(v=>v*.2*(1-f));};
    const sample=(a,y,ray,f)=>{const hs=levels(...a),lo=Math.max(...hs.filter(v=>v<=y)),hi=Math.min(...hs.filter(v=>v>=y)),low=Number.isFinite(lo)?lo:y,upper=Number.isFinite(hi)?hi:y,A=corner(...a,low),B=corner(...a,upper),blend=upper-low<.001?0:(y-low)/(upper-low),oa=round(A.rays,ray,f),ob=round(B.rays,ray,f);return {p:A.p.map((v,k)=>mix(v,B.p[k],blend)),offset:oa.map((v,k)=>mix(v,ob[k],blend))};};
    const boundary=(a,ha,b,hb,t)=>{const key=a+','+ha+','+b+','+hb+','+t;if(boundaries.has(key))return boundaries.get(key);const ray=[b[0]-a[0],b[1]-a[1]],A=sample(a,ha,ray,t),B=sample(b,hb,ray.map(v=>-v),1-t),p=A.p.map((v,k)=>mix(v,B.p[k],t));p[0]+=A.offset[0]+B.offset[0];p[2]+=A.offset[1]+B.offset[1];const cut=crossing(a,b);if(cut!==null){const factor=t<cut?(cut-t)/cut:(t-cut)/(1-cut),pa=point(...[a[0],ha,a[1]]),pb=point(...[b[0],hb,b[1]]);for(const k of [0,2])p[k]=mix(mix(pa[k],pb[k],t),p[k],factor);}const [first,last]=edgeDelta(a,b),delta=first===last&&ha===hb?clamp(first,-1,1):0,wx=(cx+mix(a[0],b[0],t))*2-32,wz=(cz+mix(a[1],b[1],t))*2-32;const fracture=(Math.sin(wx*2.7+wz*.9)*.16+Math.sin(wz*2.3-wx*.7)*.08)*clamp(Math.min((t-.4)*10,(.6-t)*10),0,1)*delta;p[a[1]===b[1]?2:0]+=fracture;boundaries.set(key,p);return p;};
    const vertices=[[0,0],[1,0],[1,1],[0,1]],corners=vertices.map(([x,z],k)=>joint(x,z,h[k])),cuts=vertices.map((a,k)=>crossing(a,vertices[(k+1)%4])),samples=new Map();
    const top=(u,v)=>{const key=u+','+v;if(samples.has(key))return samples.get(key);const n=boundary(vertices[0],h[0],vertices[1],h[1],u),s=boundary(vertices[3],h[3],vertices[2],h[2],u),w=boundary(vertices[0],h[0],vertices[3],h[3],v),e=boundary(vertices[1],h[1],vertices[2],h[2],v),p=n.map((a,k)=>mix(a,s[k],v)+mix(w[k],e[k],u)-mix(mix(corners[0][k],corners[1][k],u),mix(corners[3][k],corners[2][k],u),v));const flat=mix(mix(h[0],h[1],u),mix(h[3],h[2],u),v),interior=clamp(Math.min(u,1-u,v,1-v)*4,0,1);p[1]=mix(p[1],flat,interior)+reliefHeight(map,p[0],p[2]);samples.set(key,p);return p;};
    const triangles=[],edges=[];
    const center=top(.5,.5),outline=[],inner=[];
    for(const [a,b] of [[0,3],[3,2],[2,1],[1,0]]){const cut=crossing(vertices[a],vertices[b]),steps=[0,.25,.5,.75];if(cut!==null&&cut>1e-6&&cut<1-1e-6&&!steps.some(v=>Math.abs(v-cut)<1e-6))steps.push(cut);steps.sort((a,b)=>a-b);for(const t of steps){const p=top(mix(vertices[a][0],vertices[b][0],t),mix(vertices[a][1],vertices[b][1],t)),q=center.map((v,axis)=>mix(v,p[axis],.5));const innerTop=top((mix(vertices[a][0],vertices[b][0],t)+.5)*.5,(mix(vertices[a][1],vertices[b][1],t)+.5)*.5);q[1]=innerTop[1]-reliefHeight(map,innerTop[0],innerTop[2])+reliefHeight(map,q[0],q[2]);outline.push(p);inner.push(q);}}
    for(let k=0;k<outline.length;k++){const j=(k+1)%outline.length;triangles.push([center,inner[k],inner[j]],[inner[k],outline[k],outline[j]],[inner[k],outline[j],inner[j]]);}
    for(const [dx,dz,a,b,na,nb] of [[0,-1,0,1,3,2],[1,0,1,2,0,3],[0,1,2,3,1,0],[-1,0,3,0,2,1]]){const nx=clamp(cx+dx,0,31),nz=clamp(cz+dz,0,31),nh=tierCorners(map,nx,nz);if(Math.abs(h[a]-nh[na])<.01&&Math.abs(h[b]-nh[nb])<.01)continue;const ts=[0,.25,.5,.75,1],cut=cuts[a];if(cut!==null&&!ts.includes(cut))ts.push(cut);ts.sort((a,b)=>a-b);for(let k=1;k<ts.length;k++)edges.push([boundary(vertices[a],h[a],vertices[b],h[b],ts[k-1]),boundary(vertices[a],h[a],vertices[b],h[b],ts[k])]);}
    return cache[i]={key,triangles,edges};
  }
  function groundPlane(map,cx,cz){
    const height=map.heights?.[cz*32+cx]||0;for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++){const i=clamp(z,0,31)*32+clamp(x,0,31);if((map.heights?.[i]||0)!==height||map.ramps?.[i])return null;}
    const value=(x,z)=>map.relief?.[clamp(cz+z-1,0,32)*33+clamp(cx+x-1,0,32)]||0,a=value(0,0),dx=value(1,0)-a,dz=value(0,1)-a;for(let z=0;z<4;z++)for(let x=0;x<4;x++)if(Math.abs(value(x,z)-a-x*dx-z*dz)>1e-7)return null;return height*2;
  }
  function groundSample(map,x,z,trusted=false){
    const [cx,cz]=cell(x,z),plane=groundPlane(map,cx,cz);if(plane!==null&&Math.abs(x)<30&&Math.abs(z)<30)return {i:cz*32+cx,y:plane+reliefHeight(map,x,z)};const px=x-(cx*2-32),pz=z-(cz*2-32),xs=px<.75?[-1,0]:px>1.25?[0,1]:[0],zs=pz<.75?[-1,0]:pz>1.25?[0,1]:[0];let found=null;
    for(const dz of zs)for(const dx of xs){const ix=cx+dx,iz=cz+dz;if(ix<0||iz<0||ix>31||iz>31)continue;const i=iz*32+ix;for(const [a,b,c] of groundTile(map,ix,iz,trusted).triangles){const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(det)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;if(u< -1e-7||v< -1e-7||u+v>1+1e-7)continue;const y=u*a[1]+v*b[1]+(1-u-v)*c[1];if(!found||y>found.y+1e-7)found={i,y};}}
    return found;
  }
  function elevation(map,x,z){const surface=Math.abs(x)<=32&&Math.abs(z)<=32?groundSample(map,x,z):null;if(surface)return surface.y;const [cx,cz]=cell(x,z);return tileHeight(map,cz*32+cx,clamp(x-(cx*2-32),0,2),clamp(z-(cz*2-32),0,2));}
  function terrainEdge(map,a,b){
    if(a===b)return true;const dx=b%32-a%32,dz=Math.floor(b/32)-Math.floor(a/32);if(Math.abs(dx)+Math.abs(dz)!==1)return false;
    for(const t of [0,2]){const x=dx?dx>0?2:0:t,z=dz?dz>0?2:0:t;if(Math.abs(tileHeight(map,a,x,z)-tileHeight(map,b,x-dx*2,z-dz*2))>.01)return false;}return true;
  }
  function groundRegions(map,key=(map.heights||[]).join(',')+';'+(map.ramps||[]).join(',')){
    const old=groundGraphs.get(map);if(old?.key===key)return old.regions;const regions=new Int16Array(1024);regions.fill(-1);regions.cliffs=false;
    for(let i=0;i<1024;i++){if(regions[i]!==-1)continue;regions[i]=i;const cells=[i];for(let k=0;k<cells.length;k++){const n=cells[k];for(const d of [-32,-1,1,32]){const j=n+d;if(j<0||j>1023||Math.abs(j%32-n%32)+Math.abs(Math.floor(j/32)-Math.floor(n/32))!==1)continue;if(!terrainEdge(map,n,j)){regions.cliffs=true;continue;}if(regions[j]!==-1)continue;regions[j]=i;cells.push(j);}}}
    groundGraphs.set(map,{key,regions});return regions;
  }
  function groundNavigation(s){
    let cache=groundFrames.get(s);if(!cache||cache.map!==s.map||cache.frame!==s.frame){const tiers=(s.map.heights||[]).join(',')+';'+(s.map.ramps||[]).join(','),key=tiers+';'+(s.map.relief||[]).join(','),same=cache?.map===s.map&&cache.key===key;if(!same)groundMeshes.delete(s.map);cache={map:s.map,frame:s.frame,key,regions:same?cache.regions:groundRegions(s.map,tiers),routeEdges:same?cache.routeEdges:new Map()};groundFrames.set(s,cache);}return cache.regions;
  }
  function groundClear(map,ax,az,bx,bz,radius=0,regions){
    const trusted=!!regions;regions??=groundRegions(map);
    if(map.terrain[index(ax,az)]===1||map.terrain[index(bx,bz)]===1)return false;
    const dx=bx-ax,dz=bz-az,cuts=[0,1];for(let i=1;i<32;i++)for(const [a,d] of [[ax,dx],[az,dz]])if(d){const t=(i*2-32-a)/d;if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(map.terrain[index(ax+dx*t,az+dz*t)]===1)return false;}
    if(!regions.cliffs)return true;
    const start=groundSample(map,ax,az,trusted),end=groundSample(map,bx,bz,trusted);if(!start||!end||regions[start.i]!==regions[end.i])return false;
    const first=cell(Math.min(ax,bx)-radius-1,Math.min(az,bz)-radius-1),last=cell(Math.max(ax,bx)+radius+1,Math.max(az,bz)+radius+1),group=regions[start.i];
    for(let z=first[1];z<=last[1];z++)for(let x=first[0];x<=last[0];x++){if(regions[z*32+x]!==group||segmentDistance(x*2-31,z*2-31,[ax,az],[bx,bz])>radius+2.2||groundPlane(map,x,z)!==null)continue;for(const [a,b] of groundTile(map,x,z,trusted).edges){const A=[a[0],a[2]],B=[b[0],b[2]],C=[ax,az],D=[bx,bz],cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]),ab=cross(A,B,C)*cross(A,B,D),cd=cross(C,D,A)*cross(C,D,B);if(ab<0&&cd<0)return false;const before=segmentDistance(...C,A,B),after=segmentDistance(...D,A,B),distance=Math.min(before,after,segmentDistance(...A,C,D),segmentDistance(...B,C,D));if(distance<Math.max(radius,1e-5)-1e-7&&!(before<radius&&distance>=before-1e-7&&after>before+.0001))return false;}}
    return true;
  }
  const traversable=(map,ax,az,bx,bz)=>groundClear(map,ax,az,bx,bz);
  function flatSite(map,x,z,radius){
    const level=map.heights?.[index(x,z)]||0,a=cell(x-radius,z-radius),b=cell(x+radius,z+radius);if(Math.abs(x)+radius>30||Math.abs(z)+radius>30)return false;let low=Infinity,high=-Infinity;
    for(let cz=a[1];cz<=b[1];cz++)for(let cx=a[0];cx<=b[0];cx++){const i=cz*32+cx;if(map.terrain[i]===1||map.ramps?.[i]||(map.heights?.[i]||0)!==level)return false;for(const [dx,dz] of [[0,0],[2,0],[2,2],[0,2]]){const h=tileHeight(map,i,dx,dz);low=Math.min(low,h);high=Math.max(high,h);}}return high-low<=.25&&groundClear(map,x,z,x,z,radius);
  }
  const pickHeight=(map,x,z)=>elevation(map,x,z)+(map.terrain[index(x,z)]===1?.04:0);
  const unitHeight=(s,u)=>{groundNavigation(s);return (groundSample(s.map,u.x,u.z,true)?.y??elevation(s.map,u.x,u.z))+(u.cyclone>0?4:types[u.kind]?.flying?types[u.kind].flightHeight??4:0);};
  function attackClear(s,u,v){
    if((attackRange(u,v)<=2||u.kind==='hall'&&u.baseRules===1&&u.baseFaction===2)&&!types[u.kind].flying&&!traversable(s.map,u.x,u.z,v.x,v.z))return false;
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
    map.regions=[{name:'Highland outpost',x:5,z:-5,width:8,height:8}];for(let i=0;i<1024;i++)if(map.ramps[i]>0&&map.ramps[i]<=4)gradeRamp(map,i);return validateMap(map);
  }
  function defaultMap(mode='skirmish') {
    const map={version:1,name:mode==='moba'?'Ancients of the Vale':mode==='td'?'Serpentine Watch':'Winterfall Basin',mode,startingHour:8,cliffStyle:0,terrain:Array(1024).fill(0),surfaces:Array(1024).fill(0),heights:Array(1024).fill(0),ramps:Array(1024).fill(0),props:[],spawns:[[-23,23],[23,-23]],startingGold:mode==='td'?650:500,startingWood:mode==='skirmish'?150:250,waveInterval:mode==='td'?18:mode==='moba'?30:24,waves:12};
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
      for(let z=10;z<=12;z++)for(let x=7;x<=9;x++)ridge(x,z,2);
      // MiYu: three-cell lower and two-cell summit entrances preserve the surrounding cliff faces.
      for(let z=11;z<=13;z++)ridge(12,z,0,2);
      for(let z=11;z<=12;z++)ridge(10,z,1,2);
    }
    for(const team of [0,1]){const [x,z]=map.spawns[team];map.props.push({kind:'mine',x:x+(team?-6:6),z,amount:9000});for(let i=0;i<8;i++)map.props.push({kind:'tree',x:x+(team?-1:1)*(2+i%4*2),z:z+(team?1:-1)*(6+Math.floor(i/4)*2),amount:600});}
    for(let i=0;i<24;i++){const x=((i*17)%50)-25,z=((i*29)%48)-24;if(Math.hypot(x,z)>12&&map.spawns.every(p=>Math.hypot(p[0]-x,p[1]-z)>12))map.props.push({kind:'tree',x,z,amount:600});}
    if(mode==='moba')map.surfaces=map.terrain.map(kind=>kind===0?3:kind===2?4:0);
    if(mode==='moba')map.props=map.props.filter(p=>p.kind!=='mine'&&[0,1,2].every(lane=>{const route=lanePath(0,lane);return route.slice(1).every((v,i)=>segmentDistance(p.x,p.z,route[i],v)>3.5);}));
    if(mode==='td')map.props=map.props.filter(p=>p.kind!=='tree'||tdPath.slice(1).every((v,i)=>segmentDistance(p.x,p.z,tdPath[i],v)>3.5));
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
    for(let i=0;i<1024;i++)if(map.ramps[i]>0&&map.ramps[i]<=4)gradeRamp(map,i);return map;
  }
  function doodadMap(){const map=defaultMap();map.name='Rocky Crossing';map.tileset=1;map.doodads=[];for(let i=0;i<12;i++){const x=(i%2?1:-1)*(5+i%3*1.5),z=-8+Math.floor(i/2)*4;map.doodads.push({kind:'rock',x,z,variant:i%6,scale:.75+i%3*.25,yaw:(i*.8)%(Math.PI*2)});}for(let i=0;i<8;i++)map.doodads.push({kind:'shrub',x:i%2?9:-9,z:-9+Math.floor(i/2)*5,variant:0,scale:.75+i%3*.25,yaw:i*.7});return validateMap(map);}
  function validateMap(raw) {
    if(!raw||raw.version!==1||!['skirmish','moba','td','rpg'].includes(raw.mode)||!Array.isArray(raw.terrain)||raw.terrain.length!==1024||raw.terrain.some(v=>!Number.isInteger(v)||v<0||v>2))throw Error('Invalid map terrain or mode');
    if(raw.tileset!==undefined&&(!Number.isInteger(raw.tileset)||raw.tileset<0||raw.tileset>2))throw Error('Invalid terrain tileset');
    if(raw.cliffStyle!==undefined&&(!Number.isInteger(raw.cliffStyle)||raw.cliffStyle<0||raw.cliffStyle>2))throw Error('Invalid cliff style');
    for(const [key,max] of [['heights',3],['ramps',8],['surfaces',4],['cliffs',3]])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].length!==1024||raw[key].some(v=>!Number.isInteger(key==='heights'?v*2:v)||v<0||v>max)))throw Error('Invalid terrain '+key);
    if(raw.relief!==undefined&&(!Array.isArray(raw.relief)||raw.relief.length!==1089||Array.from(raw.relief).some(v=>!Number.isFinite(v)||Math.abs(v)>1||!Number.isInteger(v*16))))throw Error('Invalid terrain relief');
    if(raw.startingHour!==undefined&&(!Number.isInteger(raw.startingHour)||raw.startingHour<0||raw.startingHour>23))throw Error('Invalid starting hour');
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=27);
    if(!Array.isArray(raw.spawns)||raw.spawns.length!==2||!raw.spawns.every(point)||Math.hypot(raw.spawns[0][0]-raw.spawns[1][0],raw.spawns[0][1]-raw.spawns[1][1])<20)throw Error('Two separated spawn points are required');
    if(!Array.isArray(raw.props)||raw.props.length>100||raw.props.some(p=>!p||!['tree','mine','camp'].includes(p.kind)||!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>29||Math.abs(p.z)>29))throw Error('Invalid map objects');
    const map={version:1,name:Array.from(String(raw.name||'Custom battlefield')).slice(0,40).join(''),mode:raw.mode,startingHour:raw.startingHour??8,cliffStyle:raw.cliffStyle??0,terrain:[...raw.terrain],surfaces:raw.surfaces?[...raw.surfaces]:Array(1024).fill(0),heights:raw.heights?[...raw.heights]:Array(1024).fill(0),ramps:raw.ramps?[...raw.ramps]:Array(1024).fill(0),relief:raw.relief?raw.relief.map(v=>v||0):Array(1089).fill(0),spawns:raw.spawns.map(p=>[...p]),props:raw.props.map(p=>({kind:p.kind,x:p.x,z:p.z,amount:clamp(Number.isFinite(p.amount)?p.amount:1000,100,10000)})),startingGold:clamp(Number.isFinite(raw.startingGold)?Math.round(raw.startingGold):500,100,2000),startingWood:clamp(Number.isFinite(raw.startingWood)?Math.round(raw.startingWood):raw.mode==='skirmish'?150:250,0,2000),waveInterval:clamp(Number.isFinite(raw.waveInterval)?raw.waveInterval:raw.mode==='moba'?30:24,10,60),waves:clamp(Number.isFinite(raw.waves)?Math.round(raw.waves):12,3,30)};
    if(raw.doodads!==undefined){if(!Array.isArray(raw.doodads)||raw.doodads.length>DOODAD_LIMIT||Array.from(raw.doodads).some(d=>!d||!Object.hasOwn(doodads,d.kind)||!Number.isFinite(d.x)||!Number.isFinite(d.z)||Math.abs(d.x)>29||Math.abs(d.z)>29||!Number.isInteger(d.variant)||d.variant<0||d.variant>=doodads[d.kind].variants||!Number.isFinite(d.scale)||d.scale<.5||d.scale>3||!Number.isFinite(d.yaw)||d.yaw<0||d.yaw>=Math.PI*2))throw Error('Invalid map doodads');map.doodads=raw.doodads.map(({kind,x,z,variant,scale,yaw})=>({kind,x,z,variant,scale,yaw}));}
    if(raw.cliffs!==undefined)map.cliffs=[...raw.cliffs];if(raw.tileset!==undefined)map.tileset=raw.tileset;
    const at=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=27&&Math.abs(p.z)<=27;
    if(raw.players!==undefined&&(!Array.isArray(raw.players)||raw.players.length!==2||raw.players.some(p=>!p||!Number.isInteger(p.faction)||p.faction<0||p.faction>3||typeof p.ai!=='boolean'||p.heroClass!==undefined&&!validHero(p.heroClass))))throw Error('Invalid player settings');
    map.players=clone(raw.players||[{faction:0,ai:false},{faction:1,ai:true}]);for(const p of map.players)p.heroClass??=0;
    if(raw.units!==undefined&&(!Array.isArray(raw.units)||raw.units.length>64||raw.units.some(u=>!at(u)||!Object.hasOwn(types,u.kind)||![-1,0,1].includes(u.team)||u.heroClass!==undefined&&(u.kind!=='hero'||!validHero(u.heroClass))||u.tag!==undefined&&!['scout','keeper','boss'].includes(u.tag))))throw Error('Invalid placed units');
    map.units=(raw.units||[]).map(u=>({kind:u.kind,team:u.team,x:u.x,z:u.z,...(u.heroClass!==undefined?{heroClass:u.heroClass}:{}),...(u.tag?{tag:u.tag}:{})}));
    if(map.units.some((u,i)=>u.kind==='hauntedmine'&&(map.mode!=='skirmish'||map.players[u.team]?.faction!==3||!map.props.some(r=>r.kind==='mine'&&distance(r,u)<.01)||map.units.some((v,j)=>j<i&&['hauntedmine','entangledmine'].includes(v.kind)&&distance(u,v)<.01))))throw Error('Place one Haunted Mine on a gold deposit for a Revenant player');
    if(map.units.some((u,i)=>u.kind==='entangledmine'&&(map.mode!=='skirmish'||map.players[u.team]?.faction!==2||!map.props.some(r=>r.kind==='mine'&&distance(r,u)<.01)||map.units.some((v,j)=>j<i&&['hauntedmine','entangledmine'].includes(v.kind)&&distance(u,v)<.01))))throw Error('Place one Entangled Mine on a gold deposit for a Night Elf player');
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
    for(let i=0;i<1024;i++)if(map.ramps[i]&&(map.heights[i]+(map.ramps[i]>4?.5:1)>3||map.terrain[i]===1))throw Error('Ramp requires dry ground below maximum height');
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
    const f=s.mode==='moba'?0:s.teams[team]?.faction||0,baseRules=kind==='hall'&&s.mode==='skirmish'?(extra.baseRules??(s.baseRulesVersion===1?1:0)):undefined,baseFaction=extra.baseFaction??f,heroClass=kind==='hero'?(extra.heroClass??s.teams[team]?.heroClass??0):0,production=s.productionAncientVersion===1&&s.mode==='skirmish'&&f===2&&!!productionAncientTypes[kind],d=production?productionAncientTypes[kind][extra.uprooted?'uprooted':'rooted']:kind==='hero'?heroes[heroClass]:baseRules===1?(baseFaction===2&&extra.uprooted?uprootedTypes:mainBaseTypes[baseFaction])[(extra.upgradeTier||1)-1]:kind==='farm'&&nightArmy(s,team)?moonWellType:types[kind],hp=d.hp*(f===1&&baseRules!==1?1.12:1),speed=d.speed*(f===2&&baseRules!==1&&!production?1.12:1);
    const u={id:++s.serial,kind,team,x,z,hp,maxHp:hp,damage:d.damage*(f===3&&!d.supply&&baseRules!==1?1.1:1),speed,cd:0,order:null,waypoints:[],path:[],pathAt:-100,built:1,queue:[],level:1,xp:0,mana:150,spell:[0,0,0,0],inventory:[],cargo:0,respawn:0,...(kind==='hall'?{upgradeTier:1}:{}),...(baseRules!==undefined?{baseRules,baseFaction,...(baseRules===1?{armorValue:d.armorValue,...(baseFaction===2?{uprooted:!!extra.uprooted}:{})}:{})}:{}),...(['worker','ghoul'].includes(kind)?{gatherCd:0}:{}),...(kind==='necromancer'?{raiseDeadAuto:false,raiseDeadCd:0,casterRank:s.teams[team]?.necromancy||0}:{}),...(kind==='shaman'?{bloodlustAuto:true,casterRank:s.teams[team]?.shamanism||0}:{}),...(kind==='shop'?{stock:shopStock(s,team)}:{}),...(production?{ancientProduction:1,uprooted:!!extra.uprooted,armorValue:d.armorValue}:{}),...(kind==='hero'?{heroClass,skills:[0,0,0,0],skillPoints:1,itemCooldown:0}:{}),...extra};if(['necromancer','shaman'].includes(kind)&&u.casterRank){u.maxHp+=40*u.casterRank;u.hp+=40*u.casterRank;}if(kind==='worker'&&s.wispHarvestVersion===1&&s.mode==='skirmish'&&f===2){Object.assign(u,{wispRules:1,hp:wispRules.hp,maxHp:wispRules.hp,damage:0,speed:wispRules.speed,armorValue:wispRules.armorValue},extra);}if(ancientWarRules.units[kind])Object.assign(u,{hp:d.hp,maxHp:d.hp,damage:d.damage,speed:d.speed,armorValue:d.armorValue},extra);if(kind==='workshop'&&warArmy(s,team))Object.assign(u,{huntersHallRules:1,hp:huntersHallType.hp,maxHp:huntersHallType.hp,damage:0,speed:0,armorValue:huntersHallType.armorValue},extra);const nature=natureUnit(s,u);if(nature)u.armorValue??=nature.armorValue;if(kind==='farm'&&nightArmy(s,team))Object.assign(u,{moonWellRules:1,mana:nightTechnology.units.emow.initialMana,rechargeAuto:true,armorValue:d.armorValue},extra);blessUnit(s,u);updateNightUnit(s,u);if(druidUnit(u)){u.druidRank=druidRank(s,team,druidRules.units[kind].research);const bonus=druidTrainingBonus(kind,u.druidRank);u.hp=d.hp+bonus.hp;u.maxHp=u.hp;u.damage=d.damage+bonus.damage;delete u.nightLevels;u.speed=d.speed;u.armorValue=d.armorValue;u.mana=d.initialMana;Object.assign(u,extra);updateNightUnit(s,u);}if(['druidtalon','druidcrow'].includes(kind))u.faerieAuto??=true;s.units.push(u);return u;
  }
  function create(mode='skirmish',options={}) {
    const map=validateMap(options.map||defaultMap(mode));mode=map.mode;if(options.heroes&&(!Array.isArray(options.heroes)||options.heroes.length!==2||!options.heroes.every(validHero)))throw Error('Invalid hero selection');
    const s={version:1,druidVersion:1,nightElfTechVersion:1,ancientWarVersion:1,productionAncientVersion:1,natureVersion:1,baseRulesVersion:1,baseTechVersion:1,heroLifecycleVersion:1,economyVersion:1,wispHarvestVersion:1,entangledVersion:1,itemShopVersion:2,moonUntil:0,sentinels:[],blight:[],rng:123456789,map,mode,frame:0,serial:0,units:[],corpses:[],resources:clone(map.props),clearedResources:[[],[]],teams:[0,1].map(i=>({gold:map.startingGold,wood:map.startingWood,faction:clamp(options.factions?.[i]??map.players[i].faction,0,3),ai:options.ai?.[i]??map.players[i].ai,upgrade:0,kills:0,tier:1,naturesBlessing:0,druidResearch:Object.fromEntries(Object.keys(druidRules.research).map(k=>[k,0])),nightResearch:Object.fromEntries(Object.keys(nightTechnology.research).map(key=>[key,0])),necromancy:0,shamanism:0,skeletalLongevity:0,skeletalMastery:0,cannibalize:0,portalGranted:false,heroClass:options.heroes?.[i]??map.players[i].heroClass})),events:[],pendingEvents:[],zones:[],winner:null,wave:0,tdPending:[],nextWave:40,lives:20,loot:[],quest:{stage:0,scouts:0,relic:false,boss:false},triggered:[],triggerState:map.triggers.map(()=>({count:0,last:-1,next:0})),announcement:'',announcements:['',''],explored:[Array(1024).fill(0),Array(1024).fill(0)],visible:[[],[]]};
    for(const team of [0,1]){
      if((mode==='td'||mode==='rpg')&&team===1)continue;
      const [x,z]=map.spawns[team],base=spawn(s,'hall',team,x,z);
      if(mode==='skirmish'){
        const undead=s.teams[team].faction===3,mine=undead&&s.resources.filter(r=>r.kind==='mine'&&r.amount>0&&distance(r,{x,z})<12&&!hauntedMine(s,r)&&!map.units.some(u=>u.kind==='hauntedmine'&&u.team!==team&&distance(u,r)<.01)).sort((a,b)=>distance(a,{x,z})-distance(b,{x,z}))[0];if(mine)spawn(s,'hauntedmine',team,mine.x,mine.z);
        if(s.teams[team].faction===2){const authored=r=>map.units.some(u=>u.kind==='entangledmine'&&u.team===team&&distance(u,r)<.01),r=s.resources.filter(r=>entangleTarget(s,base,r)&&!map.units.some(u=>['hauntedmine','entangledmine'].includes(u.kind)&&u.team!==team&&distance(u,r)<.01)).sort((a,b)=>Number(authored(b))-Number(authored(a))||distance(base,a)-distance(base,b))[0];if(r)startEntangle(s,base,r,true);}
        for(let i=0;i<(undead?3:5);i++){const p=undead&&mine?minePoint(mine,i):{x:x+(team?-1:1)*(4.5-[0,.7,.7,1.4,1.4][i]),z:z+[0,1.4,-1.4,.7,-.7][i]};spawn(s,'worker',team,p.x,p.z);}
        if(undead)spawn(s,'ghoul',team,x,z+(team?4:-4));
      }else if(mode==='moba'){
        spawn(s,'hero',team,x,z+(team?4:-4));
        for(let lane=0;lane<3;lane++){const route=lanePath(team,lane);for(const j of [1,2]){const p=route[j];spawn(s,'tower',team,p[0],p[1],{lane});}}
      }else if(mode==='rpg'){spawn(s,'hero',0,x+3,z-3,{maxHp:heroes[s.teams[0].heroClass].hp+250,hp:heroes[s.teams[0].heroClass].hp+250,damage:heroes[s.teams[0].heroClass].damage+17});}
      else{spawn(s,'worker',0,-16,-17);spawn(s,'hero',0,-22,-18);spawn(s,'tower',0,-12,-20);s.nextWave=120;}
    }
    if(mode==='skirmish'||mode==='moba')for(const p of [{x:-8,z:-6},{x:8,z:6},...map.props.filter(p=>p.kind==='camp')])spawn(s,'neutral',-1,p.x,p.z,{home:[p.x,p.z]});
    for(const p of map.units){if(p.kind==='entangledmine')continue;if(p.kind==='hauntedmine'){if(mode!=='skirmish'||s.teams[p.team]?.faction!==3)continue;const r=s.resources.find(r=>r.kind==='mine'&&distance(r,p)<.01);if(!r)throw Error('Haunted Mine must cover a gold deposit');const existing=hauntedMine(s,r);if(existing){if(existing.team!==p.team)throw Error('Gold deposit is already haunted');continue;}}const extra={...(p.heroClass!==undefined?{heroClass:p.heroClass}:{}),...(p.team===-1||p.tag?{home:[p.x,p.z]}:{}),...(p.tag?{tag:p.tag}:{})};if(mode==='rpg'){const hp=p.tag==='boss'?1900:p.tag==='keeper'?700:260;Object.assign(extra,{hp,maxHp:hp,damage:p.tag==='boss'?60:18,speed:2});}spawn(s,p.kind,p.team,p.x,p.z,extra);}
    for(const p of map.units.filter(p=>p.kind==='entangledmine')){if(mode!=='skirmish'||s.teams[p.team]?.faction!==2)continue;const r=s.resources.find(r=>r.kind==='mine'&&distance(r,p)<.01),existing=entangledMine(s,r);if(existing){if(existing.team!==p.team)throw Error('Entangled Gold Mine is already occupied');continue;}const base=s.units.filter(b=>b.team===p.team&&!b.entangleMine&&entangleTarget(s,b,r)).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(!base||!startEntangle(s,base,r,true))throw Error('Entangled Gold Mine requires a nearby unbound rooted Tree');}
    for(const r of s.resources)if(r.kind==='tree')r.hp=r.amount>0?nightTechnology.treeRules.hp:0;s.projectiles=[];s.projectileSerial=0;visibility(s);return s;
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
  function resourceAvailable(s,i,team=-1){const r=s.resources[i];return !!r&&(team<0||s.visible[team]?.[index(r.x,r.z)]?r.amount>0:!s.clearedResources?.[team]?.includes(i));}
  function resourceAt(s,x,z,team=-1,radius=2.8){let found=-1,best=radius;for(let i=0;i<s.resources.length;i++){const r=s.resources[i],d=Math.hypot(r.x-x,r.z-z);if(r.kind!=='camp'&&resourceAvailable(s,i,team)&&d<best){best=d;found=i;}}return found;}
  const treeFields=new WeakMap();
  function treeField(s,team){
    let cache=treeFields.get(s);if(!cache||cache.frame!==s.frame||cache.resources!==s.resources||cache.length!==s.resources.length){cache={frame:s.frame,resources:s.resources,length:s.resources.length,teams:[]};treeFields.set(s,cache);}if(cache.teams[team+1])return cache.teams[team+1];
    const trees=[],cells=Array.from({length:1024},()=>[]);for(let i=0;i<s.resources.length;i++){const r=s.resources[i];if(r.kind!=='tree'||!resourceAvailable(s,i,team))continue;trees.push(r);cells[index(r.x,r.z)].push(r);}return cache.teams[team+1]={trees,cells};
  }
  function treeClear(s,ax,az,bx,bz,radius=0,team=-1,escape=false){
    const field=treeField(s,team),reach=TREE_RADIUS+radius,[x0,z0]=cell(Math.min(ax,bx)-reach,Math.min(az,bz)-reach),[x1,z1]=cell(Math.max(ax,bx)+reach,Math.max(az,bz)+reach);
    const clear=r=>{const d=segmentDistance(r.x,r.z,[ax,az],[bx,bz]);if(d>=reach-1e-7)return true;const before=Math.hypot(ax-r.x,az-r.z),after=Math.hypot(bx-r.x,bz-r.z);return escape&&before<reach&&d>=before-1e-7&&after>before+.0001;};
    if((x1-x0+1)*(z1-z0+1)>32)return field.trees.every(clear);for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(!field.cells[z*32+x].every(clear))return false;return true;
  }
  function doodadClear(s,ax,az,bx,bz,radius=0,escape=false,ignore=-1){return (s.map.doodads||[]).every((d,i)=>{const size=doodads[d.kind].radius*d.scale;if(!size||i===ignore)return true;const reach=size+radius,dist=segmentDistance(d.x,d.z,[ax,az],[bx,bz]);if(dist>=reach-1e-7)return true;const before=Math.hypot(ax-d.x,az-d.z);return escape&&before<reach&&dist>=before-1e-7&&Math.hypot(bx-d.x,bz-d.z)>before+.0001;});}
  function obstacleClear(s,ax,az,bx,bz,radius=0,team=-1,escape=false){return treeClear(s,ax,az,bx,bz,radius,team,escape)&&doodadClear(s,ax,az,bx,bz,radius,escape);}
  function buildingSite(s,x,z,radius,team=-1){return flatSite(s.map,x,z,radius)&&obstacleClear(s,x,z,x,z,radius,team);}
  function solid(s,x,z,ignore=0,team=-1,radius=.35){if(Math.abs(x)+radius>30||Math.abs(z)+radius>30||!groundClear(s.map,x,z,x,z,radius,groundNavigation(s))||!obstacleClear(s,x,z,x,z,radius,team))return true;return s.units.some(u=>u.id!==ignore&&u.hp>0&&!mobile(u)&&(team<0||isVisible(s,team,u))&&Math.hypot(u.x-x,u.z-z)<(types[u.kind].radius||1)+radius);}
  const navigationCache=new WeakMap();
  function navigation(s,team=-1){
    let cache=navigationCache.get(s);if(!cache||cache.frame!==s.frame||cache.serial!==s.serial){cache={frame:s.frame,serial:s.serial,blocked:[]};navigationCache.set(s,cache);}if(cache.blocked[team+1])return cache.blocked[team+1];
    const blocked=Uint8Array.from(s.map.terrain,v=>v===1?1:0);
    for(const u of s.units)if(u.hp>0&&!mobile(u)&&(team<0||isVisible(s,team,u))){const radius=(types[u.kind].radius||1)+.35,[cx,cz]=cell(u.x,u.z),r=Math.ceil(radius/2)+1;for(let z=Math.max(0,cz-r);z<=Math.min(31,cz+r);z++)for(let x=Math.max(0,cx-r);x<=Math.min(31,cx+r);x++)if(Math.hypot(x*2-31-u.x,z*2-31-u.z)<radius)blocked[z*32+x]=1;}
    cache.blocked[team+1]=blocked;return blocked;
  }
  function routeSearch(s,u,goal=-1){
    const start=index(u.x,u.z),blocked=navigation(s,u.team),regions=groundNavigation(s),edgeCache=groundFrames.get(s).routeEdges,radius=movementRadius(u);let edges=edgeCache.get(radius);if(!edges){edges=new Uint8Array(4096);edgeCache.set(radius,edges);}const prev=new Int16Array(1024);prev.fill(-1);prev[start]=start;const cells=[start];
    for(let k=0;k<cells.length;k++){const n=cells[k],x=n%32,z=Math.floor(n/32);if(n===goal)break;
      for(const [direction,[dx,dz]] of [[1,0],[-1,0],[0,1],[0,-1]].entries()){const nx=x+dx,nz=z+dz,j=nz*32+nx;if(nx<1||nz<1||nx>30||nz>30||prev[j]!==-1||blocked[j]||!terrainEdge(s.map,n,j))continue;const edge=n*4+direction;edges[edge]||=groundClear(s.map,x*2-31,z*2-31,nx*2-31,nz*2-31,radius,regions)?1:2;if(edges[edge]===2||!obstacleClear(s,x*2-31,z*2-31,nx*2-31,nz*2-31,radius,u.team,true))continue;prev[j]=n;cells.push(j);}}
    return {start,prev,cells};
  }
  function path(s,u,tx,tz){
    const goal=index(tx,tz),{start,prev,cells}=routeSearch(s,u,goal);let found=start,best=Infinity;
    for(const n of cells){const d=Math.hypot(n%32-goal%32,Math.floor(n/32)-Math.floor(goal/32));if(d<best){best=d;found=n;}}
    const result=[];for(let n=found;n!==start;n=prev[n])result.push([n%32*2-31,Math.floor(n/32)*2-31]);return result.reverse();
  }
  function movementRadius(u){if(types[u.kind]?.collision)return types[u.kind].collision;return ancient(u)&&u.uprooted?ancientRules.radius:types[u.kind]?.flying?1:types[u.kind]?.attack==='siege'?.9:types[u.kind]?.model==='knight'?.7:.5;}
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
      const reserved=s.units.filter(u=>u.hp>0&&!u.inside&&u.speed&&u.team===members[0].team&&!(u.cyclone>0)&&!units.some(v=>v.id===u.id)&&!!types[u.kind].flying===flying).map(u=>{const p=orderPoint(s,u,u.waypoints?.at(-1)||(['move','attackMove','patrol'].includes(u.order?.type)?u.order:u));return {x:p.x,z:p.z,r:movementRadius(u)};});
      for(let i=0;i<members.length;i++){
        const u=members[i],row=Math.floor(i/columns),width=Math.min(columns,members.length-row*columns),side=(i%columns-(width-1)/2)*spacing,forward=((rows-1)/2-row)*spacing,ideal=[clamp(x+fz*side+fx*forward,-30,30),clamp(z-fx*side+fz*forward,-30,30)],r=movementRadius(u),search=flying?null:routeSearch(s,u),cells=flying?Array.from({length:1024},(_,j)=>j):search.cells;
        const available=(px,pz)=>Math.abs(px)+r<=30&&Math.abs(pz)+r<=30&&(flying||!solid(s,px,pz,u.id,u.team,r))&&reserved.every(v=>Math.hypot(px-v.x,pz-v.z)>=r+v.r+.3);
        let dest=null,best=Infinity;
        const consider=(px,pz)=>{const score=(px-ideal[0])**2+(pz-ideal[1])**2;if(score<best&&available(px,pz)){dest=[px,pz];best=score;}};
        const cellX=cell(...ideal)[0]*2-31,cellZ=cell(...ideal)[1]*2-31;
        if(flying||search.prev[index(...ideal)]!==-1&&groundClear(s.map,cellX,cellZ,...ideal,r,groundNavigation(s))&&obstacleClear(s,cellX,cellZ,...ideal,r,u.team,true))consider(...ideal);
        for(const j of cells)consider(j%32*2-31,Math.floor(j/32)*2-31);
        if(!dest)return null;
        reserved.push({x:dest[0],z:dest[1],r});orders.set(u.id,dest);
      }
    }
    return orders;
  }
  function walkClear(s,u,x,z){
    const radius=movementRadius(u);if(Math.abs(x)+radius>30||Math.abs(z)+radius>30)return false;if(types[u.kind].flying)return true;
    if(!groundClear(s.map,u.x,u.z,x,z,radius,groundNavigation(s))||!obstacleClear(s,u.x,u.z,x,z,radius,u.team,true))return false;
    return !s.units.some(v=>v.id!==u.id&&v.hp>0&&!mobile(v)&&(u.team<0||isVisible(s,u.team,v))&&(distance(u,v)<(types[v.kind].radius||1)+radius?Math.hypot(x-v.x,z-v.z)<=distance(u,v)+.0001:segmentDistance(v.x,v.z,[u.x,u.z],[x,z])<(types[v.kind].radius||1)+radius));
  }
  function traffic(s,u){const flying=types[u.kind].flying,height=flying?0:unitHeight(s,u);return s.units.filter(v=>v.id!==u.id&&v.hp>0&&!v.inside&&!(v.cyclone>0)&&mobile(v)&&!!types[v.kind].flying===!!flying&&(u.team<0||v.team===u.team||isVisible(s,u.team,v))&&(flying||Math.abs(height-unitHeight(s,v))<1.5||traversable(s.map,u.x,u.z,v.x,v.z)));}
  function trafficClear(u,near,x,z){
    const r=movementRadius(u);return near.every(v=>{if(v.id===u.id)return true;const radius=r+movementRadius(v),before=distance(u,v),after=Math.hypot(x-v.x,z-v.z);return before<radius-.0001?after>before+.0001:segmentDistance(v.x,v.z,[u.x,u.z],[x,z])>=radius-.0001;});
  }
  const trafficCache=new WeakMap();
  function trafficGrid(s,u){
    let cache=trafficCache.get(s);if(!cache||cache.frame!==s.frame||cache.serial!==s.serial){const waterKey=s.map.terrain.join(',');cache={frame:s.frame,serial:s.serial,waterKey,water:cache?.waterKey===waterKey?cache.water:null,teams:[],edges:new Map()};trafficCache.set(s,cache);}const flying=types[u.kind].flying,key=flying?3:u.team+1;if(cache.teams[key])return cache.teams[key];
    // MiYu: retain the water raster across ticks; visible buildings are applied to each team's fresh copy.
    if(!flying&&!cache.water){cache.water=new Uint8Array(121*121);for(let z=0;z<=120;z++)for(let x=0;x<=120;x++)if(s.map.terrain[Math.floor((z+4)/4)*32+Math.floor((x+4)/4)]===1)cache.water[z*121+x]=1;}
    const grid=flying?new Uint8Array(121*121):cache.water.slice();if(!flying){
      for(const v of s.units)if(v.hp>0&&!mobile(v)&&(u.team<0||isVisible(s,u.team,v))){const r=(types[v.kind].radius||1)+.4;for(let z=Math.max(0,Math.floor((v.z-r)*2)+60);z<=Math.min(120,Math.ceil((v.z+r)*2)+60);z++)for(let x=Math.max(0,Math.floor((v.x-r)*2)+60);x<=Math.min(120,Math.ceil((v.x+r)*2)+60);x++)if(Math.hypot(x/2-30-v.x,z/2-30-v.z)<r)grid[z*121+x]=1;}
      for(const v of treeField(s,u.team).trees)for(let z=Math.max(0,Math.floor((v.z-TREE_RADIUS)*2)+60);z<=Math.min(120,Math.ceil((v.z+TREE_RADIUS)*2)+60);z++)for(let x=Math.max(0,Math.floor((v.x-TREE_RADIUS)*2)+60);x<=Math.min(120,Math.ceil((v.x+TREE_RADIUS)*2)+60);x++)if(Math.hypot(x/2-30-v.x,z/2-30-v.z)<TREE_RADIUS)grid[z*121+x]=1;
      for(const v of s.map.doodads||[]){const r=doodads[v.kind].radius*v.scale;if(!r)continue;for(let z=Math.max(0,Math.floor((v.z-r)*2)+60);z<=Math.min(120,Math.ceil((v.z+r)*2)+60);z++)for(let x=Math.max(0,Math.floor((v.x-r)*2)+60);x<=Math.min(120,Math.ceil((v.x+r)*2)+60);x++)if(Math.hypot(x/2-30-v.x,z/2-30-v.z)<r)grid[z*121+x]=1;}
    }
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
    const r=movementRadius(u),edgeCache=trafficCache.get(s).edges;let edges=edgeCache.get(r);if(!edges){edges=new Uint8Array(121*121*8);edgeCache.set(r,edges);}
    const heap=[];
    const push=(node,score)=>{let i=heap.length;heap.push([node,score]);while(i){const p=(i-1)>>1;if(heap[p][1]<=score)break;heap[i]=heap[p];i=p;}heap[i]=[node,score];};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[i]=heap[c];i=c;}heap[i]=last;}return first[0];};
    push(start,0);let found=start,best=Math.hypot(u.x-x,u.z-z);
    // Bound one search; partial routes are continued from the next position.
    for(let visited=0;heap.length&&visited<2048;visited++){
      const n=pop();if(blocked[n]===2)continue;blocked[n]=2;const cx=(n%size)/2-30,cz=Math.floor(n/size)/2-30,point=n===start?u:{id:u.id,kind:u.kind,team:u.team,x:cx,z:cz},d=Math.hypot(point.x-x,point.z-z);if(d<best){best=d;found=n;}if(d<=stop&&(types[u.kind].flying||traversable(s.map,point.x,point.z,x,z))||d<=.75&&walkClear(s,point,x,z)&&trafficClear(point,near,x,z)){found=n;break;}
      for(let direction=0;direction<8;direction++){
        const [dx,dz]=trafficDirections[direction],nx=cx+dx/2,nz=cz+dz/2,j=(nz*2+60)*size+nx*2+60,next=cost[n]+Math.hypot(dx,dz)/2;if(nx<-30||nz<-30||nx>30||nz>30||blocked[j]||field.counts[j]>(Math.hypot(nx-u.x,nz-u.z)<r*2-.0001?1:0)||next>=cost[j])continue;
        if(n===start){if(!walkClear(s,point,nx,nz)||!trafficClear(point,near,nx,nz))continue;}else{if(!types[u.kind].flying){const edge=n*8+direction;edges[edge]||=groundClear(s.map,cx,cz,nx,nz,r,groundNavigation(s))?1:2;if(edges[edge]===2||!obstacleClear(s,cx,cz,nx,nz,r,u.team,true))continue;}if(!trafficClear(point,field.occupants[n]||[],nx,nz))continue;}prev[j]=n;cost[j]=next;push(j,next+Math.max(0,Math.hypot(nx-x,nz-z)-stop));
      }
    }
    const result=[];for(let n=found;n!==start;n=prev[n])result.push([n%size/2-30,Math.floor(n/size)/2-30]);result.reverse();const last=result.at(-1),end=last?{...u,x:last[0],z:last[1]}:u;if(walkClear(s,end,x,z)&&trafficClear(end,near,x,z))result.push([x,z]);return result.slice(0,1024);
  }
  function move(s,u,x,z,stop=.5){
    if(u.root>0||u.stun>0||u.cyclone>0)return false;
    if(!u.speed||Math.hypot(u.x-x,u.z-z)<=stop&&(types[u.kind].flying||traversable(s.map,u.x,u.z,x,z)))return true;
    const near=traffic(s,u);
    if(near.some(v=>distance(u,v)<movementRadius(u)+movementRadius(v)-.0001)||!types[u.kind].flying&&(!obstacleClear(s,u.x,u.z,u.x,u.z,movementRadius(u),u.team)||s.units.some(v=>v.id!==u.id&&v.hp>0&&!mobile(v)&&(u.team<0||isVisible(s,u.team,v))&&distance(u,v)<(types[v.kind].radius||1)+.35))){
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
  function population(s,team){const us=s.units.filter(u=>u.team===team&&(u.hp>0||s.mode==='skirmish'&&u.kind==='hero')&&!u.consumed);return {used:us.reduce((n,u)=>n+(u.summoned?0:types[u.kind].food)+u.queue.reduce((a,q)=>a+(q.research||q.revive?0:types[q.kind].food),0),0),cap:Math.min(s.mode==='skirmish'?100:80,us.reduce((n,u)=>n+(u.built===1?(u.kind==='hall'?(s.mode==='skirmish'?[12,10,10,10][s.teams[team].faction]:14):types[u.kind].supply|| (u.kind==='farm'?(s.mode==='skirmish'?[6,10,10,10][s.teams[team].faction]:8):0)):0),0))};}
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
        if(Math.abs(x)>30||Math.abs(z)>30||solid(s,x,z)||!traversable(s.map,corpse.x,corpse.z,x,z)||!s.visible[u.team][index(x,z)]||positions.some(p=>Math.hypot(p[0]-x,p[1]-z)<radius*2+.05)||s.units.some(v=>v.hp>0&&!v.inside&&mobile(v)&&!types[v.kind].flying&&Math.hypot(v.x-x,v.z-z)<movementRadius(v)+radius+.05))continue;
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
    if(!types[v.kind].speed||v.order?.type==='townPortal'&&v.team!==u.team||['frenzy','cripple','bloodlust'].includes(c.spell)&&!types[v.kind].organic||c.spell==='cripple'&&v.team===u.team||c.spell==='bloodlust'&&v.team!==u.team||c.spell==='lightningShield'&&types[v.kind].flying||types[v.kind].magicImmune||v.itemMagicImmune>0)return 'Invalid spell target';
    const eventStart=s.events.length;u.mana-=spell.cost;u[c.spell+'Cd']=spell.cooldown;u.castLeft=.8;u.castYaw=Math.atan2(v.x-u.x,v.z-u.z);
    if(c.spell==='frenzy'){v.frenzy=spell.duration;v.frenzySource={id:u.id,kind:u.kind,team:u.team,x:u.x,z:u.z};}
    if(c.spell==='cripple')v.cripple=v.kind==='hero'?10:spell.duration;
    if(c.spell==='bloodlust')v.bloodlust=spell.duration;
    if(c.spell==='lightningShield'){v.lightningShield=spell.duration;v.lightningSource={id:u.id,kind:u.kind,team:u.team,x:u.x,z:u.z};}
    if(c.spell==='purge'){
      for(const key of dispellable)v[key]=0;delete v.frenzySource;delete v.lightningSource;delete v.faerieTeam;visibility(s);
      if(v.team!==u.team){v.purgeLeft=v.kind==='hero'?5:spell.duration;v.root=.2;}
      if(v.summoned&&v.team!==u.team)damage(s,u,v,400,'spell');
    }
    s.events.push({type:'spell',spell:c.spell,art:c.spell==='purge'?'nature':c.spell==='lightningShield'?'arcane':c.spell==='bloodlust'?'fire':'shadow',x:v.x,z:v.z,team:u.team});if(!simulating.has(s))(s.pendingEvents??=[]).push(...s.events.slice(eventStart));return null;
  }
  function command(s,team,c){
    if(s.winner!==null||!c||![0,1].includes(team))return 'Match is finished';
    updateTechnology(s);
    if(c.append!==undefined&&typeof c.append!=='boolean'||c.append&&!['move','attackMove','build','construct','repair','gather'].includes(c.type))return 'Only movement and worker jobs can be queued';
    const selected=s.units.filter(u=>canControl(s,team,u)&&u.hp>0&&(!u.inside||c.append&&u.kind==='worker'&&!u.consumed)&&Array.isArray(c.ids)&&c.ids.slice(0,40).includes(u.id));if(selected.length&&selected.every(u=>u.order?.type==='townPortal')&&c.type!=='stop')return 'Town Portal is channeling; Stop cancels it';
    const own=selected.filter(u=>u.order?.type!=='townPortal'||c.type==='stop'),u=own[0],point=Number.isFinite(c.x)&&Number.isFinite(c.z)&&Math.abs(c.x)<=30&&Math.abs(c.z)<=30;
    if(own.some(v=>v.cyclone>0))return 'Cyclone prevents orders';
    if(own.some(v=>v.druidShift))return 'Druid transformation is uninterruptible';
    if(own.some(v=>v.ancientShift))return 'Ancient is changing between Root and Uproot';
    if(c.type==='detonate'){
      if(!u||!wisp(s,u)||u.built!==1||u.inside||u.stun>0||u.sanctuary||!point)return 'Select an available Wisp and a ground destination';
      u.order={type:'detonate',x:c.x,z:c.z};u.waypoints=[];u.path=[];u.pathAt=-100;u.gatherCd=0;delete u.dest;delete u.workResume;return null;
    }
    if(c.type==='entangle'){
      const r=s.resources[c.resource];if(!ancientMain(u)||u.built!==1||u.entangleMine||u.entangleCast||!Number.isInteger(c.resource)||!r||!s.visible[team][index(r.x,r.z)]||!entangleTarget(s,u,r))return 'Select a rooted Tree and an unused visible Gold Mine within range';
      if(s.units.length>=LIMIT)return 'Unit capacity reached';u.entangleCast={resource:c.resource,left:entangledRules.castTime};u.order=null;u.waypoints=[];u.path=[];return null;
    }
    if(c.type==='cancelEntangle'){
      if(u?.entangleCast){delete u.entangleCast;return null;}const b=u?.kind==='entangledmine'?u:s.units.find(v=>v.id===u?.entangleMine&&v.hp>0);
      if(!b||b.built===1)return 'No unfinished Entangle to cancel';destroyEntangle(s,b);return null;
    }
    if(c.type==='loadWisp'){
      const w=s.units.find(v=>v.id===c.target&&v.hp>0&&v.team===team&&!v.inside&&miningWisp(s,v));if(u?.kind!=='entangledmine'||!w||!Number.isSafeInteger(c.target))return 'Select a friendly Wisp to load';return command(s,team,{type:'gather',ids:[w.id],resource:u.mineResource});
    }
    if(c.type==='unloadWisps'){
      if(u?.kind!=='entangledmine'||u.built!==1||c.target!==undefined&&!Number.isSafeInteger(c.target))return 'Select a completed Entangled Gold Mine';return unloadWisps(s,u,c.target);
    }
    if(c.type==='uproot'||c.type==='rootAncient'){const all=own.filter(ancient),uprooted=c.type==='uproot',targets=all.filter(v=>v.uprooted!==uprooted);if(s.mode!=='skirmish'||!all.length||all.some(v=>v.built!==1||v.baseUpgrade||v.casterResearch))return 'Select completed idle Night Elf Ancients';if(!targets.length)return uprooted?'Ancient is already uprooted':'Ancient is already rooted';if(!uprooted&&targets.some(v=>!rootSite(s,v,targets)))return 'Root requires clear flat dry ground for the entire footprint';for(const v of targets){if(uprooted){delete v.entangleCast;const mine=s.units.find(b=>b.id===v.entangleMine&&b.hp>0);if(mine)destroyEntangle(s,mine);}v.ancientShift={uprooted,left:ancientRules.morph};v.speed=0;v.order=null;v.waypoints=[];v.path=[];v.pathAt=-100;delete v.dest;}navigationCache.delete(s);trafficCache.delete(s);return null;}
    if(c.type==='eatTree'){const r=s.resources[c.resource];if(!ancient(u)||!u.uprooted||u.built!==1||!Number.isInteger(c.resource)||r?.kind!=='tree'||r.amount<=0||!s.visible[team][index(r.x,r.z)])return 'Select an uprooted Ancient and a visible living tree';u.order={type:'eatTree',resource:c.resource};u.path=[];u.pathAt=-100;u.waypoints=[];return null;}
    if(own.some(v=>v.sanctuary))return 'Unit is recovering in sanctuary';
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
    if(c.type==='druidSpell')return orderDruidSpell(s,u,c);
    if(c.type==='faerieAuto'){if(!u||!['druidtalon','druidcrow'].includes(u.kind)||typeof c.enabled!=='boolean')return 'Select a Druid of the Talon';u.faerieAuto=c.enabled;return null;}
    if(c.type==='druidMorph')return startDruidMorph(s,u);
    if(c.type==='druidResearch'){const option=druidResearchOption(s,u,c.upgrade);if(!option?.enabled)return 'Select a rooted Ancient with resources, required technology and unfinished Druid research';pay(s,team,option.gold,option.wood);u.queue.push({research:c.upgrade,rank:option.rank,left:option.time});return null;}
    if(c.type==='casterSpell')return castUnit(s,u,c);
    if(c.type==='bloodlustAuto'){if(!u||u.kind!=='shaman'||typeof c.enabled!=='boolean')return 'Select a shaman';u.bloodlustAuto=c.enabled;return null;}
    if(c.type==='hide'){if(!u||!shadowMeld(u)||s.teams[team].faction!==2||!isNight(s))return 'Only Wildwood archers can hide at night';u.order=null;u.waypoints=[];u.path=[];u.hiding=!u.hiding;return null;}
    if(c.type==='guardTower'){if(!u||u.kind!=='scouttower'||u.built!==1||u.guardTowerUpgrade)return 'Select an idle completed Scout Tower';if(!pay(s,team,100,70))return 'Not enough resources';u.guardTowerUpgrade={left:30};return null;}
    if(c.type==='cancelGuardTowerUpgrade'){if(!u?.guardTowerUpgrade)return 'No Guard Tower upgrade to cancel';s.teams[team].gold+=75;s.teams[team].wood+=52;delete u.guardTowerUpgrade;return null;}
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
        const r=s.resources[c.resource],mine=hauntedMine(s,r),entangled=entangledMine(s,r);if(!resourceAvailable(s,c.resource,team))return 'Resource is depleted';
        if(r.kind==='mine'&&members.some(v=>miningWisp(s,v))){if(!entangled||entangled.team!==team)return 'Entangle a friendly Gold Mine first';if(members.some(v=>!miningWisp(s,v)))return 'Entangled Gold Mines accept Wisps only';if(!c.append&&wispWorkers(s,r).filter(w=>!members.includes(w)).length+members.length>entangledRules.capacity)return 'Entangled Gold Mine supports five Wisps';}
        else if(entangled)return 'Gold mine is entangled';
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
        if(c.type==='gather'&&miningWisp(s,v)&&s.resources[c.resource].kind==='mine'){const occupied=wispWorkers(s,s.resources[c.resource]).filter(w=>w.id!==v.id);next.mineSlot=Array.from({length:entangledRules.capacity},(_,i)=>i).find(i=>!occupied.some(w=>w.order.mineSlot===i));}
        if(c.type==='stop')delete v.entangleCast;delete v.druidCastLeft;delete v.druidCastSpell;
        if(wisp(s,v))v.gatherCd=0;delete v.workResume;v.path=[];v.pathAt=-100;v.waypoints=[];v.order=next;
      });return null;
    }
    if(c.type==='build'){
      if(c.kind==='shop'&&s.mode!=='skirmish')return 'Item shops can be built in melee games';
      if(s.mode==='moba'||!u||u.kind!=='worker'||!['hall','farm','barracks','tower','frosttower','flametower','altar','workshop','temple','spiritlodge','hauntedmine','shop','ancientlore','ancientwind'].includes(c.kind)||!point)return 'Select a worker and a building site';
      if(s.mode==='skirmish'&&s.teams[team].faction===3&&['tower','frosttower','flametower'].includes(c.kind))return 'Upgrade a Ziggurat to build Revenant defenses';
      if(c.kind==='hauntedmine'){
        if(s.economyVersion!==1)return 'Start a new match to use Haunted Gold Mines';
        if(s.mode!=='skirmish'||s.teams[team].faction!==3)return 'Only Revenant acolytes can haunt a gold mine';
        const r=s.resources.find(r=>r.kind==='mine'&&r.amount>0&&distance(r,c)<2.8&&s.visible[team][index(r.x,r.z)]);if(!r)return 'Choose a visible gold deposit';c={...c,x:r.x,z:r.z};if(hauntedMine(s,r)||entangledMine(s,r)||s.units.some(v=>v.hp>0&&v.entangleCast?.resource===s.resources.indexOf(r)))return 'Gold deposit is already occupied';
        if([0,1,2,3,4].some(i=>{const p=minePoint(r,i);return solid(s,p.x,p.z)||!flatSite(s.map,p.x,p.z,.5);}))return 'Keep all five mining stations clear';
      }else if(s.resources.some(r=>r.kind==='mine'&&r.amount>0&&distance(r,c)<types[c.kind].radius+(hauntedMine(s,r)?2.9:2)))return 'Keep gold deposits clear';
      if(druidRules.buildings[c.kind]&&(!druidProducer(s,{kind:c.kind,team})||!druidBuildingRequirement(s,team,c.kind)))return 'Requires the Night Elf Tree of Ages'+(c.kind==='ancientlore'?" and Hunter's Hall":'');
      if(casterTraining[c.kind]&&(s.mode!=='skirmish'||s.teams[team].faction!==casterTraining[c.kind].faction||s.teams[team].tier<2))return types[c.kind].label+' requires its faction stronghold tier 2';
      if(c.append){const error=queueError([u]);if(error)return error;if(!buildingSite(s,c.x,c.z,types[c.kind].radius,team))return 'Building footprint requires clear flat dry ground';const next={type:'build',kind:c.kind,x:c.x,z:c.z};if(u.order)u.waypoints.push(next);else{u.order=next;u.path=[];u.pathAt=-100;}return null;}
      if(c.kind==='workshop'&&!warArmy(s,team)&&(s.mode!=='skirmish'||s.teams[team].tier<2))return 'Siege workshop requires stronghold tier 2';
      if(s.mode==='skirmish'&&s.teams[team].faction===3&&!['hall','hauntedmine'].includes(c.kind)&&!s.units.some(v=>v.team===team&&v.hp>0&&v.built===1&&['hall','altar'].includes(v.kind)&&distance(v,c)<=(v.kind==='hall'?18:12))&&!inBlight(s,c.x,c.z,team))return 'Summon inside stronghold or altar territory';
      const d=buildingType(s,c.kind,team);if(!buildingSite(s,c.x,c.z,d.radius,team))return 'Building footprint requires clear flat dry ground';if(distance(u,c)>15||solid(s,c.x,c.z)||s.units.some(v=>v.hp>0&&!mobile(v)&&distance(v,c)<(types[v.kind].radius||1)+d.radius+.8))return 'Site blocked or too far from worker';
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
      if(!u||u.built===1||!u.construction)return 'Select an unfinished building';if(u.kind==='entangledmine'){destroyEntangle(s,u);return null;}const c=u.construction;s.teams[team].gold+=Math.floor(c.paidGold*.75);s.teams[team].wood+=Math.floor(c.paidWood*.75);u.hp=0;finishWork(s,u,true);hallDefeat(s,u);return null;
    }
    if(c.type==='train'){
      if(s.mode!=='skirmish'||!u||u.built<1||!trainable(s,u).includes(c.kind)||u.queue.length>=3||u.casterResearch||u.cannibalizeResearch||u.baseUpgrade)return 'Select the appropriate completed production building';
      const requirement=trainingRequirement(s,c.kind,team);if(requirement)return requirement;
      if(!warProducer(s,u)&&(u.kind==='workshop'||u.kind==='barracks'&&trainable(s,u).indexOf(c.kind)>=2)&&s.teams[team].tier<2)return 'Upgrade your stronghold to tier 2';
      if(types[c.kind].flying&&s.teams[team].tier<3)return 'Flying creatures require stronghold tier 3';
      const heroClass=c.heroClass===undefined?s.teams[team].heroClass??0:c.heroClass;
      if(c.kind==='hero'){if(!validHero(heroClass))return 'Invalid hero type';const roster=heroRoster(s,team),queued=heroQueued(s,team);if(roster.some(v=>v.heroClass===heroClass)||queued.some(q=>q.heroClass===heroClass))return 'Only one hero of each type';if(roster.length+queued.length>=3)return 'Maximum three heroes';if(roster.length+queued.length>=s.teams[team].tier)return 'Advance your stronghold to tier '+(roster.length+queued.length+1);}
      const d=c.kind==='hero'?heroRecruitment(s,team):trainType(s,c.kind,team),p=population(s,team);if(p.used+d.food>p.cap)return 'Build more supply lodges';if(s.units.length>=LIMIT)return 'Unit capacity reached';
      if(!pay(s,team,d.gold,d.wood))return 'Not enough resources';u.queue.push({kind:c.kind,left:d.time,...(c.kind==='hero'?{heroClass,paidGold:d.gold,paidWood:d.wood}:{})});return null;
    }
    if(c.type==='revive'){
      const h=heroRoster(s,team).find(v=>v.id===c.target&&v.hp<=0),queued=s.units.some(v=>v.hp>0&&v.queue.some(q=>q.revive===c.target));
      if(s.mode!=='skirmish'||u?.kind!=='altar'||u.built!==1||u.queue.length>=3||!h||queued)return 'Select a completed altar and a fallen hero awaiting revival';
      const d=heroRevival(h);if(!pay(s,team,d.gold))return 'Not enough gold';u.queue.push({kind:'hero',heroClass:h.heroClass,revive:h.id,left:d.time,paidGold:d.gold,paidWood:0});return null;
    }
    if(c.type==='rally'){if(!u||!trainable(s,u).length||!point)return 'Select a production building and rally destination';u.rally={x:c.x,z:c.z};return null;}
    if(c.type==='cancelTrain'){if(!u||!Number.isInteger(c.index)||c.index<0||c.index>=u.queue.length)return 'Select a queued unit';const q=u.queue.splice(c.index,1)[0],d=q.research?researchPrice(s,q):trainType(s,q.kind,team);s.teams[team].gold+=q.paidGold??d.gold;s.teams[team].wood+=q.paidWood??d.wood;return null;}
    if(c.type==='purgeSentinel'){
      const owl=s.sentinels.find(o=>o.source===c.target),r=casterSpells.purge;if(u?.kind!=='shaman'||u.built!==1||u.stun>0||u.purgeCd>0||u.mana<r.cost||!owl||!owl.perched||owl.team===team||!isVisiblePoint(s,team,owl)||distance(u,owl)>r.range)return 'Select a Shaman and a nearby visible enemy Sentinel';u.mana-=r.cost;u.purgeCd=r.cooldown;u.castLeft=.8;u.castYaw=Math.atan2(owl.x-u.x,owl.z-u.z);s.sentinels=s.sentinels.filter(o=>o!==owl);const event={type:'spell',spell:'purge',art:'nature',x:owl.x,z:owl.z,team};s.events.push(event);if(!simulating.has(s))(s.pendingEvents??=[]).push(event);visibility(s);return null;
    }
    if(c.type==='sentinel'){
      const tree=s.resources[c.resource];if(!u||nightSource(s,u)!=='esen'||!nightRank(s,team,'Resc')||u.sentinelUsed||!Number.isInteger(c.resource)||tree?.kind!=='tree'||tree.amount<=0||!isVisiblePoint(s,team,tree)||u.stun>0)return 'Select an unused Huntress and a visible tree after researching Sentinel';
      u.order={type:'sentinel',resource:c.resource};u.waypoints=[];u.path=[];delete u.weaponWindup;delete u.hiding;return null;
    }
    if(c.type==='attackTree'||c.type==='attackGround'){
      const tree=s.resources[c.resource];if(!u||u.kind!=='glaivethrower'||!nightArmy(s,team)||u.built!==1||u.stun>0||c.type==='attackTree'&&(!nightRank(s,team,'Repb')||!Number.isInteger(c.resource)||tree?.kind!=='tree'||tree.amount<=0||!isVisiblePoint(s,team,tree))||c.type==='attackGround'&&!point)return 'Select a Glaive Thrower and valid ground or a visible tree after Vorpal Blades';
      u.order=c.type==='attackTree'?{type:c.type,resource:c.resource}:{type:c.type,x:c.x,z:c.z};u.waypoints=[];u.path=[];delete u.weaponWindup;return null;
    }
    if(c.type==='nightResearch'){
      const r=typeof c.upgrade==='string'&&Object.hasOwn(nightTechnology.research,c.upgrade)?nightTechnology.research[c.upgrade]:null,level=r?.levels[nightRank(s,team,c.upgrade)];
      if(!u||!r||!level||r.building!==nightBuilding(s,u)||u.built!==1||u.uprooted||u.ancientShift||u.baseUpgrade||u.entangleCast||u.queue.length>=3||nightQueued(s,team,c.upgrade))return 'Select a rooted research building with unfinished Night Elf research';
      if(!nightRequirement(s,team,level))return 'Requires '+level.requires.map(r=>({edob:"Hunter's Hall",etoa:'Tree of Ages',etoe:'Tree of Eternity'}[r.id])).join(', ');
      if(!pay(s,team,level.gold,level.wood))return 'Not enough resources';u.queue.push({research:c.upgrade,rank:level.rank,left:level.time});return null;
    }
    if(c.type==='moonRechargeAuto'){if(u?.moonWellRules!==1||u.built!==1)return 'Select a completed Moon Well';u.rechargeAuto=!u.rechargeAuto;return null;}
    if(c.type==='moonRecharge'){if(u?.moonWellRules!==1||u.built!==1||!moonRestore(s,u,s.units.find(v=>v.id===c.target)))return 'Select a nearby injured friendly organic unit';return null;}
    if(c.type==='naturesBlessing'){
      if(!u||!natureResearcher(s,u)||u.built!==1||u.uprooted||u.baseUpgrade||u.entangleCast||u.queue.length>=3||!natureTechnology(s,team)||s.teams[team].naturesBlessing||natureQueued(s,team))return 'Select a rooted Tree with tier 2 and unfinished Nature\'s Blessing research';
      if(!pay(s,team,natureRules.gold,natureRules.wood))return 'Not enough resources';u.queue.push({research:'naturesBlessing',left:natureRules.time});return null;
    }
    if(c.type==='skeletonResearch'){
      const t=s.teams[team],r=typeof c.upgrade==='string'&&Object.hasOwn(skeletonResearch,c.upgrade)?skeletonResearch[c.upgrade]:null;if(s.mode!=='skirmish'||!r||t.faction!==3||u?.kind!=='temple'||u.built!==1||u.queue.length||u.casterResearch||t[r.field]||t.tier<r.tier||s.units.some(v=>v.team===team&&v.hp>0&&v.casterResearch?.upgrade===c.upgrade))return 'Select an idle Temple with the required tier and unfinished research';
      if(!pay(s,team,r.gold,r.wood))return 'Not enough resources';u.casterResearch={upgrade:c.upgrade,left:r.time};return null;
    }
    if(c.type==='casterResearch'){
      const t=s.teams[team],school=casterTraining[u?.kind],rank=(t[school?.field]||0)+1;if(s.mode!=='skirmish'||!school||t.faction!==school.faction||u.built!==1||u.queue.length||u.casterResearch||rank>2||s.units.some(v=>v.team===team&&v.kind===u.kind&&v.hp>0&&v.casterResearch?.rank))return 'Select an idle caster building ready to research';
      if(rank===2&&t.tier<3)return 'Master Training requires stronghold tier 3';const wood=rank===1?50:150;if(!pay(s,team,100,wood))return 'Not enough resources';u.casterResearch={rank,left:school.times[rank-1]};return null;
    }
    if(c.type==='cancelCasterResearch'){if(!u?.casterResearch)return 'No caster research to cancel';const r=skeletonResearch[u.casterResearch.upgrade];s.teams[team].gold+=r?r.gold:100;s.teams[team].wood+=r?r.wood:u.casterResearch.rank===1?50:150;delete u.casterResearch;return null;}
    if(c.type==='tech'){if(s.mode!=='skirmish'||u?.kind!=='hall'||u.uprooted||u.ancientShift||u.built!==1||u.upgradeTier>=3||u.baseUpgrade||u.entangleCast||u.queue.length)return 'Select an idle main base ready to advance';const tier=u.upgradeTier+1,r=mainBase(s,u,tier);if(!pay(s,team,r.gold,r.wood))return 'Not enough resources';u.baseUpgrade={tier,left:r.time};return null;}
    if(c.type==='cancelTech'){if(!u?.baseUpgrade)return 'Select a main base with an upgrade to cancel';const r=u.baseUpgrade,d=r.legacy?{gold:250*u.upgradeTier,wood:120*u.upgradeTier}:mainBase(s,u,r.tier);s.teams[team].gold+=Math.floor(d.gold*.75);s.teams[team].wood+=Math.floor(d.wood*.75);delete u.baseUpgrade;return null;}
    if(c.type==='zigguratUpgrade'){const r=typeof c.kind==='string'&&Object.hasOwn(zigguratUpgrades,c.kind)?zigguratUpgrades[c.kind]:null;if(s.mode!=='skirmish'||!r||s.teams[team].faction!==3||u?.kind!=='farm'||u.built!==1||u.zigguratUpgrade)return 'Select a completed Revenant Ziggurat';if(!pay(s,team,r.gold,r.wood))return 'Not enough resources';u.zigguratUpgrade={kind:c.kind,left:r.time};return null;}
    if(c.type==='cancelZigguratUpgrade'){if(!u?.zigguratUpgrade)return 'No Ziggurat upgrade to cancel';const r=zigguratUpgrades[u.zigguratUpgrade.kind];s.teams[team].gold+=Math.floor(r.gold*.75);s.teams[team].wood+=Math.floor(r.wood*.75);delete u.zigguratUpgrade;return null;}
    if(c.type==='towerUpgrade'){if(!u||types[u.kind].model!=='tower'||types[u.kind].supply||u.built<1||u.level>=3||productionAncient(u))return 'Select a completed tower below level 3';if(!pay(s,team,100*u.level))return 'Not enough gold';u.level++;u.damage+=types[u.kind].damage*.65;u.maxHp+=200;u.hp=Math.min(u.maxHp,u.hp+200);return null;}
    if(c.type==='sell'){if(s.mode!=='td'||!u||types[u.kind].model!=='tower')return 'Select a defense tower';s.teams[team].gold+=Math.floor((types[u.kind].gold+100*(u.level-1)*u.level/2)*.65);u.hp=0;return null;}
    if(c.type==='upgrade'){if(!u||u.kind!=='barracks'||u.built<1||u.uprooted||warProducer(s,u))return 'Select a completed barracks';if(s.teams[team].upgrade>=s.teams[team].tier)return 'Advance your stronghold for more research';if(!pay(s,team,180+s.teams[team].upgrade*100,100))return 'Not enough resources';s.teams[team].upgrade++;return null;}
    if(c.type==='buy'){
      const item=Number.isInteger(c.item)?items[c.item]:null;if(!u||u.kind!=='hero'||!item)return 'Select a hero and an item';if(c.shop!==undefined&&(!Number.isSafeInteger(c.shop)||c.shop<1))return 'Select an item shop';const shop=shopFor(s,u,c.shop,c.item);if(!shop)return s.mode==='skirmish'&&s.itemShopVersion>=1?'Visit a completed friendly item shop':'Visit your stronghold shop';
      const offer=shopOffers(s,shop).find(o=>o.item===c.item);if(!offer)return 'This shop does not sell that item';if((s.teams[team].tier||1)<offer.tier)return 'Item requires stronghold tier '+offer.tier;const next=[...u.inventory],uses=inventoryUses(u);for(const part of item.recipe||[]){const slot=next.indexOf(part);if(slot<0)return 'Requires '+item.recipe.map(i=>items[i].name).join(' + ');next.splice(slot,1);uses.splice(slot,1);}if(next.length>=6)return 'Inventory is full';
      if(shop.kind==='shop'&&shop.stock[c.item].count<=0)return 'Item is out of stock';if(!pay(s,team,item.gold,item.wood||0))return item.wood?'Not enough gold or lumber':'Not enough gold';if(shop.kind==='shop'){const stock=shop.stock[c.item];stock.count--;if(stock.left<=0)stock.left=offer.restock;}setInventory(u,[...next,c.item],[...uses,item.charges||0]);return null;
    }
    if(['dropItem','sellItem','useItem'].includes(c.type)){
      if(!u||u.kind!=='hero'||!Number.isInteger(c.slot)||c.slot<0||c.slot>=u.inventory.length||!Number.isInteger(c.item)||u.inventory[c.slot]!==c.item)return 'Select a current inventory slot';
      const item=items[c.item],next=u.inventory.filter((_,i)=>i!==c.slot),uses=inventoryUses(u),nextUses=uses.filter((_,i)=>i!==c.slot);
      if(c.type==='sellItem'){if(!shopFor(s,u))return s.mode==='skirmish'&&s.itemShopVersion>=1?'Visit a completed friendly item shop':'Visit your stronghold shop';s.teams[team].gold+=Math.floor(itemValue(c.item)/2*(item.charges?uses[c.slot]/item.charges:1));}
      if(c.type==='dropItem'){if(s.loot.length>=LIMIT-64)return 'Too many items on the ground';s.loot.push({id:++s.serial,x:u.x,z:u.z,item:c.item,relic:false,manual:true,...(item.charges?{uses:uses[c.slot]}:{})});}
      if(c.type==='useItem'){
        if(c.item>=racialCatalog.firstItem)return useRacialItem(s,u,c);
        if(item.townPortal){
          if(u.stun>0||u.root>0)return 'Hero cannot use Town Portal while disabled';
          const bases=s.units.filter(v=>rootedBase(v)&&v.team===team&&v.hp>0&&v.built===1),base=c.target!==undefined?bases.find(v=>v.id===c.target):point?bases.filter(v=>distance(v,c)<=townPortal.baseRange).sort((a,b)=>distance(a,c)-distance(b,c)||a.id-b.id)[0]:bases.sort((a,b)=>b.level-a.level||a.id-b.id)[0];
          if(!base||c.target!==undefined&&!Number.isSafeInteger(c.target)||point&&distance(base,c)>townPortal.baseRange||!point&&(c.x!==undefined||c.z!==undefined))return 'Select a completed friendly main base';
          u.order={type:'townPortal',target:base.id,x:point?c.x:base.x,z:point?c.z:base.z,left:townPortal.time};u.path=[];u.pathAt=-100;u.waypoints=[];delete u.dest;setInventory(u,next,nextUses);const e={type:'spell',art:'townPortal',slot:2,heroClass:u.heroClass,x:u.x,z:u.z,team};s.events.push(e);if(!simulating.has(s))(s.pendingEvents??=[]).push(e);return null;
        }
        if(!item.restoreHp&&!item.restoreMana)return 'This item grants a passive bonus';if(u.stun>0||u.itemCooldown>0)return 'Item is not ready';if(item.restoreHp&&u.hp>=u.maxHp||item.restoreMana&&u.mana>=150+u.level*10)return 'Already at full health or mana';
        if(item.restoreHp)u.hp=Math.min(u.maxHp,u.hp+item.restoreHp);if(item.restoreMana)u.mana=Math.min(150+u.level*10,u.mana+item.restoreMana);u.itemCooldown=10;const event={type:'spell',slot:1,heroClass:u.heroClass,x:u.x,z:u.z,team};s.events.push(event);if(!simulating.has(s))(s.pendingEvents??=[]).push(event);
      }
      setInventory(u,next,nextUses);return null;
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
      if(distance(u,target)>spell.range)return 'Target outside spell range';if(spell.kind==='blink'&&(u.root>0||solid(s,c.x,c.z,u.id,u.team,movementRadius(u))))return 'Blink destination is blocked or hero is rooted';
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
          if(!isVisible(s,team,v)||v.order?.type==='townPortal'||v.itemMagicImmune>0||types[v.kind].magicImmune)continue;if(spell.kind==='cone'){const dx=c.x-u.x,dz=c.z-u.z,dist=distance(u,v);if(dist>spell.radius||dist>.01&&(dx*(v.x-u.x)+dz*(v.z-u.z))/(Math.max(.01,Math.hypot(dx,dz))*dist)<.65)continue;}
          damage(s,u,v,power,'spell');if(v.hp>0){if(spell.slow)v.slow=spell.slow;if(spell.root)v.root=spell.root+(rank-1)*.5;if(spell.stun)v.stun=spell.stun+(rank-1)*.25;}
        }
      }
      if(spell.kind!=='zone')s.events.push({type:'spell',x:target.x,z:target.z,slot:c.slot,heroClass:u.heroClass,team});if(!simulating.has(s))(s.pendingEvents??=[]).push(...s.events.slice(eventStart));return null;
    }
    return 'Unknown command';
  }
  function rootSite(s,u,forming=[]){const radius=types[u.kind].radius;return buildingSite(s,u.x,u.z,radius,u.team)&&s.units.every(v=>v.id===u.id||v.hp<=0||v.inside||types[v.kind].flying||distance(u,v)>=radius+(mobile(v)&&!forming.includes(v)?movementRadius(v):types[v.kind].radius||1)+.05);}
  function hallDefeat(s,b){if(b.kind==='hall'&&s.mode!=='td'&&(s.mode!=='skirmish'||!s.units.some(v=>v.team===b.team&&v.kind==='hall'&&v.hp>0)))s.winner=1-b.team;}
  function assignWork(w,b,type){if(!w.workResume&&w.order?.type==='gather'){w.workResume=clone(w.order);delete w.workResume.mineSlot;delete w.workResume.bonded;}if(w.order?.bonded)w.gatherCd=0;w.order={type,target:b.id};w.waypoints=[];w.path=[];w.pathAt=-100;}
  function advanceOrder(s,u){
    if(u.order?.bonded)u.gatherCd=0;u.order=null;u.path=[];u.pathAt=-100;
    while(u.hp>0&&u.waypoints.length){const next=u.waypoints.shift();if(['move','attackMove','build'].includes(next.type)){u.order=next;return;}const pending=u.waypoints,error=command(s,u.team,{...next,ids:[u.id]});u.waypoints=pending;if(!error)return;s.announcements[u.team]='Queued '+next.type+' skipped: '+error;}
  }
  function releaseWorker(s,w){delete w.inside;delete w.consumed;w.order=w.hp>0?w.workResume||null:null;delete w.workResume;w.path=[];w.pathAt=-100;if(w.hp<=0)w.waypoints=[];else if(w.waypoints.length)advanceOrder(s,w);}
  function finishWork(s,b,cancel=false){for(const w of s.units)if(!w.miningInside&&(w.inside===b.id||['construct','repair'].includes(w.order?.type)&&w.order.target===b.id)){if(w.consumed&&!cancel)w.hp=0;releaseWorker(s,w);}delete b.construction;}
  function repairCost(b){const d=unitType(b),hp=Math.min(b.maxHp-b.hp,b.maxHp*DT/(d.time*1.5));return {hp,gold:d.gold*hp/b.maxHp*.5,wood:d.wood*hp/b.maxHp*.5};}
  function work(s,w){
    const b=s.units.find(v=>v.id===w.order.target&&v.team===w.team&&v.hp>0&&!types[v.kind].speed);if(!b||w.order.type==='construct'&&b.built===1||w.order.type==='repair'&&(b.built<1||b.hp>=b.maxHp)){releaseWorker(s,w);return;}
    if(!move(s,w,b.x,b.z,types[b.kind].radius+1.1))return;
    if(w.order.type==='repair'){const cost=repairCost(b);if(pay(s,w.team,cost.gold,cost.wood))b.hp+=cost.hp;return;}
    const c=b.construction;if(!c){releaseWorker(s,w);return;}if(c.started&&c.style!=='work'){releaseWorker(s,w);return;}
    c.started=true;if(c.style==='inside'||c.style==='growth'&&!['farm','altar'].includes(b.kind)){w.inside=b.id;w.consumed=c.style==='growth';if(w.consumed){if(w.waypoints.length)s.announcements[w.team]='Worker consumed by living construction; queued work cleared';w.waypoints=[];}}else if(c.style!=='work')releaseWorker(s,w);
  }
  function construct(s,b){
    const c=b.construction;if(!c?.started)return;let rate=1;
    if(c.style==='work'){const workers=s.units.filter(w=>w.hp>0&&w.order?.type==='construct'&&w.order.target===b.id&&!w.stun&&!w.root&&distance(w,b)<=types[b.kind].radius+1.1&&traversable(s.map,w.x,w.z,b.x,b.z));if(!workers.length)return;const extra=.6*(workers.length-1),d=unitType(b);if(extra&&pay(s,b.team,d.gold*DT/d.time*extra,d.wood*DT/d.time*extra))rate+=extra;}
    const progress=Math.min(1-b.built,DT/(c?.itemDuration||unitType(b).time)*rate*(b.kind==='hall'&&b.baseRules===1||productionAncient(b)||b.huntersHallRules===1?.99:1));b.built=Math.min(1,b.built+progress);if(1-b.built<1e-8)b.built=1;b.hp=Math.min(b.maxHp,b.hp+b.maxHp*progress*.9/.99);if(s.frame%10===0)s.events.push({type:'construction',x:b.x,z:b.z,team:b.team});if(b.built===1)finishWork(s,b);
  }
  function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
  function shopFor(s,u,id,item){const baseShop=s.mode!=='skirmish'||s.itemShopVersion<1;const candidates=s.units.filter(v=>v.team===u.team&&(v.kind==='shop'||baseShop&&v.kind==='hall')&&v.hp>0&&v.built===1&&!v.uprooted&&!v.ancientShift&&(id===undefined||v.id===id)&&distance(v,u)<itemShop.range&&traversable(s.map,u.x,u.z,v.x,v.z)&&obstacleClear(s,u.x,u.z,v.x,v.z,0,u.team)).sort((a,b)=>distance(a,u)-distance(b,u)||a.id-b.id);return item!==undefined&&id===undefined?candidates.find(v=>v.kind==='hall'||v.stock[item]?.count>0)||candidates[0]:candidates[0];}
  // MiYu: charged inventory state travels with items; timed effects use authoritative simulation time.
  function consumeRacial(u,slot){const item=items[u.inventory[slot]],next=[...u.inventory],uses=inventoryUses(u);if(item.staff)return;if(item.charges&&uses[slot]>1){uses[slot]--;u.itemUses=uses;}else{next.splice(slot,1);uses.splice(slot,1);setInventory(u,next,uses);}}
  function itemEvent(s,u,item){const e={type:'spell',slot:1,heroClass:u.heroClass??0,x:u.x,z:u.z,team:u.team,item};s.events.push(e);if(!simulating.has(s))(s.pendingEvents??=[]).push(e);}
  const organic=u=>!!types[u.kind].speed&&!types[u.kind].mechanical&&!['ballista','catapult','trebuchet','ram','siegecreep','critter'].includes(u.kind);
  const inBlight=(s,x,z,team)=>s.blight?.some(b=>(team===undefined||b.team===team)&&Math.hypot(x-b.x,z-b.z)<=b.radius)||s.units.some(u=>u.hp>0&&u.built===1&&u.kind==='hall'&&s.teams[u.team]?.faction===3&&(team===undefined||u.team===team)&&Math.hypot(x-u.x,z-u.z)<=10);
  const isHidden=(s,u)=>!!u.hiding&&isNight(s)&&u.hp>0&&!u.order;
  const detected=(s,team,u)=>(u.detectedUntil?.[team]||0)>s.frame||u.faerieFire>0&&u.faerieTeam===team||s.sentinels?.some(o=>o.team===team&&o.perched&&distance(o,u)<=nightTechnology.specialRules.sentinel.perchedSight/100);
  function friendlyItemTarget(s,u,c,range){const v=c.target===undefined?u:s.units.find(v=>v.id===c.target);return v&&v.team===u.team&&v.hp>0&&!v.inside&&v.built===1&&distance(u,v)<=range&&isVisible(s,u.team,v)?v:null;}
  function itemArrival(s,v,base){const r=movementRadius(v),points=Array.from({length:1024},(_,i)=>({x:i%32*2-31,z:Math.floor(i/32)*2-31})).filter(p=>Math.abs(p.x)<=30&&Math.abs(p.z)<=30&&distance(p,base)<=10).sort((a,b)=>distance(a,base)-distance(b,base)||a.z-b.z||a.x-b.x);return points.find(p=>(types[v.kind].flying||!solid(s,p.x,p.z,0,-1,r))&&s.units.every(q=>q.id===v.id||q.hp<=0||q.inside||!types[q.kind].speed||!!types[q.kind].flying!==!!types[v.kind].flying||distance(q,p)>=movementRadius(q)+r+.1));}
  function useRacialItem(s,u,c){
    const item=items[c.item],timer=itemTimerKey(c.item);if(u.stun>0||u.sanctuary||u.itemTimers?.[timer]>0)return 'Item is not ready';if(c.target!==undefined&&(!Number.isSafeInteger(c.target)||c.target<1))return 'Select a valid item target';
    if(item.orb)return 'This item grants a passive bonus';let apply;
    if(item.restoreHp||item.restoreMana){if(item.restoreHp&&u.hp>=u.maxHp||item.restoreMana&&u.mana>=maxMana(u))return 'Already at full health or mana';apply=()=>{if(item.restoreHp)u.hp=Math.min(u.maxHp,u.hp+item.restoreHp);if(item.restoreMana)u.mana=Math.min(maxMana(u),u.mana+item.restoreMana);};}
    else if(item.regen){const v=friendlyItemTarget(s,u,c,item.range||0),targets=item.regen.radius?s.units.filter(v=>v.team===u.team&&v.hp>0&&!v.inside&&v.built===1&&organic(v)&&distance(u,v)<=item.regen.radius):v?[v]:[];if(!targets.length||targets.some(v=>!organic(v)))return 'Select a nearby friendly organic unit';const needy=targets.filter(v=>item.regen.hp?v.hp<v.maxHp:v.kind==='hero'&&v.mana<maxMana(v));if(!needy.length)return 'Already at full health or mana';apply=()=>{for(const v of needy)v.itemRegen={hp:(item.regen.hp||0)/item.regen.time,mana:(item.regen.mana||0)/item.regen.time,left:item.regen.time};};}
    else if(item.speedScroll){apply=()=>{for(const v of s.units)if(v.team===u.team&&v.hp>0&&!v.inside&&types[v.kind].speed&&distance(u,v)<=item.radius)v.speedScroll=item.speedScroll;};}
    else if(item.healGroup){const targets=s.units.filter(v=>v.team===u.team&&v.hp>0&&!v.inside&&organic(v)&&distance(u,v)<=item.radius&&v.hp<v.maxHp);if(!targets.length)return 'No injured friendly organic units';apply=()=>{for(const v of targets)v.hp=Math.min(v.maxHp,v.hp+item.healGroup);};}
    else if(item.moonstone)apply=()=>{s.moonUntil=s.frame+Math.round(item.moonstone/DT);visibility(s);};
    else if(item.magicImmune)apply=()=>{u.itemMagicImmune=item.magicImmune;};
    else if(item.dust)apply=()=>{for(const v of s.units)if(v.team!==u.team&&v.hp>0&&!v.inside&&distance(u,v)<=item.radius){v.detectedUntil??=[0,0];v.detectedUntil[u.team]=s.frame+Math.round(item.dust/DT);}};
    else if(item.staff){const v=friendlyItemTarget(s,u,c,item.range),bases=s.units.filter(b=>b.team===u.team&&rootedBase(b)&&b.hp>0&&b.built===1).sort((a,b)=>b.upgradeTier-a.upgradeTier||a.id-b.id),base=bases[0];if(!v||v.id===u.id||!types[v.kind].speed||v.order?.type==='townPortal'||v.root>0)return 'Select another nearby friendly mobile unit';if(!base)return 'No completed friendly main base';const p=itemArrival(s,v,base);if(!p)return 'No free arrival space at the main base';apply=()=>{v.x=p.x;v.z=p.z;v.order=null;v.waypoints=[];v.path=[];v.pathAt=-100;delete v.dest;delete v.workResume;delete v.itemRegen;delete v.hiding;delete v.sanctuary;if(item.staff==='sanctuary'&&v.hp<v.maxHp)v.sanctuary=true;};}
    else if(item.deploy){const radius=types[item.deploy].radius;if(!Number.isFinite(c.x)||!Number.isFinite(c.z)||Math.abs(c.x)>30||Math.abs(c.z)>30||distance(u,c)>5||!s.visible[u.team]?.[index(c.x,c.z)]||!buildingSite(s,c.x,c.z,radius)||s.units.some(v=>v.hp>0&&!v.inside&&!types[v.kind].flying&&distance(v,c)<radius+(mobile(v)?movementRadius(v):(types[v.kind].radius||1)+.8)))return 'Choose a clear visible building site within five units';if(s.units.length>=LIMIT)return 'Unit capacity reached';apply=()=>{const b=spawn(s,item.deploy,u.team,c.x,c.z,{built:.01});b.hp=b.maxHp*.1;b.construction={style:'summon',started:true,paidGold:0,paidWood:0,itemDuration:item.buildTime};};}
    else if(item.skull){if(!Number.isFinite(c.x)||!Number.isFinite(c.z)||Math.abs(c.x)>30||Math.abs(c.z)>30||distance(u,c)>item.range||s.map.terrain[index(c.x,c.z)]===1||!s.visible[u.team]?.[index(c.x,c.z)])return 'Choose visible dry ground within five units';if(s.blight.length>=64)return 'Blight area limit reached';apply=()=>{s.blight.push({x:c.x,z:c.z,team:u.team,radius:item.skull});};}
    else if(item.critter){if(s.units.length>=LIMIT)return 'Unit capacity reached';const p=itemArrival(s,{...u,id:0,kind:'critter'},u);if(!p)return 'No free space for a mechanical critter';apply=()=>spawn(s,'critter',u.team,p.x,p.z,{order:{type:'hold'}});}
    else if(item.rod){const body=s.corpses.filter(b=>b.kind!=='hero'&&(c.corpse===undefined||b.id===c.corpse)&&distance(u,b)<=item.range&&s.visible[u.team]?.[index(b.x,b.z)]&&!s.units.some(v=>v.order?.type==='cannibalize'&&v.order.active&&v.order.target===b.id)).sort((a,b)=>distance(u,a)-distance(u,b)||a.id-b.id)[0];if(c.corpse!==undefined&&(!Number.isSafeInteger(c.corpse)||c.corpse<1)||!body)return 'No usable nearby corpse';if(s.units.length+2>LIMIT)return 'Unit capacity reached';const positions=[];for(let ring=1;ring<=3&&positions.length<2;ring++)for(let i=0;i<12&&positions.length<2;i++){const x=body.x+Math.cos(i*Math.PI/6)*ring,z=body.z+Math.sin(i*Math.PI/6)*ring;if(!solid(s,x,z,0,-1,.45)&&s.units.every(v=>v.hp<=0||v.inside||!mobile(v)||distance(v,{x,z})>=movementRadius(v)+.45)&&positions.every(p=>distance(p,{x,z})>=1))positions.push({x,z});}if(positions.length!==2)return 'No space for two Skeleton Warriors';apply=()=>{s.corpses.splice(s.corpses.indexOf(body),1);for(const p of positions)spawn(s,'skeletonwarrior',u.team,p.x,p.z,{summoned:true,expires:s.frame+Math.round(item.summonTime/DT)});};}
    else return 'This item grants a passive bonus';
    apply();delete u.hiding;if(item.cooldown){u.itemTimers??={};u.itemTimers[timer]=item.cooldown;}consumeRacial(u,c.slot);itemEvent(s,u,c.item);return null;
  }
  function updateRacialUnit(s,u){
    if(u.itemTimers)for(const k of Object.keys(u.itemTimers)){u.itemTimers[k]=Math.max(0,u.itemTimers[k]-DT);if(u.itemTimers[k]<=1e-7)delete u.itemTimers[k];}if(u.itemTimers&&!Object.keys(u.itemTimers).length)delete u.itemTimers;
    if(u.order)delete u.hiding;if(u.hp<=0){delete u.itemRegen;delete u.sanctuary;delete u.venom;delete u.hiding;return;}
    for(const key of ['speedScroll','itemMagicImmune','corruption'])if(u[key]>0){u[key]=Math.max(0,u[key]-DT);if(u[key]<=1e-7)u[key]=0;}
    if(u.itemRegen){const r=u.itemRegen,elapsed=Math.min(DT,r.left);u.hp=Math.min(u.maxHp,u.hp+r.hp*elapsed);u.mana=Math.min(maxMana(u),u.mana+r.mana*elapsed);r.left=Math.max(0,r.left-DT);if(r.left<=1e-7||r.hp&&u.hp>=u.maxHp||r.mana&&u.mana>=maxMana(u))delete u.itemRegen;}
    if(u.sanctuary){u.hp=Math.min(u.maxHp,u.hp+15*DT);if(u.hp>=u.maxHp)delete u.sanctuary;}
    if(u.venom){const v=u.venom,elapsed=Math.min(DT,v.left);v.left=Math.max(0,v.left-DT);const a=s.units.find(a=>a.id===v.source&&a.team===v.team)||{id:v.source,kind:'hero',heroClass:0,team:v.team,x:u.x,z:u.z};damage(s,a,u,9*elapsed,'poison');if(v.left<=1e-7)delete u.venom;}
    if(s.itemShopVersion===2&&s.teams[u.team]?.faction===3&&organic(u)&&!u.inside&&inBlight(s,u.x,u.z,u.team))u.hp=Math.min(u.maxHp,u.hp+2*DT);
  }
  function orbHit(s,a,b,orb){
    if(orb==='corruption'&&b.hp>0)b.corruption=5;
    if(orb==='venom'&&b.hp>0&&organic(b))b.venom={source:a.id,team:a.team,left:6};
    if(orb==='fire')for(const v of s.units)if(v.id!==b.id&&v.team!==a.team&&v.hp>0&&!v.inside&&distance(v,b)<=1.4)damage(s,a,v,5,'spell');
    if(orb==='lightning'){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;if(s.rng%100<35&&b.hp>0&&!b.itemMagicImmune&&!types[b.kind].magicImmune){for(const key of ['frenzy','slow','cold','haste','root','shield','shieldLeft','bloodlust','lightningShield','speedScroll'])b[key]=0;delete b.frenzySource;delete b.lightningSource;delete b.itemRegen;delete b.venom;b.purgeLeft=3;if(b.summoned)damage(s,a,b,150,'spell');}}
  }
  function validateRacialUnit(s,u){
    if(u.inventory.some(i=>items[i].charges)&&u.itemUses===undefined)throw Error('Missing saved item charges');
    if(u.armorValue!==undefined&&(!Number.isFinite(u.armorValue)||u.armorValue<0||u.armorValue>100))throw Error('Invalid saved armor');
    if(u.guardTowerUpgrade!==undefined&&(!u.guardTowerUpgrade||u.kind!=='scouttower'||u.built!==1||u.hp<=0||!Number.isFinite(u.guardTowerUpgrade.left)||u.guardTowerUpgrade.left<=0||u.guardTowerUpgrade.left>30))throw Error('Invalid saved Guard Tower upgrade');
    if(u.itemUses!==undefined&&(!Array.isArray(u.itemUses)||u.itemUses.length!==u.inventory.length||u.itemUses.some((v,i)=>!Number.isInteger(v)||v<0||v>(items[u.inventory[i]].charges||0)||!!items[u.inventory[i]].charges!==(v>0))))throw Error('Invalid saved item charges');
    if(u.itemTimers!==undefined&&(!u.itemTimers||typeof u.itemTimers!=='object'||Array.isArray(u.itemTimers)||Object.entries(u.itemTimers).some(([k,v])=>!Number.isFinite(v)||v<=0||!items.some((item,i)=>item.cooldown&&itemTimerKey(i)===k&&v<=item.cooldown))))throw Error('Invalid saved item timers');
    if(u.itemRegen!==undefined&&(!u.itemRegen||!Number.isFinite(u.itemRegen.hp)||!Number.isFinite(u.itemRegen.mana)||!Number.isFinite(u.itemRegen.left)||u.itemRegen.hp<0||u.itemRegen.hp>400/45||u.itemRegen.mana<0||u.itemRegen.mana>100/30||u.itemRegen.left<=0||u.itemRegen.left>45||!u.itemRegen.hp&&!u.itemRegen.mana||u.itemRegen.hp&&u.itemRegen.mana))throw Error('Invalid saved item regeneration');
    for(const [k,max] of [['speedScroll',10],['itemMagicImmune',15],['corruption',5]])if(u[k]!==undefined&&(!Number.isFinite(u[k])||u[k]<0||u[k]>max))throw Error('Invalid saved item effect');
    if(u.sanctuary!==undefined&&(u.sanctuary!==true||!types[u.kind].speed||u.hp<=0||u.hp>=u.maxHp)||u.hiding!==undefined&&(typeof u.hiding!=='boolean'||s.teams[u.team]?.faction!==2||!shadowMeld(u)))throw Error('Invalid saved sanctuary or hiding state');
    if(u.detectedUntil!==undefined&&(!Array.isArray(u.detectedUntil)||u.detectedUntil.length!==2||u.detectedUntil.some(v=>!Number.isSafeInteger(v)||v<0||v>s.frame+200)))throw Error('Invalid saved detection');
    if(u.venom!==undefined&&(!u.venom||!Number.isSafeInteger(u.venom.source)||u.venom.source<1||u.venom.source>s.serial||![0,1].includes(u.venom.team)||!Number.isFinite(u.venom.left)||u.venom.left<=0||u.venom.left>6))throw Error('Invalid saved venom');
  }
  function updateShops(s){for(const u of s.units)if(u.kind==='shop'&&u.hp>0&&u.built===1&&!u.uprooted&&!u.ancientShift)for(const o of shopOffers(s,u)){const stock=u.stock[o.item];if(stock.count>=o.capacity||(s.teams[u.team]?.tier||1)<o.tier)continue;stock.left=Math.max(0,stock.left-DT);if(stock.left<=1e-7){stock.count++;stock.left=stock.count<o.capacity?o.restock:0;}}}
  function setInventory(u,next,uses=next.map(i=>items[i].charges||0)){
    const sum=(list,key)=>list.reduce((n,i)=>n+(items[i][key]||0),0),ratio=u.hp/u.maxHp;u.damage+=sum(next,'damage')-sum(u.inventory,'damage');u.maxHp+=sum(next,'hp')-sum(u.inventory,'hp');u.speed+=sum(next,'speed')-sum(u.inventory,'speed');u.hp=Math.min(u.maxHp,u.maxHp*ratio);u.inventory=next;if(next.some(i=>items[i].charges))u.itemUses=uses;else delete u.itemUses;
  }
  function equip(u,i,uses){setInventory(u,[...u.inventory,i],[...inventoryUses(u),uses??items[i].charges??0]);}
  function pickup(s,u,d){if(d.relic)s.quest.relic=true;else equip(u,d.item,d.uses);s.loot.splice(s.loot.indexOf(d),1);}

  function experience(h,xp){h.xp+=xp;while(h.xp>=h.level*90&&h.level<10){h.xp-=h.level*90;h.level++;h.skillPoints++;h.maxHp+=90;h.hp=Math.min(h.maxHp,h.hp+150);h.damage+=6;}}
  function meleeSlot(s,u,target){
    if(u.order?.type!=='attack'||attackRange(u,target)>2||!u.speed)return null;
    const group=s.units.filter(v=>v.hp>0&&!v.inside&&v.team===u.team&&v.speed&&v.order?.type==='attack'&&v.order.target===target.id&&unitType(v).range<=2).sort((a,b)=>a.id-b.id);if(group.length<2)return null;
    const radius=unitType(u).range+(types[target.kind].radius||.3)-.12,spacing=Math.max(...group.map(movementRadius))*2+.1,count=Math.max(1,Math.min(group.length,Math.floor(Math.PI*2*radius/spacing))),slot=group.findIndex(v=>v.id===u.id),angle=slot%count*Math.PI*2/count-Math.PI/2,ring=radius+Math.floor(slot/count)*spacing,x=target.x+Math.cos(angle)*ring,z=target.z+Math.sin(angle)*ring;
    return Math.abs(x)<=30&&Math.abs(z)<=30&&(types[u.kind].flying||!solid(s,x,z,u.id,u.team)&&traversable(s.map,x,z,target.x,target.z))?{x,z}:null;
  }
  function attackInRange(s,u,v){return distance(u,v)>=(unitType(u).minRange||0)&&Math.hypot(distance(u,v),unitHeight(s,u)-unitHeight(s,v))<=attackRange(u,v)+(types[v.kind].radius||.3)&&attackClear(s,u,v);}
  function leavesCorpse(kind){return kind!=='hero'&&Object.hasOwn(types,kind)&&types[kind].speed>0&&!types[kind].mechanical&&types[kind].attack!=='siege';}
  function damage(s,a,b,value,mode='attack',orb,weapon=a){
    const friendlySplash=mode==='splash'&&unitType(weapon).splashEnemiesOnly===false;
    if(b.hp<=0||b.cyclone>0||b.inside&&!(b.miningInside&&mode==='drain')||b.order?.type==='townPortal'||a.team===b.team&&!friendlySplash&&!['drain','lightning','dispel'].includes(mode)&&!canDeny(s,a.team,b))return;if((b.itemMagicImmune>0||types[b.kind].magicImmune)&&(['spell','lightning','poison','dispel'].includes(mode)||mode==='attack'&&unitType(a).attack==='magic'))return;delete b.itemRegen;delete b.hiding;const denied=!friendlySplash&&!['drain','lightning','dispel'].includes(mode)&&a.team===b.team;if(b.avatar>0&&mode!=='drain')value*=.6;const absorbed=mode==='drain'?0:Math.min(b.shield||0,value);b.shield=Math.max(0,(b.shield||0)-absorbed);value-=absorbed;if(value<=0)return;s.events.push({type:denied&&value>=b.hp?'deny':'damage',x:b.x,z:b.z,y:unitHeight(s,b),amount:Math.ceil(Math.min(b.hp,value)),team:b.team});b.hp-=value;if(mode==='attack'&&a.team!==b.team&&(orb||itemOrb(a)))orbHit(s,a,b,orb||itemOrb(a));
    if(b.team===-1&&b.home)for(const guard of s.units)if(guard.team===-1&&guard.home&&guard.hp>0&&Math.hypot(guard.home[0]-b.home[0],guard.home[1]-b.home[1])<=8)guard.awakeUntil=s.frame+100;
    if(mode==='attack'&&!denied&&types[a.kind].lifesteal&&a.hp>0)a.hp=Math.min(a.maxHp,a.hp+value*types[a.kind].lifesteal);
    if(mode==='attack'&&!denied&&types[a.kind].slow)b.slow=types[a.kind].slow;
    if(mode==='attack'&&!denied&&unitType(weapon).cold&&types[b.kind].speed)b.cold=unitType(weapon).cold;
    if(b.hp<=0){b.hp=0;if(['sentinel','attackGround','attackTree'].includes(b.order?.type))b.order=null;if(b.kind==='entangledmine')destroyEntangle(s,b);if(b.entangleMine){const mine=s.units.find(v=>v.id===b.entangleMine);if(mine)destroyEntangle(s,mine);}delete b.entangleCast;delete b.zigguratUpgrade;delete b.guardTowerUpgrade;delete b.baseUpgrade;delete b.ancientShift;delete b.druidShift;if(druidUnit(b))b.speed=types[b.kind].speed;if(b.order?.type==='druidSpell')b.order=null;delete b.druidCastLeft;delete b.druidCastSpell;delete b.druidCastFrame;delete b.druidLastSpell;delete b.ancientRegen;delete b.weaponWindup;b.queue=b.queue.filter(q=>!q.research);updateTechnology(s);b.waypoints=[];if(!types[b.kind].speed)finishWork(s,b);s.events.push({type:'death',x:b.x,z:b.z,team:b.team});if(leavesCorpse(b.kind)&&!b.summoned){s.corpses=s.corpses.filter(c=>c.id!==b.id);s.corpses.push({id:b.id,kind:b.kind,heroClass:b.heroClass??0,team:b.team,x:b.x,y:unitHeight(s,b),z:b.z,yaw:b.yaw??(Number.isFinite(a.x)&&Number.isFinite(a.z)?Math.atan2(a.x-b.x,a.z-b.z):0),age:0,boss:b.tag==='boss',large:!!b.tdBoss});if(s.corpses.length>CORPSE_LIMIT)s.corpses.shift();}if(a.team>=0&&(a.team!==b.team||denied)){
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
  function isVisible(s,team,u){return !u.inside&&(u.team===team||u.hp>0&&!!s.visible[team]?.[index(u.x,u.z)]&&(!isHidden(s,u)||detected(s,team,u)));}
  function fire(s,u,target,ground=null){
    const source=ancientWarRules.units[u.kind],speed=projectileSpeed(u,target);if(speed&&s.projectiles.length>=PROJECTILE_LIMIT)return false;const value=attackDamage(u,(nightWeaponRoll(s,u)*(u.avatar>0?1.6:1)+(source||druidUnit(u)||u.kind==='hero'||u.kind==='hall'&&u.baseRules===1?0:s.teams[u.team]?.upgrade||0)*6));
    if(speed){
      if(s.projectiles.length>=PROJECTILE_LIMIT)return false;
      const yaw=Math.atan2(target.x-u.x,target.z-u.z)-Math.PI/2,offset=source?.launch||[0,1.6,0],x=u.x+offset[0]*Math.cos(yaw)+offset[2]*Math.sin(yaw),z=u.z-offset[0]*Math.sin(yaw)+offset[2]*Math.cos(yaw),y=unitHeight(s,u)+offset[1],toY=unitHeight(s,target)+1.6,dx=target.x-x,dy=toY-y,dz=target.z-z,d=Math.hypot(dx,dy,dz)||1;
      s.projectiles.push({id:++s.projectileSerial,source:u.id,kind:u.kind,heroClass:u.heroClass??0,team:u.team,...(u.baseRules!==undefined?{baseRules:u.baseRules,baseFaction:u.baseFaction,upgradeTier:u.upgradeTier}:{}),...(productionAncient(u)?{ancientProduction:1,uprooted:u.uprooted}:{}),target:target.id,...(source?{fromX:u.x,fromZ:u.z}:{}),...ground,x,y,z,baseY:y,toX:target.x,toY,toZ:target.z,travel:0,age:0,born:s.frame,...(source?{flightDistance:d,segmentTravel:0}:{}),...(u.nightLevels?{nightLevels:clone(u.nightLevels)}:{}),...(source?.bounceTargets?{bounceLeft:unitType(u).bounceTargets-1,bounceHits:[]}:{}),...(itemOrb(u)?{orb:itemOrb(u)}:{}),damage:value,splashDamage:attackDamage(u,u.damage*.6),vx:dx/d*speed,vy:dy/d*speed,vz:dz/d*speed,art:projectileArt(u)});
    }else{
      damage(s,u,target,weaponDamage(u,target,value));if(types[u.kind].splash)for(const v of s.units)if(v.id!==target.id&&v.team!==u.team&&v.hp>0&&canAttack(u,v)&&distance(v,target)<types[u.kind].splash)damage(s,u,v,weaponDamage(u,v,u.damage*.6*(u.cripple>0?.5:1)));
    }
    u.yaw=Math.atan2(target.x-u.x,target.z-u.z);if(!source)u.cd=unitType(u).cooldown||1;s.events.push({type:speed?'launch':'hit',x:target.x,z:target.z,fromX:u.x,fromZ:u.z,fromY:unitHeight(s,u)+1.6,toY:unitHeight(s,target)+1.6,team:u.team,ranged:!!speed,...(u.kind==='rifleman'?{art:'musket'}:{})});return true;
  }
  function advanceProjectiles(s){
    s.projectiles=s.projectiles.filter(p=>{
      if(p.born===s.frame)return true;p.age+=DT;if(p.age>6)return false;
      const target=s.units.find(u=>u.id===p.target&&canTarget(s,p,u)),ballistic=unitType(p).attack==='siege';
      if(!ballistic&&!target)return false;if(!ballistic){p.toX=target.x;p.toY=unitHeight(s,target)+1.6;p.toZ=target.z;}
      const dx=p.toX-p.x,dy=p.toY-p.baseY,dz=p.toZ-p.z,d=Math.hypot(dx,dy,dz),step=projectileSpeed(p)*DT;
      if(d<=step){
        const attacker=s.units.find(u=>u.id===p.source&&u.team===p.team)||p,point={x:p.toX,z:p.toZ},direct=target&&(!ballistic||distance(target,point)<(types[target.kind].radius||.3)+.6);
        const bands=unitType(p).splashBands,sourceSplash=!!bands&&!!ancientWarRules.units[p.kind];
        if(direct&&!sourceSplash)damage(s,attacker,target,weaponDamage(p,target,p.damage),'attack',p.orb,p);
        if(sourceSplash)glaiveImpact(s,p,point,attacker,target,direct);
        else if(bands)for(const v of s.units)if((unitType(p).splashEnemiesOnly===false||v.team!==p.team)&&v.hp>0&&(!direct||v.id!==target.id)&&!types[v.kind].flying&&canAttack(p,v)){const band=bands.find(([radius])=>distance(v,point)<=radius);if(band)damage(s,attacker,v,weaponDamage(p,v,p.damage*band[1]),'splash',undefined,p);}
        if(types[p.kind].splash)for(const v of s.units)if(v.team!==p.team&&v.hp>0&&(!direct||v.id!==target.id)&&canAttack(p,v)&&distance(v,point)<types[p.kind].splash)damage(s,attacker,v,weaponDamage(p,v,p.splashDamage));
        s.events.push({type:'impact',x:p.toX,y:p.toY,z:p.toZ,team:p.team,art:p.art});
        if(direct&&p.bounceLeft>0){p.bounceHits.push(target.id);const next=s.units.filter(v=>v.hp>0&&v.team!==p.team&&!p.bounceHits.includes(v.id)&&canAttack(p,v)&&distance(v,point)<=unitType(p).bounceRadius).sort((a,b)=>distance(a,point)-distance(b,point)||a.id-b.id)[0];if(next){p.bounceLeft--;p.damage*=1-unitType(p).bounceLoss;p.target=next.id;p.x=p.toX;p.y=p.toY;p.z=p.toZ;p.baseY=p.y;p.toX=next.x;p.toY=unitHeight(s,next)+1.6;p.toZ=next.z;p.segmentTravel=0;p.flightDistance=Math.hypot(p.toX-p.x,p.toY-p.y,p.toZ-p.z);return true;}}return false;
      }
      const oldY=p.y;p.x+=dx/d*step;p.baseY+=dy/d*step;p.z+=dz/d*step;p.travel+=step;
      if(ancientWarRules.units[p.kind]){p.segmentTravel+=step;const progress=clamp(p.segmentTravel/(p.segmentTravel+d-step),0,1);p.y=p.baseY+4*progress*(1-progress)*p.flightDistance*unitType(p).missileArc;}else p.y=p.baseY+Math.sin(Math.PI*p.travel/(p.travel+d-step))*(ballistic?2.5:p.art==='arrow'?.6:.2);p.vx=dx/d*projectileSpeed(p);p.vy=(p.y-oldY)/DT;p.vz=dz/d*projectileSpeed(p);return true;
    });
  }
  function learnResources(s){
    s.clearedResources??=[[],[]];let changed=false;for(let t=0;t<2;t++)for(let i=0;i<s.resources.length;i++){const r=s.resources[i];if(r.amount<=0&&s.visible[t]?.[index(r.x,r.z)]&&!s.clearedResources[t].includes(i)){s.clearedResources[t].push(i);changed=true;}}
    if(changed){treeFields.delete(s);trafficCache.delete(s);}
  }
  function visibility(s){
    for(let t=0;t<2;t++){const vis=Array(1024).fill(0),reveal=(point,r)=>{const [cx,cz]=cell(point.x,point.z);for(let z=Math.max(0,Math.ceil(cz-r));z<=Math.min(31,Math.floor(cz+r));z++)for(let x=Math.max(0,Math.ceil(cx-r));x<=Math.min(31,Math.floor(cx+r));x++)if((x-cx)**2+(z-cz)**2<=r*r)vis[z*32+x]=1;};for(const u of s.units)if((u.team===t||u.faerieFire>0&&u.faerieTeam===t)&&u.hp>0&&!u.inside){const source=nightSource(s,u),rules=source&&nightTechnology.units[source],r=rules?(isNight(s)&&!u.nightLevels.Reuv?rules.nightSight:rules.daySight)/200:isNight(s)?(types[u.kind].model==='tower'?5:3):(u.kind==='tower'?7:6);reveal(u,r);}for(const o of s.sentinels||[])if(o.team===t)reveal(o,(o.perched?nightTechnology.specialRules.sentinel.perchedSight:nightTechnology.specialRules.sentinel.flightSight)/200);s.visible[t]=vis;for(let i=0;i<1024;i++)if(vis[i])s.explored[t][i]=1;}learnResources(s);
  }
  const acolyte=(s,u)=>s.economyVersion===1&&s.mode==='skirmish'&&u.kind==='worker'&&s.teams[u.team]?.faction===3;
  const canGather=(s,u,r)=>!!r&&(u.kind==='worker'?(acolyte(s,u)?r.kind==='mine':['mine','tree'].includes(r.kind)):u.kind==='ghoul'&&s.economyVersion===1&&s.mode==='skirmish'&&s.teams[u.team]?.faction===3&&r.kind==='tree');
  const hauntedMine=(s,r)=>r&&s.units.find(b=>b.kind==='hauntedmine'&&b.hp>0&&distance(b,r)<.01);
  const entangledMine=(s,r)=>r&&s.units.find(b=>b.kind==='entangledmine'&&b.hp>0&&distance(b,r)<.01);
  const miningWisp=(s,u)=>s.entangledVersion===1&&wisp(s,u);
  const wispWorkers=(s,r)=>s.units.filter(w=>w.hp>0&&miningWisp(s,w)&&w.order?.type==='gather'&&w.order.resource===s.resources.indexOf(r));
  const mineResidents=(s,b)=>s.units.filter(w=>w.hp>0&&w.miningInside&&w.inside===b.id).sort((a,b)=>(a.order?.mineSlot??5)-(b.order?.mineSlot??5)||a.id-b.id);
  const entangleReach=b=>entangledRules.range+entangledRules.mineCollision+entangledRules.treeCollision[['etol','etoa','etoe'][(b.upgradeTier||1)-1]];
  function entangleTarget(s,b,r){return s.entangledVersion===1&&ancientMain(b)&&b.hp>0&&rootedBase(b)&&b.built===1&&!b.baseUpgrade&&r?.kind==='mine'&&r.amount>0&&s.resources.includes(r)&&distance(b,r)<=entangleReach(b)+1e-7&&!hauntedMine(s,r)&&!entangledMine(s,r)&&!s.units.some(v=>v.id!==b.id&&v.hp>0&&v.entangleCast?.resource===s.resources.indexOf(r));}
  function startEntangle(s,b,r,instant=false){
    if(!entangleTarget(s,b,r)||b.entangleMine||s.units.length>=LIMIT)return null;
    const mine=spawn(s,'entangledmine',b.team,r.x,r.z,{entangleBase:b.id,mineResource:s.resources.indexOf(r),armorValue:entangledRules.armorValue,goldLeft:entangledRules.interval,goldIndex:0,workers:0,...(!instant?{built:0,hp:entangledRules.hp*.1,construction:{style:'summon',started:true,paidGold:0,paidWood:0,startFrame:s.frame}}:{})});
    if(mine){b.entangleMine=mine.id;navigationCache.delete(s);trafficCache.delete(s);}return mine;
  }
  function autoEntangle(s,b){const r=s.resources.filter(r=>entangleTarget(s,b,r)).sort((a,c)=>distance(b,a)-distance(b,c)||s.resources.indexOf(a)-s.resources.indexOf(c))[0];if(r&&!b.entangleMine&&!b.entangleCast)b.entangleCast={resource:s.resources.indexOf(r),left:entangledRules.castTime};}
  function mineExit(s,b,w,reserved){
    const radius=movementRadius(w),free=(x,z)=>Math.abs(x)+radius<=30&&Math.abs(z)+radius<=30&&!solid(s,x,z,b.id,w.team,radius)&&s.units.every(v=>v.hp<=0||v.inside||!mobile(v)||types[v.kind].flying||Math.hypot(v.x-x,v.z-z)>=movementRadius(v)+radius+.05)&&reserved.every(p=>Math.hypot(p.x-x,p.z-z)>=p.r+radius+.05);
    for(let ring=0;ring<22;ring++)for(let i=0;i<32;i++){const angle=(i+(w.order?.mineSlot||0)*6.4)*Math.PI/16,d=types.entangledmine.radius+radius+.2+ring*.5,x=b.x+Math.cos(angle)*d,z=b.z+Math.sin(angle)*d;if(free(x,z))return {x,z,r:radius};}return null;
  }
  function unloadWisps(s,b,target,forced=false){
    const all=mineResidents(s,b),chosen=target===undefined?all:all.filter(w=>w.id===target);if(!chosen.length)return forced?null:'Select a resident Wisp';const reserved=[],positions=new Map();
    for(const w of chosen){let p=mineExit(s,b,w,reserved);if(!p&&!forced)return 'No clear exit space for the selected Wisps';p??={x:w.mineEntry?.x??b.x,z:w.mineEntry?.z??b.z,r:movementRadius(w)};positions.set(w.id,p);reserved.push(p);}
    for(const w of chosen){Object.assign(w,{x:positions.get(w.id).x,z:positions.get(w.id).z,gatherCd:0,order:null,path:[],pathAt:-100});for(const key of ['inside','miningInside','mineEntry','mineExitPending'])delete w[key];if(w.waypoints.length)advanceOrder(s,w);}
    b.workers=mineResidents(s,b).length;trafficCache.delete(s);return null;
  }
  function destroyEntangle(s,b){
    const base=s.units.find(v=>v.id===b.entangleBase),r=s.resources[b.mineResource],waiting=wispWorkers(s,r).filter(w=>!w.miningInside);b.hp=0;unloadWisps(s,b,undefined,true);
    for(const w of waiting){w.order=null;w.gatherCd=0;w.path=[];if(w.waypoints.length)advanceOrder(s,w);}
    if(base?.entangleMine===b.id)delete base.entangleMine;for(const key of ['entangleBase','mineResource','goldLeft','goldIndex','workers','construction'])delete b[key];navigationCache.delete(s);trafficCache.delete(s);
  }
  function tickEntangledMine(s,b){
    const base=s.units.find(v=>v.id===b.entangleBase),r=s.resources[b.mineResource];if(!base||!rootedBase(base)||base.hp<=0||base.entangleMine!==b.id||!r||r.amount<=0){destroyEntangle(s,b);return;}
    if(b.built<1){if(s.frame>b.construction.startFrame)construct(s,b);return;}
    for(const w of mineResidents(s,b).filter(w=>w.mineExitPending))unloadWisps(s,b,w.id);
    const residents=mineResidents(s,b);b.workers=residents.length;b.goldLeft=Math.max(0,b.goldLeft-DT);if(b.goldLeft>1e-8)return;b.goldLeft=entangledRules.interval;b.goldIndex=(b.goldIndex+1)%entangledRules.capacity;
    const w=residents[b.goldIndex];if(!w||w.mineExitPending)return;const amount=Math.min(entangledRules.goldPerInterval,r.amount);r.amount-=amount;s.teams[b.team].gold+=amount;if(w.waypoints.length){w.mineExitPending=true;unloadWisps(s,b,w.id);}if(!r.amount){learnResources(s);destroyEntangle(s,b);}
  }
  function tickMineResident(s,u){
    if(u.frenzy>0){const elapsed=Math.min(DT,u.frenzy);damage(s,u.frenzySource,u,4*elapsed,'drain');if(u.hp<=0){const b=s.units.find(v=>v.id===u.inside);for(const key of ['inside','miningInside','mineEntry','mineExitPending'])delete u[key];u.order=null;u.waypoints=[];if(b)b.workers=mineResidents(s,b).length;return;}}
    for(const key of ['stun','root','slow','cold','haste','avatar','shieldLeft','frenzy','cripple','purgeLeft','castLeft','bloodlust','frenzyCd','crippleCd','purgeCd','bloodlustCd','lightningShieldCd'])if(u[key]>0)u[key]=Math.max(0,u[key]-DT);
    if(!u.shieldLeft)u.shield=0;if(!u.frenzy)delete u.frenzySource;u.cd=Math.max(0,u.cd-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));
  }
  function gatherWispGold(s,u,r){
    const b=entangledMine(s,r);if(!b||b.team!==u.team||r.amount<=0){advanceOrder(s,u);return;}const occupied=wispWorkers(s,r).filter(w=>w.id!==u.id);let slot=u.order.mineSlot;
    if(!Number.isInteger(slot)||occupied.some(w=>w.order.mineSlot===slot)){slot=Array.from({length:entangledRules.capacity},(_,i)=>i).find(i=>!occupied.some(w=>w.order.mineSlot===i));if(slot===undefined){s.announcements[u.team]='Entangled Gold Mine supports five Wisps';advanceOrder(s,u);return;}u.order.mineSlot=slot;}
    const reach=entangledRules.loadRange+types.entangledmine.radius;if(!move(s,u,b.x,b.z,reach)||b.built<1||u.stun)return;
    u.mineEntry={x:u.x,z:u.z};u.inside=b.id;u.miningInside=true;u.x=b.x;u.z=b.z;u.gatherCd=0;u.path=[];u.pathAt=-100;b.workers=mineResidents(s,b).length;
  }
  function validateEntangles(s){
    const point=p=>p&&[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30),slot=v=>Number.isInteger(v)&&v>=0&&v<entangledRules.capacity;
    for(const u of s.units){
      delete u.entangleCasting;
      if(u.entangleCast){const c=u.entangleCast,r=s.resources[c.resource];if(!Number.isInteger(c.resource)||!Number.isFinite(c.left)||c.left<=0||c.left>entangledRules.castTime||u.entangleMine||!entangleTarget(s,u,r))throw Error('Invalid saved Entangle cast');}
      if(u.entangleMine!==undefined){const b=s.units.find(v=>v.id===u.entangleMine&&v.hp>0);if(!Number.isSafeInteger(u.entangleMine)||!ancientMain(u)||!rootedBase(u)||u.hp<=0||u.built!==1||b?.kind!=='entangledmine'||b.entangleBase!==u.id)throw Error('Invalid saved Entangle base binding');}
      if(u.kind==='entangledmine'){
        if(s.entangledVersion!==1||s.mode!=='skirmish'||s.teams[u.team]?.faction!==2||u.maxHp!==entangledRules.hp||u.damage!==0||u.speed!==0||u.armorValue!==entangledRules.armorValue)throw Error('Invalid saved Entangled Mine rules');
        if(u.hp>0&&u.built<1&&(!u.construction||u.construction.style!=='summon'||!u.construction.started||!Number.isSafeInteger(u.construction.startFrame)||u.construction.startFrame<0||u.construction.startFrame>s.frame))throw Error('Invalid saved Entangle construction');
        if(u.hp>0){const b=s.units.find(v=>v.id===u.entangleBase&&v.hp>0),r=s.resources[u.mineResource],residents=mineResidents(s,u);if(!b||!ancientMain(b)||!rootedBase(b)||b.built!==1||b.team!==u.team||b.entangleMine!==u.id||!Number.isInteger(u.mineResource)||r?.kind!=='mine'||r.amount<=0||distance(u,r)>.01||s.units.some(v=>v.id!==u.id&&v.hp>0&&['hauntedmine','entangledmine'].includes(v.kind)&&distance(u,v)<.01)||!Number.isFinite(u.goldLeft)||u.goldLeft<0||u.goldLeft>entangledRules.interval||!slot(u.goldIndex)||residents.length>entangledRules.capacity||u.workers!==residents.length)throw Error('Invalid saved Entangled Mine binding or clock');}
      }else if(['entangleBase','mineResource','goldLeft','goldIndex','workers'].some(k=>u[k]!==undefined))throw Error('Invalid saved mining metadata');
      if(u.miningInside!==undefined||u.mineEntry!==undefined||u.mineExitPending!==undefined){const b=s.units.find(v=>v.id===u.inside&&v.hp>0);if(u.miningInside!==true||!miningWisp(s,u)||u.hp<=0||b?.kind!=='entangledmine'||b.built!==1||b.team!==u.team||u.consumed||u.order?.type!=='gather'||u.order.resource!==b.mineResource||!slot(u.order.mineSlot)||u.cargo!==0||u.gatherCd!==0||!point(u.mineEntry)||distance(u,b)>1e-7||u.path.length||u.mineExitPending!==undefined&&(u.mineExitPending!==true||!u.waypoints.length))throw Error('Invalid saved resident Wisp');}
      if(miningWisp(s,u)){if(u.cargo!==0)throw Error('Invalid saved Wisp gold cargo');if(u.order?.type==='gather'&&s.resources[u.order.resource]?.kind==='mine'&&entangledMine(s,s.resources[u.order.resource])?.team!==u.team)throw Error('Invalid saved Wisp mine order');}
    }
  }
  const mineWorkers=(s,r)=>s.units.filter(w=>w.hp>0&&!w.inside&&acolyte(s,w)&&w.order?.type==='gather'&&w.order.resource===s.resources.indexOf(r));
  const minePoint=(r,slot)=>({x:r.x+Math.cos(slot*Math.PI*2/5)*2.4,z:r.z+Math.sin(slot*Math.PI*2/5)*2.4});
  function miningTarget(s,u){const r=s.resources[u.order?.resource],mine=hauntedMine(s,r);return acolyte(s,u)&&u.hp>0&&!u.stun&&!u.inside&&!u.cargo&&u.order?.type==='gather'&&Number.isInteger(u.order.mineSlot)&&mine?.team===u.team&&mine.built===1&&r.amount>0&&distance(u,minePoint(r,u.order.mineSlot))<=.16?r:null;}
  function mineGold(s,u,r){
    const mine=hauntedMine(s,r);if(!mine||mine.team!==u.team||r.amount<=0){advanceOrder(s,u);return;}
    const occupied=mineWorkers(s,r).filter(w=>w.id!==u.id);let slot=u.order.mineSlot;
    if(!Number.isInteger(slot)||occupied.some(w=>w.order.mineSlot===slot)){slot=[0,1,2,3,4].find(i=>!occupied.some(w=>w.order.mineSlot===i));if(slot===undefined){advanceOrder(s,u);return;}u.order.mineSlot=slot;}
    const target=minePoint(r,slot);if(!move(s,u,target.x,target.z,.15)||mine.built<1)return;
    if(u.gatherCd<=1e-6){const take=Math.min(10,r.amount);r.amount-=take;if(r.amount===0)learnResources(s);s.teams[u.team].gold+=take;u.gatherCd=5;if(u.waypoints.length)advanceOrder(s,u);}
  }
  function wispWorkingTarget(s,u){const r=s.resources[u.order?.resource];return wisp(s,u)&&u.hp>0&&!u.inside&&!u.stun&&!u.cargo&&u.order?.type==='gather'&&u.order.bonded&&r?.kind==='tree'&&r.amount>0&&distance(u,r)<=wispRules.harvestReach+.01&&traversable(s.map,u.x,u.z,r.x,r.z)?r:null;}
  function harvestWisp(s,u,r){
    if(r.amount<=0){u.gatherCd=0;advanceOrder(s,u);return;}
    if(distance(u,r)>wispRules.harvestReach+.01||!traversable(s.map,u.x,u.z,r.x,r.z)){delete u.order.bonded;u.gatherCd=0;move(s,u,r.x,r.z,wispRules.harvestReach);return;}
    if(!u.order.bonded){u.order.bonded=true;u.gatherCd=wispRules.harvestTime;return;}
    if(u.gatherCd<=1e-6){s.teams[u.team].wood+=wispRules.lumber;u.gatherCd=wispRules.harvestTime;if(u.waypoints.length)advanceOrder(s,u);}
  }
  function gather(s,u){let r=s.resources[u.order.resource];if(!canGather(s,u,r)){advanceOrder(s,u);return;}if(wisp(s,u)&&r.kind==='tree'&&!u.cargo){harvestWisp(s,u,r);return;}if(miningWisp(s,u)&&r.kind==='mine'){gatherWispGold(s,u,r);return;}if(acolyte(s,u)&&!u.cargo){mineGold(s,u,r);return;}if(!u.cargo&&(hauntedMine(s,r)||entangledMine(s,r))){advanceOrder(s,u);return;}if(r.amount<=0&&!u.cargo&&resourceAvailable(s,u.order.resource,u.team)){move(s,u,r.x,r.z,2.9);return;}if(r.amount<=0&&!u.cargo){const next=s.resources.filter(v=>v.kind===r.kind&&v.amount>0&&!hauntedMine(s,v)&&!entangledMine(s,v)).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(!next){advanceOrder(s,u);return;}u.order.resource=s.resources.indexOf(next);r=next;}const hall=s.units.filter(v=>v.team===u.team&&rootedBase(v)&&v.hp>0&&v.built===1).sort((a,b)=>distance(u,a)-distance(u,b))[0];if(!hall){if(u.waypoints.length){s.announcements[u.team]='Queued gathering skipped: no completed stronghold';advanceOrder(s,u);}return;}const returning=!!hauntedMine(s,r)||!!entangledMine(s,r)||acolyte(s,u)&&u.cargo>0||u.cargo>=20||u.cargo>0&&(r.amount<=0||u.cargoKind&&u.cargoKind!==r.kind),target=returning?hall:r;
    const reach=returning?4:3;if(distance(u,target)>reach||!traversable(s.map,u.x,u.z,target.x,target.z)){move(s,u,target.x,target.z,reach-.1);return;}if(returning){s.teams[u.team][(u.cargoKind||r.kind)==='mine'?'gold':'wood']+=u.cargo;u.cargo=0;delete u.cargoKind;if(u.waypoints.length)advanceOrder(s,u);}else if(u.gatherCd<=0){const take=Math.min(5,r.amount);u.cargo+=take;u.cargoKind=r.kind;r.amount-=take;u.gatherCd=.65;if(r.kind==='tree'&&r.amount===0)r.felled={frame:s.frame,yaw:Math.atan2(r.x-u.x,r.z-u.z),age:0};if(r.amount===0)learnResources(s);}
  }
  function ai(s,t){
    const team=s.teams[t],us=s.units.filter(u=>u.team===t&&u.hp>0),base=s.map.spawns[t],foe=s.map.spawns[1-t],worker=us.find(u=>u.kind==='worker'&&!u.inside&&!['construct','repair'].includes(u.order?.type));
    if(s.mode==='skirmish'){
      const pending=us.find(u=>u.built<1&&u.construction&&(!u.construction.started||u.construction.style==='work')&&!us.some(w=>w.order?.type==='construct'&&w.order.target===u.id));if(worker&&pending){command(s,t,{type:'construct',ids:[worker.id],target:pending.id});return;}
      if(s.economyVersion===1&&team.faction===3&&worker){const r=s.resources.filter(r=>r.kind==='mine'&&r.amount>0&&!hauntedMine(s,r)&&distance(r,{x:base[0],z:base[1]})<16).sort((a,b)=>distance(worker,a)-distance(worker,b))[0];if(r&&command(s,t,{type:'build',ids:[worker.id],kind:'hauntedmine',x:r.x,z:r.z})===null)return;}
      const build=kind=>{if(!worker||['construct','repair'].includes(worker.order?.type))return false;for(const radius of [8,11,14,17])for(let i=0;i<12;i++){const a=(i+s.frame/40)*Math.PI/6;if(command(s,t,{type:'build',ids:[worker.id],kind,x:clamp(base[0]+Math.cos(a)*radius,-27,27),z:clamp(base[1]+Math.sin(a)*radius,-27,27)})===null)return true;}return false;};
      const opening=['altar','farm','barracks'].find(kind=>!us.some(u=>u.kind===kind||kind==='farm'&&types[u.kind].supply));if(opening&&build(opening))return;
      if(team.faction===3&&s.frame>350&&team.gold>450)for(const b of us.filter(u=>u.kind==='farm'&&u.built===1&&!u.zigguratUpgrade))command(s,t,{type:'zigguratUpgrade',ids:[b.id],kind:us.some(u=>u.kind==='nerubiantower'||u.zigguratUpgrade?.kind==='nerubiantower')?'spirittower':'nerubiantower'});
      if(heroRoster(s,t).some(h=>h.hp>0)&&!us.some(u=>u.kind==='shop'))build('shop');
      const pop=population(s,t);if(pop.used+3>pop.cap&&!us.some(u=>u.kind==='farm'&&u.built<1))build('farm');
      if(s.entangledVersion===1)for(const b of us.filter(u=>ancientMain(u)&&rootedBase(u)&&u.built===1&&!u.entangleMine&&!u.entangleCast))autoEntangle(s,b);
      const hall=us.find(u=>u.kind==='hall'&&u.built===1);if(hall&&us.filter(u=>u.kind==='worker'&&!u.consumed).length<(team.faction===2?8:5)&&!hall.queue.length)command(s,t,{type:'train',ids:[hall.id],kind:'worker'});if(hall&&s.frame>350&&team.gold>600)command(s,t,{type:'tech',ids:[hall.id]});
      if(hall&&team.faction===2&&!team.naturesBlessing&&team.tier>=2&&team.gold>natureRules.gold&&team.wood>=natureRules.wood)command(s,t,{type:'naturesBlessing',ids:[hall.id]});
      for(const b of us.filter(u=>u.kind==='altar'&&u.built===1)){const dead=heroRoster(s,t).find(h=>h.hp<=0&&!us.some(v=>v.queue.some(q=>q.revive===h.id)));if(dead){if(command(s,t,{type:'revive',ids:[b.id],target:dead.id})===null)continue;}const roster=heroRoster(s,t),queued=heroQueued(s,t),heroClass=[team.heroClass,...heroes.map((_,i)=>i)].find(i=>!roster.some(h=>h.heroClass===i)&&!queued.some(q=>q.heroClass===i));if(roster.length+queued.length<team.tier&&command(s,t,{type:'train',ids:[b.id],kind:'hero',heroClass})===null)continue;command(s,t,{type:'train',ids:[b.id],kind:flyers[team.faction]});}
      if((team.tier>=2||warArmy(s,t))&&!us.some(u=>u.kind==='workshop'))build('workshop');
      if([1,3].includes(team.faction)&&team.tier>=2&&!us.some(u=>u.kind===(team.faction===1?'spiritlodge':'temple')))build(team.faction===1?'spiritlodge':'temple');
      for(const b of us.filter(u=>casterTraining[u.kind])){const school=casterTraining[b.kind],upgrade=b.kind==='temple'&&Object.keys(skeletonResearch).find(k=>!team[skeletonResearch[k].field]&&team.tier>=skeletonResearch[k].tier);if(b.casterResearch)continue;if(!b.queue.length&&upgrade&&command(s,t,{type:'skeletonResearch',ids:[b.id],upgrade})===null)continue;if(!b.queue.length&&(team[school.field]||0)<(team.tier>=3?2:1)&&command(s,t,{type:'casterResearch',ids:[b.id]})===null)continue;command(s,t,{type:'train',ids:[b.id],kind:school.unit});}
      for(const b of us.filter(u=>u.kind==='workshop')){command(s,t,{type:'rally',ids:[b.id],x:foe[0],z:foe[1]});command(s,t,{type:'train',ids:[b.id],kind:trainable(s,b)[0]});}
      for(const b of us.filter(u=>u.kind==='barracks')){if(team.faction===3&&team.gold>200&&!team.cannibalize)command(s,t,{type:'cannibalizeResearch',ids:[b.id]});const roster=trainable(s,b).filter(k=>!trainingRequirement(s,k,t));if(roster.length)command(s,t,{type:'train',ids:[b.id],kind:roster[Math.floor(s.frame/40)%(warProducer(s,b)||team.tier>=2?roster.length:Math.min(2,roster.length))]});if(team.gold>500&&!warProducer(s,b))command(s,t,{type:'upgrade',ids:[b.id]});}
      for(const w of us.filter(u=>(u.kind==='worker'||u.kind==='ghoul'&&team.faction===3&&us.filter(v=>v.kind==='ghoul'&&v.order?.type==='gather').length<2)&&!u.inside&&!u.order)){const mining=us.filter(v=>v.kind==='worker'&&v.order?.type==='gather'&&s.resources[v.order.resource]?.kind==='mine').length,kind=w.kind==='ghoul'||miningWisp(s,w)&&!s.resources.some(r=>entangledMine(s,r)?.team===t&&wispWorkers(s,r).length<5)?'tree':acolyte(s,w)||mining<(miningWisp(s,w)?Math.min(5,Math.max(3,us.filter(v=>v.kind==='worker'&&!v.consumed).length-2)):3)?'mine':'tree',ri=s.resources.findIndex(r=>r.amount>0&&r.kind===kind&&canGather(s,w,r)&&distance(w,r)<16&&(!acolyte(s,w)||hauntedMine(s,r)?.team===t&&mineWorkers(s,r).length<5)&&(!miningWisp(s,w)||r.kind!=='mine'||entangledMine(s,r)?.team===t&&wispWorkers(s,r).length<5));const tree=wisp(s,w)&&kind==='tree'?s.resources.map((r,i)=>({r,i,occupied:us.filter(v=>v.id!==w.id&&v.order?.type==='gather'&&v.order.resource===i).length})).filter(v=>v.r.kind==='tree'&&v.r.amount>0&&distance(w,v.r)<16).sort((a,b)=>a.occupied-b.occupied||distance(w,a.r)-distance(w,b.r))[0]?.i:undefined;if((tree??ri)>=0&&(w.kind!=='ghoul'||us.filter(v=>v.kind==='ghoul'&&v.order?.type==='gather').length<2))command(s,t,{type:'gather',ids:[w.id],resource:tree??ri});}
      if(s.frame>200)for(const u of us.filter(u=>u.speed&&u.kind!=='worker'&&!u.order))u.order={type:'attackMove',x:foe[0],z:foe[1]};
    }
    for(const h of us.filter(u=>u.kind==='hero')){if(s.mode==='skirmish'&&h.hp<h.maxHp*.3&&h.inventory.includes(townPortal.item)&&distance(h,{x:base[0],z:base[1]})>12&&command(s,t,{type:'useItem',ids:[h.id],slot:h.inventory.indexOf(townPortal.item),item:townPortal.item})===null)continue;for(let n=0;n<10&&h.skillPoints;n++){const slot=[3,0,1,2].find(i=>h.skills[i]<(i===3?1:3)&&h.level>=(i===3?6:h.skills[i]*2+1));if(slot===undefined)break;command(s,t,{type:'learn',ids:[h.id],slot});}if(s.mode==='moba'&&!h.order)h.order={type:'attackMove',x:foe[0],z:foe[1]};const e=s.units.find(u=>u.team!==t&&u.hp>0&&!asleep(s,u)&&isVisible(s,t,u)&&distance(u,h)<9);if(e)for(const slot of [3,0,1,2]){const spell=unitType(h).spells[slot],self=['heal','shield','haste','avatar'].includes(spell.kind),target=self?h:e;if(spell.kind==='heal'&&h.hp>h.maxHp*.75)continue;command(s,t,{type:'spell',ids:[h.id],slot,x:target.x,z:target.z});}}
    for(const u of us.filter(u=>u.kind==='necromancer'||u.kind==='shaman')){
      const enemies=s.units.filter(v=>v.hp>0&&v.team!==t&&isVisible(s,t,v)&&distance(u,v)<=6);
      if(u.kind==='necromancer'){if(enemies.length)u.raiseDeadAuto=true;const enemy=enemies.find(v=>types[v.kind].organic&&!v.cripple);if(enemy)command(s,t,{type:'casterSpell',ids:[u.id],spell:'cripple',target:enemy.id});const ally=enemies.length&&us.filter(v=>types[v.kind].organic&&v.damage>0&&v.hp>180&&!v.frenzy&&distance(u,v)<=5).sort((a,b)=>b.damage-a.damage)[0];if(ally)command(s,t,{type:'casterSpell',ids:[u.id],spell:'frenzy',target:ally.id});}
      else {const target=us.find(v=>(v.cripple>0||v.purgeLeft>0||v.lightningShield>0&&us.some(w=>w.id!==v.id&&distance(w,v)<=1.6))&&distance(u,v)<=7)||enemies.find(v=>v.summoned||v.frenzy>0||v.shield>0||v.haste>0||v.bloodlust>0);if(target)command(s,t,{type:'casterSpell',ids:[u.id],spell:'purge',target:target.id});else {const carrier=enemies.find(v=>!types[v.kind].flying&&!v.lightningShield&&distance(u,v)<=6&&enemies.some(w=>w.id!==v.id&&!types[w.kind].flying&&distance(w,v)<=1.6)&&!us.some(w=>distance(w,v)<=1.6));if(carrier)command(s,t,{type:'casterSpell',ids:[u.id],spell:'lightningShield',target:carrier.id});}}
    }
    if(team.cannibalize)for(const u of us.filter(u=>Object.hasOwn(cannibalize.healing,u.kind)&&u.hp<u.maxHp*.75&&!s.units.some(v=>v.team!==t&&v.hp>0&&!v.inside&&isVisible(s,t,v)&&distance(u,v)<8)))command(s,t,{type:'cannibalize',ids:[u.id]});
    if(s.mode!=='moba'&&team.faction===3&&s.itemShopVersion<2)for(const u of us)u.hp=Math.min(u.maxHp,u.hp+2);
  }
  const portalLeft=u=>u.order?.type==='townPortal'?u.order.left:u.portalLeft||0;
  function finishPortal(s,u){
    const o=u.order,base=s.units.find(v=>v.id===o.target&&rootedBase(v)&&v.team===u.team&&v.hp>0&&v.built===1);if(!base){u.order=null;s.announcements[u.team]='Town Portal cancelled: destination base is unavailable';return;}
    const passengers=[u,...s.units.filter(v=>v.id!==u.id&&v.team===u.team&&v.hp>0&&!v.inside&&v.built===1&&types[v.kind].speed&&(!v.summoned||s.frame<v.expires)&&!v.root&&!(v.cyclone>0)&&distance(u,v)<=townPortal.radius&&(!['worker','ghoul'].includes(v.kind)||!['gather','build','construct','repair'].includes(v.order?.type)))],slots=new Map(),reserved=s.units.filter(v=>v.hp>0&&!v.inside&&mobile(v)&&!passengers.includes(v)).map(v=>({x:v.x,z:v.z,r:movementRadius(v),flying:!!types[v.kind].flying}));
    const cells=[{x:o.x,z:o.z},...Array.from({length:1024},(_,i)=>({x:i%32*2-31,z:Math.floor(i/32)*2-31}))].filter(p=>Math.abs(p.x)<=30&&Math.abs(p.z)<=30).sort((a,b)=>distance(a,o)-distance(b,o)||a.z-b.z||a.x-b.x);
    for(const v of passengers){const flying=!!types[v.kind].flying,r=movementRadius(v),p=cells.find(p=>(flying||!solid(s,p.x,p.z,0,-1,r))&&reserved.every(b=>b.flying!==flying||distance(p,b)>=r+b.r+.1));if(!p){if(v===u){u.order=null;s.announcements[u.team]='Town Portal failed: no free arrival space';return;}continue;}slots.set(v.id,p);reserved.push({...p,r,flying});}
    const from={x:u.x,z:u.z};for(const v of passengers){const p=slots.get(v.id);if(!p)continue;v.x=p.x;v.z=p.z;v.portalArrivalFrame=s.frame;v.order=null;v.waypoints=[];v.path=[];v.pathAt=-100;delete v.dest;delete v.workResume;}
    s.announcements[u.team]='Town Portal transported '+slots.size+' units';s.events.push({type:'spell',art:'townPortal',slot:2,heroClass:u.heroClass,...from,team:u.team},{type:'spell',art:'townPortal',slot:2,heroClass:u.heroClass,x:u.x,z:u.z,team:u.team});visibility(s);
  }
  function tick(s){
    for(const r of s.resources)if(r.felled)r.felled.age=Math.min(TREE_FALL_LIFETIME,(Math.round(r.felled.age/DT)+1)*DT);
    s.corpses=s.corpses.filter(c=>{if(s.winner!==null||!s.units.some(u=>u.hp>0&&!u.inside&&u.order?.type==='cannibalize'&&u.order.active&&u.order.target===c.id))c.age+=DT;return c.age<CORPSE_LIFETIME;});
    if(s.winner!==null)return;simulating.add(s);const night=isNight(s);s.frame++;s.events=s.pendingEvents||[];s.pendingEvents=[];if(night!==isNight(s))visibility(s);
    updateTechnology(s);updateShops(s);
    if(s.mode==='moba'&&s.frame>=s.nextWave&&spawnLaneWave(s)){s.wave++;s.nextWave=s.frame+Math.round(s.map.waveInterval/DT);}
    if(s.mode==='td'&&s.frame>=s.nextWave&&s.units.length+s.tdPending.length+5+(s.wave+1)*2<=LIMIT){
      s.wave++;s.nextWave=s.frame+Math.round(s.map.waveInterval/DT);
      if(s.wave<=s.map.waves)for(let i=0;i<5+s.wave*2;i++){const boss=s.wave%4===0&&i===0,hp=(100+s.wave*40)*(boss?5:s.wave%3===2?1.4:1);s.tdPending.push({hp,speed:(3+s.wave*.12)*(s.wave%3===0?1.45:1),tdBoss:boss});}
    }
    if(s.mode==='td'&&s.tdPending.length&&s.units.length<LIMIT&&!solid(s,...tdPath[0])&&s.units.every(u=>u.hp<=0||u.inside||types[u.kind].flying||!types[u.kind].speed||Math.hypot(u.x-tdPath[0][0],u.z-tdPath[0][1])>=movementRadius(u)+.55)){const next=s.tdPending.shift();spawn(s,'creep',1,...tdPath[0],{...next,maxHp:next.hp,route:tdPath,waypoint:1,td:true});}
    if(s.frame%40===0)for(let t=0;t<2;t++)if(s.teams[t].ai)ai(s,t);
    if(s.frame%10===0&&s.mode==='moba')for(const t of s.teams)t.gold+=3;
    for(const u of s.units){if(u.hp<=0||!(u.lightningShield>0))continue;const elapsed=Math.min(DT,u.lightningShield);if(!u.inside&&!(u.summoned&&s.frame>=u.expires))for(const v of s.units)if(v.id!==u.id&&v.hp>0&&!v.inside&&mobile(v)&&!types[v.kind].flying&&!types[v.kind].magicImmune&&distance(u,v)<=casterSpells.lightningShield.radius)damage(s,u.lightningSource,v,casterSpells.lightningShield.power*elapsed,'lightning');u.lightningShield=Math.max(0,u.lightningShield-DT);if(!u.lightningShield)delete u.lightningSource;}
    for(const u of s.units){
      if(u.kind==='entangledmine'&&u.hp<=0&&u.entangleBase)destroyEntangle(s,u);
      updateRacialUnit(s,u);if(u.hp<=0){if(u.kind==='hero'&&s.mode==='skirmish'){u.cd=Math.max(0,u.cd-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));u.itemCooldown=Math.max(0,(u.itemCooldown||0)-DT);}if(u.respawn>0){u.respawn-=DT;if(u.respawn<=0){s.corpses=s.corpses.filter(c=>c.id!==u.id);[u.x,u.z]=s.map.spawns[u.team];u.hp=u.maxHp;u.mana=150;u.order=null;u.waypoints=[];u.path=[];for(const effect of ['stun','root','slow','cold','haste','avatar','shieldLeft','shield','frenzy','cripple','purgeLeft','castLeft','bloodlust','lightningShield','speedScroll','itemMagicImmune','corruption','roar','rejuvenation','faerieFire','cyclone'])u[effect]=0;delete u.faerieTeam;delete u.frenzySource;delete u.lightningSource;}}continue;}
      if(druidUnit(u)&&isNight(s))u.hp=Math.min(u.maxHp,u.hp+druidRules.units[u.kind].nightRegen*DT);
      if(ancientWarRules.units[u.kind]?.nightRegen&&isNight(s))u.hp=Math.min(u.maxHp,u.hp+ancientWarRules.units[u.kind].nightRegen*DT);
      if(productionAncient(u)&&isNight(s))u.hp=Math.min(u.maxHp,u.hp+productionAncientUnits[u.kind].nightRegen*DT);
      if(wisp(s,u)&&isNight(s))u.hp=Math.min(u.maxHp,u.hp+wispRules.nightRegen*DT);
      if(wisp(s,u)&&u.stun>0&&u.order?.bonded){delete u.order.bonded;u.gatherCd=0;}
      if(u.inside){if(u.miningInside)tickMineResident(s,u);continue;}
      if(u.summoned&&s.frame>=u.expires){u.hp=0;continue;}
      for(const effect of ['stun','root','haste','avatar','shieldLeft'])if(u[effect]>0)u[effect]=Math.max(0,u[effect]-DT);if(!u.shieldLeft)u.shield=0;
      if(u.kind==='hero')u.itemCooldown=Math.max(0,(u.itemCooldown||0)-DT);
      u.cd=Math.max(0,u.cd-DT*attackRate(u));if(['worker','ghoul'].includes(u.kind))u.gatherCd=Math.max(0,(u.gatherCd||0)-DT);u.spell=u.spell.map(v=>Math.max(0,v-DT));if(u.moonWellRules!==1)u.mana=Math.min(maxMana(u),u.mana+DT*(druidUnit(u)?druidRules.units[u.kind].manaRegen+.325*u.druidRank:['necromancer','shaman'].includes(u.kind)?.667+.25*(u.casterRank||0):2));updateMoonWell(s,u);if(u.kind==='necromancer')u.raiseDeadCd=Math.max(0,u.raiseDeadCd-DT);
      u.slow=Math.max(0,(u.slow||0)-DT);if(u.cold>0)u.cold=Math.max(0,u.cold-DT);
      if(u.frenzy>0){const elapsed=Math.min(DT,u.frenzy);u.frenzy=Math.max(0,u.frenzy-DT);damage(s,u.frenzySource,u,4*elapsed,'drain');if(!u.frenzy)delete u.frenzySource;if(u.hp<=0)continue;}
      if(u.rejuvenation>0){const elapsed=Math.min(DT,u.rejuvenation);u.hp=Math.min(u.maxHp,u.hp+Number(druidRules.commands.Arej.sourceRow.DataA1)/druidRules.commands.Arej.duration*elapsed);u.rejuvenation=Math.max(0,u.rejuvenation-DT);}
      for(const effect of ['roar','faerieFire','cyclone','roarCd','rejuvenationCd','faerieFireCd','cycloneCd','druidCastLeft','cripple','purgeLeft','castLeft','frenzyCd','crippleCd','purgeCd','bloodlust','bloodlustCd','lightningShieldCd'])if(u[effect]>0)u[effect]=Math.max(0,u[effect]-DT);
      if(!u.faerieFire)delete u.faerieTeam;if(!u.druidCastLeft){delete u.druidCastLeft;delete u.druidCastSpell;}if(u.cyclone>0)continue;
      if(u.sanctuary){u.order=null;u.waypoints=[];u.path=[];continue;}if(u.order?.type==='townPortal'){u.order.left=Math.max(0,u.order.left-DT);if(u.order.left<1e-8)finishPortal(s,u);continue;}
      if(types[u.kind].heal&&s.frame%10===0)for(const ally of s.units)if(ally.team===u.team&&ally.hp>0&&distance(ally,u)<6)ally.hp=Math.min(ally.maxHp,ally.hp+types[u.kind].heal);
      if(u.kind==='entangledmine'){tickEntangledMine(s,u);continue;}
      if(u.entangleCast){const cast=u.entangleCast,r=s.resources[cast.resource];if(!entangleTarget(s,u,r)){delete u.entangleCast;s.announcements[u.team]='Entangle canceled: gold deposit is no longer available';}else{cast.left=Math.max(0,cast.left-DT);if(cast.left<1e-8){delete u.entangleCast;if(!startEntangle(s,u,r))s.announcements[u.team]='Entangle canceled: unit capacity reached';}}}
      if(u.built<1){construct(s,u);if(u.built===1&&ancientMain(u))autoEntangle(s,u);continue;}
      if(u.guardTowerUpgrade){const r=u.guardTowerUpgrade;r.left=Math.max(0,r.left-DT);if(r.left<1e-8){const d=types.guardtower,fraction=u.hp/u.maxHp;u.kind='guardtower';u.maxHp=d.hp;u.hp=d.hp*fraction;u.damage=d.damage;delete u.guardTowerUpgrade;}}
      if(u.zigguratUpgrade){const r=u.zigguratUpgrade;r.left=Math.max(0,r.left-DT);if(r.left<1e-8){const d=types[r.kind],fraction=u.hp/u.maxHp;u.kind=r.kind;u.maxHp=d.hp;u.hp=u.maxHp*fraction;u.damage=d.damage;u.order=null;delete u.zigguratUpgrade;}}
      if(u.baseUpgrade){const r=u.baseUpgrade;r.left=Math.max(0,r.left-DT);if(r.left<1e-7){const extra=mainBase(s,u,r.tier).hp-mainBase(s,u).hp;u.maxHp+=extra;u.hp=Math.min(u.maxHp,u.hp+extra);u.upgradeTier=r.tier;if(s.mode==='skirmish'){u.baseRules=1;if(ancient(u))u.uprooted??=false;const d=unitType(u);u.damage=d.damage;u.armorValue=d.armorValue;}delete u.baseUpgrade;updateTechnology(s);s.events.push({type:'construction',x:u.x,z:u.z,team:u.team});}}
      if(u.cannibalizeResearch){u.cannibalizeResearch=Math.max(0,u.cannibalizeResearch-DT);if(!u.cannibalizeResearch){s.teams[u.team].cannibalize=1;delete u.cannibalizeResearch;}}
      if(u.casterResearch){const r=u.casterResearch;r.left=Math.max(0,r.left-DT);if(!r.left){if(r.upgrade)s.teams[u.team][skeletonResearch[r.upgrade].field]=1;else{const school=casterTraining[u.kind];s.teams[u.team][school.field]=r.rank;for(const v of s.units)if(v.team===u.team&&v.kind===school.unit){const extra=40*(r.rank-(v.casterRank||0));v.casterRank=r.rank;v.maxHp+=extra;if(v.hp>0)v.hp+=extra;}}delete u.casterResearch;}}
      if(u.ancientRegen>0){const elapsed=Math.min(DT,u.ancientRegen);u.hp=Math.min(u.maxHp,u.hp+ancientRules.healing/ancientRules.duration*elapsed);u.ancientRegen=Math.max(0,u.ancientRegen-DT);if(u.ancientRegen<1e-8)delete u.ancientRegen;}
      if(u.druidShift){const r=u.druidShift;r.left=Math.max(0,r.left-DT);if(r.left<1e-8)finishDruidMorph(s,u);continue;}
      if(u.ancientShift){const r=u.ancientShift;r.left=Math.max(0,r.left-DT);if(r.left<1e-8){if(!r.uprooted&&!rootSite(s,u)){delete u.ancientShift;u.speed=ancientMoveSpeed(u);s.announcements[u.team]='Root canceled: footprint became blocked';}else{u.uprooted=r.uprooted;delete u.ancientShift;u.speed=unitType(u).speed;if(productionAncient(u))u.damage=unitType(u).damage;if(!u.uprooted&&ancientMain(u))autoEntangle(s,u);}navigationCache.delete(s);trafficCache.delete(s);s.events.push({type:'construction',x:u.x,z:u.z,team:u.team});}continue;}
      if(u.queue.length&&!u.uprooted){
        const q=u.queue[0];q.left=Math.max(0,q.left-DT);if(q.left<1e-8)q.left=0;
        if(q.left===0&&q.research){u.queue.shift();if(q.research==='naturesBlessing'){s.teams[u.team].naturesBlessing=1;for(const v of s.units)if(v.team===u.team)blessUnit(s,v);s.announcements[u.team]=natureRules.name+' research complete';}else if(Object.hasOwn(druidRules.research,q.research))druidResearchComplete(s,u,q);else nightResearchComplete(s,u,q);}
        else if(q.left===0&&(q.revive||s.units.length<LIMIT)){
          let p=null;for(let a=0;a<12;a++){const x=u.x+Math.cos(a*Math.PI/6)*4,z=u.z+Math.sin(a*Math.PI/6)*4;if(Math.abs(x)<=30&&Math.abs(z)<=30&&(types[q.kind].flying||!solid(s,x,z,0,-1,movementRadius({kind:q.kind})))&&s.units.every(v=>v.hp<=0||v.inside||!mobile(v)||!!types[v.kind].flying!==!!types[q.kind].flying||Math.hypot(x-v.x,z-v.z)>=movementRadius(v)+movementRadius({kind:q.kind})+.05)){p=[x,z];break;}}
          if(p){const v=q.revive?s.units.find(v=>v.id===q.revive&&v.team===u.team&&v.kind==='hero'&&v.hp<=0):spawn(s,q.kind,u.team,...p,q.kind==='hero'?{heroClass:q.heroClass}:{});if(v){u.queue.shift();if(q.kind==='hero'&&!q.revive&&!s.teams[u.team].portalGranted){setInventory(v,[...v.inventory,townPortal.item]);s.teams[u.team].portalGranted=true;}if(q.revive){[v.x,v.z]=p;v.hp=v.maxHp;v.mana=100;v.respawn=0;v.order=null;v.waypoints=[];v.path=[];v.pathAt=-100;delete v.dest;for(const effect of ['stun','root','slow','cold','haste','avatar','shieldLeft','shield','frenzy','cripple','purgeLeft','castLeft','bloodlust','lightningShield','speedScroll','itemMagicImmune','corruption'])v[effect]=0;delete v.frenzySource;delete v.lightningSource;delete v.castYaw;delete v.workResume;s.announcements[v.team]=unitType(v).label+' (level '+v.level+') has been revived.';s.events.push({type:'spell',slot:1,heroClass:v.heroClass,x:v.x,z:v.z,team:v.team});}if(u.rally)v.order={type:v.kind==='worker'?'move':'attackMove',...u.rally};}}
        }
      }
      if(u.order?.type==='eatTree'){const r=s.resources[u.order.resource];if(!r||r.amount<=0||!s.visible[u.team][index(r.x,r.z)]){u.order=null;u.path=[];}else if(distance(u,r)>ancientRules.eatReach||!traversable(s.map,u.x,u.z,r.x,r.z))move(s,u,r.x,r.z,ancientRules.eatReach-.05);else{r.amount=0;r.felled={frame:s.frame,yaw:Math.atan2(r.x-u.x,r.z-u.z),age:0};learnResources(s);navigationCache.delete(s);trafficCache.delete(s);u.ancientRegen=ancientRules.duration;u.order=null;u.path=[];s.events.push({type:'construction',x:r.x,z:r.z,team:u.team});}continue;}
      if(u.order?.type==='cannibalize'){
        const o=u.order,body=s.corpses.find(c=>c.id===o.target);if(!body||u.stun>0||u.hp>=u.maxHp||!s.visible[u.team][index(body.x,body.z)]){if(body&&o.active&&u.hp>=u.maxHp)s.corpses=s.corpses.filter(c=>c.id!==body.id);u.order=null;u.path=[];}
        else if(distance(u,body)>cannibalize.reach){o.active=false;move(s,u,body.x,body.z,cannibalize.reach-.1);}
        else {o.active=true;body.age=Math.max(body.age,2);u.yaw=Math.atan2(body.x-u.x,body.z-u.z);u.hp=Math.min(u.maxHp,u.hp+cannibalize.healing[u.kind]*Math.min(DT,o.left));o.left=Math.max(0,o.left-DT);if(o.left<1e-8||u.hp>=u.maxHp){s.corpses=s.corpses.filter(c=>c.id!==body.id);u.order=null;}}
        continue;
      }
      if(u.stun>0||asleep(s,u)||isHidden(s,u)){if(u.order?.type==='druidSpell'){delete u.order.castLeft;}continue;}
      if(druidUnit(u)){autoDruidSpell(s,u);if(u.order?.type==='druidSpell'){tickDruidSpell(s,u);continue;}if(u.druidCastLeft>0)continue;}
      if(u.order?.type==='sentinel'){castSentinel(s,u);continue;}
      if(['attackTree','attackGround'].includes(u.order?.type)){groundAttackOrder(s,u);continue;}
      if(u.order?.type==='detonate'){const o=u.order;if(distance(u,o)<=detonateRules.range+1e-7)detonate(s,u);else move(s,u,o.x,o.z,detonateRules.range);continue;}
      if(u.kind==='necromancer'){if(u.raiseDeadAuto&&!['move','patrol'].includes(u.order?.type))raise(s,u);if(u.castLeft>0||u.raiseDeadCd>raiseDead.cooldown-.8)continue;}
      if(u.kind==='shaman'){if(u.bloodlustAuto&&(u.casterRank||0)>=2&&!u.castLeft&&!['move','patrol'].includes(u.order?.type)&&s.units.some(v=>v.team!==u.team&&v.hp>0&&!v.inside&&isVisible(s,u.team,v)&&distance(u,v)<=8)){const target=s.units.filter(v=>v.team===u.team&&v.hp>0&&!v.inside&&v.damage>0&&types[v.kind].organic&&!types[v.kind].magicImmune&&!v.bloodlust&&distance(u,v)<=6&&attackClear(s,u,v)).sort((a,b)=>b.damage-a.damage||a.id-b.id)[0];if(target)castUnit(s,u,{spell:'bloodlust',target:target.id});}if(u.castLeft>0)continue;}
      if(u.order?.type==='pickup'){const d=s.loot.find(d=>d.id===u.order.target);if(!d||!s.visible[u.team][index(d.x,d.z)]||u.inventory.length>=6&&!d.relic){u.order=null;u.path=[];}else if(distance(u,d)<=2.5&&traversable(s.map,u.x,u.z,d.x,d.z)){pickup(s,u,d);u.order=null;u.path=[];}else move(s,u,d.x,d.z,2.25);continue;}
      if(u.kind==='worker'&&u.order?.type==='build'){
        const o=u.order;if(distance(u,o)>15){move(s,u,o.x,o.z,types[o.kind].radius+1.1);continue;}const pending=u.waypoints,error=command(s,u.team,{...o,ids:[u.id]});u.waypoints=pending;if(error){s.announcements[u.team]='Queued build skipped: '+error;advanceOrder(s,u);}else if(!u.order)advanceOrder(s,u);continue;
      }
      if(u.kind==='worker'&&['construct','repair'].includes(u.order?.type)){work(s,u);continue;}
      if(['worker','ghoul'].includes(u.kind)&&u.order?.type==='gather'){gather(s,u);continue;}
      if(u.td){const p=u.route[u.waypoint];if(!p){u.hp=0;s.lives-=u.tdBoss?5:1;if(s.lives<=0)s.winner=1;continue;}if(move(s,u,p[0],p[1],u.waypoint===u.route.length-1?4.5:1.3))u.waypoint++;continue;}
      if(u.entangleCast)continue;
      if(ancientWarRules.units[u.kind]&&isHidden(s,u)){delete u.weaponWindup;continue;}
      let target=u.order?.type==='attack'?s.units.find(v=>v.id===u.order.target&&canTarget(s,u,v)&&isVisible(s,u.team,v)):null;
      if(u.order?.type==='attack'&&!target)u.order=null;
      if(u.order?.type!=='move'&&u.damage>0&&!target){let best=Infinity;for(const v of s.units){if(v.team===u.team||v.hp<=0||v.kind==='critter'||asleep(s,v)||!canAttack(u,v)||distance(u,v)<(unitType(u).minRange||0)||(u.team>=0&&!isVisible(s,u.team,v))||u.order?.type==='hold'&&!attackInRange(s,u,v))continue;const d=distance(u,v);if(d<best&&(u.order?.type==='hold'||d<Math.max(unitType(u).range,8))){target=v;best=d;}}}
      if(target&&u.team===-1&&u.home)u.awakeUntil=s.frame+100;
      if(u.weaponWindup&&(!target||target.id!==u.weaponWindup.target||!attackInRange(s,u,target)))delete u.weaponWindup;
      if(target){const range=attackRange(u,target)+(types[target.kind].radius||.3),inRange=attackInRange(s,u,target),slot=meleeSlot(s,u,target);
        if(u.weaponWindup){u.weaponWindup.left=Math.max(0,u.weaponWindup.left-DT*attackRate(u));if(u.weaponWindup.left<1e-8&&fire(s,u,target))delete u.weaponWindup;}
        else if(inRange&&u.cd<=0){const point=unitType(u).damagePoint;if(point){u.weaponWindup={target:target.id,left:point};u.cd=unitType(u).cooldown;u.yaw=Math.atan2(target.x-u.x,target.z-u.z);}else fire(s,u,target);}
        if(target.hp>0&&u.order?.type!=='hold'){if(slot)move(s,u,slot.x,slot.z,.12);else if(!inRange)move(s,u,target.x,target.z,range*.98);}
      }
      else if(u.order&&['move','attackMove','patrol'].includes(u.order.type)){
        if(!types[u.kind].flying&&solid(s,u.order.x,u.order.z,u.id,u.team)||s.units.some(v=>v.id!==u.id&&v.team===u.team&&v.hp>0&&!v.inside&&mobile(v)&&(!v.order||v.order.type==='hold')&&!!types[v.kind].flying===!!types[u.kind].flying&&Math.hypot(v.x-u.order.x,v.z-u.order.z)<movementRadius(u)+movementRadius(v)+.1)){const p=formation(s,[u],u.order.x,u.order.z)?.get(u.id);if(p){u.order.x=p[0];u.order.z=p[1];u.path=[];u.pathAt=-100;}}
        if(move(s,u,u.order.x,u.order.z,.12)){if(u.order.type==='patrol'){const o=u.order;[o.x,o.z,o.fromX,o.fromZ]=[o.fromX,o.fromZ,o.x,o.z];}else advanceOrder(s,u);u.path=[];u.pathAt=-100;}
      }
      else if(!u.order&&u.route){const p=u.route[u.waypoint];if(p&&move(s,u,p[0],p[1],1.5))u.waypoint++;}
      else if(!u.order&&u.home&&distance(u,{x:u.home[0],z:u.home[1]})>3)move(s,u,...u.home,2);
      if(s.mode!=='skirmish'&&u.kind==='hero'&&s.units.some(v=>v.team===u.team&&rootedBase(v)&&v.hp>0&&v.built===1&&distance(u,v)<8))u.hp=Math.min(u.maxHp,u.hp+DT*12);
    }
    advanceProjectiles(s);
    for(const zone of s.zones){zone.left-=DT;zone.pulse-=DT;if(zone.pulse<=0){zone.pulse+=1;for(const v of s.units)if(v.team!==zone.team&&v.hp>0&&v.order?.type!=='townPortal'&&!v.itemMagicImmune&&!types[v.kind].magicImmune&&distance(v,zone)<=zone.radius){damage(s,{kind:'hero',heroClass:zone.heroClass,team:zone.team},v,zone.damage,'spell');if(zone.slow)v.slow=zone.slow;}s.events.push({type:'spell',x:zone.x,z:zone.z,slot:zone.slot,heroClass:zone.heroClass,team:zone.team});}}s.zones=s.zones.filter(z=>z.left>0);
    for(const b of s.units)if(b.hp<=0&&!types[b.kind].speed)finishWork(s,b);
    for(const u of s.units)if(u.order?.type==='townPortal'&&!s.units.some(b=>b.id===u.order.target&&b.kind==='hall'&&b.team===u.team&&b.hp>0&&b.built===1))finishPortal(s,u);
    s.units=s.units.filter(u=>u.hp>0||u.respawn>0||s.mode==='skirmish'&&u.kind==='hero'&&u.team>=0);
    if(s.mode==='rpg'){
      const h=s.units.find(u=>u.kind==='hero'&&u.team===0&&u.hp>0);
      if(h){s.loot=s.loot.filter(d=>{if(d.manual||distance(h,d)>2.5||!traversable(s.map,h.x,h.z,d.x,d.z)||!d.relic&&h.inventory.length>=6)return true;if(d.relic)s.quest.relic=true;else equip(h,d.item,d.uses);return false;});
        const q=s.quest,done=[q.scouts>=3,q.relic,q.boss,distance(h,{x:s.map.spawns[0][0],z:s.map.spawns[0][1]})<7];
        if(q.stage<4&&done[q.stage]){q.stage++;experience(h,180);s.teams[0].gold+=150;s.announcement=q.stage===4?'The covenant is restored.':questNames[q.stage];s.events.push({type:'spell',slot:1,x:h.x,z:h.z,team:0});if(q.stage===4)s.winner=0;}
      }
    }
    runTriggers(s);
    if(s.mode==='td'&&s.wave>=s.map.waves&&!s.tdPending.length&&!s.units.some(u=>u.td)&&s.frame>s.nextWave-Math.round(s.map.waveInterval/DT)+10)s.winner=0;
    updateTechnology(s);updateSentinels(s);if(s.frame%3===0)visibility(s);simulating.delete(s);
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
    const s=clone(raw),legacyBaseRules=s.baseRulesVersion===undefined,legacyBase=s.baseTechVersion===undefined,legacyHeroes=s.heroLifecycleVersion===undefined;if(!legacyHeroes&&s.heroLifecycleVersion!==1)throw Error('Invalid saved hero lifecycle');s.heroLifecycleVersion=1;s.druidVersion??=0;if(![0,1].includes(s.druidVersion))throw Error('Invalid saved Druid version');validateDruidResearch(s);s.nightElfTechVersion??=0;if(![0,1].includes(s.nightElfTechVersion)||s.nightElfTechVersion===1&&s.ancientWarVersion!==1)throw Error('Invalid saved Night Elf technology version');s.ancientWarVersion??=0;if(![0,1].includes(s.ancientWarVersion)||s.ancientWarVersion===1&&s.productionAncientVersion!==1)throw Error('Invalid saved Ancient of War version');s.productionAncientVersion??=0;if(![0,1].includes(s.productionAncientVersion))throw Error('Invalid saved production Ancient version');s.natureVersion??=0;if(![0,1].includes(s.natureVersion))throw Error('Invalid saved Nature\'s Blessing version');s.entangledVersion??=0;if(![0,1].includes(s.entangledVersion)||s.entangledVersion===1&&s.wispHarvestVersion!==1)throw Error('Invalid saved Entangled Mine version');s.wispHarvestVersion??=0;if(![0,1].includes(s.wispHarvestVersion))throw Error('Invalid saved Wisp harvest version');s.economyVersion??=0;if(![0,1].includes(s.economyVersion))throw Error('Invalid saved economy version');s.itemShopVersion??=0;if(![0,1,2].includes(s.itemShopVersion))throw Error('Invalid saved item shop version');s.map=validateMap(s.map);if(s.mode!==s.map.mode)throw Error('Save mode mismatch');if(s.nightElfTechVersion===1&&!Array.isArray(s.sentinels))throw Error('Missing saved Sentinels');s.sentinels??=[];if(s.itemShopVersion===2&&(s.blight===undefined||s.moonUntil===undefined||s.rng===undefined))throw Error('Missing saved racial item world state');s.blight??=[];s.moonUntil??=0;s.rng??=123456789;if(!Array.isArray(s.blight)||s.blight.length>64||s.blight.some(b=>!b||![-1,0,1].includes(b.team)||![b.x,b.z,b.radius].every(Number.isFinite)||Math.abs(b.x)>30||Math.abs(b.z)>30||b.radius!==3.5)||!Number.isSafeInteger(s.moonUntil)||s.moonUntil<0||s.moonUntil>s.frame+300||!Number.isSafeInteger(s.rng)||s.rng<0||s.rng>4294967295)throw Error('Invalid saved racial item world state');
    s.tdPending??=[];if(!Array.isArray(s.tdPending)||s.tdPending.length>LIMIT||s.mode!=='td'&&s.tdPending.length||s.tdPending.some(v=>!v||!Number.isFinite(v.hp)||v.hp<=0||v.hp>20000||!Number.isFinite(v.speed)||v.speed<=0||v.speed>15||typeof v.tdBoss!=='boolean'))throw Error('Invalid saved entrance queue');
    if(s.teams.some(t=>!t||![t.gold,t.wood,t.faction,t.upgrade,t.kills].every(finite)||!Number.isInteger(t.faction)||t.faction<0||t.faction>3))throw Error('Invalid saved teams');
    for(let team=0;team<2;team++){const t=s.teams[team],research=t.nightResearch;if(s.nightElfTechVersion===1&&(!research||typeof research!=='object'||Array.isArray(research)||Object.keys(research).length!==Object.keys(nightTechnology.research).length))throw Error('Missing saved Night Elf research');if(research!==undefined&&(typeof research!=='object'||Array.isArray(research)||Object.keys(research).some(key=>!Object.hasOwn(nightTechnology.research,key))||Object.entries(nightTechnology.research).some(([key,r])=>!Number.isInteger(research[key])||research[key]<0||research[key]>r.maxLevel||research[key]>0&&!nightArmy(s,team))))throw Error('Invalid saved Night Elf research levels');}
    for(let team=0;team<2;team++){const t=s.teams[team];t.naturesBlessing??=0;if(![0,1].includes(t.naturesBlessing)||t.naturesBlessing&&(s.natureVersion!==1||s.mode!=='skirmish'||t.faction!==2))throw Error('Invalid saved Nature\'s Blessing rank');}
    if(!legacyBase&&s.baseTechVersion!==1)throw Error('Invalid saved main base version');
    for(const t of s.teams){t.tier??=1;t.research??=0;if(!Number.isInteger(t.tier)||t.tier<1||t.tier>3||!finite(t.research)||t.research<0||t.research>40||t.research>0&&(t.tier===3||!legacyBase))throw Error('Invalid saved technology');}
    if(legacyBase){
      for(const u of s.units)if(u?.kind==='hall')u.upgradeTier=u.built===1?s.teams[u.team]?.tier||1:1;
      for(let team=0;team<2;team++){const t=s.teams[team],base=s.units.filter(u=>u?.kind==='hall'&&u.team===team&&u.hp>0&&u.built===1).sort((a,b)=>a.id-b.id)[0];if(t.research>0&&base)base.baseUpgrade={tier:t.tier+1,left:t.research,legacy:true};}
    }
    s.baseTechVersion=1;for(const t of s.teams)delete t.research;
    if(!legacyBaseRules&&s.baseRulesVersion!==1)throw Error('Invalid saved main base rules version');
    if(legacyBaseRules&&s.mode==='skirmish')for(const u of s.units)if(u?.kind==='hall'){u.baseRules=0;u.baseFaction=s.teams[u.team]?.faction||0;}s.baseRulesVersion=1;
    if(s.projectiles===undefined)s.projectiles=[];if(s.projectileSerial===undefined)s.projectileSerial=0;
    if(!Array.isArray(s.projectiles)||s.projectiles.length>PROJECTILE_LIMIT||!Number.isSafeInteger(s.projectileSerial)||s.projectileSerial<0)throw Error('Invalid saved projectiles');
    const shots=new Set();for(const p of s.projectiles){
      validateNightLevels(s,p,true);
      if(ancientWarRules.units[p?.kind]&&s.nightElfTechVersion===1&&(![p.fromX,p.fromZ].every(v=>finite(v)&&Math.abs(v)<=32)))throw Error('Invalid saved source projectile origin');
      if(p?.groundAttack!==undefined||p?.treeTarget!==undefined){if(!nightArmy(s,p.team)||p.kind!=='glaivethrower'||p.target!==0||p.groundAttack!==undefined&&p.groundAttack!==true||p.groundAttack&&p.treeTarget!==undefined||p.treeTarget!==undefined&&(!Number.isInteger(p.treeTarget)||raw.resources?.[p.treeTarget]?.kind!=='tree'||!p.nightLevels?.Repb))throw Error('Invalid saved Glaive ground projectile');}
      if(p?.baseRules!==undefined&&(!validBaseMetadata(p)||p.kind!=='hall')||p?.baseRules===undefined&&(p?.baseFaction!==undefined||p?.upgradeTier!==undefined))throw Error('Invalid saved main base projectile');
      if(ancientWarRules.units[p?.kind]){if(!finite(p.flightDistance)||p.flightDistance<=0||!finite(p.segmentTravel)||p.segmentTravel<0||p.segmentTravel>p.travel+1e-6)throw Error('Invalid saved source projectile trajectory');const r=unitType(p);if(r.bounceTargets){if(!Number.isInteger(p.bounceLeft)||p.bounceLeft<0||p.bounceLeft>=r.bounceTargets||!Array.isArray(p.bounceHits)||p.bounceHits.length!==r.bounceTargets-1-p.bounceLeft||p.bounceHits.some(id=>!Number.isSafeInteger(id)||id<1||id>s.serial||id===p.target||id===p.source)||new Set(p.bounceHits).size!==p.bounceHits.length)throw Error('Invalid saved Moon Glaive bounce');}else if(p.bounceLeft!==undefined||p.bounceHits!==undefined)throw Error('Unexpected saved bounce');}else if(['flightDistance','segmentTravel','bounceLeft','bounceHits'].some(k=>p[k]!==undefined))throw Error('Unexpected saved source projectile');
      if(p.ancientProduction!==undefined&&(p.ancientProduction!==1||s.productionAncientVersion!==1||!productionAncient(p)||p.kind!=='tower'||p.uprooted!==false||s.teams[p.team]?.faction!==2))throw Error('Invalid saved Ancient projectile form');
      if(!p||!Object.hasOwn(types,p.kind)||!validHero(p.heroClass)||![-1,0,1].includes(p.team)||!Number.isSafeInteger(p.id)||p.id<1||p.id>s.projectileSerial||shots.has(p.id)||!Number.isSafeInteger(p.source)||p.source<1||p.source>s.serial||!Number.isSafeInteger(p.target)||p.target<(p.groundAttack===true||p.treeTarget!==undefined?0:1)||p.target>s.serial||p.source===p.target||!Number.isSafeInteger(p.born)||p.born<0||p.born>s.frame||![p.x,p.y,p.z,p.baseY,p.toX,p.toY,p.toZ,p.travel,p.age,p.damage,p.splashDamage,p.vx,p.vy,p.vz].every(finite)||!projectileSpeed(p)||p.age<0||p.age>6||Math.abs(p.age-(s.frame-p.born)*DT)>1e-6||p.travel<0||p.travel>projectileSpeed(p)*p.age+1e-6||p.damage<0||p.splashDamage<0||p.orb!==undefined&&(!['fire','lightning','venom','corruption'].includes(p.orb)||p.kind!=='hero')||p.art!==projectileArt(p)&&!(p.art==='bolt'&&p.kind!=='archer'))throw Error('Invalid saved projectile');p.art=projectileArt(p);shots.add(p.id);
    }
    s.corpses??=[];if(legacyHeroes&&Array.isArray(s.corpses))s.corpses=s.corpses.filter(c=>c?.kind!=='hero');if(!Array.isArray(s.corpses)||s.corpses.length>CORPSE_LIMIT)throw Error('Invalid saved corpses');const bodies=new Set();
    for(const c of s.corpses){if(!c||!leavesCorpse(c.kind)||![-1,0,1].includes(c.team)||!Number.isSafeInteger(c.id)||c.id<1||c.id>s.serial||bodies.has(c.id)||!validHero(c.heroClass)||c.kind!=='hero'&&c.heroClass!==0||![c.x,c.y,c.z,c.yaw,c.age].every(finite)||Math.abs(c.x)>32||Math.abs(c.z)>32||c.y< -1||c.y>32||Math.abs(c.yaw)>Math.PI||c.age<0||c.age>=CORPSE_LIFETIME||typeof c.boss!=='boolean'||typeof c.large!=='boolean'||s.units.some(u=>u.id===c.id&&(u.hp>0||u.kind!==c.kind||u.team!==c.team)))throw Error('Invalid saved corpse');bodies.add(c.id);}
    if(legacyHeroes)for(const u of s.units)if(Array.isArray(u?.queue))for(const q of u.queue)if(q?.kind==='hero'){q.heroClass??=s.teams[u.team]?.heroClass??0;q.paidGold??=300;q.paidWood??=80;}
    const ids=new Set();for(const u of s.units){
      if(u?.sentinelUsed!==undefined&&(u.sentinelUsed!==true||nightSource(s,u)!=='esen'||!nightRank(s,u.team,'Resc')))throw Error('Invalid saved Sentinel use');
      if(u?.order?.type==='sentinel'&&(nightSource(s,u)!=='esen'||!nightRank(s,u.team,'Resc')||u.sentinelUsed||!Number.isInteger(u.order.resource)||raw.resources?.[u.order.resource]?.kind!=='tree'||u.hp<=0))throw Error('Invalid saved Sentinel order');
      if(['attackGround','attackTree'].includes(u?.order?.type)&&(u.kind!=='glaivethrower'||!nightArmy(s,u.team)||u.order.type==='attackTree'&&(!nightRank(s,u.team,'Repb')||!Number.isInteger(u.order.resource)||raw.resources?.[u.order.resource]?.kind!=='tree')||u.order.type==='attackGround'&&![u.order.x,u.order.z].every(v=>finite(v)&&Math.abs(v)<=30)||u.weaponWindup&&u.weaponWindup.target!==0))throw Error('Invalid saved Glaive ground order');
      if(u?.moonWellRules!==undefined&&(u.moonWellRules!==1||!nightArmy(s,u.team)||u.kind!=='farm'||typeof u.rechargeAuto!=='boolean'||!Number.isFinite(u.mana)||u.mana<0||u.mana>maxMana(u))||nightArmy(s,u?.team)&&u?.kind==='farm'&&u.moonWellRules!==1||u?.rechargeAuto!==undefined&&u.moonWellRules!==1)throw Error('Invalid saved Moon Well');
      if(!u||!Object.hasOwn(types,u.kind)||![-1,0,1].includes(u.team)||!Number.isSafeInteger(u.id)||u.id<1||u.id>s.serial||ids.has(u.id)||![u.x,u.z,u.hp,u.maxHp,u.damage,u.speed,u.cd,u.built,u.level,u.xp,u.mana,u.cargo,u.respawn,u.pathAt].every(finite)||u.maxHp<=0||!Array.isArray(u.path)||u.path.length>1024||!u.path.every(point)||!Array.isArray(u.spell)||u.spell.length!==4||!u.spell.every(finite)||!Array.isArray(u.queue)||u.queue.length>3||u.queue.some(q=>!q||!Object.hasOwn(types,q.kind)&&q.research!=='naturesBlessing'&&!Object.hasOwn(nightTechnology.research,q.research)&&!Object.hasOwn(druidRules.research,q.research)||!finite(q.left))||!Array.isArray(u.inventory)||u.inventory.length>6||u.inventory.some(i=>!Number.isInteger(i)||!items[i])||u.route!==undefined&&(!Array.isArray(u.route)||!u.route.every(point))||u.home!==undefined&&!point(u.home))throw Error('Invalid saved units');ids.add(u.id);
      if(u.ancientProduction!==undefined&&(u.ancientProduction!==1||!productionAncient(u)||s.productionAncientVersion!==1||s.mode!=='skirmish'||s.teams[u.team]?.faction!==2)||s.productionAncientVersion===1&&s.mode==='skirmish'&&s.teams[u.team]?.faction===2&&Object.hasOwn(productionAncientTypes,u.kind)&&!productionAncient(u))throw Error('Invalid saved production Ancient identity');
      if(u.weaponWindup!==undefined&&(!ancientWarRules.units[u.kind]&&!druidUnit(u)||!u.weaponWindup||!Number.isSafeInteger(u.weaponWindup.target)||u.weaponWindup.target<(['attackTree','attackGround'].includes(u.order?.type)?0:1)||u.weaponWindup.target>s.serial||u.weaponWindup.target===u.id||!finite(u.weaponWindup.left)||u.weaponWindup.left<0||u.weaponWindup.left>unitType(u).damagePoint||u.hp<=0))throw Error('Invalid saved weapon windup');
      if(u.huntersHallRules!==undefined&&(u.huntersHallRules!==1||u.kind!=='workshop'||!warArmy(s,u.team))||u.kind==='workshop'&&warArmy(s,u.team)&&u.huntersHallRules!==1)throw Error('Invalid saved Hunter\'s Hall identity');
      if(u.uprooted!==undefined&&!ancient(u)||u.ancientShift!==undefined&&!ancient(u)||u.ancientRegen!==undefined&&!ancient(u))throw Error('Unexpected saved Ancient state');
      if(ancient(u)){u.uprooted??=false;if(typeof u.uprooted!=='boolean'||u.uprooted&&u.built!==1||u.ancientShift&&(u.built!==1||u.baseUpgrade||typeof u.ancientShift.uprooted!=='boolean'||u.ancientShift.uprooted===u.uprooted||!finite(u.ancientShift.left)||u.ancientShift.left<=0||u.ancientShift.left>ancientRules.morph||u.speed!==0||u.order||u.waypoints.length)||!u.ancientShift&&u.speed!==(u.uprooted?ancientMoveSpeed(u):0)||u.ancientRegen!==undefined&&(!finite(u.ancientRegen)||u.ancientRegen<=0||u.ancientRegen>ancientRules.duration)||u.order?.type==='eatTree'&&(!u.uprooted||!Number.isInteger(u.order.resource)||raw.resources?.[u.order.resource]?.kind!=='tree'))throw Error('Invalid saved Ancient state');}
      if(!ancient(u)&&u.order?.type==='eatTree')throw Error('Unexpected saved Eat Tree order');
      if(u.natureBlessed!==undefined&&(u.natureBlessed!==1||!natureUnit(s,u)||!s.teams[u.team].naturesBlessing||!finite(u.armorValue)||u.armorValue<natureUnit(s,u).armorBonus)||natureUnit(s,u)&&s.teams[u.team].naturesBlessing&&!u.natureBlessed)throw Error('Invalid saved Nature\'s Blessing unit');
      if(u.armorValue!==undefined&&(!finite(u.armorValue)||u.armorValue< -20||u.armorValue>100))throw Error('Invalid saved armor value');
      if(u.kind==='hall'&&s.mode==='skirmish'&&!validBaseMetadata(u)||u.kind!=='hall'&&(u.baseRules!==undefined||u.baseFaction!==undefined))throw Error('Invalid saved main base rules');
      if(u.kind==='hall'){if(!Number.isInteger(u.upgradeTier)||u.upgradeTier<1||u.upgradeTier>3||u.built<1&&u.upgradeTier!==1)throw Error('Invalid saved main base grade');}else if(u.upgradeTier!==undefined||u.baseUpgrade!==undefined)throw Error('Unexpected saved main base technology');
      if(u.baseUpgrade!==undefined){const r=u.baseUpgrade;if(!r||u.team<0||u.hp<=0||u.built!==1||u.upgradeTier>=3||r.tier!==u.upgradeTier+1||r.legacy!==undefined&&r.legacy!==true||!finite(r.left)||r.left<=0||r.left>(r.legacy?20*u.upgradeTier:mainBase(s,u,r.tier).time)||!r.legacy&&(s.mode!=='skirmish'||u.queue.length))throw Error('Invalid saved main base upgrade');}
      if(u.kind==='shop'){if(s.itemShopVersion<2&&Array.isArray(u.stock)&&u.stock.length===9)u.stock.push(...items.slice(9).map(()=>({count:0,left:0})));const offers=shopOffers(s,u);if(!Array.isArray(u.stock)||u.stock.length!==items.length||Array.from(u.stock).some((v,i)=>{const o=offers.find(o=>o.item===i),capacity=o?.capacity||0;return !v||!Number.isInteger(v.count)||v.count<0||v.count>capacity||!finite(v.left)||v.left<0||v.left>(o?.restock||0)||v.count===capacity&&v.left!==0||v.count<capacity&&v.left<=0;}))throw Error('Invalid saved shop stock');}else if(u.stock!==undefined)throw Error('Unexpected saved shop stock');
      validateRacialUnit(s,u);
      delete u.feeding;delete u.portalLeft;validateDruidUnit(s,u);validateDruidSpells(s,u);
      if(u.kind==='necromancer'){if(u.raiseDeadAuto===undefined)u.raiseDeadAuto=false;if(u.raiseDeadCd===undefined)u.raiseDeadCd=0;if(u.casterRank===undefined)u.casterRank=s.teams[u.team]?.necromancy||0;if(!Number.isInteger(u.casterRank)||u.casterRank<0||u.casterRank>2)throw Error('Invalid saved caster rank');if(typeof u.raiseDeadAuto!=='boolean'||!finite(u.raiseDeadCd)||u.raiseDeadCd<0||u.raiseDeadCd>raiseDead.cooldown||u.mana<0||u.mana>maxMana(u))throw Error('Invalid saved Raise Dead');}
      if(u.kind==='shaman'){u.casterRank??=s.teams[u.team]?.shamanism||0;u.bloodlustAuto??=true;if(!Number.isInteger(u.casterRank)||u.casterRank<0||u.casterRank>2||typeof u.bloodlustAuto!=='boolean'||u.mana<0||u.mana>maxMana(u))throw Error('Invalid saved shaman');}
      if(s.wispHarvestVersion===1&&s.mode==='skirmish'&&u.kind==='worker'&&s.teams[u.team]?.faction===2&&u.wispRules!==1||u.wispRules!==undefined&&(u.wispRules!==1||!wisp(s,u)||u.damage!==0||u.speed!==wispRules.speed||u.maxHp!==wispRules.hp||u.armorValue!==wispRules.armorValue||u.cargo<0||u.cargo>20||u.cargo>0&&u.cargoKind!=='mine'))throw Error('Invalid saved Wisp rules');delete u.lumberTarget;validateNightLevels(s,u);
      if(['worker','ghoul'].includes(u.kind)){if(u.gatherCd===undefined){u.gatherCd=u.order?.type==='gather'?Math.max(0,u.cd):0;}if(!finite(u.gatherCd)||u.gatherCd<0||u.gatherCd>(wisp(s,u)?wispRules.harvestTime:acolyte(s,u)?5:Math.max(.65,types.worker.cooldown||1)))throw Error('Invalid saved gathering cooldown');}
      for(const [field,max] of Object.entries({cold:5,frenzy:45,cripple:u.kind==='hero'?10:60,purgeLeft:u.kind==='hero'?5:15,castLeft:.8,frenzyCd:1,crippleCd:10,purgeCd:1,bloodlust:60,bloodlustCd:1,lightningShield:20,lightningShieldCd:0}))if(u[field]!==undefined&&(!finite(u[field])||u[field]<0||u[field]>max))throw Error('Invalid saved caster effect');
      if(u.frenzy>0){const a=u.frenzySource;if(!a||a.kind!=='necromancer'||![0,1].includes(a.team)||!Number.isSafeInteger(a.id)||a.id<1||a.id>s.serial||![a.x,a.z].every(v=>finite(v)&&Math.abs(v)<=32))throw Error('Invalid saved frenzy source');}else if(u.frenzySource!==undefined)throw Error('Unexpected saved frenzy source');
      if(u.lightningShield>0){const a=u.lightningSource;if(!a||a.kind!=='shaman'||![0,1].includes(a.team)||!Number.isSafeInteger(a.id)||a.id<1||a.id>s.serial||![a.x,a.z].every(v=>finite(v)&&Math.abs(v)<=32)||types[u.kind].flying||!types[u.kind].speed)throw Error('Invalid saved lightning source');}else if(u.lightningSource!==undefined)throw Error('Unexpected saved lightning source');
      if(u.zigguratUpgrade){const r=u.zigguratUpgrade,d=typeof r.kind==='string'&&Object.hasOwn(zigguratUpgrades,r.kind)?zigguratUpgrades[r.kind]:null;if(!d||s.mode!=='skirmish'||u.kind!=='farm'||u.built!==1||u.hp<=0||u.team<0||s.teams[u.team].faction!==3||!finite(r.left)||r.left<=0||r.left>d.time)throw Error('Invalid saved Ziggurat upgrade');}
      if(u.casterResearch){const r=u.casterResearch,school=casterTraining[u.kind],upgrade=typeof r.upgrade==='string'&&Object.hasOwn(skeletonResearch,r.upgrade)?skeletonResearch[r.upgrade]:null;if(!school||u.built!==1||u.team<0||s.teams[u.team].faction!==school.faction||u.queue.length||!finite(r.left)||r.left<=0||(r.upgrade!==undefined?(!upgrade||u.kind!=='temple'||r.rank!==undefined||s.teams[u.team][upgrade.field]||r.left>upgrade.time):(![1,2].includes(r.rank)||r.rank!==(s.teams[u.team][school.field]||0)+1||r.left>school.times[r.rank-1])))throw Error('Invalid saved caster research');}
      if(u.order?.type==='cannibalize'){const o=u.order;if(!Object.hasOwn(cannibalize.healing,u.kind)||u.team<0||!s.teams[u.team].cannibalize||!Number.isSafeInteger(o.target)||o.target<1||o.target>s.serial||!finite(o.left)||o.left<=0||o.left>cannibalize.duration||typeof o.active!=='boolean'||s.corpses.some(c=>c.id===o.target&&(c.kind==='hero'||o.active&&distance(u,c)>cannibalize.reach+.01))||u.hp>0&&s.units.some(v=>v.id!==u.id&&v.hp>0&&v.order?.type==='cannibalize'&&v.order.target===o.target))throw Error('Invalid saved Cannibalize');}
      if(u.cannibalizeResearch!==undefined&&(!finite(u.cannibalizeResearch)||u.cannibalizeResearch<=0||u.cannibalizeResearch>cannibalize.time||u.kind!=='barracks'||u.built!==1||u.team<0||s.teams[u.team].faction!==3||s.teams[u.team].cannibalize||u.queue.length))throw Error('Invalid saved Cannibalize research');
      if(u.order?.type==='townPortal'){const o=u.order,b=s.units.find(v=>v.id===o.target&&v.kind==='hall'&&v.team===u.team);if(u.kind!=='hero'||u.hp<=0||u.inside||!b||b.hp<=0||b.built!==1||![o.x,o.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||!finite(o.left)||o.left<=0||o.left>townPortal.time||rootedBase(b)&&distance(b,o)>townPortal.baseRange||u.path.length||u.waypoints?.length)throw Error('Invalid saved Town Portal channel');}
      if(u.order?.type==='pickup'&&(u.kind!=='hero'||!Number.isSafeInteger(u.order.target)||u.order.target<1||u.order.target>s.serial))throw Error('Invalid saved pickup order');
      if(u.order?.type==='detonate'&&(!wisp(s,u)||u.hp<=0||u.built!==1||u.inside||u.sanctuary||![u.order.x,u.order.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||u.waypoints?.length))throw Error('Invalid saved Detonate order');
      if(u.order?.type==='patrol'&&(!mobile(u)||![u.order.x,u.order.z,u.order.fromX,u.order.fromZ].every(v=>Number.isFinite(v)&&Math.abs(v)<=30))||u.order?.type==='hold'&&!mobile(u))throw Error('Invalid saved patrol or hold order');
      if(u.waypoints===undefined)u.waypoints=[];if(u.order?.type==='gather'&&u.order.resource===-1){u.order=null;u.path=[];u.waypoints=[];}
      const waypoint=p=>p&&(['move','attackMove'].includes(p.type)?[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30):p.type==='gather'?['worker','ghoul'].includes(u.kind)&&Number.isInteger(p.resource)&&p.resource>=0&&raw.resources?.[p.resource]&&raw.resources[p.resource].kind!=='camp':u.kind==='worker'&&(p.type==='build'?['hall','farm','barracks','tower','frosttower','flametower','altar','workshop','temple','spiritlodge','hauntedmine','shop','ancientlore','ancientwind'].includes(p.kind)&&[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30):p.type==='gather'?Number.isInteger(p.resource)&&p.resource>=0&&raw.resources?.[p.resource]&&raw.resources[p.resource].kind!=='camp':['construct','repair'].includes(p.type)&&Number.isSafeInteger(p.target)&&p.target>0&&p.target<=s.serial));
      if(!Array.isArray(u.waypoints)||u.waypoints.length>8||!u.waypoints.every(waypoint)||u.order?.type==='build'&&!waypoint(u.order)||u.waypoints.length&&(!mobile(u)||u.hp<=0||u.consumed||!waypoint(u.order)))throw Error('Invalid saved waypoint queue');
      if(u.built<0||u.built>1)throw Error('Invalid saved construction progress');
      if(u.built<1&&!u.construction)u.construction={style:'legacy',started:true,paidGold:0,paidWood:0};
      if(u.construction){const c=u.construction,d=unitType(u);if(u.built===1||mobile(u)||!['work','inside','growth','summon','legacy'].includes(c.style)||typeof c.started!=='boolean'||![c.paidGold,c.paidWood].every(v=>finite(v)&&v>=0)||c.paidGold>d.gold||c.paidWood>d.wood)throw Error('Invalid saved construction');if(c.itemDuration!==undefined&&(![5,20,30].includes(c.itemDuration)||c.style!=='summon'||!c.started||c.itemDuration!==({scouttower:5,hall:20})[u.kind]||c.paidGold!==0||c.paidWood!==0))throw Error('Invalid saved item construction');}
      if(u.workResume&&!(u.workResume.type==='gather'&&Number.isInteger(u.workResume.resource)&&raw.resources?.[u.workResume.resource]))throw Error('Invalid saved work resume');
      if(u.kind==='hero'){u.itemCooldown??=0;if(!finite(u.itemCooldown)||u.itemCooldown<0||u.itemCooldown>10)throw Error('Invalid saved item cooldown');u.heroClass??=0;if(u.skills===undefined){u.skills=[1,0,0,0];u.skillPoints=u.level-1;}if(!validHero(u.heroClass)||!Number.isInteger(u.level)||u.level<1||u.level>10||!Array.isArray(u.skills)||u.skills.length!==4||u.skills.some((r,i)=>!Number.isInteger(r)||r<0||r>(i===3?1:3)||r>0&&u.level<skillLevel(i,r))||!Number.isInteger(u.skillPoints)||u.skillPoints<0||u.skills.reduce((n,r)=>n+r,0)+u.skillPoints!==u.level)throw Error('Invalid saved hero skills');}
      for(const key of ['stun','root','haste','avatar','shieldLeft','shield'])if(u[key]!==undefined&&(!finite(u[key])||u[key]<0))throw Error('Invalid saved combat effect');
      if(u.yaw!==undefined&&(!finite(u.yaw)||Math.abs(u.yaw)>Math.PI))throw Error('Invalid saved facing');
      if(u.portalArrivalFrame!==undefined&&(!Number.isSafeInteger(u.portalArrivalFrame)||u.portalArrivalFrame<0||u.portalArrivalFrame>raw.frame))throw Error('Invalid saved Town Portal arrival frame');
      if(u.castYaw!==undefined&&(!['hero','necromancer','shaman'].includes(u.kind)&&!druidUnit(u)||!finite(u.castYaw)||Math.abs(u.castYaw)>Math.PI))throw Error('Invalid saved cast direction');
      if(u.awakeUntil!==undefined&&(u.team!==-1||!u.home||!Number.isSafeInteger(u.awakeUntil)||u.awakeUntil<0))throw Error('Invalid saved camp wake time');
      if(u.summoned&&(!Number.isSafeInteger(u.expires)||u.expires<0))throw Error('Invalid saved summon');
      if(u.rally!==undefined&&(!u.rally||![u.rally.x,u.rally.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||u.team<0||!trainable(s.mode==='moba'?{...s,mode:'skirmish'}:s,{...u,uprooted:false,ancientShift:undefined}).length))throw Error('Invalid saved rally');
      if(u.queue.length&&(u.team<0||u.queue.some(q=>!q.research&&!trainable(s,{...u,uprooted:false,ancientShift:undefined}).includes(q.kind)&&!(u.kind==='barracks'&&(s.teams[u.team].faction===3&&q.kind==='necromancer'||s.teams[u.team].faction===1&&q.kind==='shaman')))))throw Error('Invalid saved production');
    }
    for(const u of s.units){
      if((u.inside!==undefined||u.consumed)&&!u.miningInside){const b=s.units.find(v=>v.id===u.inside&&v.team===u.team&&v.hp>0&&v.built<1);if(u.kind!=='worker'||u.hp<=0||!b||!b.construction.started||!['inside','growth'].includes(b.construction.style)||!!u.consumed!==(b.construction.style==='growth')||u.order?.type!=='construct'||u.order.target!==b.id||s.units.filter(w=>w.inside===b.id).length!==1)throw Error('Invalid saved construction occupant');}
      if(['construct','repair'].includes(u.order?.type)){const b=s.units.find(v=>v.id===u.order.target&&v.team===u.team&&v.hp>0&&!types[v.kind].speed);if(u.kind!=='worker'||!b||u.order.type==='construct'&&b.built===1||u.order.type==='repair'&&b.built<1)throw Error('Invalid saved work target');}
      if((u.construction?.style==='inside'||u.construction?.style==='growth'&&!['farm','altar'].includes(u.kind))&&u.construction.started&&!s.units.some(w=>w.inside===u.id))throw Error('Missing saved construction occupant');
    }
    if(!Array.isArray(s.resources)||s.resources.length>100||s.resources.some(r=>!r||!['mine','tree','camp'].includes(r.kind)||![r.x,r.z,r.amount].every(finite)))throw Error('Invalid saved resources');
    for(const r of s.resources)if(r.felled!==undefined&&(!r.felled||r.kind!=='tree'||r.amount!==0||!Number.isSafeInteger(r.felled.frame)||r.felled.frame<1||r.felled.frame>s.frame||!Number.isFinite(r.felled.yaw)||Math.abs(r.felled.yaw)>Math.PI||!Number.isFinite(r.felled.age)||r.felled.age<0||r.felled.age>TREE_FALL_LIFETIME))throw Error('Invalid saved tree fall');
    if(!Array.isArray(s.sentinels)||s.sentinels.length>s.serial)throw Error('Invalid saved Sentinels');const owls=new Set();for(const o of s.sentinels){const tree=s.resources[o?.resource],owner=s.units.find(u=>u.id===o?.source);if(!o||!nightArmy(s,o.team)||!nightRank(s,o.team,'Resc')||!Number.isSafeInteger(o.source)||o.source<1||o.source>s.serial||owls.has(o.source)||!Number.isInteger(o.resource)||tree?.kind!=='tree'||tree.amount<=0||![o.x,o.z,o.anchorHp,o.anchorAmount].every(finite)||Math.abs(o.x)>32||Math.abs(o.z)>32||o.anchorHp!==tree.hp||o.anchorAmount!==tree.amount||typeof o.perched!=='boolean'||o.perched&&distance(o,tree)>1e-7||owner&&(owner.team!==o.team||owner.kind!=='nighthuntress'||!owner.sentinelUsed))throw Error('Invalid saved Sentinel');owls.add(o.source);}
    if(s.clearedResources===undefined)s.clearedResources=[[],[]];if(!Array.isArray(s.clearedResources)||s.clearedResources.length!==2||s.clearedResources.some(a=>!Array.isArray(a)||a.length>s.resources.length||new Set(a).size!==a.length||a.some(i=>!Number.isInteger(i)||i<0||i>=s.resources.length||s.resources[i].amount>0)))throw Error('Invalid saved resource knowledge');
    if(s.nightElfTechVersion===1&&s.resources.some(r=>r.kind==='tree'&&(!finite(r.hp)||r.hp<0||r.hp>nightTechnology.treeRules.hp||r.amount<=0&&r.hp!==0||r.amount>0&&r.hp<=0)))throw Error('Invalid saved tree life');
    for(const u of s.units){
      if(u.kind==='hauntedmine'&&(s.economyVersion!==1||s.mode!=='skirmish'||s.teams[u.team]?.faction!==3||!s.resources.some(r=>r.kind==='mine'&&distance(r,u)<.01)||s.units.some(v=>v.id!==u.id&&v.hp>0&&u.hp>0&&['hauntedmine','entangledmine'].includes(v.kind)&&distance(u,v)<.01)))throw Error('Invalid saved Haunted Mine');
      if(u.order?.type==='gather'){
        const r=s.resources[u.order.resource];if(!Number.isInteger(u.order.resource)||!r||!['worker','ghoul'].includes(u.kind)||r.kind==='camp')throw Error('Invalid saved gathering order');
        if(u.order.mineSlot!==undefined&&(!(acolyte(s,u)||miningWisp(s,u))||r.kind!=='mine'||!Number.isInteger(u.order.mineSlot)||u.order.mineSlot<0||u.order.mineSlot>4||u.hp>0&&(miningWisp(s,u)?wispWorkers(s,r):mineWorkers(s,r)).some(w=>w.id!==u.id&&w.order.mineSlot===u.order.mineSlot)))throw Error('Invalid saved mining station');
        if(u.order.bonded!==undefined&&(u.order.bonded!==true||!wisp(s,u)||r.kind!=='tree'||u.cargo!==0||u.gatherCd<=0||distance(u,r)>wispRules.harvestReach+.01))throw Error('Invalid saved Wisp tree bond');
        if(!canGather(s,u,r)){u.order=null;u.path=[];u.waypoints=[];}
      }
    }
    validateEntangles(s);
    s.zones??=[];if(!Array.isArray(s.zones)||s.zones.length>LIMIT*4||s.zones.some(z=>!z||![0,1].includes(z.team)||!validHero(z.heroClass)||![z.x,z.z,z.radius,z.damage,z.slow,z.left,z.pulse].every(finite)||z.radius<0||z.radius>14||z.damage<0||z.left<0||z.left>30||!Number.isInteger(z.slot)||z.slot<0||z.slot>3))throw Error('Invalid saved spell zones');
    const defaults=create(s.mode,{map:s.map});for(const key of ['loot','quest','triggered','announcement','announcements'])s[key]??=defaults[key];
    if(!Array.isArray(s.loot)||s.loot.length>LIMIT||new Set(s.loot.map(d=>d?.id)).size!==s.loot.length||s.loot.some(d=>!d||!Number.isSafeInteger(d.id)||d.id<1||d.id>s.serial||![d.x,d.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=30)||!Number.isInteger(d.item)||!items[d.item]||d.manual!==undefined&&typeof d.manual!=='boolean'||d.relic!==undefined&&typeof d.relic!=='boolean'||items[d.item].charges&&d.uses===undefined||d.uses!==undefined&&(!items[d.item].charges||!Number.isInteger(d.uses)||d.uses<1||d.uses>items[d.item].charges))||!Array.isArray(s.triggered)||new Set(s.triggered).size!==s.triggered.length||s.triggered.some(i=>!Number.isInteger(i)||i<0||i>=s.map.triggers.length)||!Number.isInteger(s.quest.stage)||s.quest.stage<0||s.quest.stage>4)throw Error('Invalid saved objectives');
    if(!Array.isArray(s.announcements)||s.announcements.length!==2||s.announcements.some(text=>typeof text!=='string'||text.length>120))throw Error('Invalid saved player announcements');
    if(s.triggerState===undefined)s.triggerState=s.map.triggers.map((t,i)=>({count:s.triggered.includes(i)?1:0,last:s.triggered.includes(i)?s.frame:-1,next:0}));
    if(!Array.isArray(s.triggerState)||s.triggerState.length!==s.map.triggers.length||s.triggerState.some((c,i)=>!c||!Number.isInteger(c.count)||c.count<0||c.count>s.map.triggers[i].limit||!Number.isSafeInteger(c.last)||c.last < -1||c.last>s.frame||!Number.isSafeInteger(c.next)||c.next<0||c.next>s.frame+600/DT||!!c.count!==s.triggered.includes(i)||c.count===0&&c.last!==-1||c.count>0&&c.last<0))throw Error('Invalid saved trigger clock');
    for(const t of s.teams){t.portalGranted??=heroRoster(s,s.teams.indexOf(t)).length>0;if(typeof t.portalGranted!=='boolean')throw Error('Invalid saved Town Portal grant');t.cannibalize??=0;if(![0,1].includes(t.cannibalize)||t.cannibalize&&t.faction!==3||s.units.filter(u=>u.team===s.teams.indexOf(t)&&u.hp>0&&u.cannibalizeResearch).length>1)throw Error('Invalid saved Cannibalize research');for(const [key,r] of Object.entries(skeletonResearch)){t[r.field]??=0;if(![0,1].includes(t[r.field])||s.units.filter(u=>u.team===s.teams.indexOf(t)&&u.hp>0&&u.casterResearch?.upgrade===key).length>1)throw Error('Invalid saved skeleton research');}for(const [kind,school] of Object.entries(casterTraining)){t[school.field]??=0;if(!Number.isInteger(t[school.field])||t[school.field]<0||t[school.field]>2||s.units.filter(u=>u.team===s.teams.indexOf(t)&&u.kind===kind&&u.hp>0&&u.casterResearch?.rank).length>1)throw Error('Invalid saved caster training');}t.heroClass??=0;if(!validHero(t.heroClass))throw Error('Invalid saved hero selection');}
    const reviving=new Set();for(const u of s.units)for(const q of u.queue){
      if(q.research!==undefined&&q.research==='naturesBlessing'){if(q.research!=='naturesBlessing'||!natureResearcher(s,u)||u.hp<=0||u.built!==1||u.baseUpgrade||s.teams[u.team].naturesBlessing||q.left<=0||q.left>natureRules.time||Object.keys(q).some(k=>!['research','left'].includes(k))||s.units.filter(v=>v.team===u.team&&v.hp>0).flatMap(v=>v.queue).filter(v=>v.research==='naturesBlessing').length!==1)throw Error('Invalid saved Nature\'s Blessing research');continue;}
      if(q.research!==undefined&&Object.hasOwn(druidRules.research,q.research)){validateDruidQueue(s,u,q);continue;}
      if(q.research!==undefined){const r=nightTechnology.research[q.research],level=r?.levels[q.rank-1];if(!nightArmy(s,u.team)||r?.building!==nightBuilding(s,u)||!level||q.rank!==nightRank(s,u.team,q.research)+1||u.hp<=0||u.built!==1||u.baseUpgrade||q.left<=0||q.left>level.time||Object.keys(q).some(k=>!['research','rank','left'].includes(k))||s.units.filter(v=>v.team===u.team&&v.hp>0).flatMap(v=>v.queue).filter(v=>v.research===q.research).length!==1)throw Error('Invalid saved Night Elf research queue');continue;}
      if(q.left<0||q.left>(q.revive?110:trainType(s,q.kind,u.team).time)||q.kind!=='hero'&&['heroClass','revive','paidGold','paidWood'].some(k=>q[k]!==undefined))throw Error('Invalid saved production time or metadata');
      if(q.kind!=='hero')continue;
      if(s.mode!=='skirmish'||u.kind!=='altar'||u.hp<=0||u.built!==1||!validHero(q.heroClass)||!Number.isInteger(q.paidGold)||!Number.isInteger(q.paidWood))throw Error('Invalid saved hero production');
      if(q.revive!==undefined){const h=s.units.find(v=>v.id===q.revive&&v.kind==='hero'&&v.team===u.team&&v.hp===0),d=h&&heroRevival(h);if(!Number.isSafeInteger(q.revive)||!h||h.heroClass!==q.heroClass||reviving.has(h.id)||q.paidGold!==d.gold||q.paidWood!==0||q.left>d.time)throw Error('Invalid saved hero revival');reviving.add(h.id);}
      else if(![[0,0],[425,100],[300,80]].some(([g,w])=>q.paidGold===g&&q.paidWood===w)||heroRoster(s,u.team).some(v=>v.heroClass===q.heroClass)||heroQueued(s,u.team).filter(v=>v.heroClass===q.heroClass).length!==1)throw Error('Invalid saved hero recruitment');
    }
    for(let team=0;team<2;team++){const queued=heroQueued(s,team);if(queued.length&&heroRoster(s,team).length+queued.length>3)throw Error('Invalid saved hero limit');}
    s.events=[];s.pendingEvents=[];s.visible=[[],[]];if(!Array.isArray(s.explored)||s.explored.length!==2||s.explored.some(a=>!Array.isArray(a)||a.length!==1024))throw Error('Invalid saved fog');updateTechnology(s);visibility(s);return s;
  }
  function publicState(s,team){updateTechnology(s);const state=clone(s);for(const u of state.units){if(u.kind==='entangledmine'&&u.hp>0)u.workers=mineResidents(s,u).length;if(ancientMain(u))u.entangleCasting=u.entangleCast?.left||0;u.sleeping=asleep(s,u);u.feeding=feeding(u);u.portalLeft=portalLeft(u);delete u.frenzySource;delete u.lightningSource;}state.sentinels=(s.sentinels||[]).filter(o=>o.team===team||isVisiblePoint(s,team,o)).map(({source,team,resource,x,z,perched})=>({source,team,resource,x,z,perched}));state.corpses=s.corpses.filter(c=>c.team===team||s.visible[team][index(c.x,c.z)]).map(({id,kind,heroClass,team,x,y,z,yaw,age,boss,large})=>({id,kind,heroClass,team,x,y,z,yaw,age,boss,large}));state.projectiles=s.projectiles.filter(p=>s.visible[team][index(p.x,p.z)]).map(({id,x,y,z,vx,vy,vz,team,art})=>({id,x,y,z,vx,vy,vz,team,art}));delete state.rng;state.blight=state.blight.filter(b=>b.team===team||s.visible[team][index(b.x,b.z)]);delete state.projectileSerial;delete state.pendingEvents;delete state.tdPending;state.zones=state.zones.filter(z=>s.visible[team][index(z.x,z.z)]);state.map.units=[];state.map.triggers=[];state.map.regions=[];state.triggered=[];delete state.triggerState;state.announcements[1-team]='';state.units=state.units.filter(u=>u.team===team||isVisible(s,team,u));for(const u of state.units)if(u.team!==team){delete u.faerieAuto;const r=miningTarget(s,u),tree=wispWorkingTarget(s,u);if(r)u.miningTarget={x:r.x,z:r.z};if(tree)u.lumberTarget={x:tree.x,z:tree.z};u.queue=[];delete u.rally;delete u.construction;delete u.workResume;delete u.entangleBase;delete u.entangleMine;delete u.entangleCast;delete u.mineResource;delete u.goldLeft;delete u.goldIndex;delete u.miningInside;delete u.mineEntry;delete u.mineExitPending;delete u.inside;delete u.consumed;delete u.casterResearch;delete u.stock;delete u.weaponWindup;delete u.detectedUntil;delete u.sentinelUsed;delete u.hiding;delete u.itemTimers;delete u.itemUses;delete u.guardTowerUpgrade;delete u.baseUpgrade;delete u.cannibalizeResearch;delete u.zigguratUpgrade;u.order=null;delete u.waypoints;u.path=[];delete u.dest;delete u.gatherCd;delete u.cargo;delete u.cargoKind;if(u.kind==='critter'){u.kind='neutral';u.team=-1;u.tag='critter';}}state.events=state.events.filter(e=>(e.audience===undefined||e.audience&(1<<team))&&s.visible[team][index(e.x,e.z)]&&(e.fromX===undefined||s.visible[team][index(e.fromX,e.fromZ)])).map(({audience,...event})=>event);state.teams[1-team]={faction:s.teams[1-team].faction};state.resources=state.resources.map((r,i)=>{if(!s.visible[team][index(r.x,r.z)]){r.amount=s.clearedResources?.[team]?.includes(i)?0:1;delete r.hp;delete r.felled;}return r;});state.clearedResources=[team===0?(s.clearedResources?.[0]||[]):[],team===1?(s.clearedResources?.[1]||[]):[]].map(a=>[...a]);state.loot=state.loot.filter(r=>s.visible[team][index(r.x,r.z)]);state.visible=[team===0?s.visible[0]:[],team===1?s.visible[1]:[]];state.explored=[team===0?s.explored[0]:[],team===1?s.explored[1]:[]];return state;}
  return {PROTOCOL,druidSpellOption,druidSpellOptions,druidSpellTarget,armorValue,attackDamage,druidRules,druidUnit,druidProducer,druidRank,druidResearchOption,druidResearchOptions,druidBuildingRequirement,druidTrainingBonus,druidMorphDuration,fire,updateSentinels,damageTree,detected,nightTechnology,nightArmy,nightSource,nightBuilding,nightRank,nightQueued,nightRequirement,nightResearchOption,nightResearchOptions,updateNightUnit,nightWeaponRoll,moonWellType,moonRestore,ancientWarRules,warArmy,warProducer,trainingRequirement,shadowMeld,productionAncientRules,productionAncient,ancientMain,natureRules,natureUnit,natureQueued,natureTechnology,natureResearcher,detonateRules,dispellable,entangledRules,entangledMine,miningWisp,wispWorkers,mineResidents,entangleReach,entangleTarget,startEntangle,unloadWisps,wispRules,wisp,wispWorkingTarget,trainType,ancientRules,ancient,mobile,rootedBase,rootSite,mainBaseTypes,buildingType,mainBases,mainBase,technologyTier,updateTechnology,racialCatalog,canonicalShop,shopOffers,inventoryUses,itemOrb,attackRange,inBlight,isHidden,itemShop,shopFor,DOODAD_LIMIT,doodads,doodadMap,doodadClear,obstacleClear,zigguratUpgrades,gradeRamp,groundTile,groundSample,groundClear,walkClear,movementRadius,sculptRelief,reliefHeight,tierHeight,townPortal,portalLeft,heroRoster,heroQueued,heroRecruitment,heroRevival,cannibalize,feeding,acolyte,canGather,hauntedMine,mineWorkers,minePoint,miningTarget,skeletonResearch,casterSpells,casterTraining,attackRate,moveRate,raiseDead,maxMana,DT,LIMIT,PROJECTILE_LIMIT,CORPSE_LIMIT,CORPSE_LIFETIME,TREE_FALL_LIFETIME,TREE_RADIUS,treeClear,buildingSite,resourceAvailable,resourceAt,SIZE,projectileSpeed,projectileArt,types,heroes,validHero,unitType,factions,items,itemValue,armies,siege,flyers,orderPoint,timeOfDay,isNight,daylight,asleep,canAttack,canControl,canDeny,weaponDamage,trainable,repairCost,questNames,clamp,clone,cell,index,distance,elevation,pickHeight,tileHeight,terrainEdge,traversable,flatSite,unitHeight,attackClear,highlandMap,defaultMap,siegeMap,eventMap,validateMap,removeTrigger,removeRegion,create,restore,spawn,command,tick,population,isVisible,visibility,path,solid,publicState,lanePath,tdPath};
})();
if(typeof module!=='undefined')module.exports=Frost;
