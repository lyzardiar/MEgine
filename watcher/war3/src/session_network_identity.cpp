// Author: MiYu. Same-build object identities and bounded diagnostic checksum for local LAN experiments.
#include "session.h"
#include <bit>

namespace war3 {
namespace {
std::uint32_t localType(NativeKind kind) {switch(kind){case NativeKind::Unit:return 0x4d330001;case NativeKind::Item:return 0x4d330002;case NativeKind::Destructable:return 0x4d330003;case NativeKind::Trackable:return 0x4d330004;default:return 0;}}
struct Digest {
    std::uint32_t value=2166136261u;
    void word(std::uint32_t input){for(unsigned i=0;i<4;++i){value^=(input>>(8*i))&255u;value*=16777619u;}}
    void wide(std::uint64_t input){word(std::uint32_t(input));word(std::uint32_t(input>>32));}
    void real(float input){word(std::bit_cast<std::uint32_t>(input));}
    void real(double input){wide(std::bit_cast<std::uint64_t>(input));}
};
}
std::optional<std::pair<std::uint32_t,std::uint32_t>> ScriptSession::localNetworkObject(std::uint32_t handle) const {
    if(handle<handleBase || handle-handleBase>=objects_.size())return {};auto& object=objects_[handle-handleBase];auto type=localType(object.kind);if(!object.alive || !object.localNetworkOrdinal || !type)return {};return std::pair{object.localNetworkOrdinal,type};
}
std::optional<std::uint32_t> ScriptSession::localNetworkObject(std::uint32_t ordinal,std::uint32_t type) const {
    if(!ordinal || ordinal>localNetworkObjects_.size())return {};auto handle=localNetworkObjects_[ordinal-1];auto id=localNetworkObject(handle);if(!id || id->first!=ordinal || id->second!=type)return {};return handle;
}
std::uint32_t ScriptSession::localNetworkChecksum() const {
    Digest hash;hash.word(1);hash.word(randomState_);hash.real(simulationTime_);hash.word(std::uint32_t(localNetworkObjects_.size()));
    auto ref=[&](std::uint32_t handle){auto id=localNetworkObject(handle);hash.word(id?id->first:0);hash.word(id?id->second:0);};
    for(auto& player:config_.players){hash.word(player.team);hash.word(player.controller);hash.word(player.race);hash.word(player.slotState);hash.word(player.handicap.bits());for(auto value:player.alliances)hash.word(value);hash.word(std::uint32_t(player.states.size()));for(auto [key,value]:player.states){hash.word(key);hash.word(std::uint32_t(value));}hash.word(std::uint32_t(player.research.size()));for(auto [key,value]:player.research){hash.word(key);hash.word(std::uint32_t(value));}}
    for(auto handle:localNetworkObjects_){auto& object=objects_[handle-handleBase];hash.word(localType(object.kind));hash.word(object.alive);if(!object.alive)continue;
        if(object.kind==NativeKind::Unit){auto u=std::get<std::shared_ptr<UnitState>>(object.state);if(!u){hash.word(0);continue;}hash.word(1);hash.word(u->type);hash.word(u->owner);for(auto value:{u->x,u->y,u->facing,u->life,u->maxLife,u->mana,u->maxMana,u->moveSpeed})hash.word(value.bits());for(auto value:{u->resources,u->level,u->foodUsed,u->foodMade,u->carriedGold,u->carriedLumber,u->experience,u->skillPoints})hash.word(std::uint32_t(value));hash.word(u->paused);hash.word(u->invulnerable);hash.word(u->pathing);hash.word(u->removing);hash.word(u->currentOrder);ref(u->combat.target);ref(u->combat.follow);ref(u->transport);for(auto item:u->inventory)ref(item);hash.word(std::uint32_t(u->abilities.size()));for(auto [id,level]:u->abilities){hash.word(id);hash.word(std::uint32_t(level));}hash.word(std::uint32_t(u->production.size()));for(auto& order:u->production){hash.word(order.type);hash.real(order.elapsed);hash.real(order.duration);hash.word(order.level);hash.word(order.research);hash.word(order.revival);ref(order.hero);}hash.word(std::uint32_t(u->buffs.size()));for(auto& [id,buff]:u->buffs){hash.word(id);hash.word(std::uint32_t(buff.kind));hash.real(buff.remaining);hash.real(buff.period);hash.word(buff.ability);hash.word(buff.stacks);ref(buff.source);}hash.word(std::uint32_t(u->route.size()));for(auto& point:u->route){hash.word(point.x.bits());hash.word(point.y.bits());}hash.wide(u->waypoint);
        }else if(object.kind==NativeKind::Item){auto item=std::get<std::shared_ptr<ItemState>>(object.state);if(!item){hash.word(0);continue;}hash.word(1);hash.word(item->type);hash.word(item->owner);hash.word(item->x.bits());hash.word(item->y.bits());hash.word(item->life.bits());hash.word(item->maxLife.bits());hash.word(std::uint32_t(item->charges));ref(item->holder);
        }else if(object.kind==NativeKind::Destructable){auto d=std::get<std::shared_ptr<DestructableState>>(object.state);if(!d){hash.word(0);continue;}hash.word(1);hash.word(d->type);hash.word(d->position.x.bits());hash.word(d->position.y.bits());hash.real(d->life);hash.real(d->maxLife);hash.word(d->invulnerable);hash.word(d->removed);
        }else if(object.kind==NativeKind::Trackable){auto t=std::get<std::shared_ptr<ScriptTrackable>>(object.state);if(!t){hash.word(0);continue;}hash.word(1);}
    }
    return hash.value;
}
}
