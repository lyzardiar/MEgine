// Author: MiYu. Browse local manual checkpoints with the source single-player load screen.
#pragma once
#include "glue.h"

namespace war3 {
class SavedGameBrowser {
    GlueScreen screen_;
    Renderer& renderer_;
    Log& log_;
    std::vector<std::wstring> files_;
    size_t selected_=0,scroll_=0;
    std::string error_;
    void select(size_t index,size_t rows);
public:
    SavedGameBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot);
    std::string draw(const UiInput& input);
    std::string selected() const;
};
}
