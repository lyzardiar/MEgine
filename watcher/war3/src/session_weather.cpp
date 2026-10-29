// Author: MiYu. Source weather definitions and session-owned region/enabled state.
#include "session.h"

namespace war3 {
std::shared_ptr<WeatherState> ScriptSession::makeWeather(std::uint32_t type,WorldRect region) {
    if(!weather_)weather_=SourceTable::read(requireWorld().resources(),"TerrainArt\\Weather.slk");auto id=ObjectData::name(type);for(auto& row:weather_->rows()){auto found=row.find(weather_->idColumn());if(found!=row.end() && found->second==id){auto state=std::make_shared<WeatherState>();state->type=type;state->region=region;state->definition=row;return state;}}throw std::runtime_error("Unknown source weather effect: "+id);
}
void ScriptSession::initializeMapWeather() {auto type=requireWorld().data().info.weather;if(!type || type==UINT32_MAX)return;auto state=makeWeather(type,requireWorld().bounds());state->enabled=true;weatherEffects_.emplace(0,std::move(state));}
void ScriptSession::bindWeatherNatives() {
    bind("AddWeatherEffect","weathereffect",{"rect","integer"},[this](auto&,auto args){auto region=std::get<WorldRect>(object(args[0],NativeKind::Rect).state);auto state=makeWeather(args[1].bits,region);auto handle=create(NativeKind::Weather);std::get<std::shared_ptr<WeatherState>>(object(handle,NativeKind::Weather).state)=state;weatherEffects_.emplace(handle.bits,std::move(state));return handle;});
    bind("EnableWeatherEffect","nothing",{"weathereffect","boolean"},[this](auto& vm,auto args){if(args[0].bits)std::get<std::shared_ptr<WeatherState>>(object(args[0],NativeKind::Weather).state)->enabled=args[1].bits!=0;return vm.nothing();});
    bind("RemoveWeatherEffect","nothing",{"weathereffect"},[this](auto& vm,auto args){if(args[0].bits){object(args[0],NativeKind::Weather);weatherEffects_.erase(args[0].bits);}destroy(args[0],NativeKind::Weather);return vm.nothing();});
}
}
