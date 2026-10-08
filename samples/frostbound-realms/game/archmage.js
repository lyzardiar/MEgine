/* Author: MiYu. Original Archmage attributes, Water Elemental ranks and four learned ability definitions. */
var FrostArchmage=(()=>{
  const rules=typeof module!=='undefined'?require('../archmage-rules.json'):FrostArchmageRules;
  const ids=['AHbz','AHwe','AHab','AHmt'],names=['Blizzard','Summon Water Elemental','Brilliance Aura','Mass Teleport'];
  const is=u=>u?.kind==='hero'&&u.sourceHero==='Hamg',elemental=u=>u?.kind==='waterelemental';
  const enabled=(s,team,heroClass)=>s.archmageVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===0&&heroClass===0;
  const form=()=>rules.units.Hamg,water=u=>rules.units[['hwat','hwt2','hwt3'][(u.waterRank||1)-1]];
  const attributes=u=>{const r=form(),l=u.level-1;return {strength:Math.floor(r.strength+r.strengthGrowth*l),agility:Math.floor(r.agility+r.agilityGrowth*l),intelligence:Math.floor(r.intelligence+r.intelligenceGrowth*l)};};
  const itemSum=(u,key,items)=>u.inventory.reduce((n,i)=>n+(items[i][key]||0),0);
  function stats(u,items){const r=form(),a=attributes(u),m=rules.misc;return {...a,maxHp:r.baseHp+a.strength*Number(m.StrHitPointBonus)+itemSum(u,'hp',items),damage:r.weapon.damage+a.intelligence*Number(m.StrAttackBonus)+itemSum(u,'damage',items),speed:r.speed+itemSum(u,'speed',items),armorValue:r.baseArmor+a.agility*Number(m.AgiDefenseBonus)+Number(m.AgiDefenseBase)};}
  const maxMana=u=>form().baseMana+attributes(u).intelligence*Number(rules.misc.IntManaBonus);
  const manaRegen=u=>form().manaRegen+attributes(u).intelligence*Number(rules.misc.IntRegenBonus);
  const healthRegen=u=>form().healthRegen+attributes(u).strength*Number(rules.misc.StrRegenBonus);
  const attackSpeed=u=>1+attributes(u).agility*Number(rules.misc.AgiAttackSpeedBonus);
  const xpNeed=u=>Number(rules.misc.NeedHeroXP)+(u.level-1)*Number(rules.misc.NeedHeroXPFormulaB);
  function spell(u,slot){const id=ids[slot],r=rules.abilities[id],rank=u.skills?.[slot]||0,d=r.levels[Math.max(0,rank-1)];return {...d,id,name:names[slot],rank,kind:id,description:[`${d.waves} waves of ice deal ${d.damage} damage each in a small area. Channeling can be interrupted.`,`Summon a rank ${Math.max(1,rank)} Water Elemental for ${d.duration}s.`,`Nearby allied units regenerate ${d.manaRegen} additional mana per second.`,`Teleport up to ${d.unitLimit} units including the Archmage beside an allied unit or building after ${d.delay}s.`][slot],hotkey:r.sourceStrings.Hotkey||r.sourceStrings.Researchhotkey,icon:r.icon,researchIcon:r.researchIcon,disabledIcon:r.disabledIcon,passive:id==='AHab',researchDisabledIcon:r.researchIcon.replace('-research.png','-research-disabled.png'),slot:r.sourceFunc.Buttonpos.split(',').map(Number).reduce((n,v,i)=>n+v*(i?4:1),0),researchSlot:r.sourceFunc.Researchbuttonpos.split(',').map(Number).reduce((n,v,i)=>n+v*(i?4:1),0),maxRank:r.levels.length,requiredLevel:Number(r.sourceRow.reqLevel)+(Math.max(1,rank)-1)*(Number(r.sourceRow.levelSkip)||Number(rules.misc.HeroAbilityLevelSkip))};}
  function definition(u){const r=form();return {...r,...r.weapon,hp:r.baseHp+r.strength*Number(rules.misc.StrHitPointBonus),art:r.model,role:'Intelligence / ranged',projectile:'archmage',spells:ids.map((_,i)=>spell(u,i)),splashEnemiesOnly:true};}
  function reset(u,items){const old=u.maxHp;Object.assign(u,stats(u,items));if(u.hp>0)u.hp=Math.min(u.maxHp,Math.max(1,u.hp+u.maxHp-old));u.mana=Math.min(maxMana(u),u.mana);}
  return {rules,ids,is,elemental,enabled,form,water,attributes,stats,maxMana,manaRegen,healthRegen,attackSpeed,xpNeed,spell,definition,reset};
})();
if(typeof module!=='undefined')module.exports=FrostArchmage;
