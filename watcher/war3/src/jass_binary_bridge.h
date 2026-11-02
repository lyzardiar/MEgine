// Author: MiYu. Bridge typed 2SAJ native arguments to the existing session JASS runtime.
#pragma once
#include "jass_binary.h"
#include "jass_runtime.h"

namespace war3 {
struct JassBinaryNativeValue {std::uint8_t type=0;std::uint32_t bits=0;std::shared_ptr<const std::string> text;jass::Value code;};
jass::Value toJass2Value(jass::Runtime& runtime,const JassBinaryProgram& program,jass::Id type,const JassBinaryNativeValue& value);
JassBinaryNativeValue fromJass2Value(const jass::Runtime& runtime,const jass::Value& value);
JassBinaryNativeValue invokeJass2Native(jass::Runtime& runtime,const JassBinaryProgram& program,const std::string& name,std::span<const JassBinaryNativeValue> arguments);
}
