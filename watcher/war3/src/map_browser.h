// Author: MiYu. Original skirmish screen with lazy filesystem map selection.
#pragma once
#include "glue.h"
#include "map.h"
#include "map_ui.h"
#include "player_setup_ui.h"
#include "map_preparation.h"

namespace war3 {
class MapBrowser {
    GlueScreen screen_;
    MapUiData source_;
    PlayerSetupUi players_;
    std::unique_ptr<PlayerSetup> setup_;
    std::unique_ptr<ScriptSession> session_;
    Renderer& renderer_;
    Log& log_;
    MapPreparation preparation_;
    fs::path root_,directory_;
    std::vector<MapEntry> entries_;
    std::map<fs::path,std::optional<MapHeader>> headers_;
    std::optional<MapInfo> info_;
    std::string error_;
    size_t selected_=0,scroll_=0;
    unsigned rows_=1;
    float itemFont_=0,playersFont_=0;
    std::uint64_t request_=0;
    bool loading_=false;
    void clearSelection();
    void prepared();
    void enter(const fs::path& path,const fs::path& preferred={});
    void select(size_t index);
    void infoLayout();
    const MapHeader* header(const fs::path& path);
public:
    MapBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot,const fs::path& preferred,bool muted=false);
    std::string draw(const UiInput& input);
    const MapInfo* info() const {return info_?&*info_:nullptr;}
    const PlayerSetup* setup() const {return setup_.get();}
    const ScriptSession* session() const {return session_.get();}
    bool loading() const {return loading_;}
    const std::string& focus() const {return screen_.focus();}
    bool popupOpen() const {return screen_.popupOpen();}
    fs::path selectedMap() const;
    std::pair<float,float> selectedCenter() const;
    const std::string& error() const {return error_;}
    const fs::path& directory() const {return directory_;}
    const std::vector<MapEntry>& entries() const {return entries_;}
    GlueScreen::Rect bounds(const std::string& name) const {return screen_.bounds(name);}
    IDirect3DTexture9* preview() const {return screen_.image("MinimapImage");}
};
}
