// Author: MiYu. Resolve a source production rawcode against a selected unit's commands.
#pragma once
#include "entities.h"
#include "player_commands.h"
#include <algorithm>
#include <optional>

namespace war3 {
inline std::optional<PlayerCommandKind> lanProductionOrder(const UnitState& unit,std::uint32_t type,bool point){
    auto has=[&](const auto& values){return std::find(values.begin(),values.end(),type)!=values.end();};if(!type)return {};if(point)return has(unit.buildables)?std::optional{PlayerCommandKind::BuildAt}:std::nullopt;bool train=has(unit.trainables),research=has(unit.researches),upgrade=has(unit.upgradeables);if(unsigned(train)+unsigned(research)+unsigned(upgrade)!=1)return {};return train?PlayerCommandKind::Train:research?PlayerCommandKind::Research:PlayerCommandKind::Upgrade;
}
}
