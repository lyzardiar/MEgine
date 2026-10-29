// Author: MiYu. Eat Tree claims a real destructable, tears it after the source delay and then grants timed recovery.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
bool ScriptSession::eatTreeTarget(const UnitState& u,std::uint32_t id,bool visibility){
    if(!alive(id,NativeKind::Destructable))return false;auto tree=destructables_.at(id);if(!tree->tree || !tree->visible || tree->removed || tree->life<=0 || tree->invulnerable)return false;auto claim=eatenTrees_.find(id);return (claim==eatenTrees_.end() || claim->second.first==u.handle) && (!visibility || fog(u.owner).state(tree->position)==4);
}
void ScriptSession::startEatTree(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);if(!eatTreeTarget(*u,cast.target,false)){cancelCast(*u);return;}eatenTrees_[cast.target]={id,cast.ticket};u->eatTree=EatTreeState{cast.spell,cast.target,cast.ticket};u->cast->phase=CastOrder::Phase::Channel;u->animation="Spell Eat Tree";u->animationTime=0;++u->animationGeneration;u->animationIndex.reset();u->animationQueue.clear();u->route.clear();u->waypoint=0;eatTreeActors_.insert(id);
}
void ScriptSession::cancelEatTree(UnitState& u,std::uint64_t ticket){if(!u.eatTree || u.eatTree->ticket!=ticket)return;auto state=*u.eatTree;u.eatTree.reset();eatTreeActors_.erase(u.handle);auto found=eatenTrees_.find(state.tree);if(found!=eatenTrees_.end() && found->second==std::pair{u.handle,ticket})eatenTrees_.erase(found);}
void ScriptSession::eatTreesTick(double delta){
    std::vector<std::uint32_t> actors(eatTreeActors_.begin(),eatTreeActors_.end());for(auto id:actors){if(!alive(id,NativeKind::Unit)){eatTreeActors_.erase(id);continue;}auto u=units_.at(id);if(!u->eatTree){eatTreeActors_.erase(id);continue;}auto state=*u->eatTree;auto active=[&]{return alive(id,NativeKind::Unit) && !u->removing && number(u->life)>0 && u->eatTree && u->eatTree->ticket==state.ticket && u->cast && u->cast->ticket==state.ticket;};if(!active()){cancelEatTree(*u,state.ticket);continue;}if(u->paused)continue;if(u->stunned() || u->morphed() || u->hidden()){cancelCast(*u);continue;}u->eatTree->elapsed+=delta;
        if(!u->eatTree->ripped && u->eatTree->elapsed>=state.spell.castDelay){if(!eatTreeTarget(*u,state.tree,false)){cancelCast(*u);continue;}u->eatTree->ripped=true;destructableLife(state.tree,0);if(!active())continue;auto visuals=spellVisual(state.spell,"Specialart",id,{u->x,u->y},false);u->cast->visuals.insert(u->cast->visuals.end(),visuals.begin(),visuals.end());}
        if(!active() || u->eatTree->elapsed<state.spell.channelTime)continue;cancelEatTree(*u,state.ticket);applyBuff(id,id,state.spell,BuffKind::EatTree,true);if(!alive(id,NativeKind::Unit))continue;auto found=u->buffs.find(state.spell.buff);if(found!=u->buffs.end() && found->second.kind==BuffKind::EatTree){found->second.positive=true;found->second.healRate=state.spell.loss/state.spell.duration;}finishCast(id,state.ticket);
    }
}
}
