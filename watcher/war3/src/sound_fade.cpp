// Author: MiYu. Integer fade behavior from the pinned 1.27 sound manager.
#include "sound_fade.h"
#include <algorithm>
#include <bit>

namespace war3 {
SoundFade::SoundFade(int fadeIn,int fadeOut,int target) : target_(std::clamp(target,0,127)),in_(std::max(1u,std::bit_cast<std::uint32_t>(fadeIn))),out_(std::max(1u,std::bit_cast<std::uint32_t>(fadeOut))) {}
void SoundFade::volume(int level) {level_=target_=std::clamp(level,0,127);}
bool SoundFade::start(bool playing,bool fade) {if(fade)active_=in_;else if(!playing)level_=target_;phase_=fade?Phase::In:Phase::Playing;return !playing;}
bool SoundFade::stop(bool playing,bool fade) {phase_=playing && fade?Phase::Out:Phase::Stopped;if(phase_==Phase::Out)active_=out_;return phase_==Phase::Stopped;}
SoundFade::Action SoundFade::pulse() {
    if(phase_==Phase::In){level_=std::min(target_,level_+active_);if(level_==target_)phase_=Phase::Playing;}
    else if(phase_==Phase::Out){if(level_>=active_)level_-=active_;else{phase_=Phase::Stopped;return Action::Stop;}}
    return Action::None;
}
}
