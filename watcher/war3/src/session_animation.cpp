// Author: MiYu. Advance queued unit animations on the fixed simulation clock.
#include "session.h"
#include <bit>

namespace war3 {
const std::vector<mdx::Sequence>& ScriptSession::sequencesForModel(const std::string& model){
    auto name=mdx::modelPath(model);auto found=animationSequences_.find(name);
    if(found==animationSequences_.end()){
        std::vector<mdx::Sequence> sequences;auto member=requireWorld().resources().read(name);if(member){try{sequences=mdx::readSequences(member->bytes);}catch(const std::runtime_error&){}}
        found=animationSequences_.emplace(std::move(name),std::move(sequences)).first;
    }
    return found->second;
}
void ScriptSession::updateUnitAnimation(UnitState& u){
    if(u.animationQueue.empty() || u.displayModel().empty())return;auto& sequences=sequencesForModel(u.displayModel());if(sequences.empty())return;int index=-1;
    if(u.animationIndex && *u.animationIndex<sequences.size())index=int(*u.animationIndex);
    else if(!u.animationIndex){auto life=std::bit_cast<float>(u.life.bits());auto animation=u.animation.empty()?(life<=0?std::string("Death"):!u.rooted() && !u.stunned() && u.waypoint<u.route.size()?std::string("Walk"):std::string("Stand")):u.animation;auto carry=life>0 && u.animation.empty()?(u.carriedGold?" Gold":u.carriedLumber?" Lumber":""):"";index=mdx::findSequence(sequences,u.sequenceName(animation+carry));if(index<0)index=mdx::findSequence(sequences,u.sequenceName(animation));if(index<0)index=mdx::findSequence(sequences,animation);}
    if(index<0)index=mdx::findSequence(sequences,u.animationIndex?"Stand":u.sequenceName("Stand"));if(index<0)index=0;auto duration=std::int64_t(sequences[index].end)-sequences[index].start;if(duration<=0 || u.animationTime*1000<double(duration))return;
    u.animation=u.animationQueue.front();u.animationQueue.erase(u.animationQueue.begin());u.animationIndex.reset();u.animationTime=0;
}
void ScriptSession::updateDestructableAnimations(){
    for(auto it=animatedDestructables_.begin();it!=animatedDestructables_.end();){auto found=destructables_.find(*it);if(found==destructables_.end() || found->second->removed || found->second->animationQueue.empty()){it=animatedDestructables_.erase(it);continue;}auto& d=*found->second;if(d.model.empty()){++it;continue;}auto& sequences=sequencesForModel(d.model);if(sequences.empty()){++it;continue;}auto animation=d.animation.empty()?(d.life>0?"Stand":"Death"):d.animation.c_str();int index=mdx::findSequence(sequences,animation);if(index<0)index=mdx::findSequence(sequences,"Stand");if(index<0)index=0;auto duration=std::int64_t(sequences[index].end)-sequences[index].start;double elapsed=(simulationTime_-d.animationStart)*1000*d.animationRate;if(duration>0)if(auto visual=doodad(d.doodadIndex);visual && visual->randomStart==d.animationStart && visual->randomAnimation==animation)elapsed+=visual->randomPhase%std::uint64_t(duration);if(duration>0 && ((d.initialDead && d.animation.empty()) || elapsed>=double(duration))){d.animation=d.animationQueue.front();d.animationQueue.erase(d.animationQueue.begin());d.animationStart=simulationTime_;}if(d.animationQueue.empty())it=animatedDestructables_.erase(it);else ++it;}
}
}
