// Author: MiYu. Bounded native Warcraft III LAN host lobby.
#pragma once
#include "lan_join.h"
#include "lan_mapcheck.h"
#include <memory>
#include <string_view>
#include <vector>
namespace war3 {
struct LanChecksumMismatch {std::uint64_t round=0;std::uint8_t playerId=0;std::uint32_t expected=0,actual=0;};
struct LanHostSettings {
    std::string gameName,playerName,mapPath;
    LanMapCheck map;
    std::uint16_t width=0,height=0;
    std::uint32_t mapFlags=0,gameType=1;
    std::vector<LanSlot> slots;
    std::uint32_t mapOptions=0;
    std::vector<bool> computerOnly;
    // Optional immutable snapshot used for in-memory map transfer; it must match map's declared fields.
    std::shared_ptr<const Bytes> mapBytes;
};
class LanHost {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    explicit LanHost(LanHostSettings settings);
    ~LanHost();
    LanHost(const LanHost&)=delete;
    LanHost& operator=(const LanHost&)=delete;
    void poll();
    void cancel();
    bool sendChat(std::string_view message);
    bool setSlot(std::size_t index,const LanSlot& slot);
    // Explicit loading protocol; no game simulation is started by these calls.
    bool beginCountdown();
    bool beginLoading();
    bool reportHostLoaded();
    LanLoadPhase loadPhase() const;
    const std::vector<std::uint8_t>& loadPlayers() const;
    const std::vector<std::uint8_t>& loadedPlayers() const;
    // Opaque W3GS action data; callers must separately implement simulation and original action semantics.
    bool enableTimeSlotProtocol();
    bool submitHostAction(std::span<const std::uint8_t> action);
    bool emitTimeSlot(std::uint16_t elapsedMs);
    std::optional<LanTimeSlot> takeTimeSlot();
    bool submitHostChecksum(std::uint32_t checksum);
    std::optional<LanChecksumMismatch> checksumMismatch() const;
    // The remote peer's assertion, not host-side verification of its file.
    bool playerReportsMapReady(std::uint8_t playerId) const;
    bool playerRequestsMap(std::uint8_t playerId) const;
    const std::vector<LanSlot>& slots() const;
    const std::vector<LanPlayer>& players() const;
    const std::vector<LanChatMessage>& chat() const;
    const std::string& error() const;
    bool running() const;
};
}
