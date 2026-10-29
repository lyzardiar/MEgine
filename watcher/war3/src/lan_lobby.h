// Author: MiYu. Source local multiplayer lobby backed by live server slot state.
#pragma once
#include "glue.h"
#include "lan_discovery.h"
#include "lan_join.h"
#include "lan_mapcheck.h"
#include <memory>
#include <string_view>
namespace war3 {
class MapPreparation;
struct LanLobbyHandoff {
    std::unique_ptr<LanJoin> join;
    std::shared_ptr<const Bytes> map;
    MapInfo mapInfo;
    LanMapCheck mapCheck;
    LanMapAnnouncement announcement;
    std::vector<LanSlot> slots;
    std::vector<LanPlayer> players;
    std::uint8_t localPeerId=0;
    std::uint32_t randomSeed=0;
    bool downloaded=false;
    std::string replayMapDigest;
    std::uint64_t requestPreparation(MapPreparation& preparation,std::vector<unsigned> slotPlayerIds) const;
};
class LanLobby {
    GlueScreen screen_;
    Archives& archives_;
    LanGame game_;
    std::string playerName_;
    std::unique_ptr<LanJoin> join_;
    enum class MapStatus {Waiting,WaitingWorker,Checking,Downloading,WaitingDownloadWorker,CheckingDownload,Matched,Downloaded,Failed};
    std::string error_,snapshot_,mapError_,chatError_;
    std::wstring chatDraft_;
    wchar_t chatHighSurrogate_=0;
    bool chatFocus_=true,handoffEnabled_=false;
    std::optional<LanMapAnnouncement> expectedMap_;
    std::unique_ptr<LanMapCheckTask> mapTask_;
    std::shared_ptr<const Bytes> verifiedMap_;
    std::optional<MapInfo> verifiedMapInfo_;
    std::optional<LanMapCheck> verifiedMapCheck_;
    std::string verifiedMapDigest_;
    MapStatus mapStatus_=MapStatus::Waiting;
    std::uint64_t nextMapAttempt_=0;
    std::size_t scroll_=0;
    std::set<std::string> updateSlots();
    void changeSlot(const GlueScreen::ChoiceChange& change);
    void updateMapCheck();
public:
    LanLobby(Archives& archives,Images& images,Renderer& renderer,Text& text,const LanGame& game,std::string playerName);
    std::string draw(const UiInput& input,std::wstring_view characters);
    std::string pollMinimized();
    // Enables ready reporting and loading only when the caller can own the prepared match.
    bool enableMatchHandoff();
    // Valid only on the PrepareGame action; moves the live connection exactly once.
    std::optional<LanLobbyHandoff> takeHandoff();
    // Available only after all fields match the host declaration.
    std::shared_ptr<const Bytes> verifiedMap() const {return verifiedMap_;}
    const std::optional<MapInfo>& verifiedMapInfo() const {return verifiedMapInfo_;}
};
}
