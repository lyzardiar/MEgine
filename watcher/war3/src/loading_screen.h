// Author: MiYu. Original multiplayer loading models, source FDF labels and measured upload progress.
#pragma once
#include "game_loading.h"
#include "glue.h"
#include "scene_assets.h"
#include "model_ui_audio.h"

namespace war3 {
class LoadingScreen {
    std::unique_ptr<Archives> archives_;
    Images images_;
    Renderer& renderer_;
    SceneAssets assets_;
    Model *background_=nullptr,*bar_=nullptr;
    GlueScreen screen_;
    ModelUiAudio backgroundAudio_,barAudio_;
    std::optional<std::uint64_t> started_;
public:
    LoadingScreen(ScriptSession& session,Renderer& renderer,Text& text,Log& log,IDirect3DTexture9* minimap,bool muted=false,float gain=1);
    void draw(unsigned phase,std::optional<std::pair<size_t,size_t>> uploaded,const std::string& error={});
};
}
