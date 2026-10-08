/* Author: MiYu. Original Warden attributes, summons and four learned ability definitions. */
var FrostWarden=(()=>{
  const rules=typeof module!=='undefined'?require('../warden-rules.json'):FrostWardenRules;
  const ids=['AEbl','AEfk','AEsh','AEsv'],names=['Blink','Fan of Knives','Shadow Strike','Vengeance'];
  const is=u=>u?.kind==='hero'&&u.sourceHero==='Ewar',avatar=u=>u?.kind==='vengeanceavatar',spirit=u=>u?.kind==='vengeancespirit';
  const enabled=(s,team,heroClass)=>s.wardenVersion===1&&s.mode==='skirmish'&&s.teams[team]?.faction===2&&heroClass===3;
  const form=u=>rules.units.Ewar;
  const attributes=u=>{const r=form(u),l=u.level-1;return {strength:Math.floor(r.strength+r.strengthGrowth*l),agility:Math.floor(r.agility+r.agilityGrowth*l),intelligence:Math.floor(r.intelligence+r.intelligenceGrowth*l)};};
  const itemSum=(u,key,items)=>u.inventory.reduce((n,i)=>n+(items[i][key]||0),0);
  function stats(u,items){const r=form(u),a=attributes(u),m=rules.misc;return {...a,maxHp:r.baseHp+a.strength*Number(m.StrHitPointBonus)+itemSum(u,'hp',items),damage:r.weapon.damage+a.agility*Number(m.StrAttackBonus)+itemSum(u,'damage',items),speed:r.speed+itemSum(u,'speed',items),armorValue:r.baseArmor+a.agility*Number(m.AgiDefenseBonus)+Number(m.AgiDefenseBase)};}
  const maxMana=u=>form(u).baseMana+attributes(u).intelligence*Number(rules.misc.IntManaBonus);
  const manaRegen=u=>form(u).manaRegen+attributes(u).intelligence*Number(rules.misc.IntRegenBonus);
  const healthRegen=(u,night)=>(night?form(u).nightRegen:0)+attributes(u).strength*Number(rules.misc.StrRegenBonus);
  const attackSpeed=u=>1+attributes(u).agility*Number(rules.misc.AgiAttackSpeedBonus);
  const xpNeed=u=>Number(rules.misc.NeedHeroXP)+(u.level-1)*Number(rules.misc.NeedHeroXPFormulaB);
  function spell(u,slot){const id=ids[slot],r=rules.abilities[id],rank=u.skills?.[slot]||0,d=r.levels[Math.max(0,rank-1)],description=[`Blink between ${Number(d.data.B)/100} and ${d.power/100} world units.`,`Strike nearby organic enemies for up to ${d.power} each, capped at ${d.interval} total.`,`Deal ${Number(d.data.E)} on impact, then ${d.power} every ${d.castField}s for ${d.duration}s.`,`Summon an Avatar for ${d.duration}s. It raises up to six invulnerable spirits from allied corpses.`][slot];return {...d,id,name:names[slot],rank,kind:id,description,hotkey:r.sourceStrings.Hotkey||r.sourceStrings.Researchhotkey,icon:r.icon,disabledIcon:r.disabledIcon,researchIcon:r.researchIcon,researchDisabledIcon:r.researchIcon.replace('-research.png','-research-disabled.png'),slot:r.sourceFunc.Buttonpos.split(',').map(Number).reduce((n,v,i)=>n+v*(i?4:1),0),researchSlot:r.sourceFunc.Researchbuttonpos.split(',').map(Number).reduce((n,v,i)=>n+v*(i?4:1),0),maxRank:r.levels.length,requiredLevel:Number(r.sourceRow.reqLevel)+(Math.max(1,rank)-1)*(Number(r.sourceRow.levelSkip)||Number(rules.misc.HeroAbilityLevelSkip))};}
  function definition(u){const r=form(u);return {...r,...r.weapon,hp:r.baseHp+r.strength*Number(rules.misc.StrHitPointBonus),art:r.model,role:'Agility / melee',missileSpeed:0,projectile:'warden',spells:ids.map((_,i)=>spell(u,i)),splashEnemiesOnly:true};}
  function reset(u,items){const old=u.maxHp;Object.assign(u,stats(u,items));if(u.hp>0)u.hp=Math.min(u.maxHp,Math.max(1,u.hp+u.maxHp-old));u.mana=Math.min(maxMana(u),u.mana);}
  const summon=u=>rules.units[avatar(u)?'espv':'even'];
  return {rules,ids,is,avatar,spirit,summon,enabled,form,attributes,stats,maxMana,manaRegen,healthRegen,attackSpeed,xpNeed,spell,definition,reset};
})();
if(typeof module!=='undefined')module.exports=FrostWarden;
