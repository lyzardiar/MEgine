// Author: MiYu. Preflight Lua 5.3 binary container structure before the upstream loader allocates objects.
#pragma once
#include <cstdint>
#include <span>
namespace war3 {
void validateLuaBinaryStructure(std::span<const std::uint8_t> bytes);
}
