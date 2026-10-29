// Author: MiYu. Original multiplayer loading models, source FDF labels and measured upload progress.
#pragma once
#include "game_loading.h"
#include "glue.h"
#include "scene_assets.h"

namespace war3 {
class LoadingScreen {
    std::unique_ptr<Archives> archives_;
    Images images_;
    Renderer& renderer_;
    SceneAssets assets_;
    Model *background_=nullptr,*bar_=nullptr;
    GlueScreen screen_;
public:
    LoadingScreen(ScriptSession& session,Renderer& renderer,Text& text,Log& log,IDirect3DTexture9* minimap);
    void draw(std::uint64_t elapsed,unsigned phase,std::optional<std::pair<size_t,size_t>> uploaded,const std::string& error={});
};
}
