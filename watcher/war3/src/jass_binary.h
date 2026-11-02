// Author: MiYu. Decode the bounded 2SAJ container without changing the session random stream.
#pragma once
#include <cstdint>
#include <map>
#include <utility>
#include <span>
#include <string>
#include <vector>

namespace war3 {
struct JassBinaryInstruction {std::uint8_t r3=0,r2=0,r1=0,opcode=0;std::uint32_t operand=0;};
struct JassBinaryProgram {std::vector<std::string> symbols;std::vector<JassBinaryInstruction> instructions;};
struct JassBinaryIndex {std::map<std::string,std::pair<size_t,size_t>> functions;std::map<std::uint32_t,size_t> labels;};
JassBinaryIndex indexJass2Binary(const JassBinaryProgram& program);
JassBinaryProgram readJass2Binary(std::span<const std::uint8_t> decoded);
std::vector<std::uint8_t> decodeJass2Binary(std::span<const std::uint8_t> bytes);
}
