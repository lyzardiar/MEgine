/* Author: MiYu. Shared faction models for live units, map placement and construction previews. */
var FrostVisual=(()=>{
  const buildingScales=typeof module!=='undefined'?require('../building-scale-catalog.json'):FrostBuildingScales;
  const unitScales=typeof module!=='undefined'?require('../unit-scale-catalog.json'):FrostUnitScales;
  const keeperRules=typeof module!=='undefined'?require('../keeper-rules.json'):FrostKeeperRules;
  const priestessModel=u=>Frost.priestessUnit(u)?Frost.priestessRules.units.Emoo:Frost.owlScout(u)?Frost.priestessRules.units[['nowl','now2','now3'][(u.scoutRank||1)-1]]:null;
  const bloodMageModel=u=>Frost.bloodMageUnit(u)?Frost.bloodMageRules.units.Hblm:Frost.phoenixUnit(u)?Frost.bloodMageRules.units[u.kind==='phoenixegg'?'hpxe':'hphx']:null;
  const hexModel=u=>u?.hex||u?.hexLeft>0?Frost.shadowhunterRules.hexForms[u.hex?.form||u.hexForm]:null;
  const shadowhunterModel=u=>Frost.shadowhunterUnit(u)?{...Frost.shadowhunterRules.unit,model:'ClassicShadowHunter',portrait:'ClassicShadowHunterPortrait'}:Frost.serpentward(u)?Frost.shadowhunterRules.wards['osp'+(u.wardRank||1)]:null;
  const taurenModel=u=>Frost.taurenUnit(u)?{...Frost.taurenRules.unit,model:'ClassicTaurenChieftain',portrait:'ClassicTaurenChieftainPortrait'}:null;
  const farseerModel=u=>Frost.farseerUnit(u)?{...Frost.farseerRules.unit,model:'ClassicFarSeer',portrait:'ClassicFarSeerPortrait'}:Frost.spiritwolf(u)?Frost.farseerRules.wolves['osw'+(u.wolfRank||1)]:null;
  const blademasterModel=u=>Frost.blademasterUnit(u)||Frost.bladeIllusion(u)?{...Frost.blademasterRules.units.Obla,model:'ClassicBladeMaster',portrait:'ClassicBladeMasterPortrait'}:null;
  const mountainKingModel=u=>Frost.mountainKingUnit(u)?Frost.mountainKingRules.units.Hmkg:null;
  const mountainKingScale=u=>Frost.mountainKingUnit(u)&&u.mountainAvatarLeft>0?1+Frost.mountainKingRules.abilities.AHav.levels[0].scaleField:1;
  const lichModel=u=>Frost.lichUnit(u)?Frost.lichRules.unit:null;
  const cryptLordModel=u=>Frost.cryptLordUnit(u)?Frost.cryptLordRules.unit:Frost.carrionBeetle(u)?Frost.cryptLordRules.summons[u.sourceUnit||'ucs'+(u.beetleRank||1)]:u?.kind==='locust'?Frost.locustProfile:null;
  const dreadlordModel=u=>Frost.dreadlordUnit(u)?Frost.dreadlordRules.unit:Frost.infernalUnit(u)?Frost.dreadlordRules.infernal:null;
  const deathKnightModel=u=>Frost.deathKnightUnit(u)?Frost.deathKnightRules.unit:null;
  const animatedModels={hpea:'RealWorker',opeo:'ClassicPeon',uaco:'RealAcolyte',hfoo:'RealFootman',ogru:'RealOrc',esen:'ClassicHuntress',ugho:'RealGhoul'};
  const animatedModel=u=>Frost.animatedUnit(u)?animatedModels[u.sourceUnit]:undefined;
  const paladinModel=u=>Frost.paladinUnit(u)?Frost.paladinRules.units.Hpal:null;
  const archmageModel=u=>Frost.archmageUnit(u)?Frost.archmageRules.units.Hamg:Frost.waterElemental(u)?Frost.archmageRules.units[['hwat','hwt2','hwt3'][(u.waterRank||1)-1]]:null;
  const wardenModel=u=>Frost.wardenUnit(u)?Frost.wardenRules.units.Ewar:Frost.vengeanceAvatar(u)?Frost.wardenRules.units.espv:Frost.vengeanceSpirit(u)?Frost.wardenRules.units.even:null;
  const keeperModel=u=>Frost.keeperUnit(u)?keeperRules.units.Ekee:Frost.keeperTreant(u)?keeperRules.units.efon:null;
  const druidRules=typeof module!=='undefined'?require('../druid-rules.json'):FrostDruidRules;
  const giantRules=typeof module!=='undefined'?require('../mountain-giant-rules.json'):FrostGiantRules;
  const faerieRules=typeof module!=='undefined'?require('../faerie-dragon-rules.json'):FrostFaerieRules;
  const chimaeraRules=typeof module!=='undefined'?require('../chimaera-rules.json'):FrostChimaeraRules;
  const hippogryphRules=typeof module!=='undefined'?require('../hippogryph-rules.json'):FrostHippogryphRules;
  const dryadRules=typeof module!=='undefined'?require('../dryad-rules.json'):FrostDryadRules;
  const sentinelArt=typeof module!=='undefined'?require('../sentinel-catalog.json'):FrostSentinelArt;
  const buildings={hall:'Hall',barracks:'Barracks',farm:'Lodge',tower:'Tower',altar:'Altar',workshop:'Workshop',scouttower:'Tower',guardtower:'Tower',shop:'Shop'};
  const names=[
    {barracks:'Royal barracks',farm:'Town house',tower:'Guard tower',altar:'Sanctuary',workshop:'Royal workshop',shop:'Arcane Vault'},
    {barracks:'War barracks',farm:'Clan dwelling',tower:'Watch post',altar:'Spirit sanctuary',workshop:'Siege workshop',shop:'Voodoo Lounge'},
    {barracks:'Ancient of War',farm:'Moon Well',tower:'Ancient Protector',altar:'Altar of Elders',workshop:"Hunter's Hall",shop:'Ancient of Wonders'},
    {barracks:'Crypt',farm:'Ziggurat',tower:'Soul tower',altar:'Altar of shadows',workshop:'Bone foundry',shop:'Tomb of Relics'}
  ];
  const units={nightarcher:'RealArcher',nighthuntress:'ClassicHuntress',glaivethrower:'ClassicGlaiveThrower',skeletonmage:'RealSkeletonMage',skeletonwarrior:'RealSkeletonWarrior',treant:'RealTreant',rifleman:'RealRifleman',mage:'RealEmberSage',paladin:'RealPaladin',knight:'RealKnight',archer:'RealArcher',raider:'RealOrc',hunter:'Tribal',berserker:'Orc_Skull',shaman:'RealShaman',ghoul:'RealGhoul',abomination:'RealAbomination',necromancer:'RealNecromancer',bonearcher:'RealBoneArcher'};
  const base={worker:'RealWorker',soldier:'RealFootman',archer:'Ranger',knight:'Warrior',mage:'Wizard',hero:'Cleric',creep:'RealFootman',rangedcreep:'RealArcher',siegecreep:'RealCatapult',neutral:'RealWolf',ballista:'RealBallista',catapult:'RealCatapult',trebuchet:'RealTrebuchet',ram:'RealRam',dragon:'Dragon'};
  function classicScale(key,u={}){if(Frost.animatedUnit(u))return unitScales.worldScale*Frost.deathKnightRules.revivalUnits[u.sourceUnit].modelScale;const druid=hexModel(u)??shadowhunterModel(u)??taurenModel(u)??farseerModel(u)??blademasterModel(u)??bloodMageModel(u)??mountainKingModel(u)??lichModel(u)??cryptLordModel(u)??dreadlordModel(u)??deathKnightModel(u)??paladinModel(u)??archmageModel(u)??wardenModel(u)??priestessModel(u)??keeperModel(u)??(Frost.demonHunterUnit(u)?Frost.demonHunterRules.units[u.metamorphLeft>0?'Edmm':'Edem']:giantRules.units[u.kind]??Object.values(giantRules.units).find(r=>r.model===key)??faerieRules.units[u.kind]??Object.values(faerieRules.units).find(r=>r.model===key)??chimaeraRules.units[u.kind]??chimaeraRules.buildings[u.kind]??Object.values({...chimaeraRules.units,...chimaeraRules.buildings}).find(r=>r.model===key)??hippogryphRules.units[u.kind]??Object.values(hippogryphRules.units).find(r=>r.model===key)??dryadRules.units[u.kind]??(key==='ClassicDryad'?dryadRules.units.dryad:null)??druidRules.units[u.kind]??druidRules.scales[key]);if(druid)return unitScales.worldScale*druid.modelScale*mountainKingScale(u);const building=buildingScales.models[key],unit=unitScales.models[key];if(building)return buildingScales.worldScale*building.modelScale;if(!unit)throw Error('Missing source actor scale: '+key);return unitScales.worldScale*unit.modelScale*(u.tag==='boss'||u.tdBoss?1.5:1);}
  function selectionSpan(key,u={}){if(Frost.animatedUnit(u))return unitScales.circles.unit.worldSpan*Frost.deathKnightRules.revivalUnits[u.sourceUnit].selectionScale;if(!hexModel(u)&&Frost.lichUnit(u))return unitScales.circles.hero.worldSpan*lichModel(u).selectionScale;if(!hexModel(u)&&Frost.cryptLordUnit(u))return unitScales.circles.hero.worldSpan*cryptLordModel(u).selectionScale;if(!hexModel(u)&&Frost.dreadlordUnit(u))return unitScales.circles.hero.worldSpan*dreadlordModel(u).selectionScale;if(!hexModel(u)&&Frost.deathKnightUnit(u))return unitScales.circles.hero.worldSpan*deathKnightModel(u).selectionScale;if(!hexModel(u)&&Frost.shadowhunterUnit(u))return unitScales.circles.hero.worldSpan*shadowhunterModel(u).selectionScale;if(taurenModel(u))return unitScales.circles.hero.worldSpan*taurenModel(u).selectionScale;if(Frost.farseerUnit(u))return unitScales.circles.hero.worldSpan*farseerModel(u).selectionScale;if(blademasterModel(u))return unitScales.circles.hero.worldSpan*blademasterModel(u).selectionScale;const druid=hexModel(u)??shadowhunterModel(u)??taurenModel(u)??farseerModel(u)??blademasterModel(u)??bloodMageModel(u)??mountainKingModel(u)??lichModel(u)??cryptLordModel(u)??dreadlordModel(u)??deathKnightModel(u)??paladinModel(u)??archmageModel(u)??wardenModel(u)??priestessModel(u)??keeperModel(u)??(Frost.demonHunterUnit(u)?Frost.demonHunterRules.units[u.metamorphLeft>0?'Edmm':'Edem']:giantRules.units[u.kind]??Object.values(giantRules.units).find(r=>r.model===key)??faerieRules.units[u.kind]??Object.values(faerieRules.units).find(r=>r.model===key)??chimaeraRules.units[u.kind]??chimaeraRules.buildings[u.kind]??Object.values({...chimaeraRules.units,...chimaeraRules.buildings}).find(r=>r.model===key)??hippogryphRules.units[u.kind]??Object.values(hippogryphRules.units).find(r=>r.model===key)??dryadRules.units[u.kind]??(key==='ClassicDryad'?dryadRules.units.dryad:null)??druidRules.units[u.kind]??druidRules.scales[key]);if(druid)return unitScales.circles.unit.worldSpan*druid.selectionScale*mountainKingScale(u);const unit=unitScales.models[key],scale=unit?.selectionScale??unitScales.buildingSelection[key];if(!scale)throw Error('Missing source selection scale: '+key);return unitScales.circles[unit&&/^[A-Z]/.test(unit.unit)?'hero':'unit'].worldSpan*scale*(u.tag==='boss'||u.tdBoss?1.5:1);}
  function work(state,u){
    if(u.lumberTarget&&u.hp>0&&!u.stun)return {target:u.lumberTarget,animation:'Wood'};
    if(u.miningTarget&&u.hp>0&&!u.stun)return {target:u.miningTarget,animation:'Mine'};
    if(!['worker','ghoul'].includes(u.kind)||!u.order||u.hp<=0||u.stun>0||u.inside)return null;
    let target,animation;
    if(u.order.type==='gather'){
      target=state.resources[u.order.resource];if(Frost.wisp(state,u)&&target?.kind==='tree')return Frost.wispWorkingTarget(state,u)?{target,animation:'Wood'}:null;if(Frost.acolyte(state,u)&&!u.cargo)return Frost.miningTarget(state,u)?{target,animation:'Mine'}:null;if(!target||target.amount<=0||u.cargo>=20||u.cargo>0&&u.cargoKind&&u.cargoKind!==target.kind||!state.units.some(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1)||Frost.distance(u,target)>3)return null;
      animation=target.kind==='tree'?'Wood':'Mine';
    }else if(['construct','repair'].includes(u.order.type)){
      if(u.root>0)return null;
      target=state.units.find(v=>v.id===u.order.target&&v.team===u.team&&v.hp>0&&!Frost.types[v.kind].speed);
      if(!target||u.order.type==='construct'&&target.built===1||u.order.type==='repair'&&(target.built<1||target.hp>=target.maxHp)||Frost.distance(u,target)>Frost.types[target.kind].radius+1.1)return null;
      if(u.order.type==='repair'){const cost=Frost.repairCost(target),team=state.teams[u.team];if(team.gold<cost.gold||team.wood<cost.wood)return null;}
      animation='Build';
    }else return null;
    return Frost.traversable(state.map,u.x,u.z,target.x,target.z)?{target,animation}:null;
  }
  function attackPhase(u,asset){return (asset.attackEvent+Frost.clamp(1-u.cd/(Frost.unitType(u).cooldown||1),0,1))%1;}
  function castPhase(u,asset,walking){
    if(Frost.cryptLordUnit(u))return u.cryptLordCast?1-u.cryptLordCast.left/Frost.cryptLordRules.unit.castPoint:null;
    if(Frost.dreadlordUnit(u))return u.dreadlordCast?1-u.dreadlordCast.left/Frost.dreadlordRules.unit.castPoint:null;
    if(Frost.bloodMageUnit(u))return u.bloodMageCast?1-u.bloodMageCast.left/Number(Frost.bloodMageRules.units.Hblm.sourceRows.UnitWeapons.castpt):null;
    if(Frost.mountainKingUnit(u))return u.mountainKingCast?1-u.mountainKingCast.left/Number(Frost.mountainKingRules.units.Hmkg.sourceRows.UnitWeapons.castpt):null;
    if(Frost.wardenUnit(u)){const c=u.wardenCast;return c?1-c.left/(c.slot===0?Frost.wardenRules.abilities.AEbl.levels[c.rank-1].duration:Number(Frost.wardenRules.units.Ewar.sourceRows.UnitWeapons.castpt)):null;}
    if(Frost.vengeanceAvatar(u))return u.vengeanceCast?1-u.vengeanceCast.left/Number(Frost.wardenRules.units.espv.sourceRows.UnitWeapons.castpt):null;
    if(Frost.priestessUnit(u)){const point=Number(Frost.priestessRules.units.Emoo.sourceRows.UnitWeapons.castpt);return u.priestessCast?1-u.priestessCast.left/point:u.starfall?0:null;}
    if(Frost.keeperUnit(u)){const point=Number(keeperRules.units.Ekee.sourceRows.UnitWeapons.castpt);return u.keeperCast?1-u.keeperCast.left/point:u.tranquility?0:null;}
    if(Frost.dryadUnit(u)){const r=dryadRules.units.dryad.sourceRows.UnitWeapons,point=Number(r.castpt),back=Number(r.castbsw);return !walking&&!u.stun&&(u.order?.type==='abolish'&&u.order.castLeft!==undefined||u.dryadCastLeft>0)?u.order?.type==='abolish'?(point-u.order.castLeft)/(point+back):(point+back-u.dryadCastLeft)/(point+back):null;}
    if(Frost.druidUnit(u)){const r=druidRules.units[u.kind].sourceRows.UnitWeapons,point=Number(r.castpt),back=Number(r.castbsw);return !walking&&!u.stun&&(u.order?.type==='druidSpell'&&u.order.castLeft!==undefined||u.druidCastLeft>0)?u.order?.type==='druidSpell'?(point-u.order.castLeft)/(point+back):(point+back-u.druidCastLeft)/(point+back):null;}
    if(u.kind==='shaman')return !walking&&!u.stun&&u.castLeft>0?1-u.castLeft/.8:null;
    if(u.kind==='necromancer')return !walking&&!u.stun&&(u.castLeft>0||u.raiseDeadCd>Frost.raiseDead.cooldown-.8)?u.castLeft>0?1-u.castLeft/.8:(Frost.raiseDead.cooldown-u.raiseDeadCd)/.8:null;
    if(u.kind!=='hero'||walking||u.stun||!asset.animations?.some(a=>asset.classic?/^spell|^stand channel/i.test(a.name):a.name==='Cast'))return null;
    if(Frost.portalLeft(u)>0)return Math.min(.65,(Frost.townPortal.time-Frost.portalLeft(u))/.8*.65);
    const elapsed=Math.min(...Frost.unitType(u).spells.map((s,i)=>u.spell?.[i]>0?s.cooldown-u.spell[i]:Infinity));
    return elapsed>=0&&elapsed<.8?(asset.loadedModel?asset.attackEvent+(1-asset.attackEvent)*elapsed/.8:elapsed/.8):null;
  }
  function model(state,u,walking=false){
    const d=Frost.types[u.kind],f=u.kind==='hall'?(u.baseFaction??state.teams[u.team]?.faction??0):state.teams[u.team]?.faction||0,tier=Frost.clamp(u.upgradeTier??1,1,3);
    let key=hexModel(u)?.model??animatedModel(u)??shadowhunterModel(u)?.model??taurenModel(u)?.model??farseerModel(u)?.model??blademasterModel(u)?.model??bloodMageModel(u)?.model??mountainKingModel(u)?.model??lichModel(u)?.model??cryptLordModel(u)?.model??dreadlordModel(u)?.model??deathKnightModel(u)?.model??paladinModel(u)?.model??archmageModel(u)?.model??wardenModel(u)?.model??priestessModel(u)?.model??keeperModel(u)?.model??giantRules.units[u.kind]?.model??faerieRules.units[u.kind]?.model??chimaeraRules.units[u.kind]?.model??chimaeraRules.buildings[u.kind]?.model??hippogryphRules.units[u.kind]?.model??dryadRules.units[u.kind]?.model??druidRules.units[u.kind]?.model??druidRules.buildings[u.kind]?.model??(f===0&&u.kind==='scouttower'?'KingdomScoutTower':f===0&&u.kind==='shop'?'KingdomArcaneVault':u.kind==='spirittower'?'RevenantSpiritTower':u.kind==='nerubiantower'?'RevenantNerubianTower':u.kind==='hauntedmine'?'HauntedMine':u.kind==='entangledmine'?'ClassicEntangledMine':u.kind==='temple'?'RealTemple':u.kind==='spiritlodge'?'ClassicSpiritLodge':buildings[u.kind]?Frost.factions[f]+buildings[u.kind]+(u.kind==='hall'&&tier>1?tier:''):u.kind==='hero'?Frost.unitType(u).art:u.tag==='boss'?'RealBear':u.kind==='frosttower'?'FrostTower':u.kind==='flametower'?'EmberTower':u.kind==='worker'?['RealWorker','ClassicPeon','ClassicWisp','RealAcolyte'][f]:u.kind==='soldier'?['RealFootman','RealOrc','ClassicHuntress','RealGhoul'][f]:u.kind==='hunter'?'ClassicHeadhunter':u.kind==='druid'?'ClassicDruid':u.kind==='emberdrake'?'ClassicWyvern':u.kind==='grovewyrm'?'ClassicChimaera':u.kind==='spectralwyrm'?'ClassicFrostWyrm':units[u.kind]||base[u.kind]||base[d.model]);
    const original=FrostArt[key],activity=['RealWorker','ClassicPeon','ClassicWisp','RealAcolyte','RealGhoul'].includes(key)?work(state,u):null,phase=!original.classic&&(key==='RealArcher'||original.shotModel)&&!walking&&!u.stun?(castPhase(u,original,walking)??(u.cd>0?attackPhase(u,original):null)):null,loaded=phase!==null&&(original.ammoLoad<original.attackEvent?phase>=original.ammoLoad&&phase<original.attackEvent:phase<original.attackEvent||phase>=original.ammoLoad),variant=phase===null?key:original.shotModel?(loaded?original.loadedModel||key:original.shotModel):key+(loaded?'Loaded':'Shoot');
    const asset=Frost.ancient(u)&&(u.uprooted||u.ancientShift)?FrostArt[key+'Uprooted']||original:FrostArt[activity?key+activity.animation:variant]||original,scale=asset.factionBuilding?Math.min((d.radius*2*.92)/Math.hypot(asset.size[0],asset.size[2]),(asset.maxWorldHeight??Infinity)/asset.size[1]):u.tag==='boss'||u.tdBoss?1.5:d.flying?1.1:asset.siegeModel?1:d.attack==='siege'?2:key.startsWith('Skeleton_')?1.15:key==='Tribal'?.7:key==='Demon'?.8:key==='Ghost_Skull'?.8:d.speed?(u.kind==='hero'?1.1:d.model==='knight'?1:.85):3;
    const actualScale=asset.classic?classicScale(key,u):scale;
    return {key,asset,scale:actualScale,height:(asset.classic&&asset.bounds?Math.max(0,asset.bounds.max[1]):asset.size[1])*actualScale+.5,...(asset.classic?{selectionSpan:selectionSpan(key,u)}:{})};
  }
  function heading(state,u,old){
    if(!Frost.mobile(u))return Frost.ancient(u)&&(u.uprooted||u.ancientShift)?old?.yaw??u.yaw??Math.PI/6:Math.PI/6;
    if(Frost.feeding(u))return u.yaw??0;
    const moved=old&&Math.hypot(u.x-old.x,u.z-old.z)>.008;
    if((Frost.druidUnit(u)||Frost.dryadUnit(u))&&Number.isFinite(u.castYaw)&&castPhase(u,FrostArt[(dryadRules.units[u.kind]??druidRules.units[u.kind]).model],moved)!==null)return u.castYaw;
    if(['hero','necromancer','shaman'].includes(u.kind)&&Number.isFinite(u.castYaw)&&castPhase(u,FrostArt[units[u.kind]||Frost.unitType(u).art],moved)!==null)return u.castYaw;
    const attacking=u.cd>(u.kind==='archer'?0:.25),hit=attacking&&(state.events||[]).find(e=>['hit','launch'].includes(e.type)&&e.team===u.team&&Math.hypot(e.fromX-u.x,e.fromZ-u.z)<.001),enemy=attacking&&u.order?.type==='attack'&&state.units.find(v=>v.id===u.order.target&&v.hp>0),inRange=enemy&&((Frost.hippogryphUnit(u)||Frost.chimaeraUnit(u)||Frost.faerieUnit(u))?Frost.distance(u,enemy):Math.hypot(Frost.distance(u,enemy),Frost.unitHeight(state,u)-Frost.unitHeight(state,enemy)))<=Frost.attackRange(u,enemy)+(Frost.types[enemy.kind].radius||.3)&&Frost.attackClear(state,u,enemy),target=work(state,u)?.target||hit||(inRange&&enemy);
    return target?Math.atan2(target.x-u.x,target.z-u.z):moved?Math.atan2(u.x-old.x,u.z-old.z):old?.yaw??u.yaw??0;
  }
  function corpse(state,c){
    const visual=model(state,{...c,hp:0,tag:c.boss?'boss':undefined,tdBoss:c.large}),{asset,scale}=visual,clip=asset.animations?.findIndex(a=>/Death/i.test(a.name));
    if(clip===undefined||clip<0)return null;
    if(asset.classic){const sample=classicSample(c,asset,false,c.age,'Death'),ground=Frost.elevation(state.map,c.x,c.z),fall=Frost.clamp(c.age/(asset.animations[sample.clip].duration||1),0,1),decay=Frost.clamp((c.age-(Frost.CORPSE_LIFETIME-4))/4,0,1);return {...visual,sample,mesh:sampleMesh(asset.parts[0],sample),y:ground+(c.y-ground)*(1-fall)-decay*Math.max(2,asset.size[1]*scale),yaw:c.yaw+(asset.classicYaw||0)};}
    const frames=asset.animations[clip].frames,ground=Frost.elevation(state.map,c.x,c.z),fall=Frost.clamp(c.age/(frames/12),0,1),decay=Frost.clamp((c.age-(Frost.CORPSE_LIFETIME-4))/4,0,1);
    return {...visual,mesh:asset.parts[0].mesh+'#pose='+clip+':'+Math.min(frames-1,Math.floor(c.age*12)),y:ground+(c.y-ground)*(1-fall)-decay*Math.max(2,asset.size[1]*scale),yaw:c.yaw};
  }
  function pose(u,asset,walking,time,rate=12){
    if(asset.classic)return sampleMesh(asset.parts[0],classicSample(u,asset,walking,time,undefined,rate));
    if(!asset.animations?.length)return asset.parts[0].mesh;
    const frames=clip=>asset.animations[clip].frames*rate/12,mesh=(clip,frame)=>asset.parts[0].mesh+'#pose='+clip+':'+Math.min(Math.ceil(frames(clip))-1,Math.floor(frame))+(rate===12?'':'@'+rate),loop=(clip,time)=>time*rate%frames(clip);
    if(asset.ancientForm){const morph=u.ancientShift,elapsed=u.ancientRegen>0?Frost.ancientRules.duration-u.ancientRegen:Infinity,name=morph?(morph.uprooted?'Uproot':'Root'):walking?'Walk':elapsed<10/12?'EatTree':u.cd>0&&!u.stun?'Attack':'Idle',clip=asset.animations.findIndex(a=>a.name===name);return mesh(clip,morph?(1-morph.left/Frost.ancientRules.morph)*frames(clip):name==='EatTree'?elapsed*rate:name==='Attack'?attackPhase(u,asset)*frames(clip):loop(clip,time));}
    const eat=asset.animations.findIndex(a=>a.name==='Cannibalize');if(Frost.feeding(u)&&eat>=0)return mesh(eat,loop(eat,Frost.cannibalize.duration-Frost.feeding(u)));
    if(asset.workAnimation){const clip=asset.workClip??0;return mesh(clip,loop(clip,time));}
    const cast=asset.animations.findIndex(a=>a.name===(['necromancer','shaman'].includes(u.kind)?'Staff_Attack':'Cast')),casting=castPhase(u,asset,walking);
    if(cast>=0&&casting!==null)return mesh(cast,casting*frames(cast));
    if(asset.attackEvent!==undefined){const clip=walking?1:u.cd>0&&!u.stun?2:0,frame=clip===2?attackPhase(u,asset)*frames(clip):loop(clip,time);return mesh(clip,frame);}
    const attack=(u.cd>.25)&&(u.kind!=='worker'||[FrostArt.RealWorker,FrostArt.RealAcolyte].includes(asset)&&!['gather','build','construct','repair'].includes(u.order?.type)),desired=asset===FrostArt.Skeleton_Rogue?(attack?/^2H_Ranged_Shooting$/:walking?/^Walking_A$/:/^Idle$/):asset===FrostArt.Skeleton_Mage?(attack?/^Spellcast_Shoot$/:walking?/^Walking_A$/:/^Idle$/):Frost.types[u.kind].flying?(attack?/Dragon_Attack$/:/Dragon_Flying/):attack?/Sword_Attack|Bow_Shoot|Staff_Attack|Punch|Headbutt/:walking?/^Run$|^Walk$|Fast_Flying/:/^Idle$|Flying_Idle/;
    let clip=asset.animations.findIndex(a=>desired.test(a.name));if(clip<0)clip=0;return mesh(clip,loop(clip,time));
  }
  function classicClip(asset,action,u={}){
    if(asset.classicTier===2&&action==='Attack'&&/\\HumanTower\\/i.test(asset.sourceModel||''))return classicClip(asset,'Stand',u);
    const tier=asset.classicTier||1,alternate=Frost.cryptLordUnit(u)?!!u.locustSwarm||u.locustActive===true||u.locustLeft>0:Frost.carrionBeetle(u)?Frost.beetleBurrowed(u):Frost.phoenixUnit(u)?u.kind==='phoenixegg':Frost.ancient(u)||asset.classic&&asset.factionBuilding&&/\\(Ancient[^\\]+|TreeofLife)\\/i.test(asset.sourceModel||'')?!u.uprooted:Frost.mountainKingUnit?.(u)?u.mountainAvatarLeft>0:Frost.demonHunterUnit?.(u)?u.metamorphLeft>0:Frost.druidUnit?.(u)?druidRules.units[u.kind].alternate:undefined,cargo=u.cargo>0?(u.cargoKind==='tree'?'lumber':'gold'):null;
    let best=-1,score=-Infinity;
    for(let i=0;i<asset.animations.length;i++){
      const name=asset.animations[i].name.toLowerCase().replace(/eattree/g,'eat tree'),base=action.toLowerCase();if(!name.startsWith(base)&&!(Frost.mountainKingUnit?.(u)&&name.replace(/^alternate /,'').startsWith(base))&&!(base==='attack'&&name==='alternate attack'))continue;
      let rank=0;
      if(Frost.giantUnit?.(u)){if(/upgrade/.test(name))rank+=Frost.giantWeapon(u)==='2'?40:-80;else if(Frost.giantWeapon(u)==='2')rank-=10;}else if(/upgrade/.test(name))rank+=tier===1?-80:tier===2?(/first/.test(name)?40:-80):/second/.test(name)?40:-80;
      else if(tier>1)rank-=10;
      if(alternate!==undefined)rank+=/alternate/.test(name)===alternate?30:-30;else if(/alternate/.test(name))rank-=20;
      if(/gold|lumber/.test(name))rank+=cargo&&name.includes(cargo)?15:-20;
      if(base==='stand'&&/work|ready|victory|hit|channel|birth/.test(name))rank-=30;
      rank-=name.length/1000;if(rank>score){score=rank;best=i;}
    }
    return best;
  }
  function classicSample(u,asset,walking,time,action,rate=12){
    let elapsed=Math.max(0,time),progress=null;
    if(!action&&(shadowhunterModel(u)||taurenModel(u)||farseerModel(u)||blademasterModel(u)||bloodMageModel(u)||mountainKingModel(u)||lichModel(u)||cryptLordModel(u)||dreadlordModel(u)||deathKnightModel(u)||paladinModel(u)||archmageModel(u)||wardenModel(u)||keeperModel(u)||priestessModel(u))&&/Portrait/i.test(asset.sourceModel||''))action='Portrait';
    if(!action&&Frost.demonHunterUnit(u)&&/HeroDemonHunter_Portrait/i.test(asset.sourceModel||''))action='Portrait';
    if(!action){
      const casting=castPhase(u,asset,walking);
      if(hexModel(u)&&!/Portrait/i.test(asset.sourceModel||'')){const swim=hexModel(u).movement==='float';action=u.hp<=0?(swim?'Death Swim':'Death'):walking?(swim?(classicClip(asset,'Walk Swim',u)>=0?'Walk Swim':'Swim Walk'):'Walk'):swim?'Stand Swim':'Stand';}
      else if(Frost.shadowhunterUnit(u)&&u.voodoo&&!walking){action='Stand Channel';elapsed=time-u.voodoo.frame*Frost.DT;}
      else if(Frost.shadowhunterUnit(u)&&u.shadowhunterCast&&!walking){action=u.shadowhunterCast.slot===0?'Spell Throw':'Spell';progress=1-u.shadowhunterCast.left/Number(Frost.shadowhunterRules.unit.sourceRows.UnitWeapons.castpt);}
      else if(Frost.shadowhunterUnit(u)&&u.shadowhunterLastSlot!==undefined&&!walking&&!u.stun&&time-u.shadowhunterCastFrame*Frost.DT<.7){action=u.shadowhunterLastSlot===0?'Spell Throw':'Spell';elapsed=time-u.shadowhunterCastFrame*Frost.DT;}
      else if(Frost.serpentward(u)&&u.hp>0&&time-u.wardBornFrame*Frost.DT<asset.animations[classicClip(asset,'Birth',u)].duration){action='Birth';elapsed=time-u.wardBornFrame*Frost.DT;}
      else if(Frost.taurenUnit(u)&&u.reincarnation){action='Death';elapsed=time-u.reincarnation.frame*Frost.DT;}
      else if(Frost.taurenUnit(u)&&u.taurenCast&&!walking){action=u.taurenCast.slot===0?'Attack Slam':'Spell Slam';progress=1-u.taurenCast.left/Number(Frost.taurenRules.unit.sourceRows.UnitWeapons.castpt);}
      else if(Frost.taurenUnit(u)&&u.taurenLastSlot!==undefined&&!walking&&!u.stun&&time-u.taurenCastFrame*Frost.DT<.7){action=u.taurenLastSlot===0?'Attack Slam':'Spell Slam';elapsed=time-u.taurenCastFrame*Frost.DT;}
      else if(Frost.farseerUnit(u)&&u.earthquake&&!walking){action='Spell';elapsed=time-u.earthquake.frame*Frost.DT;}
      else if(Frost.farseerUnit(u)&&u.farseerCast&&!walking){action=u.farseerCast.slot===0?'Spell Chain Lightning':'Spell';progress=1-u.farseerCast.left/Number(Frost.farseerRules.unit.sourceRows.UnitWeapons.castpt);}
      else if(Frost.farseerUnit(u)&&u.farseerLastSlot!==undefined&&!walking&&time-u.farseerCastFrame*Frost.DT<.5){action=u.farseerLastSlot===0?'Spell Chain Lightning':'Spell';elapsed=time-u.farseerCastFrame*Frost.DT;}
      else if(Frost.blademasterUnit(u)&&u.bladeStorm){action='Attack Walk Stand Spin';elapsed=time-u.bladeStorm.frame*Frost.DT;}
      else if(Frost.blademasterUnit(u)&&u.bladeCast){action='Stand';progress=1-u.bladeCast.left/Number(Frost.blademasterRules.units.Obla.sourceRows.UnitWeapons.castpt);}
      else if(Frost.bloodMageUnit(u)&&u.siphonMana&&!walking){action='Spell Channel';elapsed=time-u.siphonMana.frame*Frost.DT;}
      else if(Frost.bloodMageUnit(u)&&u.bloodMageCast&&!walking){action='Spell';progress=castPhase(u,asset,walking);}
      else if(Frost.bloodMageUnit(u)&&u.bloodMageLastSlot!==undefined&&!walking&&time-u.bloodMageCastFrame*Frost.DT<.8){action='Spell';elapsed=time-u.bloodMageCastFrame*Frost.DT;}
      else if(Frost.mountainKingUnit(u)&&u.mountainKingCast&&!walking){action=['Spell Throw','Spell Slam','','Morph Alternate'][u.mountainKingCast.slot];progress=castPhase(u,asset,walking);}
      else if(Frost.mountainKingUnit(u)&&u.mountainKingLastSlot!==undefined&&!walking&&!u.stun&&time-u.mountainKingCastFrame*Frost.DT<.8){action=['Spell Throw','Spell Slam','','Morph Alternate'][u.mountainKingLastSlot];elapsed=time-u.mountainKingCastFrame*Frost.DT;}
      else if(Frost.sleepLeft(u)>0){action='Stand';}
      else if(Frost.infernalUnit(u)&&u.hp>0&&time-u.infernalBorn*Frost.DT<asset.animations[classicClip(asset,'Birth',u)].duration){action='Birth';elapsed=time-u.infernalBorn*Frost.DT;}
      else if(Frost.cryptLordUnit(u)&&u.cryptLordCast&&!walking){action=u.cryptLordCast.slot===0?'Spell Throw':'Spell';progress=castPhase(u,asset,walking);}
      else if(Frost.cryptLordUnit(u)&&u.cryptLordLastSlot!==undefined&&!walking&&!u.stun&&time-u.cryptLordCastFrame*Frost.DT<Frost.cryptLordRules.unit.castBackswing){action=u.cryptLordLastSlot===0?'Spell Throw':'Spell';elapsed=time-u.cryptLordCastFrame*Frost.DT+Frost.cryptLordRules.unit.castPoint;}
      else if(Frost.carrionBeetle(u)&&(u.beetleShift||u.beetleShiftLeft>0)){const shift=u.beetleShift;action=(shift?shift.burrow:!Frost.beetleBurrowed(u))?'Morph':'Morph Alternate';progress=1-(shift?.left??u.beetleShiftLeft)/Frost.cryptLordRules.commands['Abu'+u.beetleRank].levels[0].duration;}
      else if(Frost.carrionBeetle(u)&&u.hp>0&&(u.beetleBorn!==undefined||u.beetleAge!==undefined)&&(u.beetleAge??time-u.beetleBorn*Frost.DT)<asset.animations[classicClip(asset,'Birth',u)].duration){action='Birth';elapsed=u.beetleAge??time-u.beetleBorn*Frost.DT;}
      else if(Frost.dreadlordUnit(u)&&u.dreadlordCast&&!walking){action=u.dreadlordCast.slot===0?'Spell Slam':'Spell';progress=castPhase(u,asset,walking);}
      else if(Frost.dreadlordUnit(u)&&u.dreadlordLastSlot!==undefined&&!walking&&!u.stun&&time-u.dreadlordCastFrame*Frost.DT<Frost.dreadlordRules.unit.castBackswing){action=u.dreadlordLastSlot===0?'Spell Slam':'Spell';elapsed=time-u.dreadlordCastFrame*Frost.DT+Frost.dreadlordRules.unit.castPoint;}
      else if(Frost.lichUnit(u)&&u.deathDecay&&!walking){action='Stand Channel';elapsed=time-u.deathDecay.frame*Frost.DT;}
      else if(Frost.lichUnit(u)&&u.lichCast&&!walking){action='Spell';progress=1-u.lichCast.left/Frost.lichRules.unit.castPoint;}
      else if(Frost.lichUnit(u)&&u.lichLastSlot!==undefined&&!walking&&!u.stun&&time-u.lichCastFrame*Frost.DT<.8){action='Spell';elapsed=time-u.lichCastFrame*Frost.DT;}
      else if(Frost.deathKnightUnit(u)&&u.deathKnightCast&&!walking){action='Spell';progress=1-u.deathKnightCast.left/Number(Frost.deathKnightRules.unit.sourceRows.UnitWeapons.castpt);}
      else if(Frost.deathKnightUnit(u)&&u.deathKnightLastSlot!==undefined&&!walking&&time-u.deathKnightCastFrame*Frost.DT<.8){action='Spell';elapsed=time-u.deathKnightCastFrame*Frost.DT;}
      else if(Frost.paladinUnit(u)&&u.paladinCast&&!walking){action='Spell';progress=1-u.paladinCast.left/Number(Frost.paladinRules.units.Hpal.sourceRows.UnitWeapons.castpt);}
      else if(Frost.paladinUnit(u)&&u.paladinLastSlot!==undefined&&!walking&&time-u.paladinCastFrame*Frost.DT<.8){action='Spell';elapsed=time-u.paladinCastFrame*Frost.DT;}
      else if(Frost.archmageUnit(u)&&(u.blizzard||u.massTeleport)&&!walking){action='Stand Channel';elapsed=time-(u.blizzard?.frame??u.massTeleport.frame)*Frost.DT;}
      else if(Frost.archmageUnit(u)&&u.archmageCast&&!walking){action='Spell';progress=1-u.archmageCast.left/Number(Frost.archmageRules.units.Hamg.sourceRows.UnitWeapons.castpt);}
      else if(Frost.archmageUnit(u)&&u.archmageLastSlot!==undefined&&!walking&&time-u.archmageCastFrame*Frost.DT<.5){action='Spell';elapsed=time-u.archmageCastFrame*Frost.DT;}
      else if(Frost.wardenUnit(u)&&u.wardenCast&&!walking){action=['Spell','Spell Slam','Spell Throw','Spell'][u.wardenCast.slot];progress=castPhase(u,asset,walking);}
      else if(Frost.wardenUnit(u)&&u.wardenLastSlot!==undefined&&!walking&&time-u.wardenCastFrame*Frost.DT<.5){action=['Spell','Spell Slam','Spell Throw','Spell'][u.wardenLastSlot];elapsed=time-u.wardenCastFrame*Frost.DT;}
      else if(Frost.vengeanceAvatar(u)&&u.vengeanceCast&&!walking){action='Spell';progress=castPhase(u,asset,walking);}
      else if(Frost.priestessUnit(u)&&u.starfall&&!walking){action='Spell';elapsed=Frost.priestessRules.abilities.AEsf.levels[0].duration-u.starfall.left;}
      else if(Frost.priestessUnit(u)&&u.priestessCast&&!walking){action='Spell';progress=1-u.priestessCast.left/Number(Frost.priestessRules.units.Emoo.sourceRows.UnitWeapons.castpt);}
      else if(Frost.keeperUnit(u)&&u.tranquility&&!walking){action='Stand Channel';elapsed=keeperRules.abilities.AEtq.levels[0].duration-u.tranquility.left;}
      else if(Frost.keeperUnit(u)&&u.keeperCast&&!walking){action='Spell';progress=1-u.keeperCast.left/Number(keeperRules.units.Ekee.sourceRows.UnitWeapons.castpt);}
      else if(Frost.demonHunterUnit(u)&&u.metamorphCastLeft>0){action='Morph';progress=1-u.metamorphCastLeft/Number(Frost.demonHunterRules.abilities.AEme.sourceRow.Dur1);}
      else if(Frost.demonHunterUnit(u)&&u.demonCast&&!walking){action='Spell';progress=1-u.demonCast.left/Number(Frost.demonHunterRules.units.Edem.sourceRows.UnitWeapons.castpt);}
      else if(Frost.druidUnit(u)&&u.druidShift){action=druidRules.units[u.kind].alternate?'Morph Alternate':'Morph';progress=1-u.druidShift.left/Frost.druidMorphDuration(u);}
      else if(Frost.ancient(u)&&u.ancientShift){action=u.ancientShift.uprooted?'Morph Alternate':'Morph';progress=1-u.ancientShift.left/Frost.ancientRules.morph;}
      else if(u.built!==undefined&&u.built<1){action='Birth';progress=u.built;}
      else if(u.kind==='entangledmine'&&u.workers>0)action='Stand Work '+['First','Second','Third','Fourth','Fifth'][Math.min(5,u.workers)-1];
      else if(Frost.ancient(u)&&(u.entangleCast||u.entangleCasting)){action='Spell';progress=1-(u.entangleCast?.left??u.entangleCasting)/Frost.entangledRules.castTime;}
      else if(Frost.giantUnit(u)&&u.order?.type==='warClub'&&u.order.left!==undefined){action='Spell Eat Tree';elapsed=Number(giantRules.abilities.Agra.sourceRow.DataA1)-u.order.left;}
      else if(Frost.giantUnit(u)&&u.tauntFrame!==undefined&&!walking&&!u.stun&&time-u.tauntFrame*Frost.DT<3){action='Spell';elapsed=Math.max(0,time-u.tauntFrame*Frost.DT);}
      else if(walking)action='Walk';
      else if(!u.stun&&casting!==null){action=Frost.druidUnit(u)&&(u.order?.spell??u.druidCastSpell)==='roar'?(u.kind==='druidbear'?'Attack Spell':'Spell Slam'):Frost.portalLeft(u)>0?'Stand Channel':'Spell';progress=casting;}
      else if(Frost.feeding(u)>0){action='Stand Channel';elapsed=Frost.cannibalize.duration-Frost.feeding(u);}
      else if(Frost.ancient(u)&&u.ancientRegen>0){action='Spell Eat Tree';elapsed=Frost.ancientRules.duration-u.ancientRegen;}
      else if(!u.stun&&asset.classicWork){action=asset.classicWork==='Wood'?'Attack Lumber':asset.classicWork==='Mine'&&classicClip(asset,'Stand Work Gold',u)>=0?'Stand Work Gold':'Stand Work';}
      else if(!u.stun&&u.cd>0){action=classicClip(asset,'Attack',u)>=0?'Attack':'Spell Attack';progress=Frost.clamp(1-u.cd/(Frost.unitType(u).cooldown||1),0,1);}
      else action='Stand';
    }
    let clip=classicClip(asset,action,u);if(clip<0)clip=classicClip(asset,'Stand',u);if(clip<0)clip=0;
    const animation=asset.animations[clip];if(!animation)return {clip:0,frame:0,rate};
    elapsed=Math.max(0,elapsed);
    const duration=animation.duration||animation.frames/12||1,t=progress!==null?Frost.clamp(progress,0,1)*duration:animation.loop||asset.classicWork&&action!=='Death'?elapsed%duration:Math.min(elapsed,duration),frame=t>=duration?Math.ceil(duration*rate):Math.floor(t*rate+1e-7);
    return {clip,frame,rate};
  }
  function sentinel(state,owl,time){
    const art=sentinelArt,asset=art.model,scale=unitScales.worldScale,tree=state.resources[owl.resource],sample=classicSample({},asset,false,time,owl.perched?'Stand':'Walk',30),yaw=owl.perched?0:Math.atan2(tree.x-owl.x,tree.z-owl.z)-Math.PI/2,height=Frost.nightTechnology.specialRules.sentinel.perchedHeight/art.sourceUnitsPerModelUnit*scale;
    const position=[owl.x,Frost.elevation(state.map,owl.x,owl.z)+(owl.perched?height:0),owl.z];
    return {parts:parts(asset,sampleMesh(asset.parts[0],sample),owl.team),position,scale:[scale,scale,scale],rotation:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],target:{x:owl.x,z:owl.z,y:position[1]+(asset.bounds.min[1]+asset.bounds.max[1])/2*scale},component:{effect:art.effect,clip:sample.clip,playing:false,looping:true,speed:1,time_seconds:time%asset.animations[sample.clip].duration}};
  }
  function sampleMesh(part,sample){return part.mesh+'#pose='+sample.clip+':'+sample.frame+(sample.rate&&sample.rate!==12?'@'+sample.rate:'');}
  function parts(asset,mesh,team=0,placement=false){
    const match=mesh?.match(/#pose=(\d+):([\d.]+)(?:@(\d+))?$/),clip=match?Number(match[1]):0,seconds=match?Number(match[2])/Number(match[3]||12):0,animation=asset.animations?.[clip],frame=animation&&seconds>=animation.duration?animation.frames:seconds*12;
    return asset.parts.map(part=>{
      const state=materialState(part.states?.[clip],frame),visible=state?state[4]>.001:part.defaultVisible!==false,color=state?state.slice(1,5):[1,1,1,1],material=placement?part.placementMaterial||'Assets/Materials/Placement.mmat':part.teamMaterials?.[String(team===0?1:0)]||part.textureMaterials?.[String(state?.[5])]||part.material||asset.material;
      return {...part,mesh:part.mesh+(match?mesh.slice(mesh.indexOf('#pose=')):''),material,color,visible};
    });
  }
  function materialState(runs,frame){if(!runs?.length)return null;let lo=0,hi=runs.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(runs[mid][0]<=frame)lo=mid;else hi=mid-1;}return runs[lo];}
  function actorPartCount(catalog=FrostArt){return Math.max(1,...Object.values(catalog).map(a=>a.parts?.length||1));}
  function portrait(asset){const b=asset.bounds;if(!asset.classic||!b)return null;const h=b.max[1]-b.min[1];return {size:h*(asset.factionBuilding?.85:.24),camera:{position:[0,asset.factionBuilding?(b.max[1]+b.min[1])/2:b.max[1]-h*.16,Math.max(Math.abs(b.min[2]),Math.abs(b.max[2]))+h*2],scale:[1,1,1],rotation:[0,0,0,1]}};}
  function environmentPartCount(catalog=FrostArt){return Math.max(1,...Object.entries(catalog).filter(([key])=>!/^Classic(?:MountainKing|BloodMage|Phoenix|BladeMaster|FarSeer|TaurenChieftain|ShadowHunter)/.test(key)).map(([,a])=>a.lod_parts?.[0]?.length||1));}
  function environment(key,height,yaw,far,width=Infinity,time=0,action='Stand'){const asset=FrostArt[key],lod=far?1:0,sample=asset.classic?classicSample({},asset,false,time,action,30):null,renderParts=sample?parts(asset,asset.parts[0].mesh+'#pose='+sample.clip+':'+sample.frame+'@30'):asset.lod_parts?.[lod]||[{mesh:asset.lods[lod],material:asset.material,pivot:[0,0,0]}];return {key,asset,mesh:renderParts[0].mesh,parts:renderParts,scale:Math.min(height/asset.size[1],width/Math.max(asset.size[0],asset.size[2])),yaw};}
  const trees=['ClassicWinterTree','ClassicOak','ClassicBarrensTree'].map(prefix=>Array.from({length:6},(_,i)=>prefix+(i||''))),rocks=['ClassicWinterRock','ClassicForestRock','ClassicBarrensRock'];
  function resource(r,zoom=27,tileset=0,elapsed=0,time=0,working=false){
    const age=r.felled?r.felled.age+Math.max(0,elapsed):0;if(r.amount<=0&&(!r.felled||age>=Frost.TREE_FALL_LIFETIME))return null;
    const variants=trees[tileset]||trees[0],seed=(Math.imul(Math.round(r.x*100),73856093)^Math.imul(Math.round(r.z*100),19349663))>>>0,key=r.kind==='tree'?variants[seed%variants.length]:r.kind==='mine'?'ClassicGoldMine':'RealFirePit',v=environment(key,r.kind==='tree'?4.7+(seed%12)/10:r.kind==='mine'?4.9:.65,r.kind==='mine'?0:seed%628/100,zoom>14,r.kind==='tree'?5:r.kind==='mine'?5.4:1.4,r.kind==='mine'&&working?time:0,r.kind==='mine'&&working?'Stand Work':'Stand');
    if(r.felled){const t=Frost.clamp(age/1.5,0,1),angle=Math.PI/2*t*t,fall=Math.sin(angle/2),x=Math.cos(r.felled.yaw)*fall,z=-Math.sin(r.felled.yaw)*fall,w=Math.cos(angle/2),s=Math.sin(v.yaw/2),c=Math.cos(v.yaw/2);v.rotation=[x*c-z*s,w*s,z*c+x*s,w*c];v.sink=Frost.clamp((age-4)/2,0,1)*Math.max(v.asset.size[0],v.asset.size[2])*v.scale;}
    return v;
  }
  function doodad(d,zoom=27,tileset=0){const def=Frost.doodads[d.kind];return environment(d.kind==='rock'?(rocks[tileset]||rocks[0])+d.variant:'RealShrub',def.height*d.scale,d.yaw,zoom>14,def.width*d.scale);}
  function scenery(i,edge,zoom=27,tileset=0){const variants=trees[tileset]||trees[0],tree=edge?i%4!==0:i%5===0,shrub=!tree&&i%3===0,key=tree?variants[i%variants.length]:shrub?'RealShrub':(rocks[tileset]||rocks[0])+i%6;return environment(key,tree?(edge?7+i%4:3.8+i%3*.5):shrub?1.2:edge?2.1+i%3*.4:.35+i%4*.2,i*2.399963,edge||zoom>14,tree?6:edge?4.5:1.7);}
  function groundDetail(i,zoom=27,green=true,normal=[0,1,0]){
    const v=environment(['RealGrassA','RealGrassB','RealGrassC'][i%3],.58+i%3*.12,i*2.399963,zoom>14,1.1),q=[normal[2],-normal[0],1+normal[1]],length=Math.hypot(...q),[x,z,w]=q.map(n=>n/length),s=Math.sin(v.yaw/2),c=Math.cos(v.yaw/2);
    return {...v,material:green?v.asset.material:v.asset.material.replace('.mmat','_dry.mmat'),rotation:[x*c-z*s,w*s,z*c+x*s,w*c]};
  }
  function heroPortrait(heroClass=0,closeup=false,u=null){if(cryptLordModel(u))return cryptLordModel(u).icon;if(dreadlordModel(u))return dreadlordModel(u).icon;if(Frost.shadowhunterUnit(u))return Frost.shadowhunterRules.unit.icon;if(taurenModel(u))return taurenModel(u).icon;if(farseerModel(u))return farseerModel(u).icon;if(blademasterModel(u))return blademasterModel(u).icon;if(bloodMageModel(u))return bloodMageModel(u).icon;if(Frost.mountainKingUnit(u))return Frost.mountainKingRules.units.Hmkg.icon;if(Frost.lichUnit(u))return lichModel(u).icon;if(Frost.deathKnightUnit(u))return deathKnightModel(u).icon;if(Frost.paladinUnit(u))return Frost.paladinRules.units.Hpal.icon;if(Frost.archmageUnit(u))return Frost.archmageRules.units.Hamg.icon;if(Frost.wardenUnit(u))return Frost.wardenRules.units.Ewar.icon;if(Frost.priestessUnit(u))return Frost.priestessRules.units.Emoo.icon;if(Frost.keeperUnit(u))return keeperRules.units.Ekee.icon;if(Frost.demonHunterUnit(u))return Frost.demonHunterRules.units[u.metamorphLeft>0?'Edmm':'Edem'].icon;const art=Frost.heroes[heroClass].art;return FrostArt[art].realistic?'Assets/Art/'+(closeup?'head-portraits':'unit-portraits')+'.png#'+art:'Assets/Art/hero-portraits.png#hero-'+heroClass;}
  function unitPortrait(state,u){if(cryptLordModel(u))return cryptLordModel(u).icon;if(dreadlordModel(u))return dreadlordModel(u).icon;if(Frost.shadowhunterUnit(u))return Frost.shadowhunterRules.unit.icon;if(Frost.serpentward(u))return Frost.shadowhunterRules.abilities.AOsw.icon;if(taurenModel(u))return taurenModel(u).icon;if(farseerModel(u))return Frost.farseerUnit(u)?farseerModel(u).icon:Frost.farseerRules.abilities.AOsf.icon;if(blademasterModel(u))return blademasterModel(u).icon;if(bloodMageModel(u))return bloodMageModel(u).icon;if(mountainKingModel(u))return mountainKingModel(u).icon;if(deathKnightModel(u))return deathKnightModel(u).icon;if(paladinModel(u))return paladinModel(u).icon;if(archmageModel(u))return archmageModel(u).icon;if(wardenModel(u))return wardenModel(u).icon;if(priestessModel(u))return priestessModel(u).icon;if(keeperModel(u))return keeperModel(u).icon;if(Frost.demonHunterUnit(u))return heroPortrait(u.heroClass,true,u);if(giantRules.units[u.kind])return giantRules.units[u.kind].icon;if(faerieRules.units[u.kind]||chimaeraRules.units[u.kind]||chimaeraRules.buildings[u.kind]||hippogryphRules.units[u.kind]||dryadRules.units[u.kind]||druidRules.units[u.kind]||druidRules.buildings[u.kind])return 'Assets/Art/classic-'+u.kind+'.png';if(Frost.ancientWarRules.units[u.kind])return 'Assets/Art/classic-'+u.kind+'.png';if(u.kind==='entangledmine')return 'Assets/Art/classic-entangle-mine.png';const v=model(state,u),key=v.key==='KingdomScoutTower'?'KingdomTower':v.key;if(key==='ClassicWisp')return 'Assets/Art/classic-wisp-icon.png';return (v.asset.factionBuilding?'Assets/Art/faction-buildings.png#':['RealFrostWarden','RealEmberSage','RealSylvanRanger','RealDawnPaladin','RealFootman','RealWorker','RealArcher','RealRifleman','RealOrc','RealAcolyte','RealNecromancer','RealShaman'].includes(key)?'Assets/Art/head-portraits.png#':'Assets/Art/unit-portraits.png#')+key;}
  function name(state,u){if(Frost.animatedUnit(u)&&['worker','soldier'].includes(u.kind))return {hpea:'Peasant',opeo:'Peon',uaco:'Acolyte',hfoo:'Footman',ogru:'Grunt',esen:'Huntress',ugho:'Ghoul'}[u.sourceUnit];if(Frost.wisp(state,u))return 'Wisp';if(u.kind==='hall')return Frost.mainBase(state,u).name;const f=state.teams[u.team]?.faction||0,value=names[f][u.kind];if(u.kind==='worker'&&f===3)return 'Acolyte';if(u.kind==='critter')return u.team===0?'Mechanical Critter':'Critter';if(u.tag==='critter')return 'Critter';if(u.kind==='neutral')return u.tag==='boss'?'Frostbound sovereign':'Frostfang wolf';return Array.isArray(value)?value[Frost.clamp((u.upgradeTier??1)-1,0,2)]:value||Frost.unitType(u).label;}
  const projectileColors={fire:[1,.32,.055,1],frost:[.35,.8,1,1],nature:[.35,.85,.24,1],shadow:[.57,.22,.8,1],arcane:[.5,.48,1,1]};
  function muzzle(e){const asset=FrostArt.RealRifleman,scale=asset.classic?classicScale('RealRifleman'):.85,[x,y,z]=asset.muzzle||[0,asset.bounds.min[1]+asset.size[1]*.6,asset.bounds.max[0]],angle=Math.atan2(e.x-e.fromX,e.z-e.fromZ),sin=Math.sin(angle),cos=Math.cos(angle);return {type:'muzzle',art:'musket',team:e.team,x:e.fromX+(x*cos+z*sin)*scale,y:e.fromY-1.6+y*scale,z:e.fromZ+(-x*sin+z*cos)*scale};}
  function projectile(art,time=0,team=-1){
    if(art==='phoenix-fire'){const scale=unitScales.worldScale;return {parts:[],scale:[scale,scale,scale],sourceXAxis:true,color:[1,1,1,1],trail:false,particleSize:0,impactSize:.3};}
    const key={shadowhunter:'ClassicShadowHunterMissile',serpentward:'ClassicSerpentWardMissile',farseer:'ClassicFarSeerMissile','blood-mage':'ClassicBloodMageBloodElfMissile',phoenix:'ClassicBloodMagePhoenix_Missile',lich:'ClassicLichMissile','death-coil':'ClassicDeathCoilMissile','mountain-bolt':'ClassicMountainKingStormBoltMissile',archmage:'ClassicArchmageMissile',warden:'ClassicWardenWardenMissile','warden-fan':'ClassicWardenFanOfKnivesMissile','warden-shadow':'ClassicWardenShadowStrikeMissile',vengeanceavatar:'ClassicWardenSpiritOfVengeanceMissile',vengeancespirit:'ClassicWardenVengeanceMissile',priestess:'ClassicPriestessMissile','priestess-searing':'ClassicPriestessSearingMissile',keeper:'ClassicKeeperMissile','demon-hunter':'ClassicDHMissile','faerie-dragon':'ClassicFaerieDragonMissile','chimaera-acid':'ClassicChimaeraAcidMissile','chimaera-lightning':'ClassicChimaeraLightningMissile','night-arrow':'ClassicNightArrow','moon-glaive':'ClassicMoonGlaive',glaive:'ClassicGlaiveMissile',dryad:'ClassicDryadMissile'}[art];
    if(key){const asset=FrostArt[key],sample=classicSample({},asset,false,time,['mountain-bolt','death-coil'].includes(art)?'Birth':'Stand',30),render=parts(asset,asset.parts[0].mesh+'#pose='+sample.clip+':'+sample.frame+'@30',team),scale=unitScales.worldScale;return {mesh:{mesh:render[0].mesh,material:render[0].material},parts:render,scale:[scale,scale,scale],sourceXAxis:true,color:[.7,.7,.65,1],texture:'spark_01',trail:false,particleSize:0,impactSize:art==='glaive'?1.5:.3};}
    if(art==='water-elemental')return {mesh:null,parts:[],scale:[unitScales.worldScale,unitScales.worldScale,unitScales.worldScale],sourceXAxis:true,trail:false,particleSize:0,impactSize:.3};
    if(art==='musket')return {mesh:null,scale:[1,1,1],color:[.74,.67,.5,.7],texture:'smoke_01',trail:false,particleSize:.3,impactSize:.3};
    const color=projectileColors[art],stone=art==='stone',physical=!color,asset=physical?FrostArt[stone?'RealRock07':'RealArrow']:null,size=stone?1.2/Math.max(...asset.size):1;
    return {mesh:asset?{mesh:stone?asset.lods[1]:asset.parts[0].mesh,material:asset.material}:null,scale:stone?[size,size,size]:art==='ballista'?[2.2,2.2,2]:art==='javelin'?[1.4,1.4,1.6]:art==='quarrel'?[1,1,.6]:[1,1,1],color:color||[.53,.43,.3,.7],texture:art==='fire'||art==='shadow'||stone?'smoke_01':art==='frost'?'star_04':'spark_01',trail:!!color,particleSize:art==='fire'?.65:art==='shadow'?.55:art==='frost'?.3:.4,impactSize:stone?1.8:physical?.3:.85};
  }
  function projectileView(maxStep=Infinity){
    let frame=-1,tracks=new Map();
    const position=(v,clock)=>{const t=Frost.clamp((clock-v.at)/Frost.DT,0,1);return {...v.target,x:v.from.x+(v.target.x-v.from.x)*t,y:v.from.y+(v.target.y-v.from.y)*t,z:v.from.z+(v.target.z-v.from.z)*t};};
    return {reset(){frame=-1;tracks.clear();},sample(shots,nextFrame,clock){
      if(Number.isFinite(maxStep))for(const p of shots){const old=tracks.get(p.id);if(old&&Math.hypot(p.x-old.target.x,p.y-old.target.y,p.z-old.target.z)>maxStep)tracks.set(p.id,{from:{...p},target:{...p},at:clock});}
      if(nextFrame!==frame){const fresh=new Map();for(const p of shots){const old=nextFrame>frame&&nextFrame-frame<=2?tracks.get(p.id):null;fresh.set(p.id,{from:old?position(old,clock):{...p},target:{...p},at:clock});}tracks=fresh;frame=nextFrame;}
      return [...tracks.values()].map(v=>position(v,clock));
    }};
  }
  return {camera:{height:32,depth:42},model,name,pose,corpse,heroPortrait,unitPortrait,heading,resource,scenery,doodad,environmentPartCount,groundDetail,projectile,projectileView,muzzle,classicClip,classicSample,parts,actorPartCount,portrait,sentinel};
})();
if(typeof module!=='undefined')module.exports=FrostVisual;
