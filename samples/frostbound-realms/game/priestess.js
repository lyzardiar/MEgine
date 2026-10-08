/* Author: MiYu. Original Priestess attributes, scout ranks and four learned ability definitions. */
var FrostPriestess=(()=>{
  const rules=typeof module!=='undefined'?require('../priestess-rules.json'):FrostPriestessRules;
  const ids=['AEst','AHfa','AEar','AEsf'],names=['Scout','Searing Arrows','Trueshot Aura','Starfall'];
  const is=u=>u?.kind==='hero'&&u.sourceHero==='Emoo',owl=u=>u?.kind==='owlscout';
  const enabled=(s,team,heroClass)=>s.priestessVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2&&heroClass===2;
  const form=u=>rules.units.Emoo;
  const attributes=u=>{const r=form(u),l=u.level-1;return {strength:Math.floor(r.strength+r.strengthGrowth*l),agility:Math.floor(r.agility+r.agilityGrowth*l),intelligence:Math.floor(r.intelligence+r.intelligenceGrowth*l)};};
  const itemSum=(u,key,items)=>u.inventory.reduce((n,i)=>n+(items[i][key]||0),0);
  function stats(u,items){const r=form(u),a=attributes(u),m=rules.misc;return {...a,maxHp:r.baseHp+a.strength*Number(m.StrHitPointBonus)+itemSum(u,'hp',items),damage:r.weapon.damage+a.agility*Number(m.StrAttackBonus)+itemSum(u,'damage',items),speed:r.speed+itemSum(u,'speed',items),armorValue:r.baseArmor+a.agility*Number(m.AgiDefenseBonus)+Number(m.AgiDefenseBase)};}
  const maxMana=u=>form(u).baseMana+attributes(u).intelligence*Number(rules.misc.IntManaBonus);
  const manaRegen=u=>form(u).manaRegen+attributes(u).intelligence*Number(rules.misc.IntRegenBonus);
  const healthRegen=(u,night)=>(night?form(u).nightRegen:0)+attributes(u).strength*Number(rules.misc.StrRegenBonus);
  const attackSpeed=u=>1+attributes(u).agility*Number(rules.misc.AgiAttackSpeedBonus);
  const xpNeed=u=>Number(rules.misc.NeedHeroXP)+(u.level-1)*Number(rules.misc.NeedHeroXPFormulaB);
  function spell(u,slot){const id=ids[slot],r=rules.abilities[id],rank=u.skills?.[slot]||0,d=r.levels[Math.max(0,rank-1)],description=[`Summon an invulnerable flying Owl Scout for ${d.duration}s.`,`Adds ${d.power} damage per arrow. Right-click toggles autocast.`,`Nearby ranged allies gain ${Math.round(d.power*100)}% attack damage.`,`Channel for ${d.duration}s, striking nearby enemies for ${d.power} every ${d.interval}s.`][slot];return {...d,id,name:names[slot],rank,kind:id,description,hotkey:r.sourceStrings.Hotkey||r.sourceStrings.Researchhotkey,icon:id==='AHfa'&&!u.searingAuto?r.offIcon:r.icon,disabledIcon:r.disabledIcon,passive:id==='AEar',maxRank:r.levels.length,requiredLevel:Number(r.sourceRow.reqLevel)+(Math.max(1,rank)-1)*(Number(r.sourceRow.levelSkip)||Number(rules.misc.HeroAbilityLevelSkip))};}
  function definition(u){const r=form(u);return {...r,...r.weapon,hp:r.baseHp+r.strength*Number(rules.misc.StrHitPointBonus),art:r.model,role:'Agility / ranged',projectile:'priestess',spells:ids.map((_,i)=>spell(u,i)),splashEnemiesOnly:true};}
  function reset(u,items){const old=u.maxHp;Object.assign(u,stats(u,items));if(u.hp>0)u.hp=Math.min(u.maxHp,Math.max(1,u.hp+u.maxHp-old));u.mana=Math.min(maxMana(u),u.mana);}
  const scout=u=>rules.units[['nowl','now2','now3'][(u.scoutRank||1)-1]];
  return {rules,ids,is,owl,scout,enabled,form,attributes,stats,maxMana,manaRegen,healthRegen,attackSpeed,xpNeed,spell,definition,reset};
})();
if(typeof module!=='undefined')module.exports=FrostPriestess;
