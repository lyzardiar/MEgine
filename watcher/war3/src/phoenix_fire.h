// Author: MiYu. Phoenix Fire keeps source projectile snapshots and hidden non-stacking burns separate from unit abilities.
#pragma once
#include "spells.h"
namespace war3 {
struct PhoenixFireClock {double remaining=0;};
struct PhoenixBurn {
    std::uint32_t source=0,target=0,ability=0;
    unsigned level=0;
    float damagePerSecond=0;
    unsigned owner=0;
    std::uint64_t ticket=0;
    double remaining=0,period=0,born=0;
    std::vector<std::uint32_t> visuals;
};
}
