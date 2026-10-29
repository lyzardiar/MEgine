// Author: MiYu. Source equipment contributions retain per-item stacking and separate scripted hero attributes.
#pragma once
#include <array>
namespace war3 {
struct EquipmentBonuses {
    std::array<float,3> attributes{};
    float health=0,mana=0,damage=0,damagePercent=0,armor=0,attackSpeed=0,movement=0,movePenalty=0,healthRegen=0,manaRegen=0,spellReduction=0,vampiric=0;
    float defendMoveReduction=0,defendMoveBonus=0,defendAttackReduction=0;
    bool magicImmune=false,ultravision=false;
    bool operator==(const EquipmentBonuses&) const=default;
};
}
