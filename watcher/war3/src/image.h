// Author: MiYu. Native in-memory BLP/TGA image decoding.
#pragma once
#include "platform.h"

namespace war3 {
struct Image {
    unsigned width = 0, height = 0;
    std::vector<std::uint32_t> pixels;
};
class Images {
    Library ijl_;
    using Init = int(__stdcall*)(void*);
    using Read = int(__stdcall*)(void*, int);
    Init init_, free_;
    Read read_;
    Image jpeg(std::span<const std::uint8_t> bytes, unsigned width, unsigned height, bool alpha) const;
public:
    explicit Images(const fs::path& dataRoot);
    Image decode(std::span<const std::uint8_t> bytes, unsigned mip = 0) const;
};
}
