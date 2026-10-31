// Author: MiYu. Win32 fibers provide cancellable, migratable script continuations with a bounded reusable stack pool.
#include "jass_threads.h"
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <exception>
#include <map>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace war3::jass {
namespace {
struct Cancelled {};
struct HostFiber {
    void* fiber=nullptr;
    bool converted=false;
    HostFiber(){if(IsThreadAFiber())fiber=GetCurrentFiber();else{fiber=ConvertThreadToFiberEx(nullptr,FIBER_FLAG_FLOAT_SWITCH);converted=fiber!=nullptr;}if(!fiber)throw std::runtime_error("Cannot prepare script host fiber: "+std::to_string(GetLastError()));}
    ~HostFiber(){if(converted)ConvertFiberToThread();}
};
}
struct ThreadScheduler::Impl {
    using State=ThreadState;
    struct Task {Impl* owner=nullptr;ThreadId id=0,caller=0,waiting=0;ThreadOwner group=0;ExternalWaitToken external=0;void* fiber=nullptr;void* callerFiber=nullptr;State state=State::Running;double due=0;bool cancelled=false,externalSignaled=false;std::function<void()> entry;std::shared_ptr<ThreadEntry> structured;std::exception_ptr failure;~Task(){if(fiber)DeleteFiber(fiber);}};
    size_t maximum;
    ThreadId next=0,current=0;
    ExternalWaitToken nextExternal=0;
    double time=0;
    bool cancelling=false,advancing=false;
    ThreadHooks hooks;
    std::map<ThreadId,std::unique_ptr<Task>> tasks;
    std::map<ExternalWaitToken,ThreadId> externalWaits;
    std::vector<std::unique_ptr<Task>> pool;
    std::map<ThreadOwner,double> paused;
    std::recursive_mutex mutex;
    explicit Impl(size_t limit):maximum(limit){if(!limit || limit>4096)throw std::runtime_error("Invalid script thread budget");}
    void switched(ThreadId from,ThreadId to){if(hooks.switched)hooks.switched(from,to);current=to;}
    void clearExternal(Task& task){if(task.external)externalWaits.erase(task.external);task.external=0;task.externalSignaled=false;}
    void yield(Task& task){switched(task.id,task.caller);SwitchToFiber(task.callerFiber);if(task.cancelled)throw Cancelled{};}
    static VOID WINAPI fiber(void* pointer){auto& task=*static_cast<Task*>(pointer);for(;;){
        {auto entry=std::move(task.entry);auto structured=task.structured;try{if(task.cancelled)throw Cancelled{};if(structured)structured->execute();else entry();}catch(const Cancelled&){}catch(...){task.failure=std::current_exception();}}
        task.state=State::Done;task.owner->switched(task.id,task.caller);SwitchToFiber(task.callerFiber);
    }}
    void run(ThreadId id,void* callerFiber){
        auto found=tasks.find(id);if(found==tasks.end())return;auto& task=*found->second;task.caller=current;task.callerFiber=callerFiber;task.state=State::Running;switched(current,id);SwitchToFiber(task.fiber);
        if(task.state==State::Done){clearExternal(task);auto failure=task.failure;auto finished=std::move(found->second);tasks.erase(found);if(hooks.finished)hooks.finished(id);finished->entry={};finished->structured.reset();finished->failure={};if(pool.size()<32)pool.push_back(std::move(finished));if(failure)std::rethrow_exception(failure);}
    }
};
ThreadScheduler::ThreadScheduler(size_t maximum):impl_(std::make_unique<Impl>(maximum)){}
ThreadScheduler::~ThreadScheduler(){cancelAll();}
void ThreadScheduler::hooks(ThreadHooks hooks){std::lock_guard lock(impl_->mutex);if(!impl_->tasks.empty())throw std::runtime_error("Cannot change live thread hooks");impl_->hooks=std::move(hooks);}
ThreadId ThreadScheduler::start(std::function<void()> entry,ThreadOwner owner){return startImpl(std::move(entry),{},owner);}
ThreadId ThreadScheduler::start(std::shared_ptr<ThreadEntry> entry,ThreadOwner owner){return startImpl({},std::move(entry),owner);}
ThreadId ThreadScheduler::startSleeping(std::shared_ptr<ThreadEntry> entry,ThreadOwner owner,double remaining){if(!std::isfinite(remaining) || remaining<0 || remaining>86400)throw std::runtime_error("Invalid restored sleep duration");return startImpl({},std::move(entry),owner,remaining);}
ThreadId ThreadScheduler::startImpl(std::function<void()> entry,std::shared_ptr<ThreadEntry> structured,ThreadOwner owner,double delay){
    std::lock_guard lock(impl_->mutex);if((!entry && !structured) || impl_->cancelling || impl_->tasks.size()>=impl_->maximum || impl_->next==UINT64_MAX)throw std::runtime_error("Script thread creation or budget rejected");HostFiber host;std::unique_ptr<Impl::Task> task;if(!impl_->pool.empty()){task=std::move(impl_->pool.back());impl_->pool.pop_back();}else{task=std::make_unique<Impl::Task>();task->owner=impl_.get();task->fiber=CreateFiberEx(64*1024,256*1024,FIBER_FLAG_FLOAT_SWITCH,Impl::fiber,task.get());if(!task->fiber)throw std::runtime_error("Cannot allocate script fiber: "+std::to_string(GetLastError()));}
    task->group=owner;task->id=++impl_->next;task->caller=task->waiting=0;task->external=0;task->externalSignaled=false;task->callerFiber=nullptr;task->cancelled=false;task->due=0;task->state=Impl::State::Running;task->entry=std::move(entry);task->structured=std::move(structured);auto id=task->id;impl_->tasks.emplace(id,std::move(task));try{if(impl_->hooks.created)impl_->hooks.created(id,impl_->current);}catch(...){impl_->tasks.erase(id);if(impl_->hooks.finished)impl_->hooks.finished(id);throw;}if(delay>=0){auto& scheduled=*impl_->tasks.at(id);scheduled.state=Impl::State::Sleeping;auto paused=impl_->paused.find(owner);scheduled.due=(paused==impl_->paused.end()?impl_->time:paused->second)+delay;}else if(impl_->paused.contains(owner))impl_->tasks.at(id)->state=Impl::State::Ready;else impl_->run(id,host.fiber);return id;
}
void ThreadScheduler::pause(ThreadOwner owner,bool paused){std::lock_guard lock(impl_->mutex);auto found=impl_->paused.find(owner);if(paused){if(found==impl_->paused.end())impl_->paused.emplace(owner,impl_->time);}else if(found!=impl_->paused.end()){double elapsed=impl_->time-found->second;for(auto& [id,task]:impl_->tasks)if(task->group==owner && task->state==Impl::State::Sleeping)task->due+=elapsed;impl_->paused.erase(found);}}
void ThreadScheduler::checkpoint(){if(!impl_->current)throw std::runtime_error("Paused script requires a live thread");auto& task=*impl_->tasks.at(impl_->current);if(impl_->paused.contains(task.group)){task.state=Impl::State::Ready;impl_->yield(task);}}
void ThreadScheduler::sleep(double seconds){
    if(!std::isfinite(seconds) || seconds>86400 || !impl_->current)throw std::runtime_error("Script sleep requires a live script thread and bounded duration");auto& task=*impl_->tasks.at(impl_->current);task.due=impl_->time+std::max(seconds,1./32);task.state=Impl::State::Sleeping;impl_->yield(task);
}
void ThreadScheduler::wait(ThreadId id){
    if(!impl_->tasks.contains(id))return;if(!impl_->current || id==impl_->current)throw std::runtime_error("Invalid script thread wait");auto& task=*impl_->tasks.at(impl_->current);task.waiting=id;task.state=Impl::State::Waiting;impl_->yield(task);task.waiting=0;
}
ExternalWaitToken ThreadScheduler::prepareExternalWait(){
    std::lock_guard lock(impl_->mutex);if(!impl_->current || impl_->cancelling || impl_->nextExternal==UINT64_MAX)throw std::runtime_error("External wait requires a live script thread and available token");auto& task=*impl_->tasks.at(impl_->current);if(task.external || task.state!=Impl::State::Running)throw std::runtime_error("Script thread already has an external wait");auto token=++impl_->nextExternal;impl_->externalWaits.emplace(token,task.id);task.external=token;task.externalSignaled=false;return token;
}
void ThreadScheduler::waitExternal(ExternalWaitToken token){
    if(!impl_->current)throw std::runtime_error("External wait requires a live script thread");auto& task=*impl_->tasks.at(impl_->current);if(!token || task.external!=token || task.state!=Impl::State::Running)throw std::runtime_error("Invalid external wait token");if(task.externalSignaled){impl_->clearExternal(task);return;}task.state=Impl::State::External;try{impl_->yield(task);}catch(...){task.state=Impl::State::Running;impl_->clearExternal(task);throw;}impl_->clearExternal(task);
}
bool ThreadScheduler::wakeExternal(ExternalWaitToken token){
    std::lock_guard lock(impl_->mutex);auto found=impl_->externalWaits.find(token);if(found==impl_->externalWaits.end())return false;auto task=impl_->tasks.find(found->second);if(task==impl_->tasks.end() || task->second->external!=token || task->second->cancelled || task->second->externalSignaled || (task->second->state!=Impl::State::Running && task->second->state!=Impl::State::External))return false;task->second->externalSignaled=true;if(task->second->state==Impl::State::External)task->second->state=Impl::State::Ready;return true;
}
bool ThreadScheduler::cancelExternalWait(ExternalWaitToken token){
    std::lock_guard lock(impl_->mutex);if(!impl_->current || !token)return false;auto& task=*impl_->tasks.at(impl_->current);if(task.external!=token || task.state!=Impl::State::Running)return false;impl_->clearExternal(task);return true;
}
void ThreadScheduler::clock(double time){std::lock_guard lock(impl_->mutex);if(!std::isfinite(time) || time<impl_->time)throw std::runtime_error("Script clock must be finite and monotonic");impl_->time=time;}
void ThreadScheduler::advance(double time){
    std::lock_guard lock(impl_->mutex);if(impl_->current || impl_->advancing || impl_->cancelling)throw std::runtime_error("Cannot recursively advance script threads");clock(time);if(impl_->tasks.empty())return;HostFiber host;impl_->advancing=true;struct Reset{bool& value;~Reset(){value=false;}}reset{impl_->advancing};
    for(size_t resumed=0;;){std::vector<std::pair<double,ThreadId>> ready;for(auto& [id,task]:impl_->tasks)if(impl_->paused.contains(task->group))continue;else if(task->state==Impl::State::Ready)ready.emplace_back(time,id);else if(task->state==Impl::State::Sleeping && task->due<=time)ready.emplace_back(task->due,id);else if(task->state==Impl::State::Waiting && !impl_->tasks.contains(task->waiting))ready.emplace_back(time,id);if(ready.empty())break;std::sort(ready.begin(),ready.end());for(auto [due,id]:ready){auto found=impl_->tasks.find(id);if(found==impl_->tasks.end() || impl_->paused.contains(found->second->group))continue;if(++resumed>impl_->maximum*2)throw std::runtime_error("Script resume budget exceeded");impl_->run(id,host.fiber);}}
}
void ThreadScheduler::cancelAll(){
    std::lock_guard lock(impl_->mutex);if(impl_->current)throw std::runtime_error("Cannot cancel the active script stack");if(impl_->tasks.empty())return;HostFiber host;impl_->cancelling=true;struct Reset{bool& value;~Reset(){value=false;}}reset{impl_->cancelling};while(!impl_->tasks.empty()){auto& task=*impl_->tasks.begin()->second;task.cancelled=true;impl_->run(task.id,host.fiber);}
}
ThreadId ThreadScheduler::current() const{return impl_->current;}
size_t ThreadScheduler::count() const{return impl_->tasks.size();}
std::vector<ThreadInspection> ThreadScheduler::inspect() const{std::lock_guard lock(impl_->mutex);std::vector<ThreadInspection> result;result.reserve(impl_->tasks.size());for(auto& [id,task]:impl_->tasks){auto paused=impl_->paused.find(task->group);double now=paused==impl_->paused.end()?impl_->time:paused->second;result.push_back({id,task->group,task->state,task->structured,task->state==Impl::State::Sleeping?std::max(0.,task->due-now):0});}return result;}
}
