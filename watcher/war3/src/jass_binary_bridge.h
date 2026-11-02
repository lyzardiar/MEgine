// Author: MiYu. Bridge typed 2SAJ native arguments to the existing session JASS runtime.
#pragma once
#include "jass_binary.h"
#include "jass_runtime.h"

namespace war3 {
struct JassBinaryNativeValue {std::uint8_t type=0;std::uint32_t bits=0;std::shared_ptr<const std::string> text;};
JassBinaryNativeValue invokeJass2Native(jass::Runtime& runtime,const JassBinaryProgram& program,const std::string& name,std::span<const JassBinaryNativeValue> arguments);
}
