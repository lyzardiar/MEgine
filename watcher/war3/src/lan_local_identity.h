// Author: MiYu. Experimental same-build LAN identity and diagnostic state digest.
#pragma once
#include "lan_action_encoder.h"

namespace war3 {
class ScriptSession;
class LanLocalIdentity {
    ScriptSession& session_;
public:
    explicit LanLocalIdentity(ScriptSession& session) : session_(session) {}
    std::optional<std::uint32_t> resolve(LanObjectId id) const;
    std::optional<LanObjectId> wire(std::uint32_t handle) const;
    std::optional<std::uint32_t> checksum(const ScriptSession& session) const;
    std::optional<LanAbilityWireFields> fields(const PlayerCommand& command) const;
};
}
