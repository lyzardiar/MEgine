// Author: MiYu. Source engineering substitutions and Tinker artillery/factory state retain real ability and unit lifetimes.
#pragma once
#include "spells.h"
#include <map>
namespace war3 {
struct EngineeringState {std::map<std::uint32_t,std::uint32_t> replacements;float movement=0,damage=0;};
struct TinkerBottle {std::uint32_t effect=0;WorldPoint endpoint;float distance=0;};
struct TinkerVolley {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint origin,point;float height=0;double elapsed=0,duration=0;bool delivered=false;std::vector<TinkerBottle> bottles;};
struct PocketFactoryState {SpellInfo spell;std::uint64_t ticket=0,death=0;unsigned owner=0;double elapsed=0,nextSpawn=0;};
struct ClockwerkState {std::uint32_t factory=0;std::uint64_t factoryTicket=0,death=0,ownership=0;WorldPoint home;float leash=0;double nextCheck=0;};
struct TinkerExplosion {SpellInfo spell;std::uint32_t source=0;unsigned owner=0;WorldPoint point;double due=0;};
}
