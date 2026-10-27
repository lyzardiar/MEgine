// Author: MiYu. Source unit-type morphs retain the unit handle, transition ticket and timed form health separately from cosmetic control forms.
#pragma once
#include "spells.h"
namespace war3 {
struct UnitFormState {SpellInfo spell;bool active=false;float healthApplied=0;double remaining=-1;};
struct UnitFormTransition {SpellInfo spell;std::uint32_t type=0;std::uint64_t ticket=0;double remaining=0;float previousHeight=0,previousRate=0;bool reverse=false,committed=false;};
}
