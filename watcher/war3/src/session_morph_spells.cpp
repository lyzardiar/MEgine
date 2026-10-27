// Author: MiYu. Source creature forms and Cyclone effects preserve unit identity while actual actions and rendering consume temporary states.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}}
std::shared_ptr<const MorphAppearance> ScriptSession::morphAppearance(std::uint32_t type){
    if(auto found=morphAppearances_.find(type);found!=morphAppearances_.end())return found->second;auto& data=definitions();if(!data.contains(type))throw std::runtime_error("Unknown source morph form");auto form=std::make_shared<MorphAppearance>();form->type=type;form->model=data.field(type,"UnitUI","file");form->icon=data.field(type,"Profile","Art");if(auto comma=form->icon.find(',');comma!=std::string::npos)form->icon.resize(comma);form->scale=data.number(type,"UnitUI","modelScale",1);float speed=data.number(type,"UnitBalance","spd");if(form->model.empty() || form->model=="_" || !std::isfinite(form->scale) || form->scale<=0 || form->scale>100 || !std::isfinite(speed) || speed<0 || speed>100000)throw std::runtime_error("Invalid source morph model, scale or speed");form->speed=real(speed);morphAppearances_[type]=form;return form;
}
void ScriptSession::morphEffect(std::uint32_t source,std::uint32_t id,const SpellInfo& s){
    if(!alive(source,NativeKind::Unit) || !alive(id,NativeKind::Unit))return;auto u=units_.at(id);unsigned group=u->movementType=="fly"?1:u->movementType=="amph"?2:(u->movementType=="float" || u->movementType=="swim")?3:0;auto& types=s.morphTypes[group];if(types.empty())throw std::runtime_error("Missing source morph movement form");auto form=morphAppearance(types[types.size()==1?0:random()%types.size()]);applyBuff(id,source,s,BuffKind::Morph);if(!alive(id,NativeKind::Unit))return;auto found=u->buffs.find(s.buff);if(found==u->buffs.end() || found->second.kind!=BuffKind::Morph)return;found->second.form=std::move(form);found->second.applied=++spellTicket_;auto applied=found->second.applied;spellVisual(s,"Specialart",id,{u->x,u->y});if(!cancelCombat(*u) || !alive(id,NativeKind::Unit))return;found=u->buffs.find(s.buff);if(found==u->buffs.end() || found->second.applied!=applied)return;u->route.clear();u->waypoint=0;u->currentOrder=0;u->animation.clear();u->animationIndex.reset();u->animationQueue.clear();u->animationTime=0;++fogRevision_;
}
void ScriptSession::cycloneEffect(std::uint32_t source,std::uint32_t id,const SpellInfo& s){
    if(!alive(source,NativeKind::Unit) || !alive(id,NativeKind::Unit))return;auto u=units_.at(id);applyBuff(id,source,s,BuffKind::Cyclone);if(!alive(id,NativeKind::Unit))return;auto found=u->buffs.find(s.buff);if(found==u->buffs.end() || found->second.kind!=BuffKind::Cyclone)return;auto& b=found->second;b.dispellable=s.dispellable;b.applied=++spellTicket_;b.carrierAttachment=definitions().field(s.buff,"Profile","Targetattach",definitions().field(s.guardBuff,"Profile","Effectattach","sprite,first"));auto visual=s;visual.ability=s.guardBuff;auto effects=spellVisual(visual,"Effectart",id,{u->x,u->y},false);if(effects.empty())throw std::runtime_error("Cyclone requires a source carrier effect");for(auto effect:effects){auto e=effects_.at(effect);e->attachment.clear();e->groundAnchor=true;}b.visuals.insert(b.visuals.end(),effects.begin(),effects.end());if(!cancelCombat(*u) || !alive(id,NativeKind::Unit))return;u->route.clear();u->waypoint=0;u->currentOrder=0;u->animation.clear();u->animationIndex.reset();u->animationQueue.clear();u->animationTime=0;++fogRevision_;
}
}
