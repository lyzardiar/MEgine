// Author: MiYu. Unit ability transitions retain identity, cast tickets and timed form or consumption state.
#pragma once
#include "spells.h"
namespace war3 {
struct GrabTreeState {SpellInfo spell;std::uint32_t tree=0;std::uint64_t ticket=0;double elapsed=0;bool consumed=false;};
struct WarClubState {SpellInfo spell;unsigned attacks=0;double elapsed=0;bool dropping=false;std::uint32_t visual=0;};
struct EatTreeState {SpellInfo spell;std::uint32_t tree=0;std::uint64_t ticket=0;double elapsed=0;bool ripped=false;};
struct RootState {SpellInfo spell;bool uprooted=false;};
struct RootTransition {SpellInfo spell;WorldPoint point;std::uint64_t ticket=0;double remaining=0;bool rooting=false;};
struct UnitFormState {SpellInfo spell;bool active=false;float healthApplied=0;double remaining=-1;};
struct UnitFormTransition {SpellInfo spell;std::uint32_t type=0;std::uint64_t ticket=0;double remaining=0;float previousHeight=0,previousRate=0;bool reverse=false,committed=false;int gold=0,lumber=0,food=0;unsigned payer=0;};
}
