// Author: MiYu. Shared original-font registration and device-independent text measurement.
#pragma once
#include "platform.h"

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
};
}
