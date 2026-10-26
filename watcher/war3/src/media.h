// Author: MiYu. Native font rasterization and shared in-memory audio interface.
#pragma once
#include "audio.h"
#include "renderer.h"
#include <unordered_map>

namespace war3 {
class Text {
    Renderer& renderer_;
    HANDLE resource_ = nullptr;
    HFONT font_ = nullptr;
    HDC context_ = nullptr;
    struct Label { Com<IDirect3DTexture9> texture; unsigned width, height; };
    std::unordered_map<std::wstring, Label> cache_;
    const Label& label(std::wstring_view text);
public:
    Text(Renderer& renderer, std::span<const std::uint8_t> font);
    ~Text();
    Text(const Text&) = delete;
    Text& operator=(const Text&) = delete;
    void draw(std::wstring_view text, float x, float y, float height, DWORD color = 0xffffcc55, bool centered = false);
    float width(std::wstring_view text, float height, bool padding = true);
    size_t fit(std::wstring_view text,float width,float height);
};

}
