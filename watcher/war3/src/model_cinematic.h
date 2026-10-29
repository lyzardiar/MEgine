// Author: MiYu. Sequential source model cameras and scene-labelled cinematic audio.
#pragma once
#include "model.h"
#include "scene_assets.h"
#include "model_ui_audio.h"
#include "sound.h"
#include "map_ui.h"
#include "morph_mesh.h"
namespace war3 {
class ModelCinematic {
    SceneAssets assets_;
    Model& model_;
    SoundScene sound_;
    ModelUiAudio modelAudio_;
    Renderer& renderer_;
    struct MorphCue {size_t scene;std::uint64_t begin,end;std::unique_ptr<MorphMesh> mesh;};
    std::vector<MorphCue> morphs_;
    std::vector<std::uint64_t> durations_;
    std::vector<std::string> labels_;
    std::vector<std::shared_ptr<ScriptSound>> prepared_;
    std::shared_ptr<ScriptSound> playing_;
    std::uint64_t start_=0,sceneStart_=0;
    size_t scene_=0;
    void select(size_t index);
public:
    ModelCinematic(Archives& archives,Images& images,Renderer& renderer,Log& log,const std::string& source,bool muted,float soundGain=1);
    bool draw(float aspect);
};
}
