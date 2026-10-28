// Author: MiYu. Source script messages and string conversions consumed by the native HUD and chat triggers.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cctype>

namespace war3 {
void ScriptSession::displayText(unsigned owner,float x,float y,double duration,std::string message) {if(owner>=16 || !std::isfinite(x) || !std::isfinite(y) || !std::isfinite(duration) || duration<0 || message.size()>65536)throw std::runtime_error("Invalid script text message");std::erase_if(texts_,[&](auto& t){return t.expires<=simulationTime_;});if(texts_.size()>=128)texts_.erase(texts_.begin());texts_.push_back({owner,x,y,simulationTime_+duration,std::move(message)});}
void ScriptSession::bindTextNatives() {
    bind("SetCreepCampFilterState","nothing",{"boolean"},[this](auto& vm,auto a){requireWorld().environment().creepCampFilter=a[0].bits!=0;return vm.nothing();});
    bind("GetCreepCampFilterState","boolean",{},[this](auto& vm,auto){return vm.boolean(requireWorld().environment().creepCampFilter);});
    auto text=[](jass::Value v){return v.text?*v.text:std::string{};};
    bind("ShowInterface","nothing",{"boolean","real"},[this](auto& vm,auto a){auto duration=std::bit_cast<float>(a[1].bits);if(!std::isfinite(duration))throw std::runtime_error("Invalid interface transition duration");interfaceFrom_=interfaceAmount();interfaceVisible_=a[0].bits!=0;interfaceChanged_=simulationTime_;interfaceDuration_=std::max(0.f,duration);return vm.nothing();});
    bind("SetCinematicScene","nothing",{"integer","playercolor","string","string","real","real"},[this,text](auto& vm,auto a){auto duration=std::bit_cast<float>(a[4].bits),voice=std::bit_cast<float>(a[5].bits);if(!std::isfinite(duration) || !std::isfinite(voice))throw std::runtime_error("Invalid cinematic scene duration");ScriptCinematicScene scene;scene.portrait=a[0].bits;scene.color=a[1].bits;scene.speaker=mapString(text(a[2]),strings_);scene.dialogue=mapString(text(a[3]),strings_);if(scene.speaker.size()>65536 || scene.dialogue.size()>65536)throw std::runtime_error("Cinematic scene text exceeds budget");scene.started=simulationTime_;scene.expires=simulationTime_+std::max(0.f,duration);scene.voiceUntil=simulationTime_+std::max(0.f,voice);if(scene.portrait && definitions().contains(scene.portrait)){auto source=definitions().field(scene.portrait,"UnitUI","file");if(!source.empty() && source!="_"){auto extension=fs::path(wide(source)).extension().wstring();if(extension==L".mdl" || extension==L".MDL" || extension==L".mdx" || extension==L".MDX")source.resize(source.size()-4);auto portrait=source+"_Portrait.mdx";scene.model=requireWorld().resources().readCandidates({portrait})?portrait:source+".mdx";}}cinematicScene_=std::move(scene);return vm.nothing();});
    bind("EndCinematicScene","nothing",{},[this](auto& vm,auto){cinematicScene_.reset();return vm.nothing();});
    bind("I2S","string",{"integer"},[](auto& vm,auto a){return vm.string(std::to_string(std::bit_cast<std::int32_t>(a[0].bits)));});
    bind("R2S","string",{"real"},[](auto& vm,auto a){auto value=std::bit_cast<float>(a[0].bits);if(!std::isfinite(value))throw std::runtime_error("Non-finite real string conversion");char buffer[128];std::snprintf(buffer,sizeof(buffer),"%.3f",value);return vm.string(buffer);});
    bind("R2SW","string",{"real","integer","integer"},[](auto& vm,auto a){auto value=std::bit_cast<float>(a[0].bits);if(!std::isfinite(value))throw std::runtime_error("Non-finite formatted real");int width=std::clamp(std::bit_cast<std::int32_t>(a[1].bits),-64,64),precision=std::clamp(std::bit_cast<std::int32_t>(a[2].bits),0,32);char buffer[256];std::snprintf(buffer,sizeof(buffer),"%*.*f",width,precision,value);return vm.string(buffer);});
    bind("S2I","integer",{"string"},[text](auto& vm,auto a){auto value=text(a[0]);return vm.integer(std::int32_t(std::strtol(value.c_str(),nullptr,10)));});
    bind("S2R","real",{"string"},[text](auto& vm,auto a){auto value=text(a[0]);auto result=std::strtof(value.c_str(),nullptr);if(!std::isfinite(result))throw std::runtime_error("Non-finite string real conversion");return vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(result)));});
    bind("StringLength","integer",{"string"},[text](auto& vm,auto a){return vm.integer(int(text(a[0]).size()));});
    bind("SubString","string",{"string","integer","integer"},[text](auto& vm,auto a){auto value=text(a[0]);auto start=std::clamp(std::bit_cast<std::int32_t>(a[1].bits),0,int(value.size())),end=std::clamp(std::bit_cast<std::int32_t>(a[2].bits),start,int(value.size()));return vm.string(value.substr(start,end-start));});
    bind("StringCase","string",{"string","boolean"},[text](auto& vm,auto a){auto value=text(a[0]);for(auto& c:value)if(static_cast<unsigned char>(c)<128)c=char(a[1].bits?std::toupper(static_cast<unsigned char>(c)):std::tolower(static_cast<unsigned char>(c)));return vm.string(std::move(value));});
    bind("DisplayTextToPlayer","nothing",{"player","real","real","string"},[this,text](auto& vm,auto a){displayText(playerId(a[0]),std::bit_cast<float>(a[1].bits),std::bit_cast<float>(a[2].bits),10,text(a[3]));return vm.nothing();});
    for(auto name:{"DisplayTimedTextToPlayer","DisplayTimedTextFromPlayer"})bind(name,"nothing",{"player","real","real","real","string"},[this,text](auto& vm,auto a){displayText(playerId(a[0]),std::bit_cast<float>(a[1].bits),std::bit_cast<float>(a[2].bits),std::bit_cast<float>(a[3].bits),text(a[4]));return vm.nothing();});
    bind("ClearTextMessages","nothing",{},[this](auto& vm,auto){texts_.clear();return vm.nothing();});
    bind("SetSkyModel","nothing",{"string"},[this,text](auto& vm,auto a){requireWorld().environment().skyModel=text(a[0]);return vm.nothing();});
}
}
