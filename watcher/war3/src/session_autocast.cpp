// Author: MiYu. Source autocast orders select useful nearby targets and preserve ordinary combat after completion.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <tuple>
#include <unordered_map>

namespace war3 {
namespace {float number(jass::Real v){return std::bit_cast<float>(v.bits());}int cell(float v){return int(std::clamp(std::floor(double(v)/512),double(INT_MIN),double(INT_MAX)));}std::uint64_t key(int x,int y){return (std::uint64_t(std::uint32_t(x))<<32)|std::uint32_t(y);}}
bool ScriptSession::abilityAutocast(std::uint32_t id,std::uint32_t ability,bool active) {
    if(!alive(id,NativeKind::Unit))return false;auto u=units_.at(id);auto found=u->abilities.find(ability);if(found==u->abilities.end() || found->second<=0 || u->paused || u->abilitiesDisabled() || u->silenced() || u->hidden() || u->removing || number(u->life)<=0)return false;auto& s=spellInfo(ability,unsigned(found->second));if(!s.orderOn || !s.orderOff)return false;u->autocast[ability]=active;ScriptContext context;context.issuedOrder=active?s.orderOn:s.orderOff;unitEvent(id,38,75,context);return true;
}
void ScriptSession::autocastTick() {
    if((autocastTicks_++%4)!=0)return;std::unordered_map<std::uint64_t,std::vector<std::uint32_t>> grid;std::set<std::uint32_t> threatened;std::vector<std::uint32_t> actors;for(auto& [id,u]:units_)if(!u->removing && !u->hidden() && number(u->life)>0){grid[key(cell(number(u->x)),cell(number(u->y)))].push_back(id);if(u->combat.target && alive(u->combat.target,NativeKind::Unit) && enemy(u->owner,units_.at(u->combat.target)->owner))threatened.insert(u->combat.target);if(!u->autocast.empty())actors.push_back(id);}
    for(auto id:actors){
        if(!alive(id,NativeKind::Unit))continue;auto u=units_.at(id);if(u->paused || u->abilitiesDisabled() || u->silenced() || u->hidden() || u->removing || u->illusion || number(u->life)<=0 || u->cast || u->construction || u->buildOrder || u->repair || u->workingOn || u->entangleTarget || u->gather.phase!=GatherOrder::Phase::None || !u->route.empty() || u->combat.windup || (u->currentOrder && !u->combat.target && !u->combat.attackMove && !u->holding))continue;
        std::optional<std::tuple<unsigned,float,float,std::uint32_t,std::uint32_t>> best;
        for(auto [ability,on]:u->autocast){if(!on)continue;auto known=u->abilities.find(ability);if(known==u->abilities.end() || known->second<=0)continue;auto& s=spellInfo(ability,unsigned(known->second));if(s.kind==SpellKind::LoadCorpse && s.orderOn && s.orderOff && spellRequirements(u->owner,s) && spellCooldown(id,ability)<=0){if(!corpseTargets(*u,s,{u->x,u->y},s.area).empty() && beginSpell(id,ability,0,{},SpellTargeting::None,true))break;continue;}if((s.kind==SpellKind::RaiseDead || cappedCorpseSummon(s.kind)) && s.orderOn && s.orderOff && spellRequirements(u->owner,s) && number(u->mana)>=s.mana && spellCooldown(id,ability)<=0){auto available=config_.players[u->owner].abilityAvailable.find(ability);if((available==config_.players[u->owner].abilityAvailable.end() || available->second) && (cappedCorpseSummon(s.kind)?corpseSummonReady(*u,s):!corpseTargets(*u,s,{u->x,u->y},s.range).empty()) && beginSpell(id,ability,0,{},SpellTargeting::None,true))break;continue;}if(s.kind==SpellKind::Bloodlust && s.targeting==SpellTargeting::None){auto buff=u->buffs.find(s.buff);if(u->combat.target && alive(u->combat.target,NativeKind::Unit) && number(units_.at(u->combat.target)->life)>0 && hasWeapon(id) && (buff==u->buffs.end() || buff->second.remaining<=0) && beginSpell(id,ability,0,{},SpellTargeting::None,true))break;continue;}if((!casterSpell(s.kind) && s.kind!=SpellKind::Web) || s.targeting!=SpellTargeting::Unit || !s.orderOn || !s.orderOff || !spellRequirements(u->owner,s) || number(u->mana)<s.mana || spellCooldown(id,ability)>0)continue;auto available=config_.players[u->owner].abilityAvailable.find(ability);if(available!=config_.players[u->owner].abilityAvailable.end() && !available->second)continue;float radius=s.autoRange>0?std::min(s.range,s.autoRange):s.range;
            auto consider=[&](std::uint32_t candidate){if(!alive(candidate,NativeKind::Unit))return;auto target=units_.at(candidate);float distance=std::hypot(number(target->x)-number(u->x),number(target->y)-number(u->y));if(distance>radius || !spellTarget(*u,*target,s))return;unsigned priority=2;float need=0;bool combat=target->combat.target || u->combat.target==candidate;
                if(s.kind==SpellKind::Heal){float missing=number(target->maxLife)-number(target->life);if(missing<s.amount)return;priority=0;need=missing/std::max(1.f,number(target->maxLife));}
                else if(s.kind==SpellKind::Web){if(target->grounded())return;priority=1;}
                else if(s.kind==SpellKind::Abolish){if(!usefulDispel(*u,*target,s))return;priority=1;}
                else {auto buff=target->buffs.find(s.buff);if(buff!=target->buffs.end() && buff->second.remaining>1)return;if(s.kind==SpellKind::Slow || s.kind==SpellKind::Curse){if(!combat && !s.alwaysAuto)return;}else if(s.kind==SpellKind::Bloodlust){if(!target->combat.target || !hasWeapon(candidate))return;}else if(s.kind==SpellKind::InnerFire){if(!hasWeapon(candidate))return;}else if(s.kind==SpellKind::FrostArmor){if(!threatened.contains(candidate))return;priority=1;need=(number(target->maxLife)-number(target->life))/std::max(1.f,number(target->maxLife));}else return;}
                auto score=std::tuple{priority,-need,distance,candidate,ability};if(!best || score<*best)best=score;
            };int left=cell(number(u->x)-radius),right=cell(number(u->x)+radius),bottom=cell(number(u->y)-radius),top=cell(number(u->y)+radius);if((double(right)-left+1)*(double(top)-bottom+1)>double(units_.size())*2)for(auto& [candidate,target]:units_)consider(candidate);else for(std::int64_t y=bottom;y<=top;++y)for(std::int64_t x=left;x<=right;++x)if(auto bucket=grid.find(key(int(x),int(y)));bucket!=grid.end())for(auto candidate:bucket->second)consider(candidate);
        }
        if(best && alive(id,NativeKind::Unit) && !u->cast){auto [priority,need,distance,target,ability]=*best;beginSpell(id,ability,target,{},SpellTargeting::Unit,true);}
    }
}
}
