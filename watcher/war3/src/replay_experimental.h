// Author: MiYu. Same-build LAN replay recording and explicit experimental replay identity.
#pragma once
#include "replay.h"
#include <filesystem>
#include <memory>
#include <optional>
#include <string>

namespace war3 {
class LanHost;
class LanJoin;
class LanRuntime;
class ScriptSession;

// The title marker is a compatibility discriminator, not an authenticated signature.
std::optional<std::string> experimentalLanReplayDigest(const ReplayGame& game);
std::optional<std::uint8_t> experimentalLanReplayPerspective(const ReplayGame& game);
bool experimentalLanReplayMatchesExecutable(const ReplayGame& game);

class ExperimentalLanRecorder {
    struct State;
    std::shared_ptr<State> state_;
    std::filesystem::path dataRoot_;
    bool attached_=false;
    ExperimentalLanRecorder(const std::filesystem::path& dataRoot,ReplayHeader header,ReplayGame game,std::vector<ReplayPlayer> players,ReplaySetup setup);
public:
    static std::unique_ptr<ExperimentalLanRecorder> fromHost(const std::filesystem::path& dataRoot,const ScriptSession& session,const LanHost& host);
    static std::unique_ptr<ExperimentalLanRecorder> fromJoin(const std::filesystem::path& dataRoot,const ScriptSession& session,const LanJoin& join);
    // Attach before the first runtime pump. The observer owns only a weak recorder reference.
    bool attach(LanRuntime& runtime);
    // Seal applied slots and publish once. Caller invokes this when it intentionally ends a match.
    std::filesystem::path save(bool partial=false);
    const std::string& error() const;
    std::uint32_t durationMs() const;
};
}
