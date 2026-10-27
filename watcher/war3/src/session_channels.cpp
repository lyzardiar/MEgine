// Author: MiYu. Source channel schedules, cancellable pulses and independent ground effects consume shared live state.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <sstream>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}
std::string levelArt(const std::string& source,unsigned level){std::stringstream input(source);std::vector<std::string> models;std::string model;while(std::getline(input,model,',')){auto first=model.find_first_not_of(" \t\"");models.push_back(first==std::string::npos?"":model.substr(first,model.find_last_not_of(" \t\"")-first+1));}return models.empty()?"":models[std::min(size_t(level?level-1:0),models.size()-1)];}
}
void ScriptSession::releaseCastVisuals(CastOrder& cast){if(cast.spell.kind==SpellKind::Cannibalize)releaseCorpseClaim(cast.target,cast.caster,cast.ticket);for(auto id:cast.visuals)destroyEffect(id);cast.visuals.clear();}
void ScriptSession::finishCast(std::uint32_t id,std::uint64_t ticket) {
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);if(!u->cast || u->cast->ticket!=ticket)return;auto cast=*u->cast;spellEvent(id,cast,3);
    if(!alive(id,NativeKind::Unit) || !u->cast || u->cast->ticket!=ticket)return;u->cast.reset();++u->castRevision;u->currentOrder=0;u->animation.clear();u->animationTime=0;releaseCastVisuals(cast);auto revision=u->castRevision,combatRevision=u->combat.revision;spellEvent(id,cast,4);
    if(cast.resume && alive(id,NativeKind::Unit) && !u->cast && u->castRevision==revision && u->combat.revision==combatRevision && !u->currentOrder && !u->paused && !u->stunned() && !u->hidden() && !u->removing && number(u->life)>0 && u->owner==cast.owner){auto resume=*cast.resume;resume.windup.reset();resume.revision=u->combat.revision+1;resume.nextAttack=std::max(resume.nextAttack,u->combat.nextAttack);resume.repath=0;u->combat=std::move(resume);u->currentOrder=cast.resumeOrder;u->holding=cast.resumeHolding;}
}
void ScriptSession::startChannel(std::uint32_t id) {
    auto u=units_.at(id);if(!u->cast)return;auto& cast=*u->cast;auto& s=cast.spell;cast.phase=CastOrder::Phase::Channel;cast.channelElapsed=0;cast.nextPulse=s.period;cast.nextArt=s.artPeriod;cast.pulses=0;
    auto add=[&](const SpellInfo& visual,const char* field,std::uint32_t target,WorldPoint point){auto ids=spellVisual(visual,field,target,point,false);cast.visuals.insert(cast.visuals.end(),ids.begin(),ids.end());};
    add(s,"CasterArt",id,{u->x,u->y});if(s.kind==SpellKind::Channel){if(cast.target)add(s,"TargetArt",cast.target,cast.point);add(s,"EffectArt",s.targeting==SpellTargeting::None?id:0,cast.point);}else if(s.effectAlias && s.kind!=SpellKind::Blizzard){auto visual=s;visual.ability=s.effectAlias;add(visual,"EffectArt",s.targeting==SpellTargeting::None?id:0,cast.point);}
    if(s.channelTime<=0)finishCast(id,cast.ticket);
}
void ScriptSession::persistentSpellPulse(std::uint32_t source,const SpellInfo& s,WorldPoint point,unsigned owner,float amount,bool percent,std::optional<std::uint64_t> ticket) {
    auto active=[&]{if(!alive(source,NativeKind::Unit))return false;auto u=units_.at(source);return !u->removing && (!ticket || (!u->paused && !u->stunned() && !u->hidden() && number(u->life)>0 && u->owner==owner && u->cast && u->cast->ticket==*ticket));};
    if(!active())return;auto caster=units_.at(source);auto victims=spellTargets(source,s,point,owner);float allocated=0;
    for(auto id:victims){
        if(!active())return;if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(!spellTarget(*caster,*u,s,false,owner))continue;float value=percent?number(u->maxLife)*amount:amount;if(s.maxDamage>0)value=std::min(value,std::max(0.f,s.maxDamage-allocated));if(value<=0)continue;allocated+=value;if(u->building)value*=s.buildingFactor;
        if(s.kind==SpellKind::Tranquility)unitLife(runtime_.handle("unit",id),real(number(u->life)+spellHealAmount(*u,value)));else damageUnit(source,id,value,0,percent?26:14);
        if(!active())return;if(alive(id,NativeKind::Unit)){auto mark=s;mark.duration=mark.heroDuration=std::max(.0625f,s.period>0?s.period+.03125f:s.burnPeriod+.03125f);applyBuff(id,source,mark,BuffKind::Mark);}
    }
    if(!active() || (!s.allowed.contains("tree") && !s.allowed.contains("debris")))return;std::vector<std::pair<float,std::uint32_t>> props;
    for(auto& [id,d]:destructables_){if(d->removed || d->life<=0 || d->invulnerable || (d->tree?!s.allowed.contains("tree"):!s.allowed.contains("debris")))continue;float distance=std::hypot(number(d->position.x)-number(point.x),number(d->position.y)-number(point.y));if(distance<=s.area+d->radius)props.emplace_back(distance,id);}std::sort(props.begin(),props.end());
    for(auto [distance,id]:props){if(!active())return;if(!alive(id,NativeKind::Destructable))continue;auto d=destructables_.at(id);if(d->removed || d->life<=0 || d->invulnerable)continue;float value=percent?d->maxLife*amount:amount;destructableLife(id,d->life-value);}
}
void ScriptSession::channelPulse(std::uint32_t id,const CastOrder& cast) {
    auto& s=cast.spell;if(s.kind==SpellKind::Channel)return;
    if(s.kind==SpellKind::Blizzard && s.effectAlias){auto visual=s;visual.ability=s.effectAlias;std::uint32_t noise=std::uint32_t(cast.ticket)^std::uint32_t(cast.pulses*2654435761u);for(unsigned i=0;i<s.shards;++i){noise=noise*1664525u+1013904223u;float angle=float(noise&0xffff)*6.28318530718f/65536;noise=noise*1664525u+1013904223u;float radius=std::sqrt(float(noise&0xffff)/65535)*s.area;spellVisual(visual,"EffectArt",0,{real(number(cast.point.x)+std::cos(angle)*radius),real(number(cast.point.y)+std::sin(angle)*radius)});}}
    persistentSpellPulse(id,s,cast.point,cast.owner,s.kind==SpellKind::Blizzard?s.amount+s.extraDamage*s.period:s.amount,s.kind==SpellKind::DeathDecay,cast.ticket);
}
void ScriptSession::channelTick(std::uint32_t id,double delta) {
    if(units_.at(id)->cast->spell.kind==SpellKind::Cannibalize){cannibalizeTick(id,delta);return;}
    auto u=units_.at(id);auto ticket=u->cast->ticket;auto valid=[&]{return alive(id,NativeKind::Unit) && u->cast && u->cast->ticket==ticket && !u->paused && !u->stunned() && !u->removing && !u->hidden() && number(u->life)>0 && u->owner==u->cast->owner;};
    u->cast->channelElapsed=std::min(u->cast->channelElapsed+delta,double(u->cast->spell.channelTime));auto s=u->cast->spell;
    while(valid() && s.period>0 && u->cast->nextPulse<=u->cast->channelElapsed+1e-7){u->cast->nextPulse+=s.period;++u->cast->pulses;auto cast=*u->cast;channelPulse(id,cast);}
    if(!valid())return;
    if(s.kind==SpellKind::Channel && s.artPeriod>0 && u->cast->nextArt<=u->cast->channelElapsed+1e-7 && u->cast->channelElapsed<s.channelTime){auto& cast=*u->cast;cast.nextArt=(std::floor(cast.channelElapsed/s.artPeriod)+1)*s.artPeriod;releaseCastVisuals(cast);auto add=[&](const char* field,std::uint32_t target){auto ids=spellVisual(s,field,target,cast.point,false);cast.visuals.insert(cast.visuals.end(),ids.begin(),ids.end());};add("CasterArt",id);if(cast.target)add("TargetArt",cast.target);add("EffectArt",s.targeting==SpellTargeting::None?id:0);}
    if(valid() && u->cast->channelElapsed>=s.channelTime)finishCast(id,ticket);
}
void ScriptSession::groundSpellsTick(double delta) {
    std::vector<std::uint64_t> actors;for(auto& [id,s]:groundSpells_)actors.push_back(id);
    for(auto id:actors){
        auto found=groundSpells_.find(id);if(found==groundSpells_.end())continue;auto ground=std::move(found->second);groundSpells_.erase(found);auto& s=ground.spell;ground.elapsed+=delta;auto clear=[&]{for(auto effect:ground.visuals)destroyEffect(effect);ground.visuals.clear();};
        if(!alive(ground.source,NativeKind::Unit) || units_.at(ground.source)->removing){clear();continue;}
        double elapsed=ground.elapsed-s.castDelay;
        if(elapsed>=0 && !ground.started){clear();ground.started=true;auto model=levelArt(definitions().field(s.ability,"Profile","SpecialArt"),s.level);auto h=createEffect(model,ground.point,0,{},false);if(h.bits)ground.visuals.push_back(h.bits);}
        if(elapsed>=s.fullTime && !ground.burn){clear();ground.burn=true;if(s.effectAlias){auto visual=s;visual.ability=s.effectAlias;ground.visuals=spellVisual(visual,"EffectArt",0,ground.point,false);}}
        while(ground.nextPulse<=ground.elapsed+1e-7 && ground.nextPulse<=s.castDelay+s.duration+1e-7){bool full=ground.nextPulse-s.castDelay<=s.fullTime+1e-7;persistentSpellPulse(ground.source,s,ground.point,ground.owner,full?s.amount:s.extraDamage,false);ground.nextPulse+=full?s.fullPeriod:s.burnPeriod;if(full && ground.nextPulse-s.castDelay>s.fullTime+1e-7)ground.nextPulse=s.castDelay+s.fullTime+s.burnPeriod;}
        if(elapsed>=s.duration || !alive(ground.source,NativeKind::Unit) || units_.at(ground.source)->removing)clear();else groundSpells_.emplace(id,std::move(ground));
    }
}
}
