// Author: MiYu. Owned 2SAJ execution state connected to one existing JASS runtime.
#pragma once
#include "jass_binary_callbacks.h"
#include "jass_binary_storage.h"

namespace war3 {
// Owner must outlive this context; remove all callback references before destroying it.
class JassBinarySession {
    jass::Runtime& owner_;
    std::shared_ptr<const JassBinaryProgram> program_;
    JassBinaryIndex index_;
    JassBinaryStorage storage_;
    JassBinaryHost host_;
    std::unique_ptr<JassBinaryCallbacks> callbacks_;
    jass::Id globalType(const std::string& name,bool array) const;
public:
    JassBinarySession(jass::Runtime& owner,std::shared_ptr<const JassBinaryProgram> program,const std::string& initializer);
    JassBinarySession(const JassBinarySession&)=delete;
    JassBinarySession& operator=(const JassBinarySession&)=delete;
    JassBinaryNativeValue run(const std::string& name,std::span<const JassBinaryNativeValue> arguments={});
    JassBinaryNativeValue reference(const std::string& name);
    const JassBinaryStorage& storage() const{return storage_;}
};
}
