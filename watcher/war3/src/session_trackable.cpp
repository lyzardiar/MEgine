// Author: MiYu. Session-owned script trackables and trigger dispatch.
#include "session.h"
#include <bit>
#include <cmath>

namespace war3 {
void ScriptSession::bindTrackableNatives() {
    bind("CreateTrackable","trackable",{"string","real","real","real"},[this](auto& vm,auto a){auto path=a[0].text?*a[0].text:std::string{};auto x=std::bit_cast<float>(a[1].bits),y=std::bit_cast<float>(a[2].bits),facing=std::bit_cast<float>(a[3].bits);if(path.empty())return vm.handle("trackable",0);if(!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(facing) || trackables_.size()>=8192)throw std::runtime_error("Invalid trackable or trackable budget exceeded");auto value=std::make_shared<ScriptTrackable>();value->model=std::move(path);value->x=x;value->y=y;value->facing=facing;auto id=create(NativeKind::Trackable);std::get<std::shared_ptr<ScriptTrackable>>(object(id,NativeKind::Trackable).state)=value;trackables_.emplace(id.bits,std::move(value));return id;});
    for(auto [name,hit]:std::initializer_list<std::pair<const char*,bool>>{{"TriggerRegisterTrackableHitEvent",true},{"TriggerRegisterTrackableTrackEvent",false}})bind(name,"event",{"trigger","trackable"},[this,hit](auto&,auto a){object(a[0],NativeKind::Trigger);object(a[1],NativeKind::Trackable);ScriptEvent event;event.owner=a[0].bits;event.target=a[1].bits;event.kind=hit?ScriptEvent::Kind::TrackableHit:ScriptEvent::Kind::TrackableTrack;event.event=hit?7:8;auto id=create(NativeKind::Event);std::get<ScriptEvent>(object(id,NativeKind::Event).state)=std::move(event);return id;});
    bind("GetTriggeringTrackable","trackable",{},[this](auto& vm,auto){return vm.handle("trackable",contexts_.empty()?0:contexts_.back().triggeringTrackable);});
}
void ScriptSession::trackableEvent(std::uint32_t id,bool hit) {
    if(!alive(id,NativeKind::Trackable))return;std::vector<std::uint32_t> matches;auto kind=hit?ScriptEvent::Kind::TrackableHit:ScriptEvent::Kind::TrackableTrack;for(auto event:eventHandles_)if(alive(event,NativeKind::Event)){auto& value=std::get<ScriptEvent>(objects_[event-handleBase].state);if(value.kind==kind && value.target==id)matches.push_back(event);}for(auto event:matches){ScriptContext context;context.triggeringTrackable=id;fire(event,context);}
}
}
