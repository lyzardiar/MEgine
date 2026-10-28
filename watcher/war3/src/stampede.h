// Author: MiYu. Source Stampede missiles and delayed Lightning Attack graphics retain independent simulation state.
#pragma once
#include "spells.h"
#include "passives.h"
#include <unordered_map>

namespace war3 {
struct StampedeTarget {std::uint32_t id=0;float x=0,y=0,radius=0;};
struct StampedeIndex {
    std::vector<StampedeTarget> targets;
    std::unordered_map<std::uint64_t,std::vector<size_t>> cells;
    float radius=0;
};
struct StampedeBeast {
    const SpellInfo* definition=nullptr;
    std::uint32_t source=0,effect=0;
    unsigned owner=0;
    std::uint64_t cast=0,deathRevision=0,ownerRevision=0;
    WorldPoint position;
    float directionX=1,directionY=0,remaining=0;
    double delay=0;
    bool collided=false;
};
struct AttackLightning {
    const PassiveInfo* definition=nullptr;
    std::uint32_t source=0,target=0;
    std::uint64_t sourceDeath=0,targetDeath=0;
    WorldPoint start,end;
    float startHeight=0,endHeight=0,sourceFly=0,targetFly=0;
    PathMovement startMovement=PathMovement::Ground,endMovement=PathMovement::Ground;
    double due=0;
};
}
