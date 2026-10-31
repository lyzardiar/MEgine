// Author: MiYu. Owned native JASS execution state and typed host function boundary.
#pragma once
#include "jass_module.h"
#include "jass_numeric.h"
#include "jass_threads.h"
#include <functional>
#include <map>

namespace war3::jass {
class Runtime;
struct Value {Id type=none;std::uint32_t bits=0;std::shared_ptr<const std::string> text;Runtime* codeOwner=nullptr;};
struct PrimitiveGlobalSnapshot {std::vector<std::uint8_t> bytes;size_t excludedGlobals=0,excludedNonDefaultGlobals=0;};
struct PrimitiveGlobalRestore {size_t excludedGlobals=0,excludedNonDefaultGlobals=0;};
struct RuntimeLimits {std::uint64_t steps=5000000;size_t frames=1024,values=262144,stringBytes=16*1024*1024;bool debug=false;size_t threads=1024;};
struct RuntimeSlotInspection {Value value;bool initialized=false,array=false;std::map<std::uint32_t,Value> elements;};
struct RuntimeFrameInspection {Id function=none;size_t pc=0,base=0;std::vector<RuntimeSlotInspection> locals;};
struct RuntimeExecutionInspection {ThreadId thread=0;size_t depth=0,localCount=0;Position caller;std::vector<Value> values;std::vector<RuntimeFrameInspection> frames;Id pendingNative=none;std::vector<Value> pendingArguments;};
struct RuntimeThreadInspection {ThreadId thread=0;std::uint64_t runtime=0;ThreadState state=ThreadState::Ready;bool structured=false;Id function=none;std::vector<Value> arguments;};
using StableHandleMap=std::function<std::uint32_t(std::string_view,std::uint32_t)>;
// Context transfer runs synchronously on the runtime owner thread and must not reenter its scheduler.
using ThreadContextTransfer=std::function<void(ThreadId)>;
struct RuntimeSleepSnapshot {std::vector<Source> sources;bool debug=false;Id function=none;std::vector<Value> arguments;double remaining=0;RuntimeExecutionInspection execution;bool handlesMapped=false,hasContext=false;};
class Runtime {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    using Native=std::function<Value(Runtime&,std::span<const Value>)>;
    explicit Runtime(Module module,RuntimeLimits limits={});
    ~Runtime();
    Runtime(const Runtime&)=delete;
    Runtime& operator=(const Runtime&)=delete;
    const Module& module() const;
    size_t instructionCount() const;
    void bind(const std::string& name,Native function);
    void bindSleep(const std::string& name);
    void shareThreads(Runtime& owner);
    void inheritNatives(const Runtime& owner);
    void initialize();
    bool ready() const;
    Value invoke(const std::string& function,std::span<const Value> arguments={});
    Value invoke(const Value& code,std::span<const Value> arguments={});
    Value invokeNoYield(const Value& code,std::span<const Value> arguments={});
    ThreadId start(std::function<void()> entry);
    ThreadId start(const std::string& function,std::span<const Value> arguments={});
    ThreadId start(const Value& code,std::span<const Value> arguments={});
    ThreadId startDiscard(const std::string& function,std::span<const Value> arguments={});
    void sleep(double seconds);
    void waitThread(ThreadId thread);
    ExternalWaitToken prepareExternalWait();
    void waitExternal(ExternalWaitToken token);
    bool wakeExternal(ExternalWaitToken token);
    bool cancelExternalWait(ExternalWaitToken token);
    void threadClock(double time);
    void advanceThreads(double time);
    void cancelThreads();
    void pauseThreads(bool paused);
    bool threadsPaused() const;
    void threadHooks(ThreadHooks hooks);
    void globalWriteHook(std::function<void(Id,Value)> hook);
    ThreadId currentThread() const;
    size_t threadCount() const;
    // Inspect on the runtime owner thread; native/fiber continuations and codeOwner pointers are not serializable.
    std::vector<RuntimeExecutionInspection> inspectExecutions() const;
    // Identities and codeOwner pointers are process-local diagnostics, not saved continuations.
    std::vector<RuntimeThreadInspection> inspectThreads() const;
    RuntimeSleepSnapshot snapshotSleepingThread(const StableHandleMap& encodeHandle={},const ThreadContextTransfer& captureContext={}) const;
    ThreadId restoreSleepingThread(const RuntimeSleepSnapshot& snapshot,const StableHandleMap& decodeHandle={},const ThreadContextTransfer& restoreContext={});
    Value global(const std::string& name,std::optional<std::uint32_t> index={}) const;
    PrimitiveGlobalSnapshot encodePrimitiveGlobals() const;
    PrimitiveGlobalRestore restorePrimitiveGlobals(std::span<const std::uint8_t> bytes);
    Value integer(std::int32_t value) const;
    Value real(Real value) const;
    Value boolean(bool value) const;
    Value string(std::string value) const;
    Value handle(const std::string& type,std::uint32_t value) const;
    Value nothing() const;
};
}
