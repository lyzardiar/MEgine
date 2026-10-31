// Author: MiYu. Spell event contexts and buff selection operate on actual cast and timed-effect lifetimes.
#include "session.h"
#include "order_ids.h"
#include <bit>

namespace war3 {
void ScriptSession::bindSpellNatives() {
    bind("AbilityId","integer",{"string"},[](auto& vm,auto){return vm.integer(0);});
    bind("AbilityId2String","string",{"integer"},[](auto& vm,auto){return jass::Value{vm.module().typeId("string"),0,{}};});
    bind("OrderId","integer",{"string"},[](auto& vm,auto a){return vm.integer(std::bit_cast<std::int32_t>(a[0].text?orderId(*a[0].text):0));});
    bind("OrderId2String","string",{"integer"},[](auto& vm,auto a){auto name=orderName(a[0].bits);return name.empty()?jass::Value{vm.module().typeId("string"),0,{}}:vm.string(std::string(name));});
    bind("UnitResetCooldown","nothing",{"unit"},[this](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Unit))return vm.nothing();auto& u=unit(a[0]);u.spellCooldowns.clear();return vm.nothing();});
    bind("GetSpellAbilityUnit","unit",{},[this](auto& vm,auto){return vm.handle("unit",contexts_.empty()?0:contexts_.back().spellUnit);});
    bind("GetSpellAbilityId","integer",{},[this](auto& vm,auto){return vm.integer(contexts_.empty()?0:std::bit_cast<std::int32_t>(contexts_.back().spellId));});
    bind("GetSpellAbility","ability",{},[this](auto& vm,auto){return vm.handle("ability",contexts_.empty()?0:contexts_.back().spellAbility);});
    bind("GetSpellTargetX","real",{},[this](auto& vm,auto){return vm.real(contexts_.empty()?jass::Real{}:contexts_.back().spellPoint.x);});
    bind("GetSpellTargetY","real",{},[this](auto& vm,auto){return vm.real(contexts_.empty()?jass::Real{}:contexts_.back().spellPoint.y);});
    bind("GetSpellTargetLoc","location",{},[this](auto&,auto){auto h=create(NativeKind::Location);std::get<WorldPoint>(object(h,NativeKind::Location).state)=contexts_.empty()?WorldPoint{}:contexts_.back().spellPoint;return h;});
    for(auto [name,type,kind]:{std::tuple{"GetSpellTargetUnit","unit",NativeKind::Unit},std::tuple{"GetSpellTargetItem","item",NativeKind::Item},std::tuple{"GetSpellTargetDestructable","destructable",NativeKind::Destructable}})bind(name,type,{},[this,type,kind](auto& vm,auto){auto id=contexts_.empty()?0:contexts_.back().spellTarget;return vm.handle(type,alive(id,kind)?id:0);});
    auto buffs=[this](std::uint32_t id,bool positive,bool negative,bool magic,bool physical,bool timed,bool aura,bool,bool remove){auto& u=unit(runtime_.handle("unit",id));unsigned count=0;for(auto it=u.buffs.begin();it!=u.buffs.end();){auto& b=it->second;if(!b.id){++it;continue;}bool selected=(b.positive?positive:negative) && (b.physical?physical:magic);if(selected){++count;if(remove && b.dispellable){releaseBuff(b);it=u.buffs.erase(it);continue;}}++it;}if(aura && magic){bool changed=false;for(auto it=u.auras.begin();it!=u.auras.end();){auto& entry=it->second;if(entry.definition->buff && (entry.positive?positive:negative)){++count;if(remove){it=u.auras.erase(it);changed=true;continue;}}++it;}if(changed)aggregateAuras(u);}if(timed && u.timedLife && (positive || negative)){++count;if(remove){auto buff=u.timedLife->buff;u.timedLife.reset();if(buff)u.abilities.erase(buff);}}return count;};
    bind("UnitRemoveBuffs","nothing",{"unit","boolean","boolean"},[this,buffs](auto& vm,auto a){if(!alive(a[0].bits,NativeKind::Unit))return vm.nothing();buffs(a[0].bits,a[1].bits!=0,a[2].bits!=0,true,true,false,false,false,true);return vm.nothing();});
    for(auto name:{"UnitRemoveBuffsEx","UnitHasBuffsEx","UnitCountBuffsEx"}){auto result=std::string_view(name)=="UnitRemoveBuffsEx"?"nothing":std::string_view(name)=="UnitHasBuffsEx"?"boolean":"integer";bind(name,result,{"unit","boolean","boolean","boolean","boolean","boolean","boolean","boolean"},[buffs,result](auto& vm,auto a){auto count=buffs(a[0].bits,a[1].bits!=0,a[2].bits!=0,a[3].bits!=0,a[4].bits!=0,a[5].bits!=0,a[6].bits!=0,a[7].bits!=0,std::string_view(result)=="nothing");return std::string_view(result)=="nothing"?vm.nothing():std::string_view(result)=="boolean"?vm.boolean(count!=0):vm.integer(int(count));});}
}
}
