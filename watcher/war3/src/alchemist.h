// Author: MiYu. Healing Spray waves retain in-memory source bottles and independently delivered healing.
#pragma once
#include "spells.h"
namespace war3 {
struct SprayBottle {std::uint32_t effect=0;WorldPoint endpoint;float distance=0;};
struct HealingSprayWave {
    SpellInfo spell;
    std::uint32_t source=0;
    unsigned owner=0;
    WorldPoint origin,point;
    float height=0;
    double elapsed=0,duration=0;
    bool delivered=false;
    std::vector<SprayBottle> bottles;
};
}
