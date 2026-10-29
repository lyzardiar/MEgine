// Author: MiYu. Fixed simulation ticks drive timer callbacks and registered time events.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
jass::Real real(double value) {return jass::Real::fromBits(std::bit_cast<std::uint32_t>(float(value)));}
bool limit(float value,float target,unsigned operation) {switch(operation){case 0:return value<target;case 1:return value<=target;case 2:return value==target;case 3:return value>=target;case 4:return value>target;case 5:return value!=target;default:throw std::runtime_error("Unknown time limit operation");}}
}
void ScriptSession::advance(double elapsed) {
    if(!mainStarted())throw std::runtime_error("Simulation requires started map main");if(!std::isfinite(elapsed) || elapsed<0 || elapsed>60)throw std::runtime_error("Invalid simulation elapsed interval");if(simulationPaused_){updateAudio();return;}accumulator_+=elapsed;
    try{while(accumulator_>=1./32 && !simulationPaused_){accumulator_-=1./32;tick(1./32);}if(simulationPaused_)accumulator_=0;}catch(...){failed_=true;throw;}updateAudio();
}
void ScriptSession::tick(double delta) {
    aurasTick(delta);moveUnits(delta);waygateTick();playerOrderQueueTick();rescueTick();spatialEvents();if(++fogTicks_%4==0)++fogRevision_;for(auto& [id,item]:items_)if(item->holder && units_.contains(item->holder)){item->x=units_.at(item->holder)->x;item->y=units_.at(item->holder)->y;}
    auto previous=requireWorld().clock().time();simulationTime_+=delta;checkSelectionSyncTimeout();updateDestructableAnimations();textTagsTick(delta);runtime_.threadClock(simulationTime_);pointDamageTick();heroUltimatesTick(delta);unitCastersTick(delta);buffsTick(delta);wardsTick(delta);spiritSplitsTick(delta);firelordTick(delta);lavaSpawnsTick(delta);healingSpraysTick(delta);tinkerTick(delta);ambientPassivesTick(delta);siegeFiresTick(delta);phoenixFireTick(delta);selfSpellsTick(delta);spellsTick(delta);concoctionsTick(delta);stampedeTick(delta);locustsTick(delta);unitFormsTick(delta);militiaTick(delta);deathRestartsTick(delta);rootsTick(delta);eatTreesTick(delta);warClubsTick(delta);stealthTick(delta);mobilityTick(delta);transportTick(delta);devourTick(delta);corpsesTick(delta);unsummonTick(delta);effectsTick();ubersplatTick(delta);attackLightningsTick();lightningTick();constructionTick(delta);buildingUpgrades(delta);repairTick(delta);blightGrowth(delta);combat(delta);harvestTick(delta);timedLives(delta);restock();production(delta);requireWorld().clock().advance(real(delta));regenerate(delta);clockChange(previous,requireWorld().clock().time(),true);std::vector<std::uint32_t> timers,events;
    for(auto id:timerHandles_)if(alive(id,NativeKind::Timer)){auto& timer=std::get<Timer>(objects_[id-handleBase].state);if(timer.running){timer.elapsed=real(std::min(double(std::bit_cast<float>(timer.timeout.bits())),simulationTime_-timer.started));if(timer.due<=simulationTime_)timers.push_back(id);}}for(auto id:eventHandles_)if(alive(id,NativeKind::Event))events.push_back(id);
    for(auto id:timers){if(!alive(id,NativeKind::Timer))continue;auto timer=std::get<Timer>(objects_[id-handleBase].state);if(!timer.running || timer.due>simulationTime_)continue;auto& state=std::get<Timer>(objects_[id-handleBase].state);if(state.periodic){auto interval=std::max(double(std::bit_cast<float>(state.timeout.bits())),1./32);state.started=simulationTime_;state.due+=interval;state.elapsed={};}else state.running=false;ScriptContext context;context.expiredTimer=id;contexts_.push_back(context);struct Pop {std::vector<ScriptContext>& values;~Pop(){values.pop_back();}}guard{contexts_};if(timer.callback.bits)runtime_.start(timer.callback);for(auto eventId:events)if(alive(eventId,NativeKind::Event)){auto event=std::get<ScriptEvent>(objects_[eventId-handleBase].state);if(event.kind==ScriptEvent::Kind::TimerExpire && event.target==id)fire(eventId,context);}}
    for(auto id:events){if(!alive(id,NativeKind::Event))continue;auto event=std::get<ScriptEvent>(objects_[id-handleBase].state);if(event.kind==ScriptEvent::Kind::Timer && event.due<=simulationTime_){auto& state=std::get<ScriptEvent>(objects_[id-handleBase].state);state.due=state.periodic?state.due+state.interval:INFINITY;fire(id);}}
    runtime_.advanceThreads(simulationTime_);aiTick();
}
void ScriptSession::clockChange(jass::Real before,jass::Real after,bool cyclic) {
    auto previous=std::bit_cast<float>(before.bits()),current=std::bit_cast<float>(after.bits());if(previous==current)return;std::vector<std::uint32_t> events;for(auto id:eventHandles_)if(alive(id,NativeKind::Event) && std::get<ScriptEvent>(objects_[id-handleBase].state).kind==ScriptEvent::Kind::Clock)events.push_back(id);auto direction=cyclic?std::bit_cast<float>(requireWorld().clock().rate().bits()):current-previous;
    for(auto id:events){if(!alive(id,NativeKind::Event))continue;auto event=std::get<ScriptEvent>(objects_[id-handleBase].state);auto target=std::bit_cast<float>(event.limit.bits());bool crossed=!limit(previous,target,event.comparison) && limit(current,target,event.comparison);if(event.comparison==2){if(direction>0)crossed=previous<=current?(previous<target && current>=target):(target>previous || target<=current);else if(direction<0)crossed=previous>=current?(previous>target && current<=target):(target<previous || target>=current);else crossed=false;}if(crossed)fire(id);}
}
}
