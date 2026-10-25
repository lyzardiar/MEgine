// Author: MiYu. Original font rasterization and Miles in-memory music.
#pragma once
#include "archive.h"
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
public:
    Text(Renderer& renderer, std::span<const std::uint8_t> font);
    ~Text();
    Text(const Text&) = delete;
    Text& operator=(const Text&) = delete;
    void draw(std::wstring_view text, float x, float y, float height, DWORD color = 0xffffcc55, bool centered = false);
};
class Music {
    Library library_;
    using Void = void(__stdcall*)();
    using One = void(__stdcall*)(void*);
    using Start = int(__stdcall*)();
    using Open = void*(__stdcall*)(unsigned, int, int, unsigned);
    using Allocate = void*(__stdcall*)(void*);
    using Named = int(__stdcall*)(void*, const char*, const void*, int, int);
    using Loop = void(__stdcall*)(void*, int);
    using Redist = const char*(__stdcall*)(const char*);
    Void shutdown_ = nullptr;
    One close_ = nullptr, release_ = nullptr, end_ = nullptr;
    void* driver_ = nullptr;
    void* sample_ = nullptr;
    std::shared_ptr<const Member> bytes_;
public:
    Music(const fs::path& dataRoot, std::shared_ptr<const Member> music);
    ~Music();
    Music(const Music&) = delete;
    Music& operator=(const Music&) = delete;
};
}
