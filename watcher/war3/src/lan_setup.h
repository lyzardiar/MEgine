// Author: MiYu. Explicit W3GS peer-to-map-player assignment for session setup.
#pragma once
#include "lan_join.h"
#include <cstdint>
#include <vector>

namespace war3 {
struct LanSessionSetup {
    // Caller must establish this slot-to-map-player mapping; color and peer ID are not map player IDs.
    std::vector<unsigned> slotPlayerIds;
    std::vector<LanSlot> slots;
    std::vector<LanPlayer> players;
    std::uint8_t localPeerId=0;
    std::uint32_t randomSeed=0;
};
}
