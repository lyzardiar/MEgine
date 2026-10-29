// Author: MiYu. Player AI pause counts, source creep flags and captain control operate on live session state.
#include "session.h"
#include <algorithm>
#include <bit>

namespace war3 {
void ScriptSession::pauseAI(unsigned owner,bool paused){if(owner>=16)throw std::runtime_error("AI player outside classic range");if(!ais_[owner])return;auto& count=aiPauseDepth_[owner];count+=paused?1u:UINT32_MAX;ais_[owner]->runtime->pauseThreads(count!=0);}
void ScriptSession::bindAiControlNatives(){
    bind("PauseCompAI","nothing",{"player","boolean"},[this](auto& vm,auto args){if(args[0].bits)pauseAI(playerId(args[0]),args[1].bits!=0);return vm.nothing();});
    bind("SetUnitCreepGuard","nothing",{"unit","boolean"},[this](auto& vm,auto args){if(alive(args[0].bits,NativeKind::Unit))units_.at(args[0].bits)->creepGuard=args[1].bits!=0;return vm.nothing();});
    bind("RemoveGuardPosition","nothing",{"unit"},[this](auto& vm,auto args){aiRemoveGuard(args[0].bits);return vm.nothing();});
    bind("RecycleGuardPosition","nothing",{"unit"},[this](auto& vm,auto args){aiRecycleGuard(args[0].bits);return vm.nothing();});
    bind("RemoveAllGuardPositions","nothing",{"player"},[this](auto& vm,auto args){if(!args[0].bits)return vm.nothing();auto owner=playerId(args[0]);std::vector<std::uint32_t> units;for(auto& [id,u]:units_)if(u->owner==owner)units.push_back(id);for(auto id:units)aiRemoveGuard(id);if(auto& ai=ais_[owner]){ai->guards.clear();ai->guardUnits.clear();}return vm.nothing();});
}
void ScriptSession::bindAiGuardNatives(ScriptAI& ai){
    auto bind=[&](const char* name,const char* result,std::initializer_list<const char*> parameters,jass::Runtime::Native native){auto& vm=*ai.runtime;auto id=vm.module().functionId(name);if(id==jass::none)return;auto& signature=vm.module().functions()[id];if(!vm.module().program().functions()[id].native || vm.module().type(signature.result).name!=result || signature.parameters.size()!=parameters.size())throw std::runtime_error(std::string("Invalid AI control signature: ")+name);size_t index=0;for(auto type:parameters)if(vm.module().type(signature.parameters[index++]).name!=type)throw std::runtime_error(std::string("Invalid AI control parameter: ")+name);vm.bind(name,std::move(native));};
    bind("AddGuardPost","nothing",{"integer","real","real"},[this,&ai](auto& vm,auto args){if(!definitions().contains(args[0].bits))throw std::runtime_error("Unknown guard post unit type");if(ai.guards.size()>=4096 || ai.guardTicket==UINT64_MAX)throw std::runtime_error("AI guard post budget exceeded");auto point=requireWorld().clamp({jass::Real::fromBits(args[1].bits),jass::Real::fromBits(args[2].bits)});ai.guards.emplace(++ai.guardTicket,AIGuardPost{args[0].bits,0,point});return vm.nothing();});
    bind("FillGuardPosts","nothing",{},[this,&ai](auto& vm,auto){ai.fillGuards=true;aiFillGuards(ai);return vm.nothing();});
    bind("ReturnGuardPosts","nothing",{},[this,&ai](auto& vm,auto){aiReturnGuards(ai,true);return vm.nothing();});
    bind("SetReplacementCount","nothing",{"integer"},[&ai](auto& vm,auto args){auto count=std::bit_cast<int>(args[0].bits);if(count< -1 || count>10000)throw std::runtime_error("AI guard replacement limit outside budget");ai.replacementCount=count;return vm.nothing();});
    bind("SetNewHeroes","nothing",{"boolean"},[&ai](auto& vm,auto args){ai.newHeroes=args[0].bits!=0;return vm.nothing();});
    bind("SetSlowChopping","nothing",{"boolean"},[&ai](auto& vm,auto args){ai.slowChopping=args[0].bits!=0;return vm.nothing();});
    bind("Unsummon","nothing",{"unit"},[this,&ai](auto& vm,auto args){aiUnsummon(ai,args[0].bits);return vm.nothing();});
    bind("UnitInvis","boolean",{"unit"},[this,&ai](auto& vm,auto args){return vm.boolean(unitInvisibleTo(args[0].bits,ai.owner));});
    bind("SetCaptainChanges","nothing",{"boolean"},[this,&ai](auto& vm,auto args){ai.captainChanges=args[0].bits!=0;aiFormCaptains(ai);return vm.nothing();});
    bind("TeleportCaptain","nothing",{"real","real"},[this,&ai](auto& vm,auto args){aiTeleportCaptain(ai,{jass::Real::fromBits(args[0].bits),jass::Real::fromBits(args[1].bits)});return vm.nothing();});
    bind("SuicideUnit","nothing",{"integer","integer"},[this,&ai](auto& vm,auto args){aiSuicide(ai,std::bit_cast<int>(args[0].bits),args[1].bits,-1);return vm.nothing();});
    bind("SuicideUnitEx","nothing",{"integer","integer","integer"},[this,&ai](auto& vm,auto args){aiSuicide(ai,std::bit_cast<int>(args[0].bits),args[1].bits,std::bit_cast<int>(args[2].bits));return vm.nothing();});
    bind("GroupTimedLife","nothing",{"boolean"},[this,&ai](auto& vm,auto args){ai.groupTimedLife=args[0].bits!=0;if(!ai.groupTimedLife)for(auto it=ai.captain.begin();it!=ai.captain.end();)if(!alive(*it,NativeKind::Unit) || units_.at(*it)->timedLife)it=ai.captain.erase(it);else ++it;return vm.nothing();});
    bind("IgnoredUnits","integer",{"integer"},[this,&ai](auto& vm,auto args){unsigned count=0;for(auto& [id,u]:units_)if(u->owner==ai.owner && u->type==args[0].bits && !u->removing && std::bit_cast<float>(u->life.bits())>0 && (ai.guardUnits.contains(id) || (!ai.groupTimedLife && u->timedLife)))++count;return vm.integer(int(count));});
    bind("ResetCaptainLocs","nothing",{},[this,&ai](auto& vm,auto){aiCancelCaptainRoute(ai);ai.homeOverride=false;aiTowns(ai);ai.goal=ai.stage=ai.home;return vm.nothing();});
    bind("ShiftTownSpot","nothing",{"real","real"},[this,&ai](auto& vm,auto args){ai.townSpot=requireWorld().clamp({jass::Real::fromBits(args[0].bits),jass::Real::fromBits(args[1].bits)});return vm.nothing();});
    bind("ClearCaptainTargets","nothing",{},[this,&ai](auto& vm,auto){aiCancelCaptainRoute(ai);for(auto id:aiCaptain(ai))stopUnit(id);ai.goal=ai.stage;ai.retreating=false;return vm.nothing();});
}
}
