// Author: MiYu. Owned 2SAJ execution state connected to one existing JASS runtime.
#pragma once
#include "jass_binary_callbacks.h"
#include "jass_binary_storage.h"

namespace war3 {
// Owner must outlive this context; remove all callback references before destroying it.
struct JassBinarySignature {std::uint8_t result=0;std::vector<std::uint8_t> parameters;};
class JassBinarySession : public std::enable_shared_from_this<JassBinarySession> {
    jass::Runtime& owner_;
    std::shared_ptr<const JassBinaryProgram> program_;
    JassBinaryIndex index_;
    JassBinaryStorage storage_;
    JassBinaryHost host_;
    unsigned noYieldDepth_=0,overrideDepth_=0;
    using Override=std::function<JassBinaryNativeValue(std::span<const JassBinaryNativeValue>)>;
    struct FunctionOverride {const void* owner=nullptr;Override callback;};
    std::map<std::string,FunctionOverride> overrides_;
    std::unique_ptr<JassBinaryCallbacks> callbacks_;
    jass::Id globalType(const std::string& name,bool array) const;
public:
    JassBinarySession(jass::Runtime& owner,std::shared_ptr<const JassBinaryProgram> program,const std::string& initializer);
    JassBinarySession(const JassBinarySession&)=delete;
    JassBinarySession& operator=(const JassBinarySession&)=delete;
    void setFunctionOverride(const std::string& name,const void* owner,Override callback);
    void removeFunctionOverrides(const void* owner);
    JassBinarySignature signature(const std::string& name) const;
    const JassBinaryIndex& index() const{return index_;}
    bool hasFunction(const std::string& name) const{return index_.functions.contains(name);}
    JassBinaryNativeValue run(const std::string& name,std::span<const JassBinaryNativeValue> arguments={});
    jass::ThreadId start(const std::string& name,std::span<const JassBinaryNativeValue> arguments={});
    JassBinaryNativeValue runOriginalNoYield(const std::string& name,std::span<const JassBinaryNativeValue> arguments={});
    JassBinaryNativeValue reference(const std::string& name);
    jass::Runtime& owner() const{return owner_;}
    const JassBinaryProgram& program() const{return *program_;}
    JassBinaryStorage& storage(){return storage_;}
    const JassBinaryStorage& storage() const{return storage_;}
};
}
