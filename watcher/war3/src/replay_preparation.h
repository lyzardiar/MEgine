// Author: MiYu. Prepare replay sessions from a checked map snapshot and recorded setup.
#pragma once
#include "lan_mapcheck.h"
#include "map_preparation.h"
#include "replay.h"
#include <memory>
#include <optional>
#include <string>

namespace war3 {
struct PreparedReplay {
    std::shared_ptr<const Replay> replay;
    std::unique_ptr<ScriptSession> session;
    fs::path mapPath;
    std::uint8_t perspectivePeer=0;
    // For headless consumers. A GameLoading consumer should instead move session into its request,
    // which starts main once during CPU loading.
    void startMain();
};
class ReplayPreparation {
    std::shared_ptr<const Replay> replay_;
    std::unique_ptr<Archives> archives_;
    std::unique_ptr<LanMapCheckTask> mapCheck_;
    MapPreparation preparation_;
    std::uint64_t request_=0;
    fs::path mapPath_;
    fs::path replayPath_;
    std::optional<std::string> mapDigest_;
    bool sidecarAttempted_=false;
    std::uint8_t perspectivePeer_=0;
    std::optional<unsigned> gameVersion_;
    std::string error_;
    enum class Phase {Checking,Preparing,Ready,Failed,Transferred} phase_=Phase::Checking;
    std::unique_ptr<ScriptSession> prepared_;
    bool fail(std::string message);
public:
    ReplayPreparation(Archives& archives,std::shared_ptr<const Replay> replay,bool muted=false,std::uint8_t perspectivePeer=0,fs::path replayPath={});
    ~ReplayPreparation();
    ReplayPreparation(const ReplayPreparation&)=delete;
    ReplayPreparation& operator=(const ReplayPreparation&)=delete;
    // Call from the owning thread. False reports a terminal failure via error().
    bool poll();
    std::optional<PreparedReplay> takeReady();
    void cancel();
    const std::string& error() const {return error_;}
};
}
