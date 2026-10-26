// Author: MiYu. Classic JASS integer, rawcode and string literal decoding.
#pragma once
#include <cstdint>
#include <string>
#include <string_view>

namespace war3::jass {
std::uint32_t integerLiteral(std::string_view token);
std::uint32_t rawcodeLiteral(std::string_view text);
std::string stringLiteral(std::string_view text);
}
