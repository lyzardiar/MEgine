// Author: MiYu. Original MIDI sound definitions and live session-owned Miles voices.
#pragma once
#include "audio.h"
#include "slk.h"
#include "sound_fade.h"

namespace war3 {
struct MidiDefinition {
    std::string label,sequence,bank,flags;
    int volume=127,priority=0,channel=0;
    float pitch=1,radius=0;
};
struct ScriptSound {
    MidiDefinition definition;
    int fadeIn=0,fadeOut=0;
    bool retired=false;
    SoundFade fade;
    std::unique_ptr<AudioVoice> voice;
};
class SoundScene {
    std::unique_ptr<Archives> resources_;
    SourceTable midi_,environments_;
    std::shared_ptr<MilesDevice> device_;
    std::vector<std::weak_ptr<ScriptSound>> sounds_;
    std::vector<std::shared_ptr<ScriptSound>> detached_;
    std::optional<SourceTable::Row> environment_;
    bool muted_=false;
    std::uint64_t nextPulse_=0;
    void collect();
    void detach(const std::shared_ptr<ScriptSound>& sound);
    void applyVolume(ScriptSound& sound);
public:
    explicit SoundScene(Archives& resources);
    MidiDefinition definition(const std::string& label) const;
    std::shared_ptr<ScriptSound> midi(const std::string& label,int fadeIn,int fadeOut);
    void environment(const std::string& name);
    const std::optional<SourceTable::Row>& environment() const {return environment_;}
    void muted(bool value);
    void start(const std::shared_ptr<ScriptSound>& sound,bool fade=false);
    void stop(const std::shared_ptr<ScriptSound>& sound,bool kill,bool fade);
    void releaseWhenDone(const std::shared_ptr<ScriptSound>& sound);
    void volume(const std::shared_ptr<ScriptSound>& sound,int level);
    void pulse();
    void update();
    size_t voices() const {return device_?device_->voices():0;}
    size_t banks() const {return device_?device_->banks():0;}
};
}
