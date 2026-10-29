// Author: MiYu. Grab Tree claims a real destructable and drives a finite source siege weapon and held tree model.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
void ScriptSession::warClubInfo(SpellInfo& s){
    auto field=[&](const char* key){return definitions().number(s.ability,"AbilityData",std::string(key)+std::to_string(s.level));};s.clubAttachDelay=s.amount;s.clubRemoveDelay=s.secondary;float disabled=s.loss,enabled=field("DataD"),attacks=field("DataE");
    if(!s.buff || s.clubAttachDelay<0 || s.clubAttachDelay>300 || s.clubRemoveDelay<0 || s.clubRemoveDelay>300 || disabled<0 || disabled>1 || disabled!=std::floor(disabled) || enabled<0 || enabled>1 || enabled!=std::floor(enabled) || disabled==enabled || attacks<1 || attacks>65536 || attacks!=std::floor(attacks))throw std::runtime_error("Grab Tree source delay, weapon indices or attack count outside supported range");s.clubDisabledWeapon=unsigned(disabled);s.clubEnabledWeapon=unsigned(enabled);s.clubAttacks=unsigned(attacks);s.animation="Spell Eat Tree";
}
void ScriptSession::startGrabTree(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);if(!eatTreeTarget(*u,cast.target,false)){cancelCast(*u);return;}eatenTrees_[cast.target]={id,cast.ticket};u->grabTree=GrabTreeState{cast.spell,cast.target,cast.ticket};u->cast->phase=CastOrder::Phase::Channel;u->animation=cast.spell.animation;u->animationTime=0;++u->animationGeneration;u->animationIndex.reset();u->route.clear();u->waypoint=0;warClubActors_.insert(id);
}
void ScriptSession::cancelGrabTree(UnitState& u,std::uint64_t ticket){
    if(!u.grabTree || u.grabTree->ticket!=ticket)return;auto tree=u.grabTree->tree;u.grabTree.reset();auto found=eatenTrees_.find(tree);if(found!=eatenTrees_.end() && found->second==std::pair{u.handle,ticket})eatenTrees_.erase(found);if(!u.warClub)warClubActors_.erase(u.handle);
}
void ScriptSession::clearWarClub(UnitState& u,bool cancelGrab){
    if(cancelGrab && u.grabTree)cancelGrabTree(u,u.grabTree->ticket);if(u.warClub){auto state=*u.warClub;u.warClub.reset();if(auto buff=u.buffs.find(state.spell.buff);buff!=u.buffs.end() && buff->second.kind==BuffKind::WarClub){releaseBuff(buff->second);u.buffs.erase(buff);}destroyEffect(state.visual);effects_.erase(state.visual);}if(!u.grabTree)warClubActors_.erase(u.handle);
}
void ScriptSession::warClubAttack(UnitState& u,unsigned slot){
    if(!u.warClub || u.warClub->dropping || slot!=u.warClub->spell.clubEnabledWeapon || !u.warClub->attacks)return;if(!--u.warClub->attacks){u.warClub->dropping=true;u.warClub->elapsed=0;}
}
void ScriptSession::warClubsTick(double delta){
    std::vector<std::uint32_t> actors(warClubActors_.begin(),warClubActors_.end());for(auto id:actors){if(!alive(id,NativeKind::Unit)){warClubActors_.erase(id);continue;}auto u=units_.at(id);if(u->removing || number(u->life)<=0){clearWarClub(*u);continue;}if(u->paused)continue;
        if(u->warClub){auto& state=*u->warClub;auto known=u->abilities.find(state.spell.ability);auto buff=u->buffs.find(state.spell.buff);if(known==u->abilities.end() || known->second<=0 || buff==u->buffs.end() || buff->second.kind!=BuffKind::WarClub)clearWarClub(*u,false);else if(state.dropping){state.elapsed+=delta;if(state.elapsed>=state.spell.clubRemoveDelay)clearWarClub(*u,false);}}
        if(!u->grabTree)continue;auto state=*u->grabTree;auto death=u->deathRevision,ownership=u->ownerRevision;auto active=[&]{return alive(id,NativeKind::Unit) && !u->removing && number(u->life)>0 && u->deathRevision==death && u->ownerRevision==ownership && u->grabTree && u->grabTree->ticket==state.ticket && u->cast && u->cast->ticket==state.ticket;};if(!active()){cancelGrabTree(*u,state.ticket);continue;}if(u->stunned() || u->silenced() || u->morphed() || u->hidden() || !u->abilities.contains(state.spell.ability) || u->abilities.at(state.spell.ability)<=0){cancelCast(*u);continue;}u->grabTree->elapsed+=delta;if(u->grabTree->elapsed<state.spell.clubAttachDelay)continue;if(!eatTreeTarget(*u,state.tree,false)){cancelCast(*u);continue;}auto tree=destructables_.at(state.tree);u->grabTree->consumed=true;destructableLife(state.tree,0);if(!active())continue;
        clearWarClub(*u,false);if(auto old=u->buffs.find(state.spell.buff);old!=u->buffs.end()){releaseBuff(old->second);u->buffs.erase(old);}WarClubState held;held.spell=state.spell;held.attacks=state.spell.clubAttacks;auto visual=createEffect(tree->model,{u->x,u->y},id,"hand,right",false);held.visual=visual.bits;if(visual.bits){auto effect=effects_.at(visual.bits);effect->scale=(tree->scale[0]+tree->scale[1]+tree->scale[2])/3;effect->replacement=tree->replacement;effect->texture=tree->texture;}u->warClub=held;UnitBuff buff;buff.id=state.spell.buff;buff.kind=BuffKind::WarClub;buff.source=buff.target=id;buff.ability=buff.originAbility=state.spell.ability;buff.sourceLevel=state.spell.level;buff.sourceOwner=u->owner;buff.positive=buff.physical=buff.persistent=true;buff.dispellable=false;if(held.visual)buff.visuals.push_back(held.visual);u->buffs[buff.id]=std::move(buff);cancelGrabTree(*u,state.ticket);warClubActors_.insert(id);finishCast(id,state.ticket);
    }
}
}
