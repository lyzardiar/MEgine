// Author: MiYu. Cooperative native script threads retain complete VM and native callback stacks.
#pragma once
#include <cstdint>
#include <cstddef>
#include <functional>
#include <memory>

namespace war3::jass {
using ThreadId=std::uint64_t;
using ThreadOwner=std::uintptr_t;
using ExternalWaitToken=std::uint64_t;
struct ThreadHooks {std::function<void(ThreadId,ThreadId)> created,switched;std::function<void(ThreadId)> finished;};
class ThreadScheduler {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    explicit ThreadScheduler(size_t maximum=1024);
    ~ThreadScheduler();
    ThreadScheduler(const ThreadScheduler&)=delete;
    ThreadScheduler& operator=(const ThreadScheduler&)=delete;
    void hooks(ThreadHooks hooks);
    ThreadId start(std::function<void()> entry,ThreadOwner owner=0);
    void pause(ThreadOwner owner,bool paused);
    void checkpoint();
    void sleep(double seconds);
    void wait(ThreadId thread);
    // Reserve within the current fiber before publishing work. A signal may arrive before wait.
    // A signaled fiber resumes on advance() after its owner is unpaused.
    ExternalWaitToken prepareExternalWait();
    void waitExternal(ExternalWaitToken token);
    bool wakeExternal(ExternalWaitToken token);
    // Use on the reserving fiber if publishing fails before wait; stale tokens return false.
    bool cancelExternalWait(ExternalWaitToken token);
    void clock(double time);
    void advance(double time);
    void cancelAll();
    ThreadId current() const;
    size_t count() const;
};
}
