// Author: MiYu. Original font memory lifetime and Win32 text rasterization.
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
const Text::Label& Text::label(std::wstring_view text) {
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
    return found->second;
}
float Text::width(std::wstring_view text, float height, bool padding) {if(text.empty())return 0;SIZE size{};if(text.size()>4096 || !GetTextExtentPoint32W(context_,text.data(),static_cast<int>(text.size()),&size))throw std::runtime_error("Font measurement failed");return height*(size.cx+(padding?4:0))/(size.cy+4);}
size_t Text::fit(std::wstring_view text,float width,float height) {if(text.empty() || width<=0 || height<=0)return 0;TEXTMETRICW metrics{};if(!GetTextMetricsW(context_,&metrics))throw std::runtime_error("Font metrics failed");int count=0;SIZE size{};if(text.size()>4096 || !GetTextExtentExPointW(context_,text.data(),static_cast<int>(text.size()),static_cast<int>(width*(metrics.tmHeight+4)/height),&count,nullptr,&size))throw std::runtime_error("Font fit failed");return size_t(count);}
void Text::draw(std::wstring_view text, float x, float y, float height, DWORD color, bool centered) {
    if(text.empty())return;auto& value=label(text);float width=height*value.width/value.height;
    renderer_.rect(centered ? x-width/2 : x,y,width,height,color,value.texture.Get());
}
}
