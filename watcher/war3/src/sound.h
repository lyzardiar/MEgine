// Author: MiYu. Original MIDI sound definitions and live session-owned Miles voices.
#pragma once
#include "audio.h"
#include "slk.h"
#include "sound_fade.h"
#include "volume_ramp.h"
#include <array>
#include <functional>

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
    std::weak_ptr<ScriptSound> detachedPlayback;
    std::shared_ptr<const Member> digital;
    std::string extension,eax;
    bool looping=true,spatial=false,stopWhenOutOfRange=false;
    int duration=-1;
    float pitch=1,minDistance=0,maxDistance=10000,cutoff=10000;
    std::array<float,3> position{},velocity{},orientation{};
    bool positionSet=false;
    std::uint32_t attachedUnit=0;
    bool spatialStopped=false;
    std::array<float,2> cone{360,360};
    int outsideVolume=127;
    std::optional<SourceTable::Row> labelParameters;
};
class SoundScene {
    std::unique_ptr<Archives> resources_;
    SourceTable midi_,environments_;
    std::shared_ptr<MilesDevice> device_;
    std::vector<std::weak_ptr<ScriptSound>> sounds_;
    std::vector<std::shared_ptr<ScriptSound>> detached_;
    std::optional<SourceTable::Row> environment_;
    std::optional<std::vector<SourceTable::Row>> labels_;
    std::array<VolumeRamp,8> groups_{};
    struct StackedArea {float x=0,y=0,width=0,height=0;std::uint32_t unit=0;};
    struct Stacked {std::weak_ptr<ScriptSound> sound;std::vector<StackedArea> areas;std::unique_ptr<AudioVoice> voice;};
    std::vector<Stacked> stacked_;
    std::array<float,3> listener_{},listenerRight_{1,0,0};
    bool listenerSet_=false;
    bool muted_=false;
    const double* simulationTime_=nullptr;
    bool groupsAnimating_=false;
    std::uint64_t nextPulse_=0;
    void collect();
    void detach(const std::shared_ptr<ScriptSound>& sound);
    void applyVolume(ScriptSound& sound);
    float groupGain(const ScriptSound& sound) const;
    float spatialGain(const ScriptSound& sound) const;
    int spatialPan(float x,float y,float z) const;
    const SourceTable::Row& label(const std::string& name);
public:
    explicit SoundScene(Archives& resources,const double* simulationTime=nullptr);
    MidiDefinition definition(const std::string& label) const;
    std::shared_ptr<ScriptSound> midi(const std::string& label,int fadeIn,int fadeOut);
    std::shared_ptr<ScriptSound> digital(const std::string& file,bool loop,bool spatial,bool stopOutOfRange,int fadeIn,int fadeOut,const std::string& eax);
    void parameters(const std::shared_ptr<ScriptSound>& sound,const std::string& label);
    std::shared_ptr<ScriptSound> fromLabel(const std::string& name,bool loop,bool spatial,bool stopOutOfRange,int fadeIn,int fadeOut);
    unsigned duration(const std::shared_ptr<ScriptSound>& sound);
    void pitch(const std::shared_ptr<ScriptSound>& sound,float ratio);
    void environment(const std::string& name);
    const std::optional<SourceTable::Row>& environment() const {return environment_;}
    void muted(bool value);
    void start(const std::shared_ptr<ScriptSound>& sound,bool fade=false);
    void stop(const std::shared_ptr<ScriptSound>& sound,bool kill,bool fade);
    void releaseWhenDone(const std::shared_ptr<ScriptSound>& sound);
    void volume(const std::shared_ptr<ScriptSound>& sound,int level);
    void channel(const std::shared_ptr<ScriptSound>& sound,unsigned channel);
    void groupVolume(unsigned group,float level);
    void resetGroups();
    void registerStacked(const std::shared_ptr<ScriptSound>& sound,bool byPosition,float width,float height);
    void unregisterStacked(const std::shared_ptr<ScriptSound>& sound,bool byPosition,float width,float height);
    void listener(float x,float y,float z,std::array<float,3> right={1,0,0});
    void updateAttachments(const std::function<std::optional<std::array<float,3>>(std::uint32_t)>& resolve);
    void pulse();
    void update();
    size_t voices() const {return device_?device_->voices():0;}
    size_t banks() const {return device_?device_->banks():0;}
};
}
