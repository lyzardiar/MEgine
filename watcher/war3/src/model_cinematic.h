// Author: MiYu. Sequential source model cameras and scene-labelled cinematic audio.
#pragma once
#include "model.h"
#include "sound.h"
#include "map_ui.h"
namespace war3 {
class ModelCinematic {
    Model model_;
    SoundScene sound_;
    std::vector<std::uint64_t> durations_;
    std::vector<std::string> labels_;
    std::vector<std::shared_ptr<ScriptSound>> prepared_;
    std::shared_ptr<ScriptSound> playing_;
    std::uint64_t start_=0,sceneStart_=0;
    size_t scene_=0;
    void select(size_t index);
public:
    ModelCinematic(Archives& archives,Images& images,Renderer& renderer,Log& log,const std::string& source,bool muted);
    bool draw(float aspect);
};
}
