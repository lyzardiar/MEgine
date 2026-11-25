// Author: MiYu. Numeric IPv4 destinations accepted by LAN discovery.
#pragma once
#include <cstdint>
#include <optional>
#include <string_view>

namespace war3 {
// A valid directed address in network byte order. Empty input is the caller's automatic mode.
std::optional<std::uint32_t> parseLanDiscoveryAddress(std::string_view address);
}
