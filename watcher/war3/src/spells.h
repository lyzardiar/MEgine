// Author: MiYu. Source-backed ability orders, cast phases and dispellable unit effects.
#pragma once
#include "world.h"
#include "combat.h"
#include <set>

namespace war3 {
enum class SpellKind {Unsupported,HolyLight,StormBolt,DeathCoil,FrostNova,Roots,ChainLightning,HealingWave,ThunderClap,WarStomp,Shockwave,CarrionSwarm,FanKnives,WaterElemental,SpiritWolf,SerpentWard,Inferno,Treants,Blizzard,FlameStrike,Tranquility,Starfall,DeathDecay,Channel,Heal,Slow,InnerFire,Bloodlust,Rejuvenation,Frenzy,Curse,Dispel,Abolish,AntiMagicShell,Unsummon};
inline bool casterSpell(SpellKind kind){return kind>=SpellKind::Heal && kind<=SpellKind::AntiMagicShell;}
enum class SpellTargeting {Unit,Point,None,Either};
struct SpellInfo {
    std::uint32_t ability=0,order=0,buff=0;
    unsigned level=0,targets=1;
    SpellKind kind=SpellKind::Unsupported;
    SpellTargeting targeting=SpellTargeting::Unit;
    float mana=0,cooldown=0,range=0,area=0,amount=0,secondary=0,loss=0,duration=0,heroDuration=0,speed=0;
    std::string animation,missile;
    std::vector<std::string> visualModels;
    float missileArc=0;
    std::set<std::string> allowed;
    float maxDamage=0,distance=0,endRadius=0,moveReduction=0,attackReduction=0,impactDelay=0,summonDuration=0;
    std::uint32_t summonType=0;
    unsigned summonCount=0;
    bool channelled=false,disableOthers=false,unlimitedRange=false;
    std::uint32_t effectAlias=0,channelOptions=0;
    unsigned pulses=0,shards=0;
    float channelTime=0,period=0,castDelay=0,buildingFactor=1,extraDamage=0,artPeriod=0,fullTime=0,fullPeriod=0,burnPeriod=0;
    std::uint32_t orderOn=0,orderOff=0;
    std::string onArt,offArt;
    float armor=0,damageBonus=0,attackBonus=0,moveBonus=0,scaleBonus=0,healthRegen=0,shield=0,spellReduction=0,manaLoss=0,autoRange=0;
    unsigned allowFull=0;
    bool alwaysAuto=false;
    std::vector<std::pair<std::uint32_t,unsigned>> prerequisites;
};
struct CastOrder {
    enum class Phase {Approach,Windup,Backswing,Channel};
    Phase phase=Phase::Approach;
    SpellInfo spell;
    std::uint32_t target=0,abilityHandle=0;
    WorldPoint point;
    std::uint64_t ticket=0;
    double remaining=0,repath=0;
    bool started=false;
    double channelElapsed=0,nextPulse=0,nextArt=0;
    unsigned pulses=0,owner=0;
    std::vector<std::uint32_t> visuals;
    std::optional<CombatOrder> resume;
    std::uint32_t resumeOrder=0;
    bool resumeHolding=false;
};
enum class BuffKind {Stun,Roots,Frost,Slow,Mark,InnerFire,Bloodlust,Rejuvenation,Frenzy,Curse,Shell,Count};
struct UnitBuff {
    std::uint32_t id=0,source=0;
    BuffKind kind=BuffKind::Stun;
    double remaining=0,period=0;
    float damage=0,moveReduction=0,attackReduction=0;
    bool positive=false,physical=false;
    float armor=0,damageBonus=0,attackBonus=0,moveBonus=0,scaleBonus=0,healthRegen=0,healRate=0,manaRate=0,missChance=0,shield=0,spellReduction=0;
    bool magicImmune=false;
    std::vector<std::uint32_t> visuals;
};
struct SpellMissile {
    SpellInfo spell;
    std::uint32_t source=0,target=0;
    unsigned owner=0;
    WorldPoint position,start;
    float amount=0,startHeight=0,endHeight=0,distance=0,travelled=0;
    double born=0;
    std::vector<std::uint32_t> visited;
};
struct ScriptAbility {std::uint32_t unit=0,type=0;};
struct SpellWave {
    SpellInfo spell;
    std::uint32_t source=0;
    unsigned owner=0;
    WorldPoint origin;
    float directionX=1,directionY=0,travelled=0,dealt=0;
    double born=0;
    std::set<std::uint32_t> hit;
};
struct DelayedSpell {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint point;double due=0;};
struct GroundSpell {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint point;double elapsed=0,nextPulse=0;bool started=false,burn=false;std::vector<std::uint32_t> visuals;};
}
