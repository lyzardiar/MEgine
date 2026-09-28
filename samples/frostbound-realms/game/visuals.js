/* Author: MiYu. Shared faction models for live units, map placement and construction previews. */
var FrostVisual=(()=>{
  const buildings={hall:'Hall',barracks:'Barracks',farm:'Lodge',tower:'Tower',altar:'Altar',workshop:'Workshop'};
  const names=[
    {hall:['Keep','Castle','Royal citadel'],barracks:'Royal barracks',farm:'Town house',tower:'Guard tower',altar:'Sanctuary',workshop:'Royal workshop'},
    {hall:['Great lodge','War hall','Iron stronghold'],barracks:'War camp',farm:'Clan tent',tower:'Watch post',altar:'Spirit totem',workshop:'Siege encampment'},
    {hall:['Ancient of roots','Ancient of boughs','Elder grove'],barracks:'Sentinel grove',farm:'Living shelter',tower:'Thorn watch',altar:'Moon sanctuary',workshop:'Grove workshop'},
    {hall:['Necropolis','Black citadel','Dread fortress'],barracks:'Crypt',farm:'Grave mound',tower:'Soul obelisk',altar:'Altar of shadows',workshop:'Bone foundry'}
  ];
  const units={raider:'Orc',hunter:'Tribal',berserker:'Orc_Skull',shaman:'Tribal',ghoul:'Demon',abomination:'Orc_Skull',necromancer:'Skeleton_Mage',bonearcher:'Skeleton_Rogue'};
  const base={worker:'Monk',soldier:'Warrior',archer:'Ranger',knight:'Warrior',mage:'Wizard',hero:'Cleric',creep:'Rogue',neutral:'Warrior',ballista:'siege-ballista',catapult:'siege-catapult',trebuchet:'siege-trebuchet',ram:'siege-ram',dragon:'Dragon'};
  function model(state,u){
    const d=Frost.types[u.kind],f=state.teams[u.team]?.faction||0,tier=Frost.clamp(u.upgradeTier??state.teams[u.team]?.tier??1,1,3);
    let key=buildings[u.kind]?Frost.factions[f]+buildings[u.kind]+(u.kind==='hall'&&tier>1?tier:''):u.kind==='hero'?Frost.unitType(u).art:u.tag==='boss'?'Demon':u.kind==='frosttower'?'FrostTower':u.kind==='flametower'?'EmberTower':u.kind==='worker'?['Monk','Tribal','Rogue','Ghost_Skull'][f]:units[u.kind]||base[u.kind]||base[d.model];
    const asset=FrostArt[key],scale=asset.factionBuilding?(d.radius*2*.92)/Math.max(asset.size[0],asset.size[2]):u.tag==='boss'||u.tdBoss?1.5:d.flying?1.1:d.attack==='siege'?2:key.startsWith('Skeleton_')?1.15:key==='Tribal'?.7:key==='Demon'?.8:key==='Ghost_Skull'?.8:d.speed?(u.kind==='hero'?1.1:d.model==='knight'?1:.85):3;
    return {key,asset,scale,height:asset.size[1]*scale+.5};
  }
  function heading(state,u,old){
    if(!Frost.types[u.kind].speed)return 0;
    const moved=old&&Math.hypot(u.x-old.x,u.z-old.z)>.008,hit=u.cd>.25&&(state.events||[]).find(e=>e.type==='hit'&&e.team===u.team&&Math.hypot(e.fromX-u.x,e.fromZ-u.z)<.001),target=hit||(!moved&&u.cd>.25&&u.order?.type==='attack'&&state.units.find(v=>v.id===u.order.target&&v.hp>0));
    return target?Math.atan2(target.x-u.x,target.z-u.z):moved?Math.atan2(u.x-old.x,u.z-old.z):old?.yaw||0;
  }
  function pose(u,asset,walking,time){
    if(!asset.animations?.length)return asset.parts[0].mesh;
    const attack=u.cd>.25&&u.kind!=='worker',desired=asset===FrostArt.Skeleton_Rogue?(attack?/^2H_Ranged_Shooting$/:walking?/^Walking_A$/:/^Idle$/):asset===FrostArt.Skeleton_Mage?(attack?/^Spellcast_Shoot$/:walking?/^Walking_A$/:/^Idle$/):Frost.types[u.kind].flying?(attack?/Dragon_Attack$/:/Dragon_Flying/):attack?/Sword_Attack|Bow_Shoot|Staff_Attack|Punch|Headbutt/:walking?/^Run$|^Walk$|Fast_Flying/:/^Idle$|Flying_Idle/;
    let clip=asset.animations.findIndex(a=>desired.test(a.name));if(clip<0)clip=0;return asset.parts[0].mesh+'#pose='+clip+':'+Math.floor(time*12)%asset.animations[clip].frames;
  }
  function name(state,u){const f=state.teams[u.team]?.faction||0,value=names[f][u.kind];return Array.isArray(value)?value[Frost.clamp((u.upgradeTier??state.teams[u.team]?.tier??1)-1,0,2)]:value||Frost.unitType(u).label;}
  return {model,name,pose,heading};
})();
if(typeof module!=='undefined')module.exports=FrostVisual;
