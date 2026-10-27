// Author: MiYu. Original 1.27 order registrations shared by scripts and client commands.
#pragma once
#include <cstdint>
#include <string_view>
namespace war3 {
std::uint32_t orderId(std::string_view name);
std::string_view orderName(std::uint32_t id);
}
