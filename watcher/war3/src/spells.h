// Author: MiYu. Source-backed ability orders, cast phases and dispellable unit effects.
#pragma once
#include "world.h"
#include "combat.h"
#include <set>
#include <memory>

namespace war3 {
enum class SpellKind {Unsupported,HolyLight,StormBolt,DeathCoil,FrostNova,Roots,ChainLightning,HealingWave,ThunderClap,WarStomp,Shockwave,CarrionSwarm,FanKnives,WaterElemental,SpiritWolf,SerpentWard,Inferno,Treants,Blizzard,FlameStrike,Tranquility,Starfall,DeathDecay,Channel,Heal,Slow,InnerFire,Bloodlust,Rejuvenation,Frenzy,Curse,Dispel,Abolish,AntiMagicShell,Unsummon,Invisibility,ShadowMeld,Reveal,Dust,WindWalk,Blink,MirrorImage,Load,Unload,UnloadInstant,BattleStations,StandDown,Devour,Cannibalize,RaiseDead,Resurrection,AnimateDead,AncestralSpirit,LoadCorpse,UnloadCorpse,Ensnare,Web,Sleep,Purge,Banish,Hex,Polymorph,Cyclone,BearForm,CrowForm,Metamorphosis,AvengerForm,StoneForm,Burrow,Root,EatTree,DevourMagic,AbsorbMana,OrbAnnihilation,Avatar,Berserk,Defend,DivineShield,Immolation,ManaShield,Drain,ManaBurn,DarkRitual,DeathPact,Possession,Charm,ControlMagic,MassTeleport,TownPortal,Recall,Bladestorm,Earthquake,Voodoo,Phoenix,PhoenixFire,FrostArmor,ShadowStrike,CarrionBeetles,Impale,LocustSwarm,SearingArrows,Scout,VengeanceAvatar,VengeanceSpirits};
inline bool heroUltimate(SpellKind kind){return kind>=SpellKind::Bladestorm && kind<=SpellKind::Voodoo;}
inline bool teleportSpell(SpellKind kind){return kind>=SpellKind::MassTeleport && kind<=SpellKind::Recall;}
inline bool ownershipSpell(SpellKind kind){return kind>=SpellKind::Possession && kind<=SpellKind::ControlMagic;}
inline bool selfSpell(SpellKind kind){return kind>=SpellKind::Avatar && kind<=SpellKind::ManaShield;}
inline bool unitFormSpell(SpellKind kind){return kind>=SpellKind::BearForm && kind<=SpellKind::Burrow;}
inline bool controlSpell(SpellKind kind){return kind>=SpellKind::Ensnare && kind<=SpellKind::Cyclone;}
inline bool attackEnhancement(SpellKind kind){return kind==SpellKind::OrbAnnihilation || kind==SpellKind::SearingArrows;}
inline bool cappedCorpseSummon(SpellKind kind){return kind==SpellKind::CarrionBeetles || kind==SpellKind::VengeanceSpirits;}
inline bool corpseSpell(SpellKind kind){return (kind>=SpellKind::Cannibalize && kind<=SpellKind::AncestralSpirit) || cappedCorpseSummon(kind);}
inline bool casterSpell(SpellKind kind){return (kind>=SpellKind::Heal && kind<=SpellKind::AntiMagicShell) || kind==SpellKind::Invisibility || kind==SpellKind::FrostArmor;}
enum class SpellTargeting {Unit,Point,None,Either};
struct SpellInfo {
    std::uint32_t ability=0,order=0,buff=0;
    std::uint32_t cargoType=0,victimBuff=0;
    unsigned creepLevel=0;
    bool temporaryControl=false;
    bool resurrectInvulnerable=false,inheritUpgrades=false;
    std::vector<std::pair<std::uint32_t,unsigned>> corpseSummons;
    unsigned level=0,targets=1;
    SpellKind kind=SpellKind::Unsupported;
    SpellTargeting targeting=SpellTargeting::Unit;
    float mana=0,cooldown=0,range=0,area=0,amount=0,secondary=0,loss=0,duration=0,heroDuration=0,speed=0;
    std::string animation,missile;
    std::vector<std::string> visualModels;
    float missileArc=0;
    bool missileHoming=true;
    std::set<std::string> allowed;
    float maxDamage=0,distance=0,endRadius=0,moveReduction=0,attackReduction=0,impactDelay=0,summonDuration=0;
    std::uint32_t summonType=0;
    unsigned summonCount=0,summonLimit=0;
    bool summonsDieWithCaster=false;
    bool channelled=false,disableOthers=false,unlimitedRange=false,nightOnly=false,wholeReveal=false;
    unsigned detectionMask=0;
    std::uint32_t effectAlias=0,channelOptions=0;
    unsigned pulses=0,shards=0;
    float channelTime=0,period=0,castDelay=0,buildingFactor=1,extraDamage=0,artPeriod=0,fullTime=0,fullPeriod=0,burnPeriod=0;
    std::uint32_t orderOn=0,orderOff=0;
    std::string onArt,offArt;
    float armor=0,damageBonus=0,attackBonus=0,moveBonus=0,scaleBonus=0,healthRegen=0,shield=0,spellReduction=0,manaLoss=0,autoRange=0;
    unsigned allowFull=0,recoveryMoveSteps=0,recoveryAttackSteps=0;
    std::uint32_t groundBuff=0,guardBuff=0,normalType=0,alternateType=0,unorder=0;
    unsigned formFlags=0;
    float heightTime=0,landDelay=0,formHealth=0;
    int formGold=0,formLumber=0,formFood=0;
    unsigned rootedWeapons=0,uprootedWeapons=0,uprootedDefense=0;
    bool rootedTurn=false,ignoreFriendlyBuffs=false;
    float buffHealth=0,buffMana=0,fullArea=0,halfArea=0;
    float flatDamage=0,healthBonus=0,damageTakenBonus=0,pierceFactor=1,attackFactor=1,magicFactor=1,deflectChance=0,deflectPierce=0,deflectMagic=1;
    float drainLifeTransfer=0,drainManaTransfer=0,drainLifeBonus=0,drainManaBonus=0,drainLifeDecay=0,drainManaDecay=0;
    bool sacrificeManaPercent=false,sacrificeLifePercent=false,leaveTargetAlive=false;
    bool possessionLocks=false,controlInvulnerable=false,controlMagicImmune=false,controlCurrentLife=false;
    float controlBaseMana=0,possessionDamage=1;
    float decayPeriod=0,initialDamage=0;
    bool magicControl=false,dispellable=true;
    bool teleportCluster=true,teleportProtection=false;
    std::array<std::vector<std::uint32_t>,4> morphTypes;
    bool alwaysAuto=false;
    std::vector<std::pair<std::uint32_t,unsigned>> prerequisites;
};
inline bool freeFormReturn(const SpellInfo& s){return s.unorder && s.order==s.unorder && s.kind!=SpellKind::StoneForm;}
struct CastOrder {
    enum class Phase {Approach,Windup,Backswing,Channel};
    Phase phase=Phase::Approach;
    SpellInfo spell;
    std::uint32_t target=0,abilityHandle=0,caster=0;
    std::uint32_t item=0;
    bool itemPaid=false;
    WorldPoint point;
    std::uint64_t ticket=0;
    double remaining=0,repath=0;
    bool started=false;
    double channelElapsed=0,nextPulse=0,nextArt=0;
    unsigned pulses=0,owner=0;
    std::vector<std::uint32_t> visuals,lightnings;
    std::vector<std::pair<std::uint32_t,std::uint32_t>> drainMarks,controlMarks,ultimateMarks;
    std::uint32_t controlClaim=0;
    unsigned controlOwner=UINT_MAX;
    std::optional<CombatOrder> resume;
    std::uint32_t resumeOrder=0;
    bool resumeHolding=false;
};
struct PossessionClaim {std::uint32_t source=0;std::uint64_t ticket=0;bool locked=false;};
struct MorphAppearance {std::uint32_t type=0;std::string model,icon;float scale=1;jass::Real speed;};
enum class BuffKind {Stun,Roots,Frost,Slow,Mark,InnerFire,Bloodlust,Rejuvenation,Frenzy,Curse,Shell,Invisibility,Detection,WindWalk,Digestion,Net,Sleep,Purge,Banish,Morph,Cyclone,UnitForm,EatTree,Avatar,Berserk,Defend,DivineShield,Immolation,ManaShield,Drain,DrainBonus,PossessionCaster,PossessionTarget,Controlled,ItemRecovery,ItemInvulnerability,ItemSpeed,Bladestorm,Earthquake,Voodoo,FrostArmor,ShadowStrike,Impale,Count};
struct UnitBuff {
    std::uint32_t id=0,source=0,target=0;
    BuffKind kind=BuffKind::Stun;
    double remaining=0,period=0,fadeRemaining=0,total=0,lockRemaining=0,damageGuard=0;
    bool groundsAir=false,dispellable=true;
    std::uint64_t applied=0;
    std::shared_ptr<const MorphAppearance> form;
    std::string carrierAttachment;
    float groundHeight=0,landTime=0;
    unsigned recoveryMoveSteps=0,recoveryAttackSteps=0;
    float damage=0,moveReduction=0,attackReduction=0;
    bool positive=false,physical=false,persistent=false;
    float armor=0,damageBonus=0,attackBonus=0,moveBonus=0,scaleBonus=0,healthRegen=0,healRate=0,manaRate=0,missChance=0,shield=0,spellReduction=0;
    bool magicImmune=false,backstab=false,invulnerable=false,breakOnDamage=false;
    float moveLimit=0;
    std::uint32_t ability=0,originAbility=0;
    float flatDamage=0,healthBonus=0,damageTakenBonus=0,pierceFactor=1,attackFactor=1,magicFactor=1,deflectChance=0,deflectPierce=0,deflectMagic=1;
    float manaEfficiency=0,absorbFraction=0,manaBonus=0,lifeDecay=0,manaDecay=0,damageTakenFactor=1;
    std::map<std::uint32_t,std::uint64_t> channelSources;
    std::map<std::uint32_t,float> channelSlow;
    unsigned sourceOwner=UINT_MAX,sourceLevel=0;
    float stealthDamage=0;
    std::map<unsigned,std::pair<unsigned,double>> detection;
    std::vector<std::uint32_t> visuals;
};
struct SpellMissile {
    SpellInfo spell;
    std::uint32_t source=0,target=0;
    unsigned owner=0;
    WorldPoint position,start;
    float amount=0,mana=0,startHeight=0,endHeight=0,distance=0,travelled=0;
    double born=0;
    std::vector<std::uint32_t> visited;
};
struct ScriptAbility {std::uint32_t unit=0,type=0;};
struct SpellWave {
    SpellInfo spell;
    std::uint32_t source=0;
    unsigned owner=0;
    WorldPoint origin;
    float directionX=1,directionY=0,travelled=0,dealt=0,nextArt=0;
    double born=0;
    std::set<std::uint32_t> hit;
};
struct DelayedSpell {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint point;double due=0;std::uint32_t target=0;};
struct GroundSpell {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint point;double elapsed=0,nextPulse=0;bool started=false,burn=false;std::vector<std::uint32_t> visuals;};
struct GroundingState {float height=0,rate=0;};
struct ShadowMeldState {std::uint32_t ability=0;unsigned level=0,owner=0;double remaining=0;bool nightOnly=true,manual=false;};
struct MirrorImageState {SpellInfo spell;unsigned owner=0;std::uint64_t ticket=0;double remaining=0;};
struct RevealArea {unsigned owner=0,mask=0;WorldPoint point;float radius=0;double expires=0;bool whole=false;std::vector<std::uint32_t> visuals;};
}
