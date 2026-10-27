// Author: MiYu. Source cargo capacity, target rules and unload geometry for live transport manifests.
#pragma once
#include "world.h"
#include <cstdint>
#include <set>
#include <string>

namespace war3 {
struct CargoInfo {std::uint32_t ability=0;unsigned level=0,capacity=0;float range=0,area=0,delay=0;std::set<std::string> allowed;};
struct CargoDropOrder {WorldPoint point;double due=0;std::uint32_t order=852048;};
}
