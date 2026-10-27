// Author: MiYu. Firelord source snapshots drive real Lava Spawn generations, delayed death explosions and Volcano rocks.
#pragma once
#include "spells.h"
namespace war3 {
struct LavaSpawnState {
    const SpellInfo* definition=nullptr;
    unsigned generation=0,attacks=0;
    std::uint64_t ticket=0,deathRevision=0,ownerRevision=0;
    double born=0,nextTry=0,flightElapsed=0,flightDuration=0;
    std::uint32_t effect=0;
    WorldPoint origin;
    float birthArc=0,originHeight=0;
    bool emerging=false;
};
struct Incineration {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint point;double due=0;};
struct VolcanoRock {
    SpellInfo spell;
    std::uint32_t source=0,target=0,effect=0;
    unsigned owner=0;
    bool destructable=false;
    std::uint64_t targetDeath=0;
    WorldPoint start,position,endpoint;
    float distance=0,travelled=0;
};
}
