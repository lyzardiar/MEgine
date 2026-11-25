// Author: MiYu. Same-build local skirmish recording and playback.
#pragma once
#include "replay_writer.h"
#include "player_commands.h"

namespace war3 {
class ScriptSession;
namespace jass {class Module;}

inline constexpr std::uint32_t soloReplayProduct=0x4d534f4cu;
enum class SoloReplayMode {None,Record,Play};
struct SoloReplaySetup {
    std::string mapDigest,commonDigest;
    std::uint32_t seed=0;
    unsigned version=0,local=0;
    std::pair<unsigned,unsigned> difficulty;
    Bytes playerConfiguration;
};
SoloReplaySetup readSoloReplaySetup(const Replay& replay);
void restoreSoloReplaySetup(ScriptSession& session,const SoloReplaySetup& setup);
void updateSoloReplayVisibility(ScriptSession& session);
void validateSoloReplayScript(const jass::Module& module);
Bytes encodeSoloCommand(const PlayerCommand& command);
PlayerCommand decodeSoloCommand(std::span<const std::uint8_t> bytes);

class SoloReplayRecorder {
    ReplayWriter writer_;
    fs::path root_;
    bool sealed_=false;
    std::string error_;
    void append(std::uint16_t elapsed,Bytes bytes);
public:
    explicit SoloReplayRecorder(const ScriptSession& session,std::stop_token stop={});
    void advance(ScriptSession& session,double elapsed,std::uint16_t playbackMs);
    void command(ScriptSession& session,const PlayerCommand& command,unsigned result);
    void leave(ScriptSession& session);
    void commandMenuOpened(ScriptSession& session,bool skills);
    void invalidate(std::string message);
    bool seal(const ScriptSession& session);
    fs::path save(const std::wstring& name) const;
    const std::string& error() const {return error_;}
};

class SoloReplayPlayer {
    bool setup_=false,finished_=false;
public:
    std::optional<std::string> consume(ScriptSession& session,const LanTimeSlot& slot);
    bool finished() const {return finished_;}
};
}
