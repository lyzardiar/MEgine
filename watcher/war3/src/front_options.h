// Author: MiYu. Original main-menu options backed by the shared local game preferences.
#pragma once
#include "glue.h"
#include "game_preferences.h"

namespace war3 {
class FrontOptions {
    enum class Page {Gameplay,Video,Sound};
    GlueScreen screen_;
    Renderer& renderer_;
    Log& log_;
    fs::path root_;
    GameCameraPreferences camera_,originalCamera_;
    GameAudioPreferences audio_,originalAudio_;
    GameVideoPreferences video_,originalVideo_;
    GameNetworkPreferences network_,originalNetwork_;
    std::string portText_;
    size_t portCursor_=0;
    bool cameraValid_=true,audioValid_=true,videoValid_=true,networkValid_=true;
    Page page_=Page::Gameplay;
    std::string sliderDrag_;
    std::string error_;
    void page(Page value);
public:
    FrontOptions(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& root);
    // Empty while open, OKButton or CancelButton when closed.
    std::string draw(const UiInput& input,std::wstring_view characters);
};
}
