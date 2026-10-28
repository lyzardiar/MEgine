// Author: MiYu. Explicit conversion of player input to documented classic LAN actions.
#pragma once
#include "lan_actions.h"
#include "player_commands.h"
#include <array>
#include <functional>
#include <optional>

namespace war3 {
class ScriptSession;
// Must return a verified original wire ID for a live session object; no handle-derived fallback is used.
using LanWireObjectResolver=std::function<std::optional<LanObjectId>(std::uint32_t)>;
struct LanAbilityWireFields {
    // The caller must supply the original action flags and both documented unknown fields.
    std::uint16_t flags;
    std::uint32_t unknownA,unknownB;
    // Target-order position, in original float bits, when a target object is sent.
    std::optional<std::array<std::uint32_t,2>> targetPosition;
    LanAbilityWireFields(std::uint16_t flagsValue,std::uint32_t firstUnknown,std::uint32_t secondUnknown,std::optional<std::array<std::uint32_t,2>> position={}) : flags(flagsValue),unknownA(firstUnknown),unknownB(secondUnknown),targetPosition(position) {}
};

// These produce one bounded 0x26 payload without dispatching commands or changing selection. The local mapped peer,
// stable resolver, and current authoritative selection are required. Unsupported inputs
// throw; they must not be silently replaced by a different command or selection.
std::vector<std::uint8_t> encodeLanSelectionChange(ScriptSession& session,std::uint8_t peerId,bool add,std::span<const std::uint32_t> handles,const LanWireObjectResolver& resolve);
struct LanSelectionChange {bool add=false;std::vector<std::uint32_t> handles;};
// Preserves changes in order in a single payload. An empty list produces an empty payload.
std::vector<std::uint8_t> encodeLanSelectionUpdate(ScriptSession& session,std::uint8_t peerId,std::span<const LanSelectionChange> changes,const LanWireObjectResolver& resolve);
std::vector<std::uint8_t> encodeLanPlayerCommand(ScriptSession& session,std::uint8_t peerId,const PlayerCommand& command,const LanAbilityWireFields& fields,const LanWireObjectResolver& resolve);
}
