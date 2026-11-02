// Author: MiYu. Owned native JASS execution state and typed host function boundary.
#pragma once
#include "jass_module.h"
#include "jass_numeric.h"
#include "jass_threads.h"
#include <functional>
#include <map>

namespace war3::jass {
class Runtime;
struct RuntimeLifetime;
struct Value {Id type=none;std::uint32_t bits=0;std::shared_ptr<const std::string> text;Runtime* codeOwner=nullptr;std::weak_ptr<const RuntimeLifetime> codeLifetime;};
struct PrimitiveGlobalSnapshot {std::vector<std::uint8_t> bytes;size_t excludedGlobals=0,excludedNonDefaultGlobals=0;};
struct PrimitiveGlobalRestore {size_t excludedGlobals=0,excludedNonDefaultGlobals=0;};
struct RuntimeLimits {std::uint64_t steps=5000000;size_t frames=1024,values=262144,stringBytes=16*1024*1024;bool debug=false;size_t threads=1024;};
struct RuntimeLifetime {bool alive=true;};
struct RuntimeSlotInspection {Value value;bool initialized=false,array=false;std::map<std::uint32_t,Value> elements;};
struct RuntimeFrameInspection {Id function=none;size_t pc=0,base=0;std::vector<RuntimeSlotInspection> locals;};
struct RuntimeExecutionInspection {ThreadId thread=0;size_t depth=0,localCount=0;Position caller;std::vector<Value> values;std::vector<RuntimeFrameInspection> frames;Id pendingNative=none;std::vector<Value> pendingArguments;};
struct RuntimeThreadInspection {ThreadId thread=0;std::uint64_t runtime=0;ThreadState state=ThreadState::Ready;bool structured=false;Id function=none;std::vector<Value> arguments;};
using StableHandleMap=std::function<std::uint32_t(std::string_view,std::uint32_t)>;
// Context transfer runs synchronously on the runtime owner thread and must not reenter its scheduler.
using ThreadContextTransfer=std::function<void(ThreadId)>;
using ThreadBatchContextTransfer=std::function<void(size_t,ThreadId)>;
struct RuntimeSleepSnapshot {std::vector<Source> sources;bool debug=false;Id function=none;std::vector<Value> arguments;double remaining=0;RuntimeExecutionInspection execution;bool handlesMapped=false,hasContext=false;std::uint32_t nativeResumeMode=1,waitIndex=0;};
struct RuntimeSleepBatch {std::vector<Source> sources;std::vector<RuntimeSleepSnapshot> threads;};
struct RuntimeSharedSleepEntry {std::uint32_t owner=0;RuntimeSleepSnapshot thread;};
struct RuntimeSharedSleepBatch {std::vector<std::vector<Source>> sources;std::vector<bool> paused;std::vector<RuntimeSharedSleepEntry> threads;};
class Runtime {
    struct Impl;
    std::shared_ptr<RuntimeLifetime> lifetime_=std::make_shared<RuntimeLifetime>();
    std::unique_ptr<Impl> impl_;
    void restoreGlobalsImpl(std::span<const std::uint8_t> bytes,const StableHandleMap& decodeHandle,bool initializing);
    RuntimeSleepSnapshot snapshotSleepingThreadImpl(const ThreadInspection& task,const StableHandleMap& encodeHandle,const ThreadContextTransfer& captureContext,bool includeSources,bool allowShared=false) const;
    ThreadId restoreSleepingThreadImpl(const RuntimeSleepSnapshot& snapshot,const StableHandleMap& decodeHandle,const ThreadContextTransfer& restoreContext,const std::vector<Source>* sources,bool allowExisting,bool allowShared=false);
public:
    using Native=std::function<Value(Runtime&,std::span<const Value>)>;
    explicit Runtime(Module module,RuntimeLimits limits={});
    ~Runtime();
    Runtime(const Runtime&)=delete;
    Runtime& operator=(const Runtime&)=delete;
    const Module& module() const;
    std::weak_ptr<const RuntimeLifetime> lifetimeToken() const {return lifetime_;}
    size_t instructionCount() const;
    void bind(const std::string& name,Native function);
    void setNativeHook(const std::string& name,const void* owner,Native function);
    void removeNativeHooks(const void* owner);
    Value invokeNativeOriginalNoYield(const std::string& name,std::span<const Value> arguments={});
    void bindSleep(const std::string& name);
    // A suspended native marked here must have completed its side effects before yielding.
    void markNativeCompletedOnResume(const std::string& name);
    void markThreadWaitNative(const std::string& name);
    // The native must safely re-enter with its saved arguments after external state is restored.
    void markNativeRestartable(const std::string& name);
    void shareThreads(Runtime& owner);
    void scopedSharedDestruction();
    void inheritNatives(const Runtime& owner);
    void inheritNativesSubset(const Runtime& owner,const std::function<bool(std::string_view)>& include);
    void initialize();
    void initializeFromGlobals(std::span<const std::uint8_t> bytes,const StableHandleMap& decodeHandle={});
    bool ready() const;
    bool snapshotSafe() const;
    Value invoke(const std::string& function,std::span<const Value> arguments={});
    Value invoke(const Value& code,std::span<const Value> arguments={});
    Value invokeNoYield(const Value& code,std::span<const Value> arguments={});
    ThreadId start(std::function<void()> entry);
    ThreadId start(const std::string& function,std::span<const Value> arguments={});
    ThreadId start(const Value& code,std::span<const Value> arguments={});
    ThreadId startDiscard(const std::string& function,std::span<const Value> arguments={});
    ThreadId startDiscard(const Value& code,std::span<const Value> arguments={});
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
    void threadEntryCompleted(std::function<void(ThreadId)> callback);
    void notifyThreadEntryCompleted();
    void globalWriteHook(std::function<void(Id,Value)> hook);
    ThreadId currentThread() const;
    size_t threadCount() const;
    // Inspect on the runtime owner thread; native/fiber continuations and codeOwner pointers are not serializable.
    std::vector<RuntimeExecutionInspection> inspectExecutions() const;
    // Identities and codeOwner pointers are process-local diagnostics, not saved continuations.
    std::vector<RuntimeThreadInspection> inspectThreads() const;
    RuntimeSleepSnapshot snapshotSleepingThread(const StableHandleMap& encodeHandle={},const ThreadContextTransfer& captureContext={}) const;
    ThreadId restoreSleepingThread(const RuntimeSleepSnapshot& snapshot,const StableHandleMap& decodeHandle={},const ThreadContextTransfer& restoreContext={});
    RuntimeSleepBatch snapshotSleepingThreads(const StableHandleMap& encodeHandle={},const ThreadBatchContextTransfer& captureContext={}) const;
    std::vector<ThreadId> restoreSleepingThreads(const RuntimeSleepBatch& snapshot,const StableHandleMap& decodeHandle={},const ThreadBatchContextTransfer& restoreContext={});
    RuntimeSharedSleepBatch snapshotSharedSleepingThreads(std::span<Runtime* const> runtimes,const StableHandleMap& encodeHandle={},const ThreadBatchContextTransfer& captureContext={}) const;
    std::vector<ThreadId> restoreSharedSleepingThreads(std::span<Runtime* const> runtimes,const RuntimeSharedSleepBatch& snapshot,const StableHandleMap& decodeHandle={},const ThreadBatchContextTransfer& restoreContext={});
    Bytes encodeSharedSleepingThreads(std::span<Runtime* const> runtimes,const RuntimeSharedSleepBatch& snapshot) const;
    RuntimeSharedSleepBatch decodeSharedSleepingThreads(std::span<Runtime* const> runtimes,std::span<const std::uint8_t> bytes) const;
    Bytes encodeSleepingThreads(const RuntimeSleepBatch& snapshot) const;
    RuntimeSleepBatch decodeSleepingThreads(std::span<const std::uint8_t> bytes) const;
    Value global(const std::string& name,std::optional<std::uint32_t> index={}) const;
    void setGlobal(const std::string& name,Value value,std::optional<std::uint32_t> index={});
    PrimitiveGlobalSnapshot encodePrimitiveGlobals() const;
    PrimitiveGlobalRestore restorePrimitiveGlobals(std::span<const std::uint8_t> bytes);
    Bytes encodeGlobals(const StableHandleMap& encodeHandle={}) const;
    void restoreGlobals(std::span<const std::uint8_t> bytes,const StableHandleMap& decodeHandle={});
    Value integer(std::int32_t value) const;
    Value real(Real value) const;
    Value boolean(bool value) const;
    Value string(std::string value) const;
    Value handle(const std::string& type,std::uint32_t value) const;
    Value nothing() const;
};
}
