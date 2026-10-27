// Author: MiYu. Source-priced altar revival preserves hero handles, progression and inventory across the real production queue.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <sstream>

namespace war3 {
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){if(!std::isfinite(value))throw std::runtime_error("Non-finite revival value");return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
int price(double value){if(!std::isfinite(value) || value<0 || value>INT_MAX)throw std::runtime_error("Revival price exceeds budget");return int(value);}
}
ProductInfo ScriptSession::revivalInfo(std::uint32_t handle){
    if(!alive(handle,NativeKind::Unit) || !units_.at(handle)->hero)throw std::runtime_error("Revival pricing requires a hero");auto u=units_.at(handle);auto result=product(u->type);double levels=std::max(0,u->level-1),maximum=std::max(0.f,gameplayNumber("ReviveMaxFactor",4));
    result.gold=price(std::max(0.,std::min({double(result.gold)*(gameplayNumber("ReviveBaseFactor",.4f)+gameplayNumber("ReviveLevelFactor",.1f)*levels),double(result.gold)*maximum,double(gameplayNumber("HeroMaxReviveCostGold",700))})));
    result.lumber=price(std::max(0.,std::min({double(result.lumber)*(gameplayNumber("ReviveBaseLumberFactor",0)+gameplayNumber("ReviveLumberLevelFactor",0)*levels),double(result.lumber)*maximum,double(gameplayNumber("HeroMaxReviveCostLumber",0))})));
    double duration=std::min({double(result.trainTime)*std::max(1,u->level)*gameplayNumber("ReviveTimeFactor",.65f),double(result.trainTime)*gameplayNumber("ReviveMaxTimeFactor",2),double(gameplayNumber("HeroMaxReviveTime",150))});if(!std::isfinite(duration) || duration<0 || duration>86400)throw std::runtime_error("Revival time exceeds budget");result.trainTime=float(std::max(1./32,duration));result.food=u->useFood?u->foodUsed:0;
    result.name=mapString(definitions().field(ObjectData::code("Arev"),"Profile","Name","Revive Hero"),strings_)+" "+(u->properName.empty()?u->name:u->properName)+" ("+std::to_string(u->level)+")";return result;
}
bool ScriptSession::revivalAllowed(std::uint32_t building,std::uint32_t hero,std::string& reason){
    if(!alive(building,NativeKind::Unit) || !alive(hero,NativeKind::Unit)){reason="无效的英雄或复活建筑";return false;}auto b=units_.at(building),u=units_.at(hero);if(!b->building || b->removing || b->construction || b->buildingUpgrade || b->unsummon || b->hidden() || b->paused || b->stunned() || number(b->life)<=0 || definitions().field(b->type,"Profile","Revive")!="1"){reason="该建筑当前无法复活英雄";return false;}
    if(b->owner!=u->owner || !u->hero || u->illusion || u->removing || number(u->life)>0){reason="需要本玩家已死亡的英雄";return false;}if(u->revivalBuilding){reason="该英雄已在复活队列中";return false;}if(b->production.size()>=7){reason="复活队列已满";return false;}auto info=revivalInfo(hero);auto& states=config_.players[b->owner].states;if(states[1]<info.gold || states[2]<info.lumber){reason="没有足够的资源复活英雄";return false;}return true;
}
void ScriptSession::revivalLink(const ProductionOrder& job){if(!job.revival || !alive(job.hero,NativeKind::Unit))return;auto u=units_.at(job.hero);if(u->revivalTicket==job.ticket){u->revivalBuilding=0;u->revivalTicket=0;}}
void ScriptSession::cancelHeroRevival(std::uint32_t hero){
    if(!alive(hero,NativeKind::Unit))return;auto u=units_.at(hero);auto building=u->revivalBuilding;auto ticket=u->revivalTicket;if(!building)return;if(alive(building,NativeKind::Unit)){auto provider=units_.at(building);for(size_t i=0;i<provider->production.size();++i)if(provider->production[i].revival && provider->production[i].hero==hero && provider->production[i].ticket==ticket){cancelProduction(building,i);return;}}u->revivalBuilding=0;u->revivalTicket=0;
}
void ScriptSession::cancelBuildingRevivals(std::uint32_t building){
    for(unsigned count=0;count<32 && alive(building,NativeKind::Unit);++count){auto provider=units_.at(building);auto found=std::find_if(provider->production.begin(),provider->production.end(),[](auto& job){return job.revival;});if(found==provider->production.end())return;cancelProduction(building,size_t(found-provider->production.begin()));}if(alive(building,NativeKind::Unit) && std::any_of(units_.at(building)->production.begin(),units_.at(building)->production.end(),[](auto& job){return job.revival;}))throw std::runtime_error("Revival cancellation reinsertion exceeds budget");
}
bool ScriptSession::queueRevival(std::uint32_t building,std::uint32_t hero){
    std::string reason;if(!revivalAllowed(building,hero,reason) || productionTicket_==UINT64_MAX)return false;auto provider=units_.at(building),u=units_.at(hero);auto info=revivalInfo(hero);auto owner=provider->owner;auto& states=config_.players[owner].states;int gold=states[1],lumber=states[2];states[1]-=info.gold;states[2]-=info.lumber;ProductionOrder job;job.type=u->type;job.gold=info.gold;job.lumber=info.lumber;job.food=info.food;job.duration=info.trainTime;job.ticket=++productionTicket_;job.revival=true;job.hero=hero;u->revivalBuilding=building;u->revivalTicket=job.ticket;provider->production.push_back(job);playerChange(owner,1,gold,gold-info.gold,false);playerChange(owner,2,lumber,lumber-info.lumber,false);ScriptContext order;order.issuedOrder=852039;order.orderTarget=hero;unitEvent(building,40,77,order);startProduction(building);return true;
}
bool ScriptSession::reviveHero(std::uint32_t handle,WorldPoint point,bool visual,int reserved){
    if(!alive(handle,NativeKind::Unit))return false;auto u=units_.at(handle);if(!u->hero || u->illusion || u->removing || number(u->life)>0 || number(u->maxLife)<=0)return false;point=requireWorld().clamp(point);cancelHeroRevival(handle);if(!alive(handle,NativeKind::Unit) || u->removing || number(u->life)>0)return false;
    clearCorpse(*u);u->x=point.x;u->y=point.y;u->life=real(std::clamp(number(u->maxLife)*gameplayNumber("HeroReviveLifeFactor",1),1.f,number(u->maxLife)));float start=gameplayNumber("HeroReviveManaStart",1)!=0?std::clamp(definitions().number(u->type,"UnitBalance","mana0",100)/100,0.f,1.f):0;u->mana=real(std::clamp(number(u->maxMana)*(start+gameplayNumber("HeroReviveManaFactor",0)),0.f,number(u->maxMana)));u->route.clear();u->waypoint=0;u->currentOrder=0;u->holding=false;u->combat={};u->combat.home=point;u->animation="Stand";u->animationIndex.reset();u->animationQueue.clear();u->animationTime=0;u->animationRate=1;u->revivalBuilding=0;u->revivalTicket=0;unitFootprint(*u);unitFood(handle,true,reserved);++fogRevision_;
    if(visual && alive(handle,NativeKind::Unit) && !u->removing && number(u->life)>0){auto paths=definitions().field(ObjectData::code("Arev"),"Profile","Targetart");std::vector<std::string> models;std::stringstream source(paths);std::string model;while(std::getline(source,model,','))models.push_back(model);unsigned race=u->race;if(race<1 || race>5)race=config_.players[u->owner].race;if(!models.empty()){auto index=race>=1 && race<=models.size()?race-1:0;createEffect(models[index],point,handle,"origin",true);}}
    if(alive(handle,NativeKind::Unit) && !u->removing && number(u->life)>0)unitEvent(handle,46,83);return true;
}
void ScriptSession::revivalButtons(std::uint32_t building,std::array<bool,12>& occupied,std::vector<CommandButton>& buttons){
    if(!alive(building,NativeKind::Unit))return;auto provider=units_.at(building);if(definitions().field(provider->type,"Profile","Revive")!="1")return;for(auto& [id,u]:units_)if(u->owner==provider->owner && u->hero && !u->illusion && !u->removing && number(u->life)<=0){auto info=revivalInfo(id);int at=info.positioned?info.button[1]*4+info.button[0]:-1;if(at<0 || at>=12 || occupied[at]){at=0;while(at<12 && occupied[at])++at;}if(at>=12)break;occupied[at]=true;std::string reason;bool enabled=revivalAllowed(building,id,reason);buttons.push_back({CommandAction::Revive,id,info.icon,info.name,info.tip,info.hotkey,reason,at%4,at/4,-1,info.gold,info.lumber,enabled});}
}
void ScriptSession::bindRevivalNatives(){
    bind("ReviveHero","boolean",{"unit","real","real","boolean"},[this](auto& vm,auto args){return vm.boolean(reviveHero(args[0].bits,{jass::Real::fromBits(args[1].bits),jass::Real::fromBits(args[2].bits)},args[3].bits!=0));});
    bind("ReviveHeroLoc","boolean",{"unit","location","boolean"},[this](auto& vm,auto args){return vm.boolean(reviveHero(args[0].bits,std::get<WorldPoint>(object(args[1],NativeKind::Location).state),args[2].bits!=0));});
    bind("GetRevivableUnit","unit",{},[this](auto& vm,auto){auto event=contexts_.empty()?UINT_MAX:contexts_.back().event;return vm.handle("unit",event==43 || event==80?contexts_.back().triggerUnit:0);});
    bind("GetRevivingUnit","unit",{},[this](auto& vm,auto){auto event=contexts_.empty()?UINT_MAX:contexts_.back().event;return vm.handle("unit",(event>=44 && event<=46) || (event>=81 && event<=83)?contexts_.back().triggerUnit:0);});
}
}
