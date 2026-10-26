// Author: MiYu. Typed JASS MIDI sound handles backed by real source definitions and Miles resources.
#include "session.h"
#include <bit>
#include <cmath>

namespace war3 {
SoundScene& ScriptSession::requireAudio() {if(!audio_){audio_=std::make_unique<SoundScene>(requireWorld().resources());audio_->muted(audioMuted_);}return *audio_;}
void ScriptSession::audioMuted(bool muted) {audioMuted_=muted;if(audio_)audio_->muted(muted);if(music_)music_->muted(muted);}
void ScriptSession::updateAudio() {if(audio_)audio_->update();if(music_)music_->update();}
void ScriptSession::bindSoundNatives() {
    auto sound=[this](jass::Value handle)->std::shared_ptr<ScriptSound>{updateAudio();if(!handle.bits)return {};return std::get<std::shared_ptr<ScriptSound>>(object(handle,NativeKind::Sound).state);};
    auto text=[](const jass::Value& value){return value.text?*value.text:std::string{};};
    bind("NewSoundEnvironment","nothing",{"string"},[this,text](auto& vm,auto args){requireAudio().environment(text(args[0]));return vm.nothing();});
    bind("CreateMIDISound","sound",{"string","integer","integer"},[this,text](auto&,auto args){auto value=requireAudio().midi(text(args[0]),std::bit_cast<std::int32_t>(args[1].bits),std::bit_cast<std::int32_t>(args[2].bits));auto handle=create(NativeKind::Sound);std::get<std::shared_ptr<ScriptSound>>(object(handle,NativeKind::Sound).state)=std::move(value);return handle;});
    bind("CreateSound","sound",{"string","boolean","boolean","boolean","integer","integer","string"},[this,text](auto&,auto args){auto value=requireAudio().digital(text(args[0]),args[1].bits!=0,args[2].bits!=0,args[3].bits!=0,std::bit_cast<std::int32_t>(args[4].bits),std::bit_cast<std::int32_t>(args[5].bits),text(args[6]));auto handle=create(NativeKind::Sound);std::get<std::shared_ptr<ScriptSound>>(object(handle,NativeKind::Sound).state)=std::move(value);return handle;});
    bind("CreateSoundFilenameWithLabel","sound",{"string","boolean","boolean","boolean","integer","integer","string"},[this,text](auto&,auto args){auto value=requireAudio().digital(text(args[0]),args[1].bits!=0,args[2].bits!=0,args[3].bits!=0,std::bit_cast<std::int32_t>(args[4].bits),std::bit_cast<std::int32_t>(args[5].bits),{});requireAudio().parameters(value,text(args[6]));auto handle=create(NativeKind::Sound);std::get<std::shared_ptr<ScriptSound>>(object(handle,NativeKind::Sound).state)=std::move(value);return handle;});
    bind("SetSoundParamsFromLabel","nothing",{"sound","string"},[this,sound,text](auto& vm,auto args){requireAudio().parameters(sound(args[0]),text(args[1]));return vm.nothing();});
    bind("StartSound","nothing",{"sound"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().start(value);return vm.nothing();});
    bind("StopSound","nothing",{"sound","boolean","boolean"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().stop(value,args[1].bits!=0,args[2].bits!=0);return vm.nothing();});
    bind("KillSoundWhenDone","nothing",{"sound"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().releaseWhenDone(value);return vm.nothing();});
    bind("GetSoundIsPlaying","boolean",{"sound"},[sound](auto& vm,auto args){auto value=sound(args[0]);return vm.boolean(value && value->voice && value->voice->playing());});
    bind("GetSoundIsLoading","boolean",{"sound"},[sound](auto& vm,auto args){sound(args[0]);return vm.boolean(false);});
    bind("GetSoundDuration","integer",{"sound"},[this,sound](auto& vm,auto args){return vm.integer(int(requireAudio().duration(sound(args[0]))));});
    bind("SetSoundVolume","nothing",{"sound","integer"},[this,sound](auto& vm,auto args){auto value=sound(args[0]);if(value)requireAudio().volume(value,std::bit_cast<std::int32_t>(args[1].bits));return vm.nothing();});
    bind("SetSoundPlayPosition","nothing",{"sound","integer"},[sound](auto& vm,auto args){auto value=sound(args[0]);if(value && value->voice)value->voice->position(args[1].bits);return vm.nothing();});
    bind("SetSoundDuration","nothing",{"sound","integer"},[sound](auto& vm,auto args){auto value=sound(args[0]);if(args[1].bits>INT_MAX)throw std::runtime_error("Invalid sound duration");if(value && !value->retired)value->duration=int(args[1].bits);return vm.nothing();});
    bind("SetSoundPitch","nothing",{"sound","real"},[this,sound](auto& vm,auto args){requireAudio().pitch(sound(args[0]),std::bit_cast<float>(args[1].bits));return vm.nothing();});
    bind("SetSoundChannel","nothing",{"sound","integer"},[sound](auto& vm,auto args){auto value=sound(args[0]);if(args[1].bits>15)throw std::runtime_error("Invalid sound channel");if(value && !value->retired)value->definition.channel=int(args[1].bits);return vm.nothing();});
    auto numeric=[](jass::Value value){auto result=std::bit_cast<float>(value.bits);if(!std::isfinite(result))throw std::runtime_error("Non-finite sound parameter");return result;};
    bind("SetSoundDistanceCutoff","nothing",{"sound","real"},[sound,numeric](auto& vm,auto args){auto value=sound(args[0]);auto cutoff=numeric(args[1]);if(cutoff<0)throw std::runtime_error("Negative sound distance cutoff");if(value && !value->retired)value->cutoff=cutoff;return vm.nothing();});
    bind("SetSoundDistances","nothing",{"sound","real","real"},[sound,numeric](auto& vm,auto args){auto value=sound(args[0]);auto minimum=numeric(args[1]),maximum=numeric(args[2]);if(minimum<0 || maximum<minimum)throw std::runtime_error("Invalid sound distance interval");if(value && !value->retired){value->minDistance=minimum;value->maxDistance=maximum;}return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,std::array<float,3> ScriptSound::*>>{{"SetSoundPosition",&ScriptSound::position},{"SetSoundVelocity",&ScriptSound::velocity},{"SetSoundConeOrientation",&ScriptSound::orientation}})bind(name,"nothing",{"sound","real","real","real"},[sound,numeric,member](auto& vm,auto args){auto value=sound(args[0]);std::array<float,3> coordinates{numeric(args[1]),numeric(args[2]),numeric(args[3])};if(value && !value->retired)value.get()->*member=coordinates;return vm.nothing();});
    bind("SetSoundConeAngles","nothing",{"sound","real","real","integer"},[sound,numeric](auto& vm,auto args){auto value=sound(args[0]);auto inside=numeric(args[1]),outside=numeric(args[2]);if(inside<0 || outside<inside || outside>360 || args[3].bits>127)throw std::runtime_error("Invalid sound cone");if(value && !value->retired){value->cone={inside,outside};value->outsideVolume=int(args[3].bits);}return vm.nothing();});
}
}
