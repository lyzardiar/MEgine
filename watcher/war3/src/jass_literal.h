// Author: MiYu. Unsigned token accumulation for classic JASS integer literals.
#pragma once
#include <cstdint>
#include <string_view>

namespace war3::jass {
std::uint32_t integerLiteral(std::string_view token);
}
