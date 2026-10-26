// Author: MiYu. Source weather definitions and session-owned region/enabled state.
#include "session.h"

namespace war3 {
void ScriptSession::bindWeatherNatives() {
    bind("AddWeatherEffect","weathereffect",{"rect","integer"},[this](auto&,auto args){auto region=std::get<WorldRect>(object(args[0],NativeKind::Rect).state);if(!weather_)weather_=SourceTable::read(requireWorld().resources(),"TerrainArt\\Weather.slk");auto id=ObjectData::name(args[1].bits);for(auto& row:weather_->rows()){auto found=row.find(weather_->idColumn());if(found!=row.end() && found->second==id){auto state=std::make_shared<WeatherState>();state->type=args[1].bits;state->region=region;state->definition=row;auto handle=create(NativeKind::Weather);std::get<std::shared_ptr<WeatherState>>(object(handle,NativeKind::Weather).state)=std::move(state);return handle;}}throw std::runtime_error("Unknown source weather effect: "+id);});
    bind("EnableWeatherEffect","nothing",{"weathereffect","boolean"},[this](auto& vm,auto args){if(args[0].bits)std::get<std::shared_ptr<WeatherState>>(object(args[0],NativeKind::Weather).state)->enabled=args[1].bits!=0;return vm.nothing();});
    bind("RemoveWeatherEffect","nothing",{"weathereffect"},[this](auto& vm,auto args){destroy(args[0],NativeKind::Weather);return vm.nothing();});
}
}
