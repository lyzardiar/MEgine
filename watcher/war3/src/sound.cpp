// Author: MiYu. Resolve source labels, preserve sound parameters and release independent playback owners.
#include "sound.h"
#include <algorithm>
#include <charconv>
#include <cmath>
#include <cctype>

namespace war3 {
namespace {
std::string lower(std::string text) {for(auto& c:text)c=char(std::tolower(static_cast<unsigned char>(c)));return text;}
std::string field(const SourceTable::Row& row,const char* name,const std::string& fallback={}) {auto found=row.find(name);return found==row.end() || found->second.empty() || found->second=="_"?fallback:found->second;}
int integer(const SourceTable::Row& row,const char* name,int fallback) {auto text=field(row,name,std::to_string(fallback));int result=0;auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),result);if(error!=std::errc{} || end!=text.data()+text.size())throw std::runtime_error("Invalid sound integer: "+std::string(name));return result;}
float real(const SourceTable::Row& row,const char* name,float fallback) {auto text=field(row,name,std::to_string(fallback));float result=0;auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),result);if(error!=std::errc{} || end!=text.data()+text.size() || !std::isfinite(result))throw std::runtime_error("Invalid sound real: "+std::string(name));return result;}
std::string path(std::string directory,std::string file) {if(directory.empty() || file.empty())throw std::runtime_error("Missing MIDI source path");std::string result;for(auto c:directory+"\\"+file){if(c=='/')c='\\';if(c!='\\' || result.empty() || result.back()!='\\')result+=c;}return result;}
}
SoundScene::SoundScene(Archives& resources) : resources_(resources.fork()),midi_(SourceTable::read(*resources_,"UI\\SoundInfo\\MIDISounds.slk")),environments_(SourceTable::read(*resources_,"UI\\SoundInfo\\EnvironmentSounds.slk")) {}
MidiDefinition SoundScene::definition(const std::string& label) const {
    auto key=lower(label);for(auto& row:midi_.rows())if(lower(field(row,"SoundLabel"))==key){MidiDefinition value;value.label=field(row,"SoundLabel");auto directory=field(row,"DirectoryBase");value.sequence=path(directory,field(row,"MIDIFileName"));value.bank=path(directory,field(row,"DLSFileName"));value.volume=integer(row,"Volume",127);value.priority=integer(row,"Priority",0);value.channel=integer(row,"Channel",0);value.pitch=real(row,"Pitch",1);value.radius=real(row,"Radius",0);value.flags=field(row,"Flags");if(value.volume<0 || value.volume>127 || value.channel<0 || value.channel>15)throw std::runtime_error("Sound definition outside supported range");return value;}throw std::runtime_error("Unknown MIDI sound label: "+label);
}
void SoundScene::collect() {std::erase_if(sounds_,[](auto& value){return value.expired();});std::erase_if(detached_,[](auto& voice){return !(voice->status()&4);});}
std::shared_ptr<ScriptSound> SoundScene::midi(const std::string& label,int fadeIn,int fadeOut) {
    collect();auto definition=this->definition(label);if(definition.pitch!=1)throw std::runtime_error("MIDI pitch control is not implemented");auto sequence=resources_->read(definition.sequence),bank=resources_->read(definition.bank);if(!sequence || !bank)throw std::runtime_error("MIDI sound source or DLS bank missing: "+label);if(!device_)device_=MilesDevice::open(resources_->root());auto sound=std::make_shared<ScriptSound>();sound->definition=std::move(definition);sound->fadeIn=fadeIn;sound->fadeOut=fadeOut;sound->voice=device_->midi(sequence,bank);sound->voice->volume(muted_?0:sound->definition.volume);sounds_.push_back(sound);return sound;
}
void SoundScene::environment(const std::string& name) {auto key=lower(name);for(auto& row:environments_.rows())if(lower(field(row,"EnvironmentType"))==key){environment_=row;return;}throw std::runtime_error("Unknown source sound environment: "+name);}
void SoundScene::muted(bool value) {muted_=value;collect();for(auto& weak:sounds_)if(auto sound=weak.lock();sound && sound->voice)sound->voice->volume(value?0:sound->definition.volume);}
void SoundScene::start(const std::shared_ptr<ScriptSound>& sound) {
    collect();if(!sound || sound->retired)return;if(sound->fadeIn!=0)throw std::runtime_error("Script sound fade-in is not implemented");if(sound->definition.flags.find("CHANNELFULLPREEMPT")!=std::string::npos)for(auto& weak:sounds_)if(auto other=weak.lock();other && other!=sound && other->voice && other->definition.channel==sound->definition.channel)other->voice->stop();sound->voice->volume(muted_?0:sound->definition.volume);sound->voice->start(true);
}
void SoundScene::stop(const std::shared_ptr<ScriptSound>& sound,bool kill,bool fade) {collect();if(!sound || sound->retired)return;if(fade && sound->fadeOut!=0)throw std::runtime_error("Script sound fade-out is not implemented");sound->voice->stop();if(kill){sound->voice.reset();sound->retired=true;}}
void SoundScene::releaseWhenDone(const std::shared_ptr<ScriptSound>& sound) {collect();if(!sound || sound->retired)return;if(sound->voice->status()&4)detached_.push_back(std::move(sound->voice));else sound->voice.reset();sound->retired=true;}
void SoundScene::volume(const std::shared_ptr<ScriptSound>& sound,int level) {if(!sound || sound->retired)return;sound->definition.volume=std::clamp(level,0,127);sound->voice->volume(muted_?0:sound->definition.volume);}
}
