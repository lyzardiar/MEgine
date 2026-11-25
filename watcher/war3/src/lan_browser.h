// Author: MiYu. Original LAN game browser backed by non-blocking room discovery.
#pragma once
#include "glue.h"
#include "lan_discovery.h"
#include "lan_lobby.h"
#include "lan_host_ui.h"
#include <memory>
#include <string_view>

namespace war3 {
class LanBrowser {
    GlueScreen screen_;
    Archives& archives_;
    Images& images_;
    Renderer& renderer_;
    Text& text_;
    Log& log_;
    std::string discoveryAddress_;
    std::unique_ptr<LanDiscovery> discovery_;
    std::unique_ptr<LanLobby> lobby_;
    std::unique_ptr<LanHostUi> host_;
    std::string error_,selection_,addressError_;
    std::wstring playerName_=L"Player";
    std::wstring addressDraft_;
    wchar_t highSurrogate_=0;
    std::uint64_t nextSearch_=0;
    size_t selected_=0,scroll_=0,addressCursor_=0;
    bool nameFocus_=true,matchHandoffEnabled_=false,loopbackOnly_=false;
    bool addressOpen_=false,addressSelected_=false;
    void start();
    void startDiscovery(std::string address);
    void pollDiscovery();
    void editAddress(const UiInput& input,std::wstring_view characters);
    void drawAddress(const UiInput& input);
public:
    LanBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,std::string_view discoveryAddress={},bool loopbackOnly=false);
    std::string draw(const UiInput& input,std::wstring_view characters,bool addressShortcut=false);
    std::string pollMinimized();
    const std::string& discoveryAddress() const {return discoveryAddress_;}
    void reportError(const std::string& message){error_=message;}
    void enableMatchHandoff();
    std::optional<LanLobbyHandoff> takeHandoff();
    std::optional<LanHostHandoff> takeHostHandoff();
};
}
