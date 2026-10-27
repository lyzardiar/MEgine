// Author: MiYu. Live invisibility, source detection ranges and shared vision drive native, command, AI and rendering consumers.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}int cell(float value){return int(std::clamp(std::floor(double(value)/512),double(INT_MIN),double(INT_MAX)));}}
bool ScriptSession::unitInvisible(std::uint32_t id){
    if(!alive(id,NativeKind::Unit))return false;auto u=units_.at(id);if(u->removing || u->hidden() || number(u->life)<=0)return false;for(auto& [buff,b]:u->buffs)if(b.kind==BuffKind::Invisibility && b.fadeRemaining<=0 && b.remaining>0)return true;for(auto [ability,level]:passiveAbilities(*u)){auto& p=passiveInfo(ability,level);if(p.kind!=PassiveKind::PermanentInvisibility)continue;auto available=config_.players[u->owner].abilityAvailable.find(ability);if(available!=config_.players[u->owner].abilityAvailable.end() && !available->second)continue;if(simulationTime_-u->stealthLastAction>=(u->hero?p.heroDuration:p.duration) && !u->cast && !u->combat.windup)return true;}return false;
}
void ScriptSession::breakInvisibility(UnitState& u){u.stealthLastAction=simulationTime_;for(auto it=u.buffs.begin();it!=u.buffs.end();)if(it->second.kind==BuffKind::Invisibility){releaseBuff(it->second);it=u.buffs.erase(it);}else ++it;}
bool ScriptSession::stealthAcquire(const UnitState& u){if(!unitInvisible(u.handle))return true;for(auto& [id,b]:u.buffs)if(b.kind==BuffKind::Invisibility && b.fadeRemaining<=0)return false;for(auto [ability,level]:passiveAbilities(u)){auto& p=passiveInfo(ability,level);if(p.kind==PassiveKind::PermanentInvisibility && p.amount!=0)return true;}return false;}
void ScriptSession::updateDetectors(){
    if(detectorTime_==simulationTime_ && detectorFogRevision_==fogRevision_ && detectorUnits_==units_.size())return;detectors_.clear();wideDetectors_.clear();for(auto& [id,u]:units_)if(!u->removing && !u->hidden() && !u->construction && number(u->life)>0){for(auto [ability,level]:passiveAbilities(*u)){auto& p=passiveInfo(ability,level);if(p.kind!=PassiveKind::Detection || p.area<=0 || !unsigned(p.amount))continue;auto available=config_.players[u->owner].abilityAvailable.find(ability);if(available!=config_.players[u->owner].abilityAvailable.end() && !available->second)continue;Detector d{u->owner,unsigned(p.amount),number(u->x),number(u->y),p.area};for(auto viewer:u->visionPlayers)d.vision|=1u<<viewer;if(d.range>2048){wideDetectors_.push_back(d);continue;}int left=cell(d.x-d.range),right=cell(d.x+d.range),bottom=cell(d.y-d.range),top=cell(d.y+d.range);for(std::int64_t x=left;x<=right;++x)for(std::int64_t y=bottom;y<=top;++y)detectors_[{int(x),int(y)}].push_back(d);}}
    detectorTime_=simulationTime_;detectorFogRevision_=fogRevision_;detectorUnits_=units_.size();
}
bool ScriptSession::detection(std::uint32_t id,unsigned owner,unsigned mask){
    if(owner>=16)throw std::runtime_error("Detection player outside classic range");if(!alive(id,NativeKind::Unit))return false;auto u=units_.at(id);if(u->removing || u->hidden() || number(u->life)<=0)return false;updateDetectors();float x=number(u->x),y=number(u->y);auto covers=[&](const Detector& d){if(!(d.mask&mask) || (d.owner!=owner && !(d.vision&(1u<<owner)) && !(config_.players[d.owner].alliances[owner]&(1u<<5))))return false;float dx=x-d.x,dy=y-d.y;return dx*dx+dy*dy<=d.range*d.range;};if(auto found=detectors_.find({cell(x),cell(y)});found!=detectors_.end())for(auto& d:found->second)if(covers(d))return true;for(auto& d:wideDetectors_)if(covers(d))return true;return false;
}
bool ScriptSession::unitDetected(std::uint32_t id,unsigned owner){return detection(id,owner,3);}
bool ScriptSession::unitInvisibleTo(std::uint32_t id,unsigned owner){
    if(owner>=16)throw std::runtime_error("Visibility player outside classic range");if(!unitInvisible(id))return false;auto u=units_.at(id);if(u->owner==owner || u->visionPlayers.contains(owner) || (config_.players[u->owner].alliances[owner]&(1u<<5)))return false;return !detection(id,owner,1);
}
bool ScriptSession::unitVisibleTo(std::uint32_t id,unsigned owner){
    if(owner>=16)throw std::runtime_error("Visibility player outside classic range");if(!alive(id,NativeKind::Unit))return false;auto u=units_.at(id);if(u->removing || u->hidden())return false;if(u->owner==owner || u->visionPlayers.contains(owner) || (config_.players[u->owner].alliances[owner]&(1u<<5)))return true;return fog(owner).state({u->x,u->y})==4 && !unitInvisibleTo(id,owner);
}
}
