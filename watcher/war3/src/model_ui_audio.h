// Author: MiYu. Per-screen model animation sounds from the original in-memory audio tables.
#pragma once
#include "model.h"
#include "sound.h"
#include <cctype>
#include <set>
namespace war3 {
class ModelUiAudio {
    Archives& archives_;
    Log& log_;
    bool muted_,cinematic_,failed_=false,checked_=false,hasEvents_=false;
    float gain_;
    SoundScene* shared_;
    std::unique_ptr<SoundScene> owned_;
    ModelInstance instance_;
    std::set<std::string> failedEvents_;
public:
    ModelUiAudio(Archives& archives,Log& log,bool muted,float gain,bool cinematic=false,SoundScene* shared=nullptr) : archives_(archives),log_(log),muted_(muted),cinematic_(cinematic),gain_(gain),shared_(shared) {}
    bool active(Model& model) {if(muted_ || gain_<=0 || failed_)return false;if(!checked_){hasEvents_=model.hasSoundEvents();checked_=true;}return hasEvents_;}
    void update(Model& model,std::uint64_t elapsed,std::uint64_t clock,const D3DMATRIX& world,const ModelCamera& camera) {
        if(!active(model))return;
        try {
            auto events=model.soundEvents(instance_,elapsed,clock,world,camera.view,false);if(!shared_ && !owned_ && events.empty())return;
            if(!shared_ && !owned_){owned_=std::make_unique<SoundScene>(archives_);owned_->localGain(gain_);}
            auto& sound=shared_?*shared_:*owned_;sound.listener(camera.position[0],camera.position[1],camera.position[2],camera.right);sound.update();
            for(auto& event:events){auto name=event.name;for(auto& c:name)c=char(std::toupper(static_cast<unsigned char>(c)));if(name.size()<8 || !name.starts_with("SND") || failedEvents_.contains(name))continue;try{sound.animation(name.substr(4,4),event.position,cinematic_);}catch(const std::exception& e){failedEvents_.insert(name);log_.write("model_ui_event_error="+name+" "+e.what());}}
        }catch(const std::exception& e){failed_=true;log_.write(std::string("model_ui_audio_error=")+e.what());}
    }
};
}
