// Author: MiYu. Source Shadow Meld transitions, independent reveal areas and player-scoped dust buffs consume live sessions.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}}
void ScriptSession::cancelShadowMeld(UnitState& u){u.shadowMeld.reset();}
void ScriptSession::startShadowMeld(std::uint32_t id,const SpellInfo& s){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);if(s.nightOnly && requireWorld().clock().daytime())return;u->shadowNight=!requireWorld().clock().daytime();u->shadowMeld=ShadowMeldState{s.ability,s.level,u->owner,s.amount,s.nightOnly,true};u->route.clear();u->waypoint=0;u->holding=true;
}
void ScriptSession::stealthTick(double delta){
    bool night=!requireWorld().clock().daytime();for(auto& [id,u]:units_){bool transition=u->shadowNight!=night;u->shadowNight=night;auto ability=sourceAbility(*u,"Ashm");if(!ability.first)ability=sourceAbility(*u,"Ahid");if(!ability.first || u->removing || u->hidden() || u->construction || u->unsummon || number(u->life)<=0){cancelShadowMeld(*u);continue;}auto& s=spellInfo(ability.first,ability.second);auto available=config_.players[u->owner].abilityAvailable.find(ability.first);if((s.nightOnly && !night) || (available!=config_.players[u->owner].abilityAvailable.end() && !available->second)){cancelShadowMeld(*u);continue;}
        bool casting=u->cast && u->cast->spell.kind!=SpellKind::ShadowMeld;bool busy=u->waypoint<u->route.size() || u->combat.target || u->combat.attackMove || casting || u->buildOrder || u->workingOn || u->repair || u->gather.phase!=GatherOrder::Phase::None;if(busy || u->stunned()){cancelShadowMeld(*u);continue;}if(u->paused)continue;if(!u->shadowMeld || u->shadowMeld->ability!=ability.first || u->shadowMeld->owner!=u->owner || u->shadowMeld->level!=ability.second)u->shadowMeld=ShadowMeldState{ability.first,ability.second,u->owner,transition?s.secondary:s.loss,s.nightOnly};u->shadowMeld->remaining=std::max(0.,u->shadowMeld->remaining-delta);
    }
    for(auto it=revealAreas_.begin();it!=revealAreas_.end();)if(it->second.expires<=simulationTime_){it=revealAreas_.erase(it);++fogRevision_;}else ++it;
}
void ScriptSession::addReveal(unsigned owner,const SpellInfo& s,WorldPoint point){
    if(owner>=16 || !s.detectionMask || s.detectionMask>3 || s.duration<=0 || !std::isfinite(s.duration) || s.duration>86400 || s.area<0 || s.area>100000)throw std::runtime_error("Invalid reveal definition");if(revealAreas_.size()>=4096 || revealTicket_==UINT64_MAX)throw std::runtime_error("Active reveal area budget exceeded");point=requireWorld().clamp(point);revealAreas_.emplace(++revealTicket_,RevealArea{owner,s.detectionMask,point,s.area,simulationTime_+s.duration,s.wholeReveal});++fogRevision_;
}
void ScriptSession::dustSpell(std::uint32_t source,const SpellInfo& s,WorldPoint point,unsigned owner){
    if(!s.buff || owner>=16)throw std::runtime_error("Dust requires a source buff and player");auto targets=spellTargets(source,s,point,owner);for(auto id:targets){if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->removing || u->hidden() || number(u->life)<=0)continue;auto duration=u->hero?s.heroDuration:s.duration;if(duration<=0)continue;auto& buff=u->buffs[s.buff];bool fresh=!buff.id;buff.id=s.buff;buff.source=source;buff.kind=BuffKind::Detection;buff.remaining=std::max(buff.remaining,double(duration));buff.positive=false;buff.physical=true;buff.detection[owner]={s.detectionMask,duration};if(fresh){auto visual=s;visual.ability=s.buff;buff.visuals=spellVisual(visual,"TargetArt",id,{u->x,u->y},false);}}
}
}
