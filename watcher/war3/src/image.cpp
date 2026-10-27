// Author: MiYu. Original IJL ABI and bounded classic texture decoding.
#include "image.h"
#include <algorithm>
#include <array>
#include <cstring>
#include <limits>

namespace war3 {
namespace {
std::span<const std::uint8_t> slice(std::span<const std::uint8_t> bytes, size_t at, size_t count) {
    if (at > bytes.size() || count > bytes.size() - at) throw std::runtime_error("Truncated image");
    return bytes.subspan(at, count);
}
unsigned word(std::span<const std::uint8_t> bytes, size_t at) { unsigned value; auto data = slice(bytes, at, 4); std::memcpy(&value, data.data(), 4); return value; }
unsigned shortWord(std::span<const std::uint8_t> bytes, size_t at) { auto data = slice(bytes, at, 2); return data[0] | (unsigned(data[1]) << 8); }
Image output(unsigned width, unsigned height) {
    if (!width || !height || width > 8192 || height > 8192 || std::uint64_t(width) * height > 16 * 1024 * 1024) throw std::runtime_error("Image exceeds pixel budget");
    return {width, height, std::vector<std::uint32_t>(size_t(width) * height)};
}
// Storage and prefix follow the shipped 1.27 blp.cpp caller at 0x6f7beed0.
struct alignas(8) IjlCore {
    int useProperties;
    std::uint8_t* dib;
    int width, height, pad, channels, color, subsampling;
    const char* file;
    std::uint8_t* jpg;
    int jpgSize, jpgWidth, jpgHeight, jpgChannels, jpgColor, jpgSubsampling;
    int thumbWidth, thumbHeight, convert, upsample, quality, padding;
    std::uint8_t internal[0x4e10];
};
static_assert(offsetof(IjlCore, internal) == 0x58 && sizeof(IjlCore) == 0x4e68);
std::uint32_t rgb565(unsigned c) {
    unsigned r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
    return 0xff000000 | (((r << 3) | (r >> 2)) << 16) | (((g << 2) | (g >> 4)) << 8) | (b << 3) | (b >> 2);
}
void blockDecode(std::span<const std::uint8_t> bytes, Image& image, unsigned kind, bool alpha) {
    size_t blocksX = (image.width + 3) / 4, blocksY = (image.height + 3) / 4, blockSize = kind == 0 ? 8 : 16;
    slice(bytes, 0, blocksX * blocksY * blockSize);
    for (size_t block = 0; block < blocksX * blocksY; ++block) {
        auto data = bytes.subspan(block * blockSize, blockSize);
        auto colors = kind == 0 ? data : data.subspan(8);
        unsigned c0 = shortWord(colors, 0), c1 = shortWord(colors, 2);
        std::array<unsigned, 4> palette{rgb565(c0), rgb565(c1), 0xff000000, 0};
        for (unsigned channel : {0u, 8u, 16u}) {
            unsigned a = (palette[0] >> channel) & 255, b = (palette[1] >> channel) & 255;
            if (c0 > c1 || kind != 0) { palette[2] |= ((2 * a + b) / 3) << channel; palette[3] |= ((a + 2 * b) / 3) << channel; }
            else palette[2] |= ((a + b) / 2) << channel;
        }
        if (c0 > c1 || kind != 0 || !alpha) palette[3] |= 0xff000000;
        std::array<unsigned, 8> alphaTable{data[0], data[1], 0, 0, 0, 0, 0, 255};
        if (kind == 7) {
            unsigned last = data[0] > data[1] ? 8 : 6;
            for (unsigned i = 2; i < last; ++i) alphaTable[i] = ((last - i) * data[0] + (i - 1) * data[1]) / (last - 1);
        }
        std::uint64_t alphaBits = 0;
        if (kind == 7) for (unsigned i = 0; i < 6; ++i) alphaBits |= std::uint64_t(data[2 + i]) << (8 * i);
        unsigned indices = word(colors, 4);
        for (unsigned i = 0; i < 16; ++i) {
            size_t x = (block % blocksX) * 4 + i % 4, y = (block / blocksX) * 4 + i / 4;
            if (x >= image.width || y >= image.height) continue;
            unsigned color = palette[(indices >> (i * 2)) & 3];
            if (kind == 1) { unsigned a = (data[i / 2] >> (i % 2 * 4)) & 15; color = (color & 0xffffff) | ((alpha ? a * 17 : 255) << 24); }
            if (kind == 7) color = (color & 0xffffff) | ((alpha ? alphaTable[(alphaBits >> (i * 3)) & 7] : 255) << 24);
            image.pixels[y * image.width + x] = color;
        }
    }
}
Image tga(std::span<const std::uint8_t> bytes) {
    slice(bytes, 0, 18);
    if (bytes[1] || (bytes[2] != 2 && bytes[2] != 10) || (bytes[16] != 24 && bytes[16] != 32)) throw std::runtime_error("Unsupported TGA encoding");
    auto image = output(shortWord(bytes, 12), shortWord(bytes, 14));
    size_t at = 18 + bytes[0], pixel = 0, channels = bytes[16] / 8;
    auto next = [&]() { auto p = slice(bytes, at, channels); at += channels; return p[0] | (unsigned(p[1]) << 8) | (unsigned(p[2]) << 16) | ((channels == 4 && (bytes[17] & 15) ? unsigned(p[3]) : 255) << 24); };
    while (pixel < image.pixels.size()) {
        unsigned packet = bytes[2] == 10 ? slice(bytes, at++, 1)[0] : 0;
        unsigned count = (packet & 127) + 1;
        if (count > image.pixels.size() - pixel) throw std::runtime_error("TGA run exceeds image");
        unsigned repeated = packet & 128 ? next() : 0;
        for (unsigned i = 0; i < count; ++i, ++pixel) {
            size_t x = pixel % image.width, y = pixel / image.width;
            if (!(bytes[17] & 32)) y = image.height - 1 - y;
            if (bytes[17] & 16) x = image.width - 1 - x;
            image.pixels[y * image.width + x] = packet & 128 ? repeated : next();
        }
    }
    return image;
}
}
Image decodeTga(std::span<const std::uint8_t> bytes) {return tga(bytes);}
Images::Images(const fs::path& dataRoot) : ijl_(dataRoot / L"ijl15.dll", "334aa12f7dee453d1c6cb1b661a3bb3494d3e4cc9c2ff3f9002064c78404e43a"), init_(ijl_.symbol<Init>("ijlInit")), free_(ijl_.symbol<Init>("ijlFree")), read_(ijl_.symbol<Read>("ijlRead")) {}
Image Images::jpeg(std::span<const std::uint8_t> bytes, unsigned width, unsigned height, bool alpha) const {
    auto image = output(width, height);
    if (bytes.size() > INT_MAX) throw std::runtime_error("JPEG input exceeds IJL limit");
    auto core = std::make_unique<IjlCore>();
    if (init_(core.get()) != 0) throw std::runtime_error("IJL initialization failed");
    struct Free { Init release; void* core; ~Free() { release(core); } } release{free_, core.get()};
    core->jpg = const_cast<std::uint8_t*>(bytes.data()); core->jpgSize = static_cast<int>(bytes.size());
    if (read_(core.get(), 1) != 0 || core->jpgWidth != int(width) || core->jpgHeight != int(height) || (core->jpgChannels != 3 && core->jpgChannels != 4)) throw std::runtime_error("JPEG header disagrees with BLP");
    auto channels = core->jpgChannels;
    Bytes raw(size_t(width) * height * channels);
    core->dib = raw.data(); core->width = width; core->height = height; core->channels = channels; core->pad = 0;
    core->color = 255; core->jpgColor = 255; core->jpgSubsampling = 0;
    if (read_(core.get(), 3) != 0) throw std::runtime_error("IJL JPEG decode failed");
    for (size_t i = 0; i < image.pixels.size(); ++i) image.pixels[i] = raw[i * channels] | (unsigned(raw[i * channels + 1]) << 8) | (unsigned(raw[i * channels + 2]) << 16) | ((alpha && channels == 4 ? unsigned(raw[i * channels + 3]) : 255) << 24);
    return image;
}
Image Images::decode(std::span<const std::uint8_t> bytes, unsigned mip) const {
    slice(bytes, 0, 4);
    bool blp1 = std::memcmp(bytes.data(), "BLP1", 4) == 0, blp2 = std::memcmp(bytes.data(), "BLP2", 4) == 0;
    if (!blp1 && !blp2) { if (mip) throw std::runtime_error("TGA has no stored mip"); return tga(bytes); }
    if (mip >= 16) throw std::runtime_error("Invalid BLP mip");
    slice(bytes, 0, blp1 ? 156 : 148);
    if (blp2 && word(bytes, 4) != 1) throw std::runtime_error("Invalid BLP2 type");
    unsigned width = word(bytes, 12), height = word(bytes, 16);
    if (!width || !height || width > 16384 || height > 16384) throw std::runtime_error("Invalid BLP dimensions");
    width = std::max(width >> mip, 1u); height = std::max(height >> mip, 1u);
    unsigned encoding = blp1 ? word(bytes, 4) : bytes[8], alpha = blp1 ? word(bytes, 8) : bytes[9];
    unsigned offset = word(bytes, (blp1 ? 28 : 20) + 4 * mip), size = word(bytes, (blp1 ? 92 : 84) + 4 * mip);
    size_t floor = blp1 ? 156 : 148;
    if (encoding == 1) floor += 1024;
    if (blp1 && encoding == 0) floor = 160ull + word(bytes, 156);
    if (!size || offset < floor) throw std::runtime_error("BLP mip overlaps header or is missing");
    auto data = slice(bytes, offset, size);
    if (blp1 && encoding == 0) {
        auto shared = slice(bytes, 160, word(bytes, 156));
        Bytes combined(shared.begin(), shared.end()); combined.insert(combined.end(), data.begin(), data.end());
        return jpeg(combined, width, height, alpha != 0);
    }
    if (alpha != 0 && alpha != 1 && alpha != 4 && alpha != 8) throw std::runtime_error("Invalid BLP alpha depth");
    auto image = output(width, height);
    if (encoding == 1) {
        if (blp1 && word(bytes, 20) != 3 && word(bytes, 20) != 4 && word(bytes, 20) != 5) throw std::runtime_error("Invalid BLP1 palette type");
        auto palette = slice(bytes, blp1 ? 156 : 148, 1024);
        auto count = image.pixels.size(); slice(data, 0, count + (count * alpha + 7) / 8);
        for (size_t i = 0; i < count; ++i) {
            unsigned a = 255;
            if (alpha) a = (data[count + i * alpha / 8] >> (i * alpha % 8)) & ((1 << alpha) - 1);
            if (alpha) a = a * 255 / ((1 << alpha) - 1);
            image.pixels[i] = (word(palette, data[i] * 4) & 0xffffff) | (a << 24);
        }
    } else if (blp2 && encoding == 2 && (bytes[10] == 0 || bytes[10] == 1 || bytes[10] == 7)) blockDecode(data, image, bytes[10], alpha != 0);
    else if (blp2 && encoding == 3 && (alpha == 0 || alpha == 8)) { slice(data, 0, image.pixels.size() * 4); std::memcpy(image.pixels.data(), data.data(), image.pixels.size() * 4); if (!alpha) for (auto& pixel : image.pixels) pixel |= 0xff000000; }
    else throw std::runtime_error("Unsupported BLP encoding");
    return image;
}
}
