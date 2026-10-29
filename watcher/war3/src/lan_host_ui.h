// Author: MiYu. Local multiplayer room creation and host lobby.
#pragma once
#include "glue.h"
#include "lan_host.h"
#include "lan_setup.h"
#include "map.h"
#include <array>
#include <memory>

namespace war3 {
class MapPreparation;
struct LanHostHandoff {
    std::unique_ptr<LanHost> host;
    std::shared_ptr<const Bytes> map;
    std::string mapPath;
    LanSessionSetup setup;
    std::uint64_t requestPreparation(MapPreparation& preparation) const;
};
class LanHostUi {
    GlueScreen create_,lobby_;
    Archives& archives_;
    Renderer& renderer_;
    Log& log_;
    fs::path root_,directory_;
    std::vector<MapEntry> entries_;
    std::unique_ptr<LanMapCheckTask> task_;
    std::unique_ptr<LanHost> host_;
    std::optional<MapInfo> mapInfo_;
    std::optional<LanSessionSetup> frozenSetup_;
    std::shared_ptr<const Bytes> frozenMap_;
    std::string playerName_,mapPath_,error_;
    std::wstring gameName_=L"Warcraft III",chatDraft_;
    std::array<std::string,16> slotKeys_{};
    std::vector<bool> computerOnly_;
    unsigned mapOptions_=0;
    wchar_t surrogate_=0;
    size_t selected_=0,scroll_=0,slotScroll_=0;
    bool nameFocus_=true,chatFocus_=true,handoffEnabled_=false;
    std::uint64_t countdownStarted_=0;
    void enter(const fs::path& path);
    void begin();
    void finish();
    std::set<std::string> slots();
    void changeSlot(const GlueScreen::ChoiceChange& change);
    bool canBeginMatch() const;
    void beginMatch();
    std::string drawCreate(const UiInput& input,std::wstring_view characters);
    std::string drawLobby(const UiInput& input,std::wstring_view characters);
public:
    LanHostUi(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,std::string playerName);
    std::string draw(const UiInput& input,std::wstring_view characters);
    std::string pollMinimized();
    void enableMatchHandoff() {handoffEnabled_=true;}
    std::optional<LanHostHandoff> takeHandoff();
    const std::optional<MapInfo>& mapInfo() const {return mapInfo_;}
    std::shared_ptr<const Bytes> mapBytes() const {return host_?host_->mapBytes():nullptr;}
    std::optional<LanSessionSetup> sessionSetup() const {if(!host_ || !host_->running() || !mapInfo_)return {};return lanHostSessionSetup(*mapInfo_,*host_);}
};
}
