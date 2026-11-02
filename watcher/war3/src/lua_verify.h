// Author: MiYu. Check Lua instruction operands and control-flow targets after binary translation.
#pragma once
struct Proto;
namespace war3 {
void validateLuaInstructions(const Proto* proto);
}
