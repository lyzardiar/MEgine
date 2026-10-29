// Author: MiYu. Source summoned units, legal placement, tree conversion, events and timed lifetime share normal unit state.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real v){return std::bit_cast<float>(v.bits());}
jass::Real real(float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));}
}
std::vector<std::uint32_t> ScriptSession::spellTrees(const SpellInfo& s,WorldPoint point) {
    std::vector<std::pair<float,std::uint32_t>> candidates;for(auto& [id,d]:destructables_)if(d->tree && !d->removed && d->visible && !d->invulnerable && d->life>0){float distance=std::hypot(number(d->position.x)-number(point.x),number(d->position.y)-number(point.y));if(distance<=s.area)candidates.emplace_back(distance,id);}std::sort(candidates.begin(),candidates.end());std::vector<std::uint32_t> result;for(auto [d,id]:candidates){result.push_back(id);if(result.size()>=s.summonCount)break;}return result;
}
std::optional<WorldPoint> ScriptSession::summonPoint(WorldPoint point,std::uint32_t type,float minimum) {
    auto& data=definitions();float radius=std::clamp(data.number(type,"UnitBalance","collision",16),0.f,512.f);auto movement=pathMovement(data.property(type,"umvt",data.field(type,"UnitData","movetp")));bool flying=movement==PathMovement::Air;
    for(unsigned ring=0;ring<10;++ring){float offset=minimum+ring*32;for(unsigned side=0;side<(offset>0?16u:1u);++side){float angle=float(side)*6.28318530718f/16;auto candidate=requireWorld().clamp({real(number(point.x)+std::cos(angle)*offset),real(number(point.y)+std::sin(angle)*offset)});if(!requireWorld().pathPointFree(candidate,radius,movement))continue;bool free=true;for(auto& [id,u]:units_)if(!u->hidden() && u->pathing && number(u->life)>0 && (u->movementType=="fly")==flying && std::hypot(number(u->x)-number(candidate.x),number(u->y)-number(candidate.y))<u->collision+radius){free=false;break;}if(free)return candidate;}}return {};
}
void ScriptSession::summonSpell(std::uint32_t caster,const SpellInfo& s,WorldPoint point,unsigned owner) {
    if(!alive(caster,NativeKind::Unit))return;auto source=units_.at(caster);auto facing=source->facing;auto revision=source->castRevision,death=source->deathRevision,ownership=source->ownerRevision;auto active=[&]{return alive(caster,NativeKind::Unit) && !source->removing && number(source->life)>0 && source->owner==owner && source->castRevision==revision && source->deathRevision==death && source->ownerRevision==ownership;};if(!active())return;
    if(s.kind==SpellKind::SpiritWolf || s.kind==SpellKind::Scout || s.kind==SpellKind::VengeanceAvatar){std::vector<std::uint32_t> previous;for(auto& [id,u]:units_)if(u->summoner==caster && u->summonAbility==s.ability && number(u->life)>0)previous.push_back(id);for(auto id:previous){if(!active())return;if(alive(id,NativeKind::Unit))unitLife(runtime_.handle("unit",id),{});}}
    std::vector<std::uint32_t> trees;if(s.kind==SpellKind::Treants)trees=spellTrees(s,point);
    for(unsigned i=0;i<s.summonCount;++i){
        if(!active())break;WorldPoint center=point;if(s.kind==SpellKind::Treants){if(i>=trees.size())break;auto id=trees[i];if(!alive(id,NativeKind::Destructable))continue;auto tree=destructables_.at(id);if(tree->life<=0 || tree->invulnerable)continue;center=tree->position;destructableLife(id,0);if(!active())break;}
        auto type=s.summonType;float minimum=s.targeting==SpellTargeting::None?source->collision+32:0;std::optional<WorldPoint> place;if(s.kind==SpellKind::MechanicalCritter){std::map<std::pair<float,bool>,std::optional<WorldPoint>> sites;std::vector<std::pair<std::uint32_t,WorldPoint>> candidates;auto& data=definitions();for(auto candidate:s.summonTypes){float radius=std::clamp(data.number(candidate,"UnitBalance","collision",16),0.f,512.f);bool flying=data.property(candidate,"umvt",data.field(candidate,"UnitData","movetp"))=="fly";auto key=std::pair{radius,flying};auto found=sites.find(key);if(found==sites.end())found=sites.emplace(key,summonPoint(center,candidate,minimum)).first;if(found->second)candidates.emplace_back(candidate,*found->second);}if(candidates.empty())return;auto& selected=candidates[size_t((std::uint64_t(random())*candidates.size())>>32)];type=selected.first;place=selected.second;}else place=summonPoint(center,type,minimum);if(!place)continue;auto h=createUnit(owner,type,place->x,place->y,facing);if(!alive(h.bits,NativeKind::Unit))continue;auto unit=units_.at(h.bits);if(!active() || unit->removing || number(unit->life)<=0 || unit->owner!=owner || unit->type!=type){if(!unit->removing)removeUnit(h.bits);if(!active())return;continue;}spellVisual(s,"TargetArt",h.bits,{unit->x,unit->y});unit->summoner=caster;unit->summonAbility=s.ability;if(s.kind==SpellKind::MechanicalCritter){if(auto old=unit->buffs.find(s.buff);old!=unit->buffs.end()){releaseBuff(old->second);unit->buffs.erase(old);}UnitBuff buff;buff.id=s.buff;buff.source=caster;buff.target=h.bits;buff.originAbility=s.ability;buff.sourceLevel=s.level;buff.sourceOwner=owner;buff.kind=BuffKind::MechanicalCritter;buff.positive=buff.persistent=true;unit->buffs.emplace(s.buff,std::move(buff));}if(s.summonDuration>0){unit->timedLife=TimedLife{s.buff,s.summonDuration,s.summonDuration,false};if(s.buff)unit->abilities[s.buff]=1;}if(wardSpell(s.kind) || s.kind==SpellKind::MonsterLure)initializeWard(h.bits,s);ScriptContext context;context.summoningUnit=caster;context.summonedUnit=h.bits;if(s.kind==SpellKind::LavaSpawn)initializeLavaSpawn(caster,h.bits,s);unitEvent(caster,47,84,context);
    }
}
}
