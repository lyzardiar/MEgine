// Author: MiYu. Shared original-font registration and device-independent text measurement.
#pragma once
#include "platform.h"
#include <functional>

namespace war3 {
class FontMetrics {
    HANDLE resource_=nullptr;
    HFONT font_=nullptr;
public:
    explicit FontMetrics(std::span<const std::uint8_t> font);
    ~FontMetrics();
    FontMetrics(const FontMetrics&)=delete;
    FontMetrics& operator=(const FontMetrics&)=delete;
    HFONT font() const {return font_;}
    float width(std::wstring_view text,float height,bool padding=true) const;
    static float width(HDC context,std::wstring_view text,float height,bool padding=true);
    size_t fit(std::wstring_view text,float width,float height) const;
    static size_t fit(HDC context,std::wstring_view text,float width,float height);
};
struct FontLine {size_t begin=0,end=0;};
std::vector<FontLine> wrapFontLines(std::wstring_view text,float width,float height,size_t limit,const std::function<size_t(std::wstring_view,float,float)>& fit);
}
