// Author: MiYu. Script waits and trigger joins operate on real continuations and fixed simulation time.
#include "session.h"

namespace war3 {
namespace {
struct ContextHandleMap {
    const jass::StableHandleMap& convert;
    const jass::Module& module;
    std::map<std::pair<std::string,std::uint32_t>,std::uint32_t> mapped,reverse;
    std::multimap<std::uint32_t,std::pair<std::string,std::uint32_t>> byInput,byOutput;
    bool related(std::string_view left,std::string_view right) const {auto a=module.typeId(std::string(left)),b=module.typeId(std::string(right));return a!=jass::none && b!=jass::none && (module.assignable(a,b) || module.assignable(b,a));}
    std::uint32_t operator()(std::string_view type,std::uint32_t id){if(!id)return 0;if(!convert)throw std::runtime_error("Thread context requires a handle mapping");auto key=std::pair{std::string(type),id};if(auto found=mapped.find(key);found!=mapped.end())return found->second;auto value=convert(type,id);if(!value || reverse.contains({std::string(type),value}))throw std::runtime_error("Invalid thread context handle mapping");auto [first,last]=byInput.equal_range(id);for(;first!=last;++first)if(related(type,first->second.first) && value!=first->second.second)throw std::runtime_error("Invalid thread context handle mapping across types");auto [begin,end]=byOutput.equal_range(value);for(;begin!=end;++begin)if(related(type,begin->second.first) && id!=begin->second.second)throw std::runtime_error("Invalid thread context handle mapping across types");reverse.emplace(std::pair{std::string(type),value},id);mapped.emplace(key,value);byInput.emplace(id,std::pair{key.first,value});byOutput.emplace(value,std::pair{std::move(key.first),id});return value;}
};
void mapContext(ScriptContext& context,ContextHandleMap& mapping){
    using Field=std::uint32_t ScriptContext::*;for(auto [type,field]:std::initializer_list<std::pair<const char*,Field>>{
        {"trigger",&ScriptContext::trigger},{"timer",&ScriptContext::expiredTimer},{"player",&ScriptContext::triggerPlayer},{"unit",&ScriptContext::triggerUnit},{"unit",&ScriptContext::filterUnit},{"unit",&ScriptContext::enumUnit},{"player",&ScriptContext::filterPlayer},{"player",&ScriptContext::enumPlayer},
        {"player",&ScriptContext::previousOwner},{"unit",&ScriptContext::killingUnit},{"unit",&ScriptContext::rescuer},{"player",&ScriptContext::detectingPlayer},{"unit",&ScriptContext::transportUnit},{"unit",&ScriptContext::loadedUnit},{"region",&ScriptContext::triggeringRegion},{"unit",&ScriptContext::enteringUnit},{"unit",&ScriptContext::leavingUnit},{"item",&ScriptContext::manipulatedItem},
        {"unit",&ScriptContext::buyingUnit},{"unit",&ScriptContext::soldUnit},{"unit",&ScriptContext::sellingUnit},{"item",&ScriptContext::soldItem},{"unit",&ScriptContext::trainedUnit},{"unit",&ScriptContext::summoningUnit},{"unit",&ScriptContext::summonedUnit},{"unit",&ScriptContext::damageSource},{"widget",&ScriptContext::orderTarget},{"unit",&ScriptContext::attacker},{"unit",&ScriptContext::eventTargetUnit},
        {"unit",&ScriptContext::spellUnit},{"ability",&ScriptContext::spellAbility},{"widget",&ScriptContext::spellTarget},{"dialog",&ScriptContext::clickedDialog},{"button",&ScriptContext::clickedButton},{"trackable",&ScriptContext::triggeringTrackable},{"unit",&ScriptContext::constructing},{"unit",&ScriptContext::cancelled},{"unit",&ScriptContext::constructed},{"widget",&ScriptContext::triggerWidget},{"destructable",&ScriptContext::triggerDestructable},{"destructable",&ScriptContext::filterDestructable},{"destructable",&ScriptContext::enumDestructable},{"item",&ScriptContext::filterItem},{"item",&ScriptContext::enumItem}})context.*field=mapping(type,context.*field);
    if(context.chat.size()>65536 || context.chatMatch.size()>65536)throw std::runtime_error("Thread context text exceeds budget");
}
void mapSelection(std::array<std::set<std::uint32_t>,16>& selection,ContextHandleMap& mapping){for(auto& units:selection){if(units.size()>65536)throw std::runtime_error("Thread selection exceeds budget");std::set<std::uint32_t> result;for(auto id:units){auto mapped=mapping("unit",id);if(!mapped || !result.insert(mapped).second)throw std::runtime_error("Invalid thread selection mapping");}units=std::move(result);}}
}
SessionSleepSnapshot ScriptSession::snapshotSleepingScript(const jass::StableHandleMap& encodeHandle) const {
    if(experimentalSelectionSync_)throw std::runtime_error("Experimental selection synchronization cannot be snapshotted");SessionSleepSnapshot snapshot;ContextHandleMap mapping{encodeHandle,runtime_.module()};jass::StableHandleMap map=[&](std::string_view type,std::uint32_t id){return mapping(type,id);};snapshot.script=runtime_.snapshotSleepingThread(map,[&](jass::ThreadId id){auto context=threadContexts_.find(id);if(context==threadContexts_.end() || context->second.size()>1024)throw std::runtime_error("Invalid sleeping thread context");snapshot.contexts=context->second;for(auto& item:snapshot.contexts)mapContext(item,mapping);if(auto found=selectionSyncViews_.find(id);found!=selectionSyncViews_.end() && found->second){snapshot.selections=*found->second;mapSelection(*snapshot.selections,mapping);}});return snapshot;
}
jass::ThreadId ScriptSession::restoreSleepingScript(const SessionSleepSnapshot& snapshot,const jass::StableHandleMap& decodeHandle) {
    if(experimentalSelectionSync_ || !snapshot.script.hasContext || snapshot.contexts.size()>1024)throw std::runtime_error("Invalid session sleeping snapshot context");auto contexts=snapshot.contexts;auto selections=snapshot.selections;ContextHandleMap mapping{decodeHandle,runtime_.module()};for(auto& context:contexts)mapContext(context,mapping);if(selections)mapSelection(*selections,mapping);auto savedSelection=selections?std::make_shared<const SelectionSnapshot>(std::move(*selections)):std::shared_ptr<const SelectionSnapshot>{};jass::StableHandleMap map=[&](std::string_view type,std::uint32_t id){return mapping(type,id);};return runtime_.restoreSleepingThread(snapshot.script,map,[&](jass::ThreadId id){threadContexts_.at(id)=std::move(contexts);if(savedSelection)selectionSyncViews_[id]=std::move(savedSelection);else selectionSyncViews_.erase(id);});
}
ScriptSession::~ScriptSession(){runtime_.cancelThreads();}
void ScriptSession::bindThreadNatives(){
    runtime_.threadHooks({[this](jass::ThreadId id,jass::ThreadId parent){threadContexts_.emplace(id,contexts_);if(auto found=selectionSyncViews_.find(parent);found!=selectionSyncViews_.end())selectionSyncViews_[id]=found->second;else if(selectionSyncLatest_)selectionSyncViews_[id]=selectionSyncLatest_;},[this](jass::ThreadId from,jass::ThreadId to){threadContexts_.at(from)=std::move(contexts_);contexts_=std::move(threadContexts_.at(to));},[this](jass::ThreadId id){threadContexts_.erase(id);selectionSyncViews_.erase(id);}});
    if(runtime_.module().functionId("TriggerSleepAction")!=jass::none)runtime_.bindSleep("TriggerSleepAction");
    bind("TriggerExecuteWait","nothing",{"trigger"},[this](auto& vm,auto args){if(args[0].bits){auto thread=triggerExecute(args[0].bits,true);vm.waitThread(thread);}return vm.nothing();});
    auto native=[this](const char* name){auto id=runtime_.module().functionId(name);return id!=jass::none && runtime_.module().program().functions()[id].native;};
    if(native("Sleep"))runtime_.bindSleep("Sleep");
    if(native("StartThread"))bind("StartThread","nothing",{"code"},[](auto& vm,auto args){vm.start(args[0]);return vm.nothing();});
}
}
