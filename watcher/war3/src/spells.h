// Author: MiYu. Source-backed ability orders, cast phases and dispellable unit effects.
#pragma once
#include "world.h"
#include <set>

namespace war3 {
enum class SpellKind {Unsupported,HolyLight,StormBolt,DeathCoil,FrostNova,Roots,ChainLightning,HealingWave,ThunderClap,WarStomp,Shockwave,CarrionSwarm,FanKnives,WaterElemental,SpiritWolf,SerpentWard,Inferno,Treants};
enum class SpellTargeting {Unit,Point,None};
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
};
struct CastOrder {
    enum class Phase {Approach,Windup,Backswing};
    Phase phase=Phase::Approach;
    SpellInfo spell;
    std::uint32_t target=0,abilityHandle=0;
    WorldPoint point;
    std::uint64_t ticket=0;
    double remaining=0,repath=0;
    bool started=false;
};
enum class BuffKind {Stun,Roots,Frost,Slow};
struct UnitBuff {
    std::uint32_t id=0,source=0;
    BuffKind kind=BuffKind::Stun;
    double remaining=0,period=0;
    float damage=0,moveReduction=0,attackReduction=0;
    bool positive=false,physical=false;
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
}
