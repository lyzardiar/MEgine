// Author: MiYu. Cooperative native script threads retain complete VM and native callback stacks.
#pragma once
#include <cstdint>
#include <cstddef>
#include <functional>
#include <memory>

namespace war3::jass {
using ThreadId=std::uint64_t;
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
    ThreadId start(std::function<void()> entry);
    void sleep(double seconds);
    void wait(ThreadId thread);
    void clock(double time);
    void advance(double time);
    void cancelAll();
    ThreadId current() const;
    size_t count() const;
};
}
