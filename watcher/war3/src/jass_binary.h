// Author: MiYu. Decode the bounded 2SAJ container without changing the session random stream.
#pragma once
#include <cstdint>
#include <span>
#include <vector>

namespace war3 {
std::vector<std::uint8_t> decodeJass2Binary(std::span<const std::uint8_t> bytes);
}
