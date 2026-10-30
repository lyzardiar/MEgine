// Author: MiYu. Source consumable definitions share actual resource, status and dispel consumers.
#pragma once
#include "spells.h"
namespace war3 {
enum class ConsumableKind {Regeneration,Invulnerability,Speed,Restoration,Dispel,Protection,SpellShield};
struct ConsumableInfo {
    SpellInfo spell;
    ConsumableKind kind=ConsumableKind::Restoration;
    unsigned fullFlags=0;
    bool noTarget=true,breakOnDamage=false;
    float heal=0,mana=0,moveLimit=0;
};
}
