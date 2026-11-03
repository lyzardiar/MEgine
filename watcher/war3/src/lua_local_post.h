// Author: MiYu. Simulate map POST callbacks locally without network access.
#pragma once
#include <cstdint>
#include <deque>
#include <memory>

namespace war3 {
class LuaRuntime;
class LuaLocalPost {
    LuaRuntime& lua_;
    struct State {std::deque<std::uint64_t> pending;};
    std::shared_ptr<State> state_=std::make_shared<State>();
public:
    explicit LuaLocalPost(LuaRuntime& lua);
    LuaLocalPost(const LuaLocalPost&)=delete;
    LuaLocalPost& operator=(const LuaLocalPost&)=delete;
    void pump();
};
}
