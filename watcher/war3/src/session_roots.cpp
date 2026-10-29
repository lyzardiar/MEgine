// Author: MiYu. Ancient root orders share live path occupancy, source weapon masks, movement and production consumers.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <sstream>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
unsigned flags(const std::string& text){std::stringstream input(text);std::string token;unsigned result=0;while(std::getline(input,token,',')){auto first=token.find_first_not_of(" \t");token=first==std::string::npos?"":token.substr(first,token.find_last_not_of(" \t")-first+1);if(token.empty() || token=="_")continue;if(token=="unwalkable")result|=2;else if(token=="unflyable")result|=4;else if(token=="unbuildable")result|=8;else if(token=="unharvestable")result|=16;else if(token=="blighted")result|=32;else if(token=="unfloatable")result|=64;else if(token=="unamphibious")result|=128;else throw std::runtime_error("Unknown root placement flag: "+token);}return result;}
}
void ScriptSession::initializeRoot(UnitState& u){
    if(u.roots)return;for(auto [ability,level]:u.abilities)if(level>0 && definitions().field(ability,"AbilityData","code")=="Aroo"){u.roots=RootState{spellInfo(ability,unsigned(level)),false};u.animationProperties="Alternate";return;}
}
void ScriptSession::prepareRootSpell(const UnitState& u,SpellInfo& s){if(s.kind!=SpellKind::Root)return;bool rooting=u.roots && u.roots->uprooted;s.targeting=rooting?SpellTargeting::Point:SpellTargeting::None;s.order=rooting?s.order:s.unorder;s.animation=rooting?"Morph":"Morph Alternate";}
bool ScriptSession::rootReady(const UnitState& u,const SpellInfo& s){
    if(!u.building || u.rootTransition || u.construction || u.buildingUpgrade || u.unsummon || u.illusion || u.transport || u.rooted() || u.entangleTarget || !u.production.empty())return false;if(u.roots && u.roots->spell.ability!=s.ability)return false;return true;
}
std::optional<WorldPoint> ScriptSession::rootSite(std::uint32_t id,WorldPoint point,std::string& reason,WorldPoint* preview){
    if(preview)*preview=point;if(!alive(id,NativeKind::Unit))return {};auto u=units_.at(id);if(!u->building || !u->roots || !u->roots->uprooted){reason="该古树当前无法扎根";return {};}auto size=buildingSize(u->type);float ox=std::fmod(size[0]/2,64.f),oy=std::fmod(size[1]/2,64.f),x=std::round((number(point.x)-ox)/64)*64+ox,y=std::round((number(point.y)-oy)/64)*64+oy;if(!std::isfinite(x) || !std::isfinite(y))throw std::runtime_error("Invalid root position");point={real(x),real(y)};if(preview)*preview=point;auto& terrain=requireWorld().data().terrain;if(x-size[0]/2<terrain.origin[0] || y-size[1]/2<terrain.origin[1] || x+size[0]/2>terrain.origin[0]+(terrain.width-1)*128 || y+size[1]/2>terrain.origin[1]+(terrain.height-1)*128){reason="扎根位置超出地图边界";return {};}auto& pathing=requireWorld().data().pathing;if(!pathing){reason="地图缺少可用的路径网格";return {};}auto& data=definitions();auto cells=pathFootprint(data.field(u->type,"UnitData","pathTex"),point,buildingAngle()*3.14159265359f/180);auto prevent=flags(data.field(u->type,"UnitBalance","preventPlace","unbuildable")),required=flags(data.field(u->type,"UnitBalance","requirePlace"));auto valid=[&](WorldPoint at){auto mask=(requireWorld().pathMask(at,u->footprint)&~32u)|(requireWorld().blighted(at)?32u:0u);return !(mask&prevent) && (mask&required)==required;};if(cells.empty() && !valid(point)){reason="无法在此地形扎根";return {};}for(auto cell:cells){WorldPoint at{real(terrain.origin[0]+float(cell.index%pathing->width)*32+16),real(terrain.origin[1]+float(cell.index/pathing->width)*32+16)};if(!valid(at)){reason="扎根位置存在地形或路径阻挡";return {};}}
    for(auto& [otherId,other]:units_)if(otherId!=id && !other->hidden() && other->pathing && !other->removing && !other->airborne() && number(other->life)>0){float dx=std::max(0.f,std::abs(number(other->x)-x)-size[0]/2),dy=std::max(0.f,std::abs(number(other->y)-y)-size[1]/2);if(std::hypot(dx,dy)<other->collision){reason="扎根位置被单位占用";return {};}}return point;
}
void ScriptSession::startRoot(std::uint32_t id,const CastOrder& cast){
    if(!alive(id,NativeKind::Unit))return;auto u=units_.at(id);initializeRoot(*u);auto& s=cast.spell;if(!rootReady(*u,s)){cancelCast(*u);return;}bool rooting=u->roots->uprooted;WorldPoint point{u->x,u->y};if(rooting){std::string reason;auto site=rootSite(id,cast.point,reason);if(!site){cancelCast(*u);return;}point=*site;u->x=point.x;u->y=point.y;u->timedFacing.reset();u->facing=real(buildingAngle());}u->rootTransition=RootTransition{s,point,cast.ticket,rooting?s.duration:s.heroDuration,rooting};u->cast->phase=CastOrder::Phase::Channel;u->animation=s.animation;u->animationTime=0;++u->animationGeneration;u->animationIndex.reset();u->animationQueue.clear();u->route.clear();u->waypoint=0;unitFootprint(*u);rootActors_.insert(id);++fogRevision_;
}
void ScriptSession::cancelRoot(UnitState& u,std::uint64_t ticket){if(!u.rootTransition || u.rootTransition->ticket!=ticket)return;u.rootTransition.reset();rootActors_.erase(u.handle);unitFootprint(u);++fogRevision_;}
void ScriptSession::rootsTick(double delta){
    std::vector<std::uint32_t> actors(rootActors_.begin(),rootActors_.end());for(auto id:actors){if(!alive(id,NativeKind::Unit)){rootActors_.erase(id);continue;}auto u=units_.at(id);if(!u->rootTransition){rootActors_.erase(id);continue;}auto transition=*u->rootTransition;if(!u->cast || u->cast->ticket!=transition.ticket || u->removing || number(u->life)<=0){cancelRoot(*u,transition.ticket);continue;}if(u->paused)continue;u->rootTransition->remaining-=delta;if(u->rootTransition->remaining>0)continue;if(transition.rooting){std::string reason;auto site=rootSite(id,{u->x,u->y},reason);if(!site || std::hypot(number(u->x)-number(transition.point.x),number(u->y)-number(transition.point.y))>1){cancelCast(*u);continue;}}u->rootTransition.reset();rootActors_.erase(id);u->roots=RootState{transition.spell,!transition.rooting};u->animationProperties=transition.rooting?"Alternate":"";u->animation.clear();u->animationTime=0;++u->animationGeneration;unitFootprint(*u);++fogRevision_;if(!transition.rooting)releaseMine(*u);if(alive(id,NativeKind::Unit) && u->cast && u->cast->ticket==transition.ticket)finishCast(id,transition.ticket);
    }
}
}
