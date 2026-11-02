// Author: MiYu. Decode the bounded 2SAJ container without changing the session random stream.
#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace war3 {
struct JassBinaryInstruction {std::uint8_t flags=0,type=0,reg=0,opcode=0;std::uint32_t operand=0;};
struct JassBinaryProgram {std::vector<std::string> symbols;std::vector<JassBinaryInstruction> instructions;};
JassBinaryProgram readJass2Binary(std::span<const std::uint8_t> decoded);
std::vector<std::uint8_t> decodeJass2Binary(std::span<const std::uint8_t> bytes);
}
