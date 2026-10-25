// Author: MiYu. Original skirmish screen with lazy filesystem map selection.
#pragma once
#include "glue.h"
#include "map.h"

namespace war3 {
class MapBrowser {
    GlueScreen screen_;
    Renderer& renderer_;
    Images& images_;
    Log& log_;
    fs::path root_,directory_;
    std::vector<MapEntry> entries_;
    std::optional<MapInfo> info_;
    std::string error_;
    size_t selected_=0,scroll_=0;
    unsigned rows_=1;
    void enter(const fs::path& path,const fs::path& preferred={});
    void select(size_t index);
    void infoLayout();
public:
    MapBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot,const fs::path& preferred);
    std::string draw(const UiInput& input);
    const MapInfo* info() const {return info_?&*info_:nullptr;}
    fs::path selectedMap() const;
    std::pair<float,float> selectedCenter() const;
    const std::string& error() const {return error_;}
};
}
