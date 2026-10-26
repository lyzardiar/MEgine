// Author: MiYu. Original unsigned MIDI volume steps and sound-manager transitions.
#pragma once
#include <cstdint>

namespace war3 {
class SoundFade {
public:
    enum class Phase {Stopped,Playing,In,Out};
    enum class Action {None,Stop};
private:
    std::uint32_t level_=0,target_=127,in_=1,out_=1,active_=0;
    Phase phase_=Phase::Stopped;
public:
    SoundFade()=default;
    SoundFade(int fadeIn,int fadeOut,int target);
    std::uint32_t level() const {return level_;}
    std::uint32_t target() const {return target_;}
    std::uint32_t inRate() const {return in_;}
    std::uint32_t outRate() const {return out_;}
    std::uint32_t activeRate() const {return active_;}
    Phase phase() const {return phase_;}
    void volume(int level);
    bool start(bool playing,bool fade=false);
    bool stop(bool playing,bool fade);
    Action pulse();
};
}
