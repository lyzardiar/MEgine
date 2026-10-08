/* Author: MiYu. Original Demon Hunter identity, attributes, forms and learned ability definitions. */
var FrostDemonHunter=(()=>{
  const rules=typeof module!=='undefined'?require('../demon-hunter-rules.json'):FrostDemonHunterRules;
  const ids=['AEmb','AEim','AEev','AEme'],names=['Mana Burn','Immolation','Evasion','Metamorphosis'];
  const is=u=>u?.kind==='hero'&&u.sourceHero==='Edem';
  const enabled=(s,team,heroClass)=>s.demonHunterVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2&&heroClass===0;
  const form=u=>rules.units[u.metamorphLeft>0?'Edmm':'Edem'];
  const attributes=u=>{const r=rules.units.Edem,l=u.level-1;return {strength:Math.floor(r.strength+r.strengthGrowth*l),agility:Math.floor(r.agility+r.agilityGrowth*l),intelligence:Math.floor(r.intelligence+r.intelligenceGrowth*l)};};
  const itemSum=(u,key,items)=>u.inventory.reduce((n,i)=>n+(items[i][key]||0),0);
  function stats(u,items){const r=rules.units.Edem,a=attributes(u),m=rules.misc;return {...a,maxHp:r.baseHp+a.strength*Number(m.StrHitPointBonus)+itemSum(u,'hp',items)+(u.metamorphLeft>0?Number(rules.abilities.AEme.sourceRow.DataE1):0),damage:form(u).weapon.damage+a.agility*Number(m.StrAttackBonus)+itemSum(u,'damage',items),speed:r.speed+itemSum(u,'speed',items),armorValue:r.baseArmor+a.agility*Number(m.AgiDefenseBonus)+Number(m.AgiDefenseBase)};}
  const maxMana=u=>rules.units.Edem.baseMana+attributes(u).intelligence*Number(rules.misc.IntManaBonus);
  const manaRegen=u=>rules.units.Edem.manaRegen+attributes(u).intelligence*Number(rules.misc.IntRegenBonus);
  const healthRegen=(u,night)=>(night?form(u).nightRegen:0)+attributes(u).strength*Number(rules.misc.StrRegenBonus);
  const attackSpeed=u=>1+attributes(u).agility*Number(rules.misc.AgiAttackSpeedBonus);
  const xpNeed=u=>Number(rules.misc.NeedHeroXP)+(u.level-1)*Number(rules.misc.NeedHeroXPFormulaB);
  function spell(u,slot){const id=ids[slot],r=rules.abilities[id],rank=u.skills?.[slot]||0,d=r.levels[Math.max(0,rank-1)],description=[`Burn up to ${d.power} enemy mana and deal matching spell damage.`,`Deal ${d.power} damage each second to nearby organic ground enemies. Drains ${r.sourceRow.DataB1} mana each second. Toggle off to stop.`,`Passively evade ${Math.round(d.power*100)}% of incoming direct attacks.`,`Gain ranged chaos attacks and ${r.sourceRow.DataE1} bonus health for ${r.sourceRow.HeroDur1} seconds.`][slot];return {...d,id,name:names[slot],rank,kind:id,description,hotkey:r.sourceStrings.Hotkey||r.sourceStrings.Researchhotkey,icon:id==='AEim'&&u.immolation?r.offIcon:r.icon,disabledIcon:r.disabledIcon,passive:id==='AEev',maxRank:r.levels.length,requiredLevel:Number(r.sourceRow.reqLevel)+(Math.max(1,rank)-1)*(Number(r.sourceRow.levelSkip)||Number(rules.misc.HeroAbilityLevelSkip))};}
  function definition(u){const r=form(u);return {...r,...r.weapon,hp:rules.units.Edem.baseHp+rules.units.Edem.strength*Number(rules.misc.StrHitPointBonus),art:r.model,role:'Agility / melee',projectile:'demon-hunter',spells:ids.map((_,i)=>spell(u,i)),splashEnemiesOnly:true};}
  function reset(u,items){const old=u.maxHp;Object.assign(u,stats(u,items));if(u.hp>0)u.hp=Math.min(u.maxHp,Math.max(1,u.hp+u.maxHp-old));u.mana=Math.min(maxMana(u),u.mana);}
  return {rules,ids,is,enabled,form,attributes,stats,maxMana,manaRegen,healthRegen,attackSpeed,xpNeed,spell,definition,reset};
})();
if(typeof module!=='undefined')module.exports=FrostDemonHunter;
