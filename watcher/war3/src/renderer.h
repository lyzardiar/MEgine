// Author: MiYu. D3D9 device ownership and native client drawing.
#pragma once
#include "platform.h"
#include <d3d9.h>
#include <wrl/client.h>

namespace war3 {
template<class T> using Com = Microsoft::WRL::ComPtr<T>;
class Renderer {
    Com<IDirect3D9> api_;
    Com<IDirect3DDevice9> device_;
    Com<IDirect3DDevice9Ex> extended_;
    D3DPRESENT_PARAMETERS parameters_{};
    HWND window_;
    bool resize_ = false;
    bool translated_ = false;
    bool reference_ = false;
public:
    explicit Renderer(HWND window, bool reference = false);
    void resize(unsigned width, unsigned height);
    bool begin();
    bool end(const fs::path& capture = {});
    void capture(const fs::path& path);
    void rect(float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture = nullptr, float u0 = 0, float v0 = 0, float u1 = 1, float v1 = 1, bool tile = false, bool additive = false, bool transpose = false);
    Com<IDirect3DTexture9> texture(unsigned width, unsigned height, std::span<const std::uint32_t> pixels);
    IDirect3DDevice9* device() const { return device_.Get(); }
    unsigned width() const { return parameters_.BackBufferWidth; }
    unsigned height() const { return parameters_.BackBufferHeight; }
    const char* driver() const { return reference_ ? (extended_ ? "d3d9ex-reference" : "d3d9-reference") : translated_ ? (extended_ ? "d3d9on12ex" : "d3d9on12") : extended_ ? "d3d9ex" : "d3d9"; }
};
}
