// Author: MiYu. Original LAN game browser backed by non-blocking room discovery.
#pragma once
#include "glue.h"
#include "lan_discovery.h"
#include <memory>
#include <string_view>

namespace war3 {
class LanBrowser {
    GlueScreen screen_;
    Renderer& renderer_;
    Log& log_;
    std::unique_ptr<LanDiscovery> discovery_;
    std::string error_,selection_;
    std::wstring playerName_=L"Player";
    wchar_t highSurrogate_=0;
    std::uint64_t nextSearch_=0;
    size_t selected_=0,scroll_=0;
    bool nameFocus_=true;
    void start();
public:
    LanBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log);
    std::string draw(const UiInput& input,std::wstring_view characters);
};
}
