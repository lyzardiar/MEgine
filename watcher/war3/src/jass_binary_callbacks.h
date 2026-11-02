// Author: MiYu. Adapt no-argument 2SAJ functions to the shared JASS callback scheduler.
#pragma once
#include "jass_binary_vm.h"

namespace war3 {
// Keep this adapter and its host captures alive until all references are destroyed and the owner is shutting down.
// Destroying its shared Runtime currently cancels all threads in the shared scheduler.
class JassBinaryCallbacks {
    std::shared_ptr<const JassBinaryProgram> program_;
    JassBinaryIndex index_;
    JassBinaryHost host_;
    std::unique_ptr<jass::Runtime> runtime_;
    std::map<std::string,std::string> names_;
public:
    JassBinaryCallbacks(jass::Runtime& owner,std::shared_ptr<const JassBinaryProgram> program,JassBinaryIndex index,JassBinaryHost host);
    JassBinaryCallbacks(const JassBinaryCallbacks&)=delete;
    JassBinaryCallbacks& operator=(const JassBinaryCallbacks&)=delete;
    JassBinaryNativeValue reference(const std::string& name);
};
}
