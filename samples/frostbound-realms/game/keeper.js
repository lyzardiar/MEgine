/* Author: MiYu. Original Keeper of the Grove identity, attributes and learned ability definitions. */
var FrostKeeper=(()=>{
  const rules=typeof module!=='undefined'?require('../keeper-rules.json'):FrostKeeperRules;
  const ids=['AEer','AEfn','AEah','AEtq'],names=['Entangling Roots','Force of Nature','Thorns Aura','Tranquility'];
  const is=u=>u?.kind==='hero'&&u.sourceHero==='Ekee';
  const enabled=(s,team,heroClass)=>s.keeperVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2&&heroClass===1;
  const form=u=>rules.units.Ekee;
  const attributes=u=>{const r=rules.units.Ekee,l=u.level-1;return {strength:Math.floor(r.strength+r.strengthGrowth*l),agility:Math.floor(r.agility+r.agilityGrowth*l),intelligence:Math.floor(r.intelligence+r.intelligenceGrowth*l)};};
  const itemSum=(u,key,items)=>u.inventory.reduce((n,i)=>n+(items[i][key]||0),0);
  function stats(u,items){const r=rules.units.Ekee,a=attributes(u),m=rules.misc;return {...a,maxHp:r.baseHp+a.strength*Number(m.StrHitPointBonus)+itemSum(u,'hp',items),damage:form(u).weapon.damage+a.intelligence*Number(m.StrAttackBonus)+itemSum(u,'damage',items),speed:r.speed+itemSum(u,'speed',items),armorValue:r.baseArmor+a.agility*Number(m.AgiDefenseBonus)+Number(m.AgiDefenseBase)};}
  const maxMana=u=>rules.units.Ekee.baseMana+attributes(u).intelligence*Number(rules.misc.IntManaBonus);
  const manaRegen=u=>rules.units.Ekee.manaRegen+attributes(u).intelligence*Number(rules.misc.IntRegenBonus);
  const healthRegen=(u,night)=>(night?form(u).nightRegen:0)+attributes(u).strength*Number(rules.misc.StrRegenBonus);
  const attackSpeed=u=>1+attributes(u).agility*Number(rules.misc.AgiAttackSpeedBonus);
  const xpNeed=u=>Number(rules.misc.NeedHeroXP)+(u.level-1)*Number(rules.misc.NeedHeroXPFormulaB);
  function spell(u,slot){const id=ids[slot],r=rules.abilities[id],rank=u.skills?.[slot]||0,d=r.levels[Math.max(0,rank-1)],description=[`Root an organic ground enemy for ${d.duration}s (heroes ${d.heroDuration}s), dealing ${d.power} damage per second.`,`Transform up to ${d.power} trees into Treants for ${d.duration}s.`,`Nearby allies reflect ${Math.round(d.power*100)}% of direct melee damage.`,`Channel for ${d.duration}s, healing nearby allies for ${d.power} every ${d.interval}s.`][slot];return {...d,id,name:names[slot],rank,kind:id,description,hotkey:r.sourceStrings.Hotkey||r.sourceStrings.Researchhotkey,icon:r.icon,disabledIcon:r.disabledIcon,passive:id==='AEah',maxRank:r.levels.length,requiredLevel:Number(r.sourceRow.reqLevel)+(Math.max(1,rank)-1)*(Number(r.sourceRow.levelSkip)||Number(rules.misc.HeroAbilityLevelSkip))};}
  function definition(u){const r=form(u);return {...r,...r.weapon,hp:rules.units.Ekee.baseHp+rules.units.Ekee.strength*Number(rules.misc.StrHitPointBonus),art:r.model,role:'Intelligence / ranged',projectile:'keeper',spells:ids.map((_,i)=>spell(u,i)),splashEnemiesOnly:true};}
  function reset(u,items){const old=u.maxHp;Object.assign(u,stats(u,items));if(u.hp>0)u.hp=Math.min(u.maxHp,Math.max(1,u.hp+u.maxHp-old));u.mana=Math.min(maxMana(u),u.mana);}
  return {rules,ids,is,enabled,form,attributes,stats,maxMana,manaRegen,healthRegen,attackSpeed,xpNeed,spell,definition,reset};
})();
if(typeof module!=='undefined')module.exports=FrostKeeper;
