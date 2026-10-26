// Author: MiYu. Source-backed unit/item creation, spatial state and native group consumers.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
using jass::Real;
Real real(float value) {if(!std::isfinite(value))throw std::runtime_error("Non-finite entity value");return Real::fromBits(std::bit_cast<std::uint32_t>(value));}
float number(Real value) {auto result=std::bit_cast<float>(value.bits());if(!std::isfinite(result))throw std::runtime_error("Non-finite entity value");return result;}
Real positive(Real value) {return real(std::max(0.f,number(value)));}
Real bounded(Real value,Real maximum) {return real(std::clamp(number(value),0.f,number(maximum)));}
int integer(float value) {if(!std::isfinite(value) || double(value)<INT_MIN || double(value)>INT_MAX)throw std::runtime_error("Entity integer field exceeds range");return int(value);}
}
ObjectData& ScriptSession::definitions() {if(!definitions_)definitions_=std::make_unique<ObjectData>(requireWorld().resources());return *definitions_;}
UnitState& ScriptSession::unit(jass::Value value) {return *std::get<std::shared_ptr<UnitState>>(object(value,NativeKind::Unit).state);}
ItemState& ScriptSession::item(jass::Value value) {return *std::get<std::shared_ptr<ItemState>>(object(value,NativeKind::Item).state);}
jass::Value ScriptSession::createUnit(std::uint32_t owner,std::uint32_t type,Real x,Real y,Real facing) {
    auto& data=definitions();if(!data.contains(type))throw std::runtime_error("Unknown source unit: "+ObjectData::name(type));auto point=requireWorld().clamp({x,y});auto state=std::make_shared<UnitState>();state->type=type;state->owner=owner;state->x=point.x;state->y=point.y;state->facing=real(std::fmod(std::fmod(number(facing),360.f)+360.f,360.f));state->model=data.field(type,"UnitUI","file");state->name=mapString(data.field(type,"Profile","Name",ObjectData::name(type)),strings_);
    state->scale=data.number(type,"UnitUI","modelScale",1);state->selectionSize=std::max(1.f,data.number(type,"UnitUI","scale",1)*128);state->collision=std::max(0.f,data.number(type,"UnitData","collision",16));state->flyHeight=data.number(type,"UnitData","moveHeight");state->movementType=data.property(type,"umvt",data.field(type,"UnitData","movetp"));
    state->maxLife=positive(real(data.number(type,"UnitBalance","HP",1)));state->life=state->maxLife;state->maxMana=positive(real(data.number(type,"UnitBalance","manaN")));state->mana=bounded(real(data.number(type,"UnitBalance","mana0")),state->maxMana);state->moveSpeed=state->defaultMoveSpeed=positive(real(data.number(type,"UnitBalance","spd")));state->acquireRange=positive(real(data.number(type,"UnitWeapons","acquire")));state->foodUsed=integer(data.number(type,"UnitBalance","fused"));state->foodMade=integer(data.number(type,"UnitBalance","fmade"));state->level=integer(data.number(type,"UnitBalance","level",1));
    state->building=data.property(type,"ubdg","0")=="1";auto firstByte=data.root(type)>>24;state->hero=firstByte>='A' && firstByte<='Z';auto race=data.property(type,"urac",data.field(type,"UnitData","race"));state->race=race=="human"?1u:race=="orc"?2u:race=="undead"?3u:race=="nightelf"?4u:race=="demon"?5u:7u;auto abilities=data.field(type,"UnitAbilities","abilList");size_t at=0;while(at<abilities.size()){auto end=abilities.find(',',at);auto id=abilities.substr(at,end==std::string::npos?end:end-at);auto first=id.find_first_not_of(" \t");if(first!=std::string::npos)id=id.substr(first,id.find_last_not_of(" \t")-first+1);if(id.size()==4)state->abilities[ObjectData::code(id)]=1;at=end==std::string::npos?abilities.size():end+1;}auto handle=create(NativeKind::Unit);std::get<std::shared_ptr<UnitState>>(object(handle,NativeKind::Unit).state)=state;units_[handle.bits]=std::move(state);return handle;
}
jass::Value ScriptSession::createItem(std::uint32_t type,Real x,Real y) {
    auto& data=definitions();if(!data.contains(type,true))throw std::runtime_error("Unknown source item: "+ObjectData::name(type));auto point=requireWorld().clamp({x,y});auto state=std::make_shared<ItemState>();state->type=type;state->x=point.x;state->y=point.y;state->name=mapString(data.field(type,"Profile","Name",ObjectData::name(type)),strings_);state->model=data.field(type,"ItemData","file");state->maxLife=positive(real(data.number(type,"ItemData","HP",1)));state->life=state->maxLife;state->charges=integer(data.number(type,"ItemData","uses"));state->level=integer(data.number(type,"ItemData","level"));auto handle=create(NativeKind::Item);std::get<std::shared_ptr<ItemState>>(object(handle,NativeKind::Item).state)=state;items_[handle.bits]=std::move(state);return handle;
}
void ScriptSession::bindEntityNatives() {
    bindOrderNatives();
    auto r=[](jass::Value value){return Real::fromBits(value.bits);};
    bind("IssueImmediateOrder","boolean",{"unit","string"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(u.paused || number(u.life)<=0 || !a[1].text)return vm.boolean(false);auto& order=*a[1].text;if(order=="stop" || order=="holdposition"){return vm.boolean(stopUnit(a[0].bits,order=="holdposition"));}for(auto& [id,level]:u.abilities)if(level>0){if(order==definitions().field(id,"Profile","Orderon")){u.autocast[id]=true;return vm.boolean(true);}if(order==definitions().field(id,"Profile","Orderoff")){u.autocast[id]=false;return vm.boolean(true);}}return vm.boolean(false);});
    bind("GetUnitCurrentOrder","integer",{"unit"},[this](auto& vm,auto a){return vm.integer(std::bit_cast<std::int32_t>(unit(a[0]).currentOrder));});
    bind("UnitAddAbility","boolean",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(!definitions().ability(a[1].bits) || u.abilities.contains(a[1].bits))return vm.boolean(false);u.abilities[a[1].bits]=1;return vm.boolean(true);});
    bind("UnitRemoveAbility","boolean",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);u.autocast.erase(a[1].bits);return vm.boolean(u.abilities.erase(a[1].bits)!=0);});
    bind("GetUnitAbilityLevel","integer",{"unit","integer"},[this](auto& vm,auto a){auto& abilities=unit(a[0]).abilities;auto found=abilities.find(a[1].bits);return vm.integer(found==abilities.end()?0:found->second);});
    bind("SetUnitAbilityLevel","integer",{"unit","integer","integer"},[this](auto& vm,auto a){auto& abilities=unit(a[0]).abilities;auto found=abilities.find(a[1].bits);if(found==abilities.end())return vm.integer(0);auto maximum=integer(definitions().number(a[1].bits,"AbilityData","levels",1));found->second=std::clamp(std::bit_cast<std::int32_t>(a[2].bits),1,std::max(1,maximum));return vm.integer(found->second);});
    bind("UnitMakeAbilityPermanent","boolean",{"unit","boolean","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(!u.abilities.contains(a[2].bits))return vm.boolean(false);u.permanentAbilities[a[2].bits]=a[1].bits!=0;return vm.boolean(true);});
    bind("GetUnitRace","race",{"unit"},[this](auto& vm,auto a){return vm.handle("race",unit(a[0]).race);});
    bind("IsUnitType","boolean",{"unit","unittype"},[this](auto& vm,auto a){auto& u=unit(a[0]);switch(a[1].bits){case 0:return vm.boolean(u.hero);case 1:return vm.boolean(number(u.life)<=0);case 2:return vm.boolean(u.building);case 3:return vm.boolean(definitions().property(u.type,"umvt")=="fly");case 4:return vm.boolean(definitions().property(u.type,"umvt")!="fly");default:break;}auto classes=definitions().property(u.type,"utyp");const char* name=nullptr;switch(a[1].bits){case 9:name="giant";break;case 14:name="undead";break;case 15:name="mechanical";break;case 16:name="peon";break;case 17:name="sapper";break;case 18:name="townhall";break;case 19:name="ancient";break;case 20:name="tauren";break;default:throw std::runtime_error("Unit type classification is not implemented: "+std::to_string(a[1].bits));}return vm.boolean(classes.find(name)!=std::string::npos);});
    bind("CreateUnit","unit",{"player","integer","real","real","real"},[this,r](auto&,auto a){return createUnit(playerId(a[0]),a[1].bits,r(a[2]),r(a[3]),r(a[4]));});
    bind("CreateUnitAtLoc","unit",{"player","integer","location","real"},[this,r](auto&,auto a){auto p=std::get<WorldPoint>(object(a[2],NativeKind::Location).state);return createUnit(playerId(a[0]),a[1].bits,p.x,p.y,r(a[3]));});
    bind("RemoveUnit","nothing",{"unit"},[this](auto& vm,auto a){if(a[0].bits){unit(a[0]);for(auto& o:objects_)if(o.alive && o.kind==NativeKind::Group)std::erase(std::get<Group>(o.state).units,a[0].bits);units_.erase(a[0].bits);destroy(a[0],NativeKind::Unit);}return vm.nothing();});
    bind("KillUnit","nothing",{"unit"},[this](auto& vm,auto a){if(a[0].bits)unitLife(a[0],{});return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,Real UnitState::*>>{{"GetUnitX",&UnitState::x},{"GetUnitY",&UnitState::y},{"GetUnitFacing",&UnitState::facing},{"GetUnitMoveSpeed",&UnitState::moveSpeed},{"GetUnitDefaultMoveSpeed",&UnitState::defaultMoveSpeed},{"GetUnitAcquireRange",&UnitState::acquireRange}})bind(name,"real",{"unit"},[this,member](auto& vm,auto a){return vm.real(unit(a[0]).*member);});
    bind("GetUnitLoc","location",{"unit"},[this](auto&,auto a){auto& u=unit(a[0]);auto handle=create(NativeKind::Location);std::get<WorldPoint>(object(handle,NativeKind::Location).state)={u.x,u.y};return handle;});
    bind("GetUnitTypeId","integer",{"unit"},[this](auto& vm,auto a){return vm.integer(a[0].bits?std::bit_cast<std::int32_t>(unit(a[0]).type):0);});
    bind("GetUnitName","string",{"unit"},[this](auto& vm,auto a){return vm.string(unit(a[0]).name);});
    bind("GetOwningPlayer","player",{"unit"},[this](auto& vm,auto a){return vm.handle("player",handleBase+unit(a[0]).owner);});
    bind("SetUnitOwner","nothing",{"unit","player","boolean"},[this](auto& vm,auto a){auto owner=playerId(a[1]);auto previous=unit(a[0]).owner;if(previous!=owner){unit(a[0]).owner=owner;ScriptContext context;context.previousOwner=handleBase+previous;unitEvent(a[0].bits,270,287,context);}return vm.nothing();});
    bind("SetUnitX","nothing",{"unit","real"},[this,r](auto& vm,auto a){number(r(a[1]));unit(a[0]).x=r(a[1]);return vm.nothing();});
    bind("SetUnitY","nothing",{"unit","real"},[this,r](auto& vm,auto a){number(r(a[1]));unit(a[0]).y=r(a[1]);return vm.nothing();});
    auto move=[this](jass::Value handle,WorldPoint point){point=requireWorld().clamp(point);auto& u=unit(handle);u.x=point.x;u.y=point.y;};
    bind("SetUnitPosition","nothing",{"unit","real","real"},[move,r](auto& vm,auto a){move(a[0],{r(a[1]),r(a[2])});return vm.nothing();});
    bind("SetUnitPositionLoc","nothing",{"unit","location"},[this,move](auto& vm,auto a){move(a[0],std::get<WorldPoint>(object(a[1],NativeKind::Location).state));return vm.nothing();});
    bind("SetUnitFacing","nothing",{"unit","real"},[this,r](auto& vm,auto a){unit(a[0]).facing=real(std::fmod(std::fmod(number(r(a[1])),360.f)+360.f,360.f));return vm.nothing();});
    bind("SetUnitMoveSpeed","nothing",{"unit","real"},[this,r](auto& vm,auto a){unit(a[0]).moveSpeed=positive(r(a[1]));return vm.nothing();});
    bind("SetUnitAcquireRange","nothing",{"unit","real"},[this,r](auto& vm,auto a){unit(a[0]).acquireRange=positive(r(a[1]));return vm.nothing();});
    bind("GetUnitState","real",{"unit","unitstate"},[this](auto& vm,auto a){auto& u=unit(a[0]);switch(a[1].bits){case 0:return vm.real(u.life);case 1:return vm.real(u.maxLife);case 2:return vm.real(u.mana);case 3:return vm.real(u.maxMana);default:throw std::runtime_error("Unsupported unit state");}});
    bind("SetUnitState","nothing",{"unit","unitstate","real"},[this,r](auto& vm,auto a){if(a[1].bits==0){unitLife(a[0],r(a[2]));return vm.nothing();}auto& u=unit(a[0]);switch(a[1].bits){case 1:u.maxLife=positive(r(a[2]));u.life=bounded(u.life,u.maxLife);break;case 2:u.mana=bounded(r(a[2]),u.maxMana);break;case 3:u.maxMana=positive(r(a[2]));u.mana=bounded(u.mana,u.maxMana);break;default:throw std::runtime_error("Unsupported unit state");}return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,int UnitState::*>>{{"GetResourceAmount",&UnitState::resources},{"GetUnitUserData",&UnitState::userData},{"GetUnitFoodUsed",&UnitState::foodUsed},{"GetUnitFoodMade",&UnitState::foodMade},{"GetUnitLevel",&UnitState::level}})bind(name,"integer",{"unit"},[this,member](auto& vm,auto a){return vm.integer(unit(a[0]).*member);});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,int UnitState::*>>{{"SetResourceAmount",&UnitState::resources},{"SetUnitUserData",&UnitState::userData}})bind(name,"nothing",{"unit","integer"},[this,member](auto& vm,auto a){unit(a[0]).*member=std::bit_cast<std::int32_t>(a[1].bits);return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,bool UnitState::*>>{{"ShowUnit",&UnitState::visible},{"PauseUnit",&UnitState::paused},{"SetUnitInvulnerable",&UnitState::invulnerable},{"SetUnitPathing",&UnitState::pathing}})bind(name,"nothing",{"unit","boolean"},[this,member](auto& vm,auto a){unit(a[0]).*member=a[1].bits!=0;return vm.nothing();});
    bind("SelectUnit","nothing",{"unit","boolean"},[this](auto& vm,auto a){selectUnit(a[0].bits,a[1].bits!=0);return vm.nothing();});
    bind("IsUnitPaused","boolean",{"unit"},[this](auto& vm,auto a){return vm.boolean(unit(a[0]).paused);});
    bind("IsUnitHidden","boolean",{"unit"},[this](auto& vm,auto a){return vm.boolean(!unit(a[0]).visible);});
    bind("IsUnitOwnedByPlayer","boolean",{"unit","player"},[this](auto& vm,auto a){return vm.boolean(unit(a[0]).owner==playerId(a[1]));});
    bind("ClearSelection","nothing",{},[this](auto& vm,auto){std::vector<std::uint32_t> selected;for(auto& [id,u]:units_)if(u->selected)selected.push_back(id);for(auto id:selected)if(alive(id,NativeKind::Unit) && units_.at(id)->selected){units_.at(id)->selected=false;unitEvent(id,25,58);}return vm.nothing();});
    bind("GroupAddUnit","nothing",{"group","unit"},[this](auto& vm,auto a){auto& list=std::get<Group>(object(a[0],NativeKind::Group).state).units;unit(a[1]);if(std::find(list.begin(),list.end(),a[1].bits)==list.end())list.push_back(a[1].bits);return vm.nothing();});
    bind("GroupRemoveUnit","nothing",{"group","unit"},[this](auto& vm,auto a){auto& list=std::get<Group>(object(a[0],NativeKind::Group).state).units;std::erase(list,a[1].bits);return vm.nothing();});
    bind("IsUnitInGroup","boolean",{"unit","group"},[this](auto& vm,auto a){auto& list=std::get<Group>(object(a[1],NativeKind::Group).state).units;return vm.boolean(std::find(list.begin(),list.end(),a[0].bits)!=list.end());});
    bind("CreateItem","item",{"integer","real","real"},[this,r](auto&,auto a){return createItem(a[0].bits,r(a[1]),r(a[2]));});
    bind("RemoveItem","nothing",{"item"},[this](auto& vm,auto a){if(a[0].bits){item(a[0]);items_.erase(a[0].bits);destroy(a[0],NativeKind::Item);}return vm.nothing();});
    bind("GetItemTypeId","integer",{"item"},[this](auto& vm,auto a){return vm.integer(a[0].bits?std::bit_cast<std::int32_t>(item(a[0]).type):0);});
    bind("GetItemX","real",{"item"},[this](auto& vm,auto a){return vm.real(item(a[0]).x);});
    bind("GetItemY","real",{"item"},[this](auto& vm,auto a){return vm.real(item(a[0]).y);});
    bind("GetItemName","string",{"item"},[this](auto& vm,auto a){return vm.string(item(a[0]).name);});
    bind("GetItemPlayer","player",{"item"},[this](auto& vm,auto a){return vm.handle("player",handleBase+item(a[0]).owner);});
    bind("SetItemPlayer","nothing",{"item","player","boolean"},[this](auto& vm,auto a){item(a[0]).owner=playerId(a[1]);return vm.nothing();});
    bind("SetItemPosition","nothing",{"item","real","real"},[this,r](auto& vm,auto a){auto p=requireWorld().clamp({r(a[1]),r(a[2])});auto& i=item(a[0]);i.x=p.x;i.y=p.y;return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,int ItemState::*>>{{"GetItemCharges",&ItemState::charges},{"GetItemUserData",&ItemState::userData},{"GetItemLevel",&ItemState::level}})bind(name,"integer",{"item"},[this,member](auto& vm,auto a){return vm.integer(item(a[0]).*member);});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,int ItemState::*>>{{"SetItemCharges",&ItemState::charges},{"SetItemUserData",&ItemState::userData}})bind(name,"nothing",{"item","integer"},[this,member](auto& vm,auto a){item(a[0]).*member=std::bit_cast<std::int32_t>(a[1].bits);return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,bool ItemState::*>>{{"SetItemVisible",&ItemState::visible},{"SetItemInvulnerable",&ItemState::invulnerable},{"SetItemDroppable",&ItemState::droppable},{"SetItemPawnable",&ItemState::pawnable},{"SetItemDropOnDeath",&ItemState::dropOnDeath}})bind(name,"nothing",{"item","boolean"},[this,member](auto& vm,auto a){item(a[0]).*member=a[1].bits!=0;return vm.nothing();});
}
}
