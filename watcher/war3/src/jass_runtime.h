// Author: MiYu. Owned native JASS execution state and typed host function boundary.
#pragma once
#include "jass_module.h"
#include "jass_numeric.h"
#include <functional>

namespace war3::jass {
struct Value {Id type=none;std::uint32_t bits=0;std::shared_ptr<const std::string> text;};
struct RuntimeLimits {std::uint64_t steps=5000000;size_t frames=1024,values=262144,stringBytes=16*1024*1024;bool debug=false;};
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
    void initialize();
    bool ready() const;
    Value invoke(const std::string& function,std::span<const Value> arguments={});
    Value invoke(const Value& code,std::span<const Value> arguments={});
    Value global(const std::string& name,std::optional<std::uint32_t> index={}) const;
    Value integer(std::int32_t value) const;
    Value real(Real value) const;
    Value boolean(bool value) const;
    Value string(std::string value) const;
    Value handle(const std::string& type,std::uint32_t value) const;
    Value nothing() const;
};
}
