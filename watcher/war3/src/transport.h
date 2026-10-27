// Author: MiYu. Source cargo capacity, target rules and unload geometry for live transport manifests.
#pragma once
#include "world.h"
#include <cstdint>
#include <optional>
#include <set>
#include <string>

namespace war3 {
enum class CargoKind {Transport,Garrison,Devour};
struct CargoInfo {std::uint32_t ability=0;unsigned level=0,capacity=0;CargoKind kind=CargoKind::Transport;float range=0,area=0,delay=0,damage=0;unsigned creepLevel=0;std::set<std::string> allowed;};
struct CargoDropOrder {WorldPoint point;double due=0;std::uint32_t order=852048;};
struct CargoReturnOrder {unsigned owner=0;std::uint32_t mine=0,tree=0,repair=0,target=0,order=0;std::optional<WorldPoint> point;};
struct DigestionState {std::uint32_t ability=0,carrierBuff=0,victimBuff=0;double elapsed=0;};
}
