/* Author: MiYu. Shared faction models for live units, map placement and construction previews. */
var FrostVisual=(()=>{
  const buildings={hall:'Hall',barracks:'Barracks',farm:'Lodge',tower:'Tower',altar:'Altar',workshop:'Workshop'};
  const names=[
    {hall:['Keep','Castle','Royal citadel'],barracks:'Royal barracks',farm:'Town house',tower:'Guard tower',altar:'Sanctuary',workshop:'Royal workshop'},
    {hall:['Great lodge','War hall','Iron stronghold'],barracks:'War barracks',farm:'Clan dwelling',tower:'Watch post',altar:'Spirit sanctuary',workshop:'Siege workshop'},
    {hall:['Ancient of roots','Ancient of boughs','Elder grove'],barracks:'Sentinel grove',farm:'Living shelter',tower:'Thorn watch',altar:'Moon sanctuary',workshop:'Grove workshop'},
    {hall:['Necropolis','Black citadel','Dread fortress'],barracks:'Crypt',farm:'Ziggurat',tower:'Soul tower',altar:'Altar of shadows',workshop:'Bone foundry'}
  ];
  const units={skeletonmage:'RealSkeletonMage',skeletonwarrior:'RealSkeletonWarrior',treant:'RealTreant',rifleman:'RealRifleman',mage:'RealEmberSage',paladin:'RealPaladin',knight:'RealKnight',archer:'RealArcher',raider:'RealOrc',hunter:'Tribal',berserker:'Orc_Skull',shaman:'RealShaman',ghoul:'RealGhoul',abomination:'RealAbomination',necromancer:'RealNecromancer',bonearcher:'RealBoneArcher'};
  const base={worker:'RealWorker',soldier:'RealFootman',archer:'Ranger',knight:'Warrior',mage:'Wizard',hero:'Cleric',creep:'RealFootman',rangedcreep:'RealArcher',siegecreep:'RealCatapult',neutral:'RealWolf',ballista:'RealBallista',catapult:'RealCatapult',trebuchet:'RealTrebuchet',ram:'RealRam',dragon:'Dragon'};
  function work(state,u){
    if(u.miningTarget&&u.hp>0&&!u.stun)return {target:u.miningTarget,animation:'Mine'};
    if(!['worker','ghoul'].includes(u.kind)||!u.order||u.hp<=0||u.stun>0||u.inside)return null;
    let target,animation;
    if(u.order.type==='gather'){
      target=state.resources[u.order.resource];if(Frost.acolyte(state,u)&&!u.cargo)return Frost.miningTarget(state,u)?{target,animation:'Mine'}:null;if(!target||target.amount<=0||u.cargo>=20||u.cargo>0&&u.cargoKind&&u.cargoKind!==target.kind||!state.units.some(v=>v.team===u.team&&v.kind==='hall'&&v.hp>0&&v.built===1)||Frost.distance(u,target)>3)return null;
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
    if(u.kind==='shaman')return !walking&&!u.stun&&u.castLeft>0?1-u.castLeft/.8:null;
    if(u.kind==='necromancer')return !walking&&!u.stun&&(u.castLeft>0||u.raiseDeadCd>Frost.raiseDead.cooldown-.8)?u.castLeft>0?1-u.castLeft/.8:(Frost.raiseDead.cooldown-u.raiseDeadCd)/.8:null;
    if(u.kind!=='hero'||walking||u.stun||!asset.animations?.some(a=>a.name==='Cast'))return null;
    if(Frost.portalLeft(u)>0)return Math.min(.65,(Frost.townPortal.time-Frost.portalLeft(u))/.8*.65);
    const elapsed=Math.min(...Frost.unitType(u).spells.map((s,i)=>u.spell?.[i]>0?s.cooldown-u.spell[i]:Infinity));
    return elapsed>=0&&elapsed<.8?(asset.loadedModel?asset.attackEvent+(1-asset.attackEvent)*elapsed/.8:elapsed/.8):null;
  }
  function model(state,u,walking=false){
    const d=Frost.types[u.kind],f=state.teams[u.team]?.faction||0,tier=Frost.clamp(u.upgradeTier??state.teams[u.team]?.tier??1,1,3);
    let key=['spirittower','nerubiantower'].includes(u.kind)?'RevenantTower':u.kind==='hauntedmine'?'HauntedMine':u.kind==='temple'?'RealTemple':u.kind==='spiritlodge'?'WarclansAltar':buildings[u.kind]?Frost.factions[f]+buildings[u.kind]+(u.kind==='hall'&&tier>1?tier:''):u.kind==='hero'?Frost.unitType(u).art:u.tag==='boss'?'RealBear':u.kind==='frosttower'?'FrostTower':u.kind==='flametower'?'EmberTower':u.kind==='worker'?['RealWorker','Tribal','Rogue','RealAcolyte'][f]:units[u.kind]||base[u.kind]||base[d.model];
    const original=FrostArt[key],activity=['RealWorker','RealAcolyte','RealGhoul'].includes(key)?work(state,u):null,phase=(key==='RealArcher'||original.shotModel)&&!walking&&!u.stun?(castPhase(u,original,walking)??(u.cd>0?attackPhase(u,original):null)):null,loaded=phase!==null&&(original.ammoLoad<original.attackEvent?phase>=original.ammoLoad&&phase<original.attackEvent:phase<original.attackEvent||phase>=original.ammoLoad),variant=phase===null?key:original.shotModel?(loaded?original.loadedModel||key:original.shotModel):key+(loaded?'Loaded':'Shoot');
    const asset=FrostArt[activity?key+activity.animation:variant]||original,scale=asset.factionBuilding?(d.radius*2*.92)/Math.hypot(asset.size[0],asset.size[2]):u.tag==='boss'||u.tdBoss?1.5:d.flying?1.1:asset.siegeModel?1:d.attack==='siege'?2:key.startsWith('Skeleton_')?1.15:key==='Tribal'?.7:key==='Demon'?.8:key==='Ghost_Skull'?.8:d.speed?(u.kind==='hero'?1.1:d.model==='knight'?1:.85):3;
    return {key,asset,scale,height:asset.size[1]*scale+.5};
  }
  function heading(state,u,old){
    if(!Frost.types[u.kind].speed)return Math.PI/6;
    if(Frost.feeding(u))return u.yaw??0;
    const moved=old&&Math.hypot(u.x-old.x,u.z-old.z)>.008;
    if(['hero','necromancer','shaman'].includes(u.kind)&&Number.isFinite(u.castYaw)&&castPhase(u,FrostArt[units[u.kind]||Frost.unitType(u).art],moved)!==null)return u.castYaw;
    const attacking=u.cd>(u.kind==='archer'?0:.25),hit=attacking&&(state.events||[]).find(e=>['hit','launch'].includes(e.type)&&e.team===u.team&&Math.hypot(e.fromX-u.x,e.fromZ-u.z)<.001),enemy=attacking&&u.order?.type==='attack'&&state.units.find(v=>v.id===u.order.target&&v.hp>0),inRange=enemy&&Math.hypot(Frost.distance(u,enemy),Frost.unitHeight(state,u)-Frost.unitHeight(state,enemy))<=Frost.unitType(u).range+(Frost.types[enemy.kind].radius||.3)&&Frost.attackClear(state,u,enemy),target=work(state,u)?.target||hit||(inRange&&enemy);
    return target?Math.atan2(target.x-u.x,target.z-u.z):moved?Math.atan2(u.x-old.x,u.z-old.z):old?.yaw??u.yaw??0;
  }
  function corpse(state,c){
    const visual=model(state,{...c,hp:0,tag:c.boss?'boss':undefined,tdBoss:c.large}),{asset,scale}=visual,clip=asset.animations?.findIndex(a=>/Death/.test(a.name));
    if(clip===undefined||clip<0)return null;
    const frames=asset.animations[clip].frames,ground=Frost.elevation(state.map,c.x,c.z),fall=Frost.clamp(c.age/(frames/12),0,1),decay=Frost.clamp((c.age-(Frost.CORPSE_LIFETIME-4))/4,0,1);
    return {...visual,mesh:asset.parts[0].mesh+'#pose='+clip+':'+Math.min(frames-1,Math.floor(c.age*12)),y:ground+(c.y-ground)*(1-fall)-decay*Math.max(2,asset.size[1]*scale),yaw:c.yaw};
  }
  function pose(u,asset,walking,time,rate=12){
    if(!asset.animations?.length)return asset.parts[0].mesh;
    const frames=clip=>asset.animations[clip].frames*rate/12,mesh=(clip,frame)=>asset.parts[0].mesh+'#pose='+clip+':'+Math.min(Math.ceil(frames(clip))-1,Math.floor(frame))+(rate===12?'':'@'+rate),loop=(clip,time)=>time*rate%frames(clip);
    const eat=asset.animations.findIndex(a=>a.name==='Cannibalize');if(Frost.feeding(u)&&eat>=0)return mesh(eat,loop(eat,Frost.cannibalize.duration-Frost.feeding(u)));
    if(asset.workAnimation){const clip=asset.workClip??0;return mesh(clip,loop(clip,time));}
    const cast=asset.animations.findIndex(a=>a.name===(['necromancer','shaman'].includes(u.kind)?'Staff_Attack':'Cast')),casting=castPhase(u,asset,walking);
    if(cast>=0&&casting!==null)return mesh(cast,casting*frames(cast));
    if(asset.attackEvent!==undefined){const clip=walking?1:u.cd>0&&!u.stun?2:0,frame=clip===2?attackPhase(u,asset)*frames(clip):loop(clip,time);return mesh(clip,frame);}
    const attack=(u.cd>.25)&&(u.kind!=='worker'||[FrostArt.RealWorker,FrostArt.RealAcolyte].includes(asset)&&!['gather','build','construct','repair'].includes(u.order?.type)),desired=asset===FrostArt.Skeleton_Rogue?(attack?/^2H_Ranged_Shooting$/:walking?/^Walking_A$/:/^Idle$/):asset===FrostArt.Skeleton_Mage?(attack?/^Spellcast_Shoot$/:walking?/^Walking_A$/:/^Idle$/):Frost.types[u.kind].flying?(attack?/Dragon_Attack$/:/Dragon_Flying/):attack?/Sword_Attack|Bow_Shoot|Staff_Attack|Punch|Headbutt/:walking?/^Run$|^Walk$|Fast_Flying/:/^Idle$|Flying_Idle/;
    let clip=asset.animations.findIndex(a=>desired.test(a.name));if(clip<0)clip=0;return mesh(clip,loop(clip,time));
  }
  function environmentPartCount(catalog=FrostArt){return Math.max(1,...Object.values(catalog).map(a=>a.lod_parts?.[0]?.length||1));}
  function environment(key,height,yaw,far,width=Infinity){const asset=FrostArt[key],lod=far?1:0,parts=asset.lod_parts?.[lod]||[{mesh:asset.lods[lod],material:asset.material,pivot:[0,0,0]}];return {key,asset,mesh:parts[0].mesh,parts,scale:Math.min(height/asset.size[1],width/Math.max(asset.size[0],asset.size[2])),yaw};}
  const trees=[['RealSpruceA','RealSpruceB','RealSpruceC'],['RealJacaranda'],['RealQuiver']];
  function resource(r,zoom=27,tileset=0,elapsed=0){
    const age=r.felled?r.felled.age+Math.max(0,elapsed):0;if(r.amount<=0&&(!r.felled||age>=Frost.TREE_FALL_LIFETIME))return null;
    const variants=trees[tileset]||trees[0],seed=(Math.imul(Math.round(r.x*100),73856093)^Math.imul(Math.round(r.z*100),19349663))>>>0,key=r.kind==='tree'?variants[seed%variants.length]:r.kind==='mine'?'RealRock07':'RealFirePit',v=environment(key,r.kind==='tree'?4.7+(seed%12)/10:r.kind==='mine'?2.5:.65,seed%628/100,zoom>14,r.kind==='tree'?(key==='RealJacaranda'?6.5:5):r.kind==='mine'?4.5:1.4);
    if(r.felled){const t=Frost.clamp(age/1.5,0,1),angle=Math.PI/2*t*t,fall=Math.sin(angle/2),x=Math.cos(r.felled.yaw)*fall,z=-Math.sin(r.felled.yaw)*fall,w=Math.cos(angle/2),s=Math.sin(v.yaw/2),c=Math.cos(v.yaw/2);v.rotation=[x*c-z*s,w*s,z*c+x*s,w*c];v.sink=Frost.clamp((age-4)/2,0,1)*Math.max(v.asset.size[0],v.asset.size[2])*v.scale;}
    return v;
  }
  function scenery(i,edge,zoom=27,tileset=0){const variants=trees[tileset]||trees[0],tree=edge?i%4!==0:i%5===0,shrub=!tree&&i%3===0,key=tree?variants[i%variants.length]:shrub?'RealShrub':'RealMossRock'+(i%6+1);return environment(key,tree?(edge?7+i%4:3.8+i%3*.5):shrub?1.2:edge?2.1+i%3*.4:.35+i%4*.2,i*2.399963,edge||zoom>14,tree?(key==='RealJacaranda'?7.5:6):edge?4.5:1.7);}
  function groundDetail(i,zoom=27,green=true,normal=[0,1,0]){
    const v=environment(['RealGrassA','RealGrassB','RealGrassC'][i%3],.58+i%3*.12,i*2.399963,zoom>14,1.1),q=[normal[2],-normal[0],1+normal[1]],length=Math.hypot(...q),[x,z,w]=q.map(n=>n/length),s=Math.sin(v.yaw/2),c=Math.cos(v.yaw/2);
    return {...v,material:green?v.asset.material:v.asset.material.replace('.mmat','_dry.mmat'),rotation:[x*c-z*s,w*s,z*c+x*s,w*c]};
  }
  function heroPortrait(heroClass=0,closeup=false){const art=Frost.heroes[heroClass].art;return FrostArt[art].realistic?'Assets/Art/'+(closeup?'head-portraits':'unit-portraits')+'.png#'+art:'Assets/Art/hero-portraits.png#hero-'+heroClass;}
  function unitPortrait(state,u){const v=model(state,u),key=v.key;return (v.asset.factionBuilding?'Assets/Art/faction-buildings.png#':['RealFrostWarden','RealEmberSage','RealSylvanRanger','RealDawnPaladin','RealFootman','RealWorker','RealArcher','RealRifleman','RealOrc','RealAcolyte','RealNecromancer','RealShaman'].includes(key)?'Assets/Art/head-portraits.png#':'Assets/Art/unit-portraits.png#')+key;}
  function name(state,u){const f=state.teams[u.team]?.faction||0,value=names[f][u.kind];if(u.kind==='worker'&&f===3)return 'Acolyte';if(u.kind==='neutral')return u.tag==='boss'?'Frostbound sovereign':'Frostfang wolf';return Array.isArray(value)?value[Frost.clamp((u.upgradeTier??state.teams[u.team]?.tier??1)-1,0,2)]:value||Frost.unitType(u).label;}
  const projectileColors={fire:[1,.32,.055,1],frost:[.35,.8,1,1],nature:[.35,.85,.24,1],shadow:[.57,.22,.8,1],arcane:[.5,.48,1,1]};
  function muzzle(e){const [x,y,z]=FrostArt.RealRifleman.muzzle,angle=Math.atan2(e.x-e.fromX,e.z-e.fromZ),sin=Math.sin(angle),cos=Math.cos(angle);return {type:'muzzle',art:'musket',team:e.team,x:e.fromX+(x*cos+z*sin)*.85,y:e.fromY-1.6+y*.85,z:e.fromZ+(-x*sin+z*cos)*.85};}
  function projectile(art){
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
  return {camera:{height:32,depth:42},model,name,pose,corpse,heroPortrait,unitPortrait,heading,resource,scenery,environmentPartCount,groundDetail,projectile,projectileView,muzzle};
})();
if(typeof module!=='undefined')module.exports=FrostVisual;
