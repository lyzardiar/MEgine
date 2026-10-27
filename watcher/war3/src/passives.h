// Author: MiYu. Source passive definitions, aura membership and live aggregate combat modifiers.
#pragma once
#include "world.h"
#include <set>

namespace war3 {
enum class PassiveKind {Unsupported,Brilliance,Devotion,Endurance,Unholy,Vampiric,Trueshot,Thorns,Command,WarDrums,Regeneration,Bash,Critical,Evasion,Cleave,PermanentInvisibility,Detection,Ghost,Exhume,Reincarnation,PhoenixMorph,PhoenixFire,SpikedCarapace,AttackModifier,LightningAttack,SlowAura,PermanentImmolation,Pulverize,TornadoDamage,TornadoSpin,TornadoWander};
struct PassiveInfo {
    std::uint32_t ability=0,buff=0,corpseType=0;
    unsigned level=0;
    PassiveKind kind=PassiveKind::Unsupported;
    bool aura=false,percent=false,melee=true,ranged=true,neverMiss=false;
    float area=0,amount=0,secondary=0,bonus=0,evasion=0,duration=0,heroDuration=0;
    std::string attackMissile,lightningType;
    float missileSpeed=0,missileArc=0;
    float period=0,innerArea=0,innerDamage=0,nearArea=0,nearDamage=0;
    std::uint32_t effectBuff=0;
    bool missileHoming=true;
    std::set<std::string> allowed;
    std::vector<std::pair<std::uint32_t,unsigned>> prerequisites;
    std::vector<std::string> visualModels;
    std::vector<std::pair<std::string,std::string>> targetModels;
};
struct UnitAura {const PassiveInfo* definition=nullptr;std::uint32_t source=0;double remaining=0;bool positive=true;};
struct AuraBonuses {
    float movement=0,attackSpeed=0,armor=0,armorPercent=0,health=0,healthPercent=0,mana=0,manaPercent=0;
    float meleeDamage=0,rangedDamage=0,meleeFlat=0,rangedFlat=0,vampiric=0,thorns=0,thornsFlat=0;
};
struct AuraEmitterVisual {unsigned level=0;std::vector<std::uint32_t> effects;};
}
