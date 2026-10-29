// Author: MiYu. Bounded projection of experimental selection synchronization chunks.
#pragma once
#include "lan_actions.h"
#include <map>
#include <optional>
#include <set>

namespace war3 {
struct LanSelectionSyncPart {bool initialized=false;std::size_t filled=0;std::vector<std::optional<LanObjectId>> objects;std::set<std::pair<std::uint32_t,std::uint32_t>> identities;};
using LanSelectionSyncProjection=std::map<std::pair<std::uint32_t,std::uint8_t>,LanSelectionSyncPart>;
}
