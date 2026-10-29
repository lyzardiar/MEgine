// Author: MiYu. Own a LAN connection through map preparation, GPU upload and the loading barrier.
#pragma once
#include "lan_host_ui.h"
#include "lan_lobby.h"
#include "lan_runtime.h"
#include "map_preparation.h"
#include <functional>
#include <memory>
#include <optional>
#include <string>

namespace war3 {
enum class LanLoadingPhase {Preparing,Loading,Uploading,WaitingPlayers,Ready,Failed,Transferred};
struct LanMatchReady {
    std::unique_ptr<GameData> data;
    std::unique_ptr<LanHost> host;
    std::unique_ptr<LanJoin> join;
    std::shared_ptr<const Bytes> replayMap;
    std::string replayMapDigest;
    ScriptSession* expectedSession=nullptr;
    std::unique_ptr<LanRuntime> start(GameView& game,LanSimulation::ObjectResolver resolve,LanWireObjectResolver wire,LanRuntime::AbilityFields fields,LanRuntime::Checksum checksum,std::uint16_t hostIntervalMs);
};
class LanMatchLoading {
    MapPreparation preparation_;
    GameLoading loader_;
    std::unique_ptr<LanHost> host_;
    std::unique_ptr<LanJoin> join_;
    std::shared_ptr<const Bytes> replayMap_;
    std::string replayMapDigest_;
    std::unique_ptr<GameData> data_;
    std::unique_ptr<ScriptSession> prepared_;
    std::uint64_t mapRequest_=0,loadRequest_=0;
    LanLoadingPhase phase_=LanLoadingPhase::Preparing;
    std::string error_;
    bool fail(std::string message);
    bool pollConnection();
public:
    // Called once before main begins; useful for creating the original loading screen.
    using Prepared=std::function<void(ScriptSession&)>;
    LanMatchLoading(const fs::path& root,bool muted,Log& log,LanHostHandoff handoff);
    LanMatchLoading(const fs::path& root,bool muted,Log& log,LanLobbyHandoff handoff,std::vector<unsigned> slotPlayerIds);
    ~LanMatchLoading();
    LanMatchLoading(const LanMatchLoading&)=delete;
    LanMatchLoading& operator=(const LanMatchLoading&)=delete;
    bool pump(Renderer& renderer,const Prepared& onPrepared);
    bool maintainConnection();
    void cancel();
    std::optional<LanMatchReady> takeReady();
    LanLoadingPhase phase() const {return phase_;}
    unsigned loadingPhase() const {return loader_.phase();}
    std::optional<std::pair<size_t,size_t>> uploadProgress() const {return data_?std::optional<std::pair<size_t,size_t>>{{data_->uploaded(),data_->uploadCount()}}:std::nullopt;}
    const std::string& error() const {return error_;}
};
}
