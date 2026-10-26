// Author: MiYu. Source skin lists, real Miles music and original wall-clock fade cadence.
#include "music.h"
#include <algorithm>
#include <bit>
#include <cctype>

namespace war3 {
namespace {
std::string nativeText(const std::string& value,size_t limit=SIZE_MAX) {return value.substr(0,std::min(value.find('\0'),limit));}
std::string lower(std::string value) {for(auto& c:value)c=char(std::tolower(static_cast<unsigned char>(c)));return value;}
bool due(std::uint32_t now,std::uint32_t target) {return std::bit_cast<std::int32_t>(now-target)>=0;}
std::vector<std::string> tokens(const std::string& value) {std::vector<std::string> result;auto text=nativeText(value);size_t at=0;while(at<text.size()){at=text.find_first_not_of(';',at);if(at==std::string::npos)break;auto end=text.find(';',at);auto part=text.substr(at,end==std::string::npos?end:end-at);if(result.size()>=4096)throw std::runtime_error("Music list exceeds budget");result.push_back(part.substr(0,259));at=end==std::string::npos?text.size():end+1;}return result;}
}
MusicScene::MusicScene(Archives& resources,std::uint32_t seed) : resources_(resources.fork()),random_(seed) {}
void MusicScene::skin(const std::string& name,unsigned version) {if(version>1)throw std::runtime_error("Unsupported classic music version");skin_=nativeText(name,259);version_=version;}
std::optional<std::string> MusicScene::lookup(const std::string& key) {
    if(!skins_){SourceSettings base;base.load(*resources_,"UI\\war3skins.txt");SourceSettings custom;if(auto member=resources_->readCandidates({"war3mapSkin.txt"},ArchiveScope::Map))custom.parse(member->bytes);skins_=std::move(base);custom_=std::move(custom);}
    if(auto value=custom_->entry("CustomSkin",key))return value;if(auto value=skins_->entry(skin_,key))return value;return skins_->entry("Default",key);
}
void MusicScene::map(const std::string& name,bool random,int index) {tracks_.clear();mapName_=nativeText(name,259);mapIndex_=random?-1:index;}
void MusicScene::clear() {map({},true,0);}
void MusicScene::applyVolume() {if(voice_)voice_->volume(muted_?0:std::bit_cast<std::int32_t>(level_));}
void MusicScene::file(const std::string& name,unsigned offset,unsigned fade,bool loop) {
    if(offset>INT_MAX || fade>INT_MAX)throw std::runtime_error("Music offset or fade exceeds supported milliseconds");fade_.reset();pending_.reset();if(voice_ && voice_->playing() && !offset && lower(name)==lower(currentFile_))return;
    voice_.reset();currentFile_=name;paused_=false;auto member=resources_->read(name);if(!member)throw std::runtime_error("Missing music archive member: "+name);auto extension=lower(fs::path(wide(name)).extension().string());voice_=muted_?AudioVoice::silent(member,extension):MilesDevice::open(resources_->root())->digital(member,extension);loop_=loop;level_=fade?0:volume_;applyVolume();voice_->start(loop_);if(offset)voice_->position(offset);if(fade)fade_=Fade{fade,GetTickCount()+50,0,false,false};
}
void MusicScene::list(const std::string& name,std::int32_t index,unsigned offset,unsigned fade) {
    auto source=nativeText(name);map(source,false,index);auto resolved=lookup(source+"_V"+std::to_string(version_));tracks_=tokens(resolved?*resolved:source);if(tracks_.empty())return;selected_=index<0?random_.index(unsigned(tracks_.size())):unsigned(index)%tracks_.size();file(tracks_[selected_],offset,fade,tracks_.size()==1);
}
void MusicScene::play(const std::string& name,unsigned offset,unsigned fade) {update();list(name,-1,offset,fade);}
void MusicScene::stop(bool fade) {update();fade_.reset();pending_.reset();if(!voice_ || !voice_->playing())return;if(fade)fade_=Fade{1000,GetTickCount()+50,0,true,false};else{voice_->pause();paused_=true;}}
void MusicScene::resume() {update();if(voice_){if(!voice_->playing()){fade_.reset();pending_.reset();level_=volume_;applyVolume();voice_->resume();paused_=false;}}else if(tracks_.empty()){if(!mapName_.empty()){auto name=mapName_;auto index=mapIndex_;list(name,index,0,0);}}else file(tracks_.at(selected_),0,0,tracks_.size()==1);}
void MusicScene::volume(std::uint32_t value) {update();volume_=std::min(value,127u);level_=value;applyVolume();}
void MusicScene::position(unsigned value) {update();if(voice_)voice_->position(value);}
void MusicScene::muted(bool value) {update();muted_=value;if(!value && voice_ && voice_->silent()){auto position=voice_->milliseconds().first;bool playing=voice_->playing(),paused=paused_;auto name=currentFile_;voice_.reset();file(name,position,0,loop_);if(!playing)voice_->pause();paused_=paused;}applyVolume();}
unsigned MusicScene::fadeLevel(unsigned volume,unsigned elapsed,unsigned duration,bool out) {if(!duration)throw std::runtime_error("Zero music fade duration");float ratio=static_cast<float>(elapsed)/static_cast<float>(duration);float scaled=ratio*static_cast<float>(volume);auto value=static_cast<unsigned>(scaled);return out?volume-value:value;}
void MusicScene::update(std::uint32_t now) {
    if(fade_ && due(now,fade_->next)){auto& fade=*fade_;fade.next=now+50;if(!fade.begun){fade.begun=true;fade.start=now;}else{auto elapsed=now-fade.start;if(elapsed>fade.duration){bool out=fade.out;fade_.reset();if(out){if(voice_)voice_->pause();paused_=true;}else{level_=volume_;applyVolume();}}else{level_=fadeLevel(volume_,elapsed,fade.duration,fade.out);applyVolume();}}}
    if(pending_ && due(now,pending_->due)){auto name=pending_->file;file(name,0,0,tracks_.size()==1);}
    if(voice_ && !voice_->playing() && !paused_ && !loop_ && !pending_){fade_.reset();if(tracks_.empty()){if(!mapName_.empty()){auto name=mapName_;auto index=mapIndex_;list(name,index,0,0);}}else{voice_.reset();if(tracks_.size()>1){selected_=(selected_+1)%tracks_.size();pending_=Pending{tracks_[selected_],now+20000};}}}
}
}
