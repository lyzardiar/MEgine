// Author: MiYu. Source item summons and tiny buildings use inventory casts, physical placement and normal construction.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
}
std::uint32_t ScriptSession::itemBuildingType(const UnitState& u,const SpellInfo& s){
    if(s.kind!=SpellKind::ItemBuild || s.itemBuildings.empty())return 0;if(s.itemBuildings.size()==1)return s.itemBuildings.front();auto race=playerRace(u.owner);return race && race<=s.itemBuildings.size()?s.itemBuildings[race-1]:0;
}
std::uint32_t ScriptSession::itemBuilding(std::uint32_t id,std::uint32_t itemId){
    if(!alive(id,NativeKind::Unit) || !alive(itemId,NativeKind::Item) || items_.at(itemId)->holder!=id)return 0;auto abilities=itemActiveAbilities(items_.at(itemId)->type);if(abilities.size()!=1 || definitions().field(abilities.front(),"AbilityData","code")!="AIbl")return 0;return itemBuildingType(*units_.at(id),spellInfo(abilities.front(),1));
}
float ScriptSession::spellRange(const UnitState& u,const SpellInfo& s,WorldPoint point,std::uint32_t target){
    if(s.kind==SpellKind::Root)return 16;float range=s.range+u.collision+(s.targeting==SpellTargeting::Unit?spellTargetCollision(target):0);if(s.kind==SpellKind::ItemBuild && s.summonType){auto size=buildingSize(s.summonType);float dx=std::abs(number(u.x)-number(point.x)),dy=std::abs(number(u.y)-number(point.y));range+=std::hypot(dx,dy)-std::hypot(std::max(0.f,dx-size[0]/2),std::max(0.f,dy-size[1]/2));}return range;
}
bool ScriptSession::useSummonItem(std::uint32_t id,std::uint32_t itemId,std::uint32_t target,std::optional<WorldPoint> point){
    if(!alive(id,NativeKind::Unit) || !alive(itemId,NativeKind::Item))return false;auto u=units_.at(id);auto abilities=itemActiveAbilities(items_.at(itemId)->type);if(abilities.size()!=1)return false;auto& s=spellInfo(abilities.front(),1);if(!itemSpellReady(*u,s,itemId))return false;if(s.targeting==SpellTargeting::None){if(target || point)return false;}else if(s.targeting==SpellTargeting::Point){if(!point && alive(target,NativeKind::Unit)){auto to=units_.at(target);if(to->removing || number(to->life)<=0 || !unitVisibleTo(target,u->owner))return false;point=WorldPoint{to->x,to->y};}if(!point)return false;if(!std::isfinite(number(point->x)) || !std::isfinite(number(point->y)))throw std::runtime_error("Invalid item summon point");}else return false;auto slot=std::find(u->inventory.begin(),u->inventory.end(),itemId);return slot!=u->inventory.end() && beginSpell(id,s.ability,0,point.value_or(WorldPoint{}),s.targeting,false,852008u+unsigned(slot-u->inventory.begin()),itemId);
}
void ScriptSession::placeItemBuilding(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);auto active=[&]{return alive(id,NativeKind::Unit) && !u->removing && number(u->life)>0 && u->owner==cast.owner && u->cast && u->cast->ticket==cast.ticket;};if(!active())return;std::string reason;std::uint32_t base=0;auto point=buildSite(id,cast.spell.summonType,cast.point,reason,&base,nullptr,true);if(!point){displayText(u->owner,0,0,3,reason);return;}auto& info=product(cast.spell.summonType);auto made=createUnit(cast.owner,info.type,point->x,point->y,real(buildingAngle()),0,nullptr,false);if(!alive(made.bits,NativeKind::Unit))return;auto building=units_.at(made.bits);if(!active() || building->removing || number(building->life)<=0 || building->owner!=cast.owner || building->type!=info.type){if(!building->removing)removeUnit(made.bits);return;}
    Construction job;job.method=Construction::Method::Summon;job.food=info.food;job.duration=std::max(1./32,double(cast.spell.duration));building->construction=job;building->life=real(std::max(1.f,number(building->maxLife)*.1f));building->animation="Birth";building->animationTime=0;if(base)linkMine(base,made.bits);adjustFood(cast.owner,job.food,0);++fogRevision_;if(!alive(made.bits,NativeKind::Unit) || building->removing || !building->construction || number(building->life)<=0)return;spellVisual(cast.spell,"TargetArt",made.bits,*point);ScriptContext context;context.constructing=made.bits;unitEvent(made.bits,26,UINT_MAX,context);if(cast.spell.duration==0 && alive(made.bits,NativeKind::Unit) && building->construction)finishConstruction(made.bits);
}
}
