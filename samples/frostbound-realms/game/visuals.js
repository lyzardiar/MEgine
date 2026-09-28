/* Author: MiYu. Shared faction models for live units, map placement and construction previews. */
var FrostVisual=(()=>{
  const buildings={hall:'Hall',barracks:'Barracks',farm:'Lodge',tower:'Tower',altar:'Altar',workshop:'Workshop'};
  const names=[
    {hall:['Keep','Castle','Royal citadel'],barracks:'Royal barracks',farm:'Town house',tower:'Guard tower',altar:'Sanctuary',workshop:'Royal workshop'},
    {hall:['Great lodge','War hall','Iron stronghold'],barracks:'War camp',farm:'Clan tent',tower:'Watch post',altar:'Spirit totem',workshop:'Siege encampment'},
    {hall:['Ancient of roots','Ancient of boughs','Elder grove'],barracks:'Sentinel grove',farm:'Living shelter',tower:'Thorn watch',altar:'Moon sanctuary',workshop:'Grove workshop'},
    {hall:['Necropolis','Black citadel','Dread fortress'],barracks:'Crypt',farm:'Grave mound',tower:'Soul obelisk',altar:'Altar of shadows',workshop:'Bone foundry'}
  ];
  const units={raider:'Orc',hunter:'Tribal',berserker:'Orc_Skull',shaman:'Tribal',ghoul:'Demon',abomination:'Orc_Skull',necromancer:'Ghost_Skull'};
  const base={worker:'Monk',soldier:'Warrior',archer:'Ranger',knight:'Warrior',mage:'Wizard',hero:'Cleric',creep:'Rogue',neutral:'Warrior',ballista:'siege-ballista',catapult:'siege-catapult',trebuchet:'siege-trebuchet',ram:'siege-ram',dragon:'Dragon'};
  function model(state,u){
    const d=Frost.types[u.kind],f=state.teams[u.team]?.faction||0,tier=Frost.clamp(u.upgradeTier??state.teams[u.team]?.tier??1,1,3);
    let key=buildings[u.kind]?Frost.factions[f]+buildings[u.kind]+(u.kind==='hall'&&tier>1?tier:''):u.kind==='hero'?Frost.unitType(u).art:u.tag==='boss'?'Demon':u.kind==='frosttower'?'FrostTower':u.kind==='flametower'?'EmberTower':u.kind==='worker'?['Monk','Tribal','Rogue','Ghost_Skull'][f]:units[u.kind]||base[u.kind]||base[d.model];
    const asset=FrostArt[key],scale=asset.factionBuilding?(d.radius*2*.92)/Math.max(asset.size[0],asset.size[2]):u.tag==='boss'||u.tdBoss?1.5:d.flying?1.1:d.attack==='siege'?2:key==='Tribal'?.7:key==='Demon'?.8:key==='Ghost_Skull'?.8:d.speed?(u.kind==='hero'?1.1:d.model==='knight'?1:.85):3;
    return {key,asset,scale,height:asset.size[1]*scale+.5};
  }
  function name(state,u){const f=state.teams[u.team]?.faction||0,value=names[f][u.kind];return Array.isArray(value)?value[Frost.clamp((u.upgradeTier??state.teams[u.team]?.tier??1)-1,0,2)]:value||Frost.unitType(u).label;}
  return {model,name};
})();
if(typeof module!=='undefined')module.exports=FrostVisual;
