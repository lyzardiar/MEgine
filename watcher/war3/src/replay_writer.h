// Author: MiYu. Bounded in-memory writer for classic replay containers.
#pragma once
#include "replay.h"

namespace war3 {
// Callers supply verified match metadata and action bytes. No files are created by this class.
class ReplayWriter {
    ReplayHeader header_;
    std::vector<std::uint8_t> records_;
    std::uint32_t duration_=0;
    std::size_t recordCount_=0;
public:
    ReplayWriter(ReplayHeader header,const ReplayGame& game,const std::vector<ReplayPlayer>& players,const ReplaySetup& setup);
    void appendTimeSlot(const LanTimeSlot& slot);
    // Payload follows the record's player ID and length and must include its chat flags/mode.
    void appendChat(std::uint8_t playerId,std::span<const std::uint8_t> payload);
    void appendPlayerLeft(std::uint8_t playerId,bool local,std::uint32_t reason,std::uint32_t counter);
    std::vector<std::uint8_t> serialize() const;
    std::uint32_t durationMs() const {return duration_;}
};
}
