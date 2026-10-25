// Author: MiYu. Font memory lifetime and pinned stdcall audio boundary.
#include "media.h"
#include <algorithm>
#include <cstring>

namespace war3 {
namespace {
unsigned big16(std::span<const std::uint8_t> b, size_t at) { if (at > b.size() || b.size() - at < 2) throw std::runtime_error("Truncated font"); return (unsigned(b[at]) << 8) | b[at + 1]; }
unsigned big32(std::span<const std::uint8_t> b, size_t at) { return (big16(b, at) << 16) | big16(b, at + 2); }
std::wstring family(std::span<const std::uint8_t> b) {
    auto count = big16(b, 4);
    for (unsigned i = 0; i < count; ++i) {
        size_t at = 12 + i * 16;
        if (big32(b, at) != 0x6e616d65) continue;
        size_t start = big32(b, at + 8), strings = start + big16(b, start + 4);
        unsigned records = big16(b, start + 2);
        for (unsigned j = 0; j < records; ++j) {
            auto row = start + 6 + j * 12;
            if (big16(b, row) != 3 || big16(b, row + 6) != 1) continue;
            size_t length = big16(b, row + 8), offset = strings + big16(b, row + 10);
            if (length % 2 || length > 512 || offset > b.size() || length > b.size() - offset) throw std::runtime_error("Invalid font family");
            std::wstring result;
            for (size_t k = 0; k < length; k += 2) result += wchar_t(big16(b, offset + k));
            return result;
        }
    }
    throw std::runtime_error("Font has no Windows family name");
}
}
Text::Text(Renderer& renderer, std::span<const std::uint8_t> font) : renderer_(renderer) {
    auto name = family(font);
    DWORD count = 0;
    resource_ = AddFontMemResourceEx(const_cast<std::uint8_t*>(font.data()), static_cast<DWORD>(font.size()), nullptr, &count);
    if (!resource_ || !count) throw std::runtime_error("Cannot register original font");
    context_ = CreateCompatibleDC(nullptr);
    font_ = CreateFontW(-32, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY, DEFAULT_PITCH, name.c_str());
    if (!context_ || !font_) { if (context_) DeleteDC(context_); if (font_) DeleteObject(font_); RemoveFontMemResourceEx(resource_); throw std::runtime_error("Cannot rasterize original font"); }
    SelectObject(context_, font_);
}
Text::~Text() { if (context_) DeleteDC(context_); if (font_) DeleteObject(font_); if (resource_) RemoveFontMemResourceEx(resource_); }
void Text::draw(std::wstring_view text, float x, float y, float height, DWORD color, bool centered) {
    if (text.empty()) return;
    std::wstring key(text);
    auto found = cache_.find(key);
    if (found == cache_.end()) {
        if (key.size() > 4096) throw std::runtime_error("Label exceeds limit");
        SIZE size{};
        if (!GetTextExtentPoint32W(context_, key.data(), static_cast<int>(key.size()), &size)) throw std::runtime_error("Font measurement failed");
        unsigned w = unsigned(std::max(size.cx + 4, 1l)), h = unsigned(std::max(size.cy + 4, 1l));
        if (w > 8192 || h > 8192) throw std::runtime_error("Label exceeds texture size");
        BITMAPINFO info{}; info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER); info.bmiHeader.biWidth = w; info.bmiHeader.biHeight = -static_cast<int>(h); info.bmiHeader.biPlanes = 1; info.bmiHeader.biBitCount = 32; info.bmiHeader.biCompression = BI_RGB;
        void* pixels = nullptr;
        auto bitmap = CreateDIBSection(context_, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
        if (!bitmap) throw std::runtime_error("Label allocation failed");
        auto previous = SelectObject(context_, bitmap);
        std::memset(pixels, 0, size_t(w) * h * 4);
        SetTextColor(context_, RGB(255, 255, 255)); SetBkColor(context_, RGB(0, 0, 0)); SetBkMode(context_, OPAQUE);
        TextOutW(context_, 2, 2, key.data(), static_cast<int>(key.size())); GdiFlush();
        auto data = static_cast<std::uint32_t*>(pixels);
        for (size_t i = 0; i < size_t(w) * h; ++i) { unsigned a = std::max({data[i] & 255, (data[i] >> 8) & 255, (data[i] >> 16) & 255}); data[i] = 0xffffff | (a << 24); }
        Com<IDirect3DTexture9> texture;
        try { texture = renderer_.texture(w, h, {data, size_t(w) * h}); }
        catch (...) { SelectObject(context_, previous); DeleteObject(bitmap); throw; }
        SelectObject(context_, previous); DeleteObject(bitmap);
        if (cache_.size() >= 256) cache_.clear();
        found = cache_.emplace(std::move(key), Label{std::move(texture), w, h}).first;
    }
    auto& label = found->second;
    auto width = height * label.width / label.height;
    renderer_.rect(centered ? x - width / 2 : x, y, width, height, color, label.texture.Get());
}
Music::Music(const fs::path& dataRoot, std::shared_ptr<const Member> music) : library_(dataRoot / L"mss32.dll", "1f9a83f42de0e7899a7f6772e5cbad6ed10c16cc5f15246c8d80b9f4fe25fc4a"), bytes_(std::move(music)) {
    auto startup = library_.symbol<Start>("_AIL_startup@0");
    shutdown_ = library_.symbol<Void>("_AIL_shutdown@0"); close_ = library_.symbol<One>("_AIL_close_digital_driver@4"); release_ = library_.symbol<One>("_AIL_release_sample_handle@4"); end_ = library_.symbol<One>("_AIL_end_sample@4");
    auto open = library_.symbol<Open>("_AIL_open_digital_driver@16");
    auto allocate = library_.symbol<Allocate>("_AIL_allocate_sample_handle@4");
    auto named = library_.symbol<Named>("_AIL_set_named_sample_file@20");
    auto loop = library_.symbol<Loop>("_AIL_set_sample_loop_count@8");
    auto play = library_.symbol<One>("_AIL_start_sample@4");
    auto redist = library_.symbol<Redist>("_AIL_set_redist_directory@4");
    if (!bytes_ || bytes_->bytes.empty() || bytes_->bytes.size() > INT_MAX) throw std::runtime_error("Missing original menu music");
    if (!startup()) throw std::runtime_error("Miles startup failed");
    try {
        auto path = utf8(dataRoot.wstring()); redist(path.c_str());
        driver_ = open(44100, 16, 2, 0);
        if (!driver_) throw std::runtime_error("Miles digital driver unavailable");
        sample_ = allocate(driver_);
        if (!sample_) throw std::runtime_error("Miles sample allocation failed");
        if (!named(sample_, ".mp3", bytes_->bytes.data(), static_cast<int>(bytes_->bytes.size()), 0)) throw std::runtime_error("Miles cannot decode menu MP3");
        loop(sample_, 0); play(sample_);
    } catch (...) { if (sample_) release_(sample_); if (driver_) close_(driver_); shutdown_(); throw; }
}
Music::~Music() { if (sample_) { end_(sample_); release_(sample_); } if (driver_) close_(driver_); if (shutdown_) shutdown_(); }
}
