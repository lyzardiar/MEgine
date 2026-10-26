// Author: MiYu. Owned JASS types and resolved expression bindings for native execution.
#pragma once
#include "jass.h"
#include <unordered_map>

namespace war3::jass {
enum class Category {Nothing,Integer,Real,Boolean,String,Code,Handle,Null};
enum class Access {None,Global,Local,Function};
struct TypeInfo {std::string name;Category category;Id parent=none;};
struct Binding {Id type=none,index=none;Access access=Access::None;};
struct Slot {Id type=none;bool array=false;};
struct FunctionInfo {Id result=none;std::vector<Id> parameters;std::vector<Slot> slots;};
class Linker;
class Module {
    friend class Linker;
    Program program_;
    std::vector<TypeInfo> types_;
    std::vector<Slot> globals_;
    std::vector<FunctionInfo> functions_;
    std::vector<Binding> bindings_,assignments_;
    std::unordered_map<std::string,Id> typeNames_,globalNames_,functionNames_;
    explicit Module(Program program) : program_(std::move(program)) {}
public:
    static Module compile(Program program);
    const Program& program() const {return program_;}
    const std::vector<TypeInfo>& types() const {return types_;}
    const TypeInfo& type(Id id) const {return types_.at(id);}
    const std::vector<Slot>& globals() const {return globals_;}
    const std::vector<FunctionInfo>& functions() const {return functions_;}
    const Binding& binding(Id expression) const {return bindings_.at(expression);}
    const Binding& assignment(Id statement) const {return assignments_.at(statement);}
    Id functionId(const std::string& name) const;
    Id typeId(const std::string& name) const;
    bool assignable(Id target,Id source) const;
};
}
