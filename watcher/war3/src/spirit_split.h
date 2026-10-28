// Author: MiYu. Real elemental members retain the original hero handle, source fields and independent birth flights.
#pragma once
#include "spells.h"
namespace war3 {
struct SpiritMember {std::uint32_t type=0,unit=0,effect=0;WorldPoint point;std::string missile;};
struct SpiritSplitState {
    SpellInfo spell;
    unsigned owner=0;
    std::uint64_t ticket=0,deathRevision=0,ownerRevision=0;
    double remaining=0,launchElapsed=0,launchDuration=0;
    WorldPoint origin,lastPoint;
    std::uint32_t lastKiller=0;
    float launchHeight=0;
    bool selected=false,emerged=false,closing=false;
    std::vector<SpiritMember> members;
};
struct AmbientClock {
    unsigned level=0;
    std::uint64_t deathRevision=0,ownerRevision=0;
    double remaining=0,elapsed=0;
    WorldPoint home;
    std::vector<std::uint32_t> visuals;
};
}
