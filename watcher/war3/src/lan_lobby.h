// Author: MiYu. Source local multiplayer lobby backed by live server slot state.
#pragma once
#include "glue.h"
#include "lan_discovery.h"
#include "lan_join.h"
#include "lan_mapcheck.h"
#include <memory>
#include <string_view>
namespace war3 {
class LanLobby {
    GlueScreen screen_;
    Archives& archives_;
    LanGame game_;
    std::string playerName_;
    std::unique_ptr<LanJoin> join_;
    enum class MapStatus {Waiting,WaitingWorker,Checking,Matched,Mismatch,Failed};
    std::string error_,snapshot_,mapError_,chatError_;
    std::wstring chatDraft_;
    wchar_t chatHighSurrogate_=0;
    bool chatFocus_=true;
    std::optional<LanMapAnnouncement> expectedMap_;
    std::unique_ptr<LanMapCheckTask> mapTask_;
    MapStatus mapStatus_=MapStatus::Waiting;
    std::uint64_t nextMapAttempt_=0;
    std::size_t scroll_=0;
    void updateSlots();
    void updateMapCheck();
public:
    LanLobby(Archives& archives,Images& images,Renderer& renderer,Text& text,const LanGame& game,std::string playerName);
    std::string draw(const UiInput& input,std::wstring_view characters);
};
}
