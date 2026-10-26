// Author: MiYu. Typed JASS MIDI sound handles backed by real source definitions and Miles resources.
#include "session.h"
#include <bit>

namespace war3 {
SoundScene& ScriptSession::requireAudio() {if(!audio_){audio_=std::make_unique<SoundScene>(requireWorld().resources());audio_->muted(audioMuted_);}return *audio_;}
void ScriptSession::audioMuted(bool muted) {audioMuted_=muted;if(audio_)audio_->muted(muted);}
void ScriptSession::bindSoundNatives() {
    auto sound=[this](jass::Value handle)->std::shared_ptr<ScriptSound>{if(!handle.bits)return {};return std::get<std::shared_ptr<ScriptSound>>(object(handle,NativeKind::Sound).state);};
    auto text=[](const jass::Value& value){return value.text?*value.text:std::string{};};
    bind("NewSoundEnvironment","nothing",{"string"},[this,text](auto& vm,auto args){requireAudio().environment(text(args[0]));return vm.nothing();});
    bind("CreateMIDISound","sound",{"string","integer","integer"},[this,text](auto&,auto args){auto value=requireAudio().midi(text(args[0]),std::bit_cast<std::int32_t>(args[1].bits),std::bit_cast<std::int32_t>(args[2].bits));auto handle=create(NativeKind::Sound);std::get<std::shared_ptr<ScriptSound>>(object(handle,NativeKind::Sound).state)=std::move(value);return handle;});
    bind("StartSound","nothing",{"sound"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().start(value);return vm.nothing();});
    bind("StopSound","nothing",{"sound","boolean","boolean"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().stop(value,args[1].bits!=0,args[2].bits!=0);return vm.nothing();});
    bind("KillSoundWhenDone","nothing",{"sound"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().releaseWhenDone(value);return vm.nothing();});
    bind("GetSoundIsPlaying","boolean",{"sound"},[sound](auto& vm,auto args){auto value=sound(args[0]);return vm.boolean(value && value->voice && (value->voice->status()&4));});
    bind("GetSoundIsLoading","boolean",{"sound"},[sound](auto& vm,auto args){sound(args[0]);return vm.boolean(false);});
    bind("GetSoundDuration","integer",{"sound"},[sound](auto& vm,auto args){auto value=sound(args[0]);return vm.integer(value && value->voice?int(value->voice->milliseconds().second):0);});
    bind("SetSoundVolume","nothing",{"sound","integer"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().volume(value,std::bit_cast<std::int32_t>(args[1].bits));return vm.nothing();});
    bind("SetSoundPlayPosition","nothing",{"sound","integer"},[sound](auto& vm,auto args){auto value=sound(args[0]);if(value && value->voice)value->voice->position(args[1].bits);return vm.nothing();});
}
}
