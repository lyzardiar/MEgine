// Author: MiYu. Typed music configuration, actual playback and archive-backed ownership.
#include "session.h"
#include <bit>

namespace war3 {
MusicScene& ScriptSession::requireMusic() {if(!music_){music_=std::make_unique<MusicScene>(requireWorld().resources());music_->localGain(localMusicGain_);music_->muted(audioMuted_);}return *music_;}
MusicScene& ScriptSession::requireThematicMusic() {if(!thematicMusic_){thematicMusic_=std::make_unique<MusicScene>(requireWorld().resources());thematicMusic_->localGain(localMusicGain_);thematicMusic_->muted(audioMuted_);}return *thematicMusic_;}
void ScriptSession::bindMusicNatives() {
    auto text=[](const jass::Value& value){return value.text?*value.text:std::string{};};
    bind("SetMapMusic","nothing",{"string","boolean","integer"},[this,text](auto& vm,auto args){requireMusic().map(text(args[0]),args[1].bits!=0,std::bit_cast<std::int32_t>(args[2].bits));return vm.nothing();});
    bind("ClearMapMusic","nothing",{},[this](auto& vm,auto){requireMusic().clear();return vm.nothing();});
    bind("PlayMusic","nothing",{"string"},[this,text](auto& vm,auto args){requireMusic().play(text(args[0]));return vm.nothing();});
    bind("PlayMusicEx","nothing",{"string","integer","integer"},[this,text](auto& vm,auto args){requireMusic().play(text(args[0]),args[1].bits,args[2].bits);return vm.nothing();});
    bind("StopMusic","nothing",{"boolean"},[this](auto& vm,auto args){requireMusic().stop(args[0].bits!=0);return vm.nothing();});
    bind("ResumeMusic","nothing",{},[this](auto& vm,auto){requireMusic().resume();return vm.nothing();});
    bind("SetMusicVolume","nothing",{"integer"},[this](auto& vm,auto args){requireMusic().volume(args[0].bits);return vm.nothing();});
    bind("SetMusicPlayPosition","nothing",{"integer"},[this](auto& vm,auto args){requireMusic().position(args[0].bits);return vm.nothing();});
    auto startThematic=[this,text](jass::Value value,unsigned offset){if(music_ && music_->voice() && music_->voice()->playing()){resumeMapAfterThematic_=true;music_->stop(false);}requireThematicMusic().thematic(text(value),offset);};
    bind("PlayThematicMusic","nothing",{"string"},[startThematic](auto& vm,auto args){startThematic(args[0],0);return vm.nothing();});
    bind("PlayThematicMusicEx","nothing",{"string","integer"},[startThematic](auto& vm,auto args){startThematic(args[0],args[1].bits);return vm.nothing();});
    bind("EndThematicMusic","nothing",{},[this](auto& vm,auto){if(thematicMusic_)thematicMusic_->stop(false);if(resumeMapAfterThematic_ && music_)music_->resume();resumeMapAfterThematic_=false;return vm.nothing();});
    bind("SetThematicMusicPlayPosition","nothing",{"integer"},[this](auto& vm,auto args){if(thematicMusic_)thematicMusic_->position(args[0].bits);return vm.nothing();});
}
}
