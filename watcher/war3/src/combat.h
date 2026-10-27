// Author: MiYu. Source weapon definitions, cancellable orders and live projectile state for native combat.
#pragma once
#include "world.h"
#include "passives.h"
#include <set>

namespace war3 {
struct WeaponDefinition {
    bool enabled=false,homing=true;
    unsigned slot=0,attackType=1,dice=0,sides=0,maxTargets=1;
    float base=0,range=0,minimumRange=0,rangeBuffer=0,cooldown=1,point=0,backswing=0;
    float speed=0,arc=0,launchX=0,launchY=0,launchZ=0,impactZ=0;
    float fullArea=0,halfArea=0,quarterArea=0,halfFactor=0,quarterFactor=0,loss=0,spillDistance=0,spillRadius=0;
    std::string kind,model;
    std::set<std::string> targets,splashTargets;
};
struct AttackWindup {std::uint32_t target=0;unsigned weapon=0;double due=0;std::uint64_t revision=0;float stealthDamage=0;bool backstab=false;std::uint32_t ability=0;};
struct CombatOrder {
    std::uint32_t target=0,follow=0,pickup=0,board=0,attackAbility=0;
    std::optional<WorldPoint> attackMove,patrolStart,patrolEnd;
    WorldPoint home;
    bool forced=false,automatic=false,returning=false;
    double nextAttack=0,repath=0,animationEnd=0,leash=0;
    float animationSpeed=1;
    std::uint64_t revision=0;
    std::optional<AttackWindup> windup;
};
struct CombatProjectile {
    WeaponDefinition definition;
    std::uint64_t id=0;
    std::uint32_t source=0,target=0,sourceType=0,owner=0,ability=0;
    unsigned weapon=0,abilityLevel=0;
    float damage=0,travelled=0,distance=0,startHeight=0,endHeight=0,stealthDamage=0;
    WorldPoint start,position,endpoint;
    double born=0;
    std::vector<std::uint32_t> visited;
    bool neverMiss=false,forcedMiss=false,reflected=false;
    std::vector<PassiveInfo> procs;
};
}
