// Author: MiYu. Original font memory lifetime and Win32 text rasterization.
#include "media.h"
#include <algorithm>
#include <cstring>

namespace war3 {
Text::Text(Renderer& renderer,std::span<const std::uint8_t> font):renderer_(renderer),metrics_(font){context_=CreateCompatibleDC(nullptr);if(!context_)throw std::runtime_error("Cannot rasterize original font");auto previous=SelectObject(context_,metrics_.font());if(!previous || previous==HGDI_ERROR){DeleteDC(context_);context_=nullptr;throw std::runtime_error("Cannot select original font");}}
Text::~Text(){if(context_)DeleteDC(context_);}
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
float Text::width(std::wstring_view text,float height,bool padding){return FontMetrics::width(context_,text,height,padding);}
size_t Text::fit(std::wstring_view text,float width,float height){return FontMetrics::fit(context_,text,width,height);}
void Text::draw(std::wstring_view text, float x, float y, float height, DWORD color, bool centered) {
    if(text.empty())return;if(text.size()>4096)throw std::runtime_error("Label exceeds limit");if(auto found=cache_.find(std::wstring(text));found!=cache_.end()){auto& value=found->second;float width=height*value.width/value.height;renderer_.rect(centered?x-width/2:x,y,width,height,color,value.texture.Get());return;}SIZE total{};if(!GetTextExtentPoint32W(context_,text.data(),int(text.size()),&total))throw std::runtime_error("Font measurement failed");if(total.cx<=8188){auto& value=label(text);float width=height*value.width/value.height;renderer_.rect(centered?x-width/2:x,y,width,height,color,value.texture.Get());return;}if(centered)x-=height*(total.cx+4)/(total.cy+4)/2;
    for(size_t at=0;at<text.size();){auto remaining=text.substr(at);int count=0;SIZE extent{};if(!GetTextExtentExPointW(context_,remaining.data(),int(remaining.size()),8188,&count,nullptr,&extent) || count<=0)throw std::runtime_error("Font chunk measurement failed");if(size_t(count)<remaining.size() && remaining[count-1]>=0xd800 && remaining[count-1]<=0xdbff && remaining[count]>=0xdc00 && remaining[count]<=0xdfff)--count;if(!count)throw std::runtime_error("Font glyph exceeds texture size");auto part=remaining.substr(0,size_t(count));auto advance=width(part,height,false);auto& value=label(part);renderer_.rect(x,y,height*value.width/value.height,height,color,value.texture.Get());x+=advance;at+=size_t(count);}
}
}
