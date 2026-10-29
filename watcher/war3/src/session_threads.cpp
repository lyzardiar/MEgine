// Author: MiYu. Script waits and trigger joins operate on real continuations and fixed simulation time.
#include "session.h"
#include <bit>

namespace war3 {
ScriptSession::~ScriptSession(){runtime_.cancelThreads();}
void ScriptSession::bindThreadNatives(){
    runtime_.threadHooks({[this](jass::ThreadId id,jass::ThreadId parent){threadContexts_.emplace(id,contexts_);if(auto found=selectionSyncViews_.find(parent);found!=selectionSyncViews_.end())selectionSyncViews_[id]=found->second;else if(selectionSyncLatest_)selectionSyncViews_[id]=selectionSyncLatest_;},[this](jass::ThreadId from,jass::ThreadId to){threadContexts_.at(from)=std::move(contexts_);contexts_=std::move(threadContexts_.at(to));},[this](jass::ThreadId id){threadContexts_.erase(id);selectionSyncViews_.erase(id);}});
    bind("TriggerSleepAction","nothing",{"real"},[](auto& vm,auto args){vm.sleep(std::bit_cast<float>(args[0].bits));return vm.nothing();});
    bind("TriggerExecuteWait","nothing",{"trigger"},[this](auto& vm,auto args){if(args[0].bits){auto thread=triggerExecute(args[0].bits,true);vm.waitThread(thread);}return vm.nothing();});
    auto native=[this](const char* name){auto id=runtime_.module().functionId(name);return id!=jass::none && runtime_.module().program().functions()[id].native;};
    if(native("Sleep"))bind("Sleep","nothing",{"real"},[](auto& vm,auto args){vm.sleep(std::bit_cast<float>(args[0].bits));return vm.nothing();});
    if(native("StartThread"))bind("StartThread","nothing",{"code"},[](auto& vm,auto args){vm.start(args[0]);return vm.nothing();});
}
}
