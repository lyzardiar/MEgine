// Author: MiYu. Bounded 2SAJ execution and host callbacks for session integration.
#pragma once
#include "jass_binary_bridge.h"
#include <functional>

namespace war3 {
struct JassBinaryHost {
    std::function<JassBinaryNativeValue(const std::string&)> codeReference;
    std::function<size_t(const std::string&)> nativeArity;
    std::function<JassBinaryNativeValue(const std::string&,std::span<const JassBinaryNativeValue>)> nativeCall;
    std::function<JassBinaryNativeValue(const std::string&)> globalRead;
    std::function<void(const std::string&,const JassBinaryNativeValue&)> globalWrite;
    std::function<JassBinaryNativeValue(const std::string&,std::uint32_t,std::uint8_t)> arrayRead;
    std::function<void(const std::string&,std::uint32_t,const JassBinaryNativeValue&)> arrayWrite;
};
JassBinaryNativeValue runJass2Function(const JassBinaryProgram& program,const JassBinaryIndex& index,const std::string& name,const JassBinaryHost& host,std::span<const JassBinaryNativeValue> arguments={},size_t stepLimit=1000000);
}
