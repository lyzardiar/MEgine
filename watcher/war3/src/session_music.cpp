// Author: MiYu. Typed music configuration, actual playback and archive-backed ownership.
#include "session.h"
#include "snapshot_codec.h"
#include <bit>

namespace war3 {
Bytes ScriptSession::encodeMusicState() const {
    constexpr size_t budget=20u*1024u*1024u;if(!runtime_.snapshotSafe() || failed_ || !world_ || !setupApplied_ || !contexts_.empty() || experimentalSelectionSync_ || !networkPlayers_.empty())throw std::runtime_error("Music snapshot requires a quiescent local session");SnapshotWriter out(budget-64);out.u32(tag("SMUS"));out.u32(1);out.text(world_->resources().mapDigest(),64);out.u64(std::bit_cast<std::uint64_t>(simulationTime_));out.u32(resumeMapAfterThematic_?1:0);auto now=GetTickCount();for(auto* scene:{music_.get(),thematicMusic_.get()}){out.u32(scene?1:0);if(scene){auto bytes=scene->encodeState(now);out.size(bytes.size());out.raw(bytes);}}return sealSnapshot(out.finish(),budget);
}
void ScriptSession::restoreMusicState(std::span<const std::uint8_t> bytes) {
    constexpr size_t budget=20u*1024u*1024u;if(!runtime_.ready() || failed_ || !world_ || !setupApplied_ || mainAttempted_ || musicStateRestored_ || runtime_.threadCount() || !runtime_.inspectExecutions().empty() || !contexts_.empty() || experimentalSelectionSync_ || !networkPlayers_.empty())throw std::runtime_error("Music restore requires a quiescent local session");Binary in(openSnapshot(bytes,budget));in.expect(tag("SMUS"));if(in.u32()!=1 || snapshotText(in,64)!=world_->resources().mapDigest() || snapshotU64(in)!=std::bit_cast<std::uint64_t>(simulationTime_))throw std::runtime_error("Music map or clock differs");auto flag=[&]{auto v=in.u32();if(v>1)throw std::runtime_error("Invalid music state flag");return v!=0;};auto resume=flag();std::array<std::span<const std::uint8_t>,2> data;for(auto& entry:data)if(flag()){auto size=in.u32();if(size<64 || size>8u*1024u*1024u)throw std::runtime_error("Invalid music component size");entry=in.take(size);}in.finish();auto now=GetTickCount();std::unique_ptr<MusicScene> music,thematic;if(!data[0].empty())music=MusicScene::decodeState(world_->resources(),data[0],audioMuted_,localMusicGain_,now);if(!data[1].empty())thematic=MusicScene::decodeState(world_->resources(),data[1],audioMuted_,localMusicGain_,now);if(resume && !music)throw std::runtime_error("Invalid thematic music resume state");music_.swap(music);thematicMusic_.swap(thematic);resumeMapAfterThematic_=resume;musicStateRestored_=true;
}
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
