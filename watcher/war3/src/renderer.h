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
    D3DPRESENT_PARAMETERS parameters_{};
    HWND window_;
    bool resize_ = false;
public:
    explicit Renderer(HWND window);
    void resize(unsigned width, unsigned height);
    bool begin();
    bool end();
    void rect(float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture = nullptr);
    Com<IDirect3DTexture9> texture(unsigned width, unsigned height, std::span<const std::uint32_t> pixels);
    IDirect3DDevice9* device() const { return device_.Get(); }
    unsigned width() const { return parameters_.BackBufferWidth; }
    unsigned height() const { return parameters_.BackBufferHeight; }
};
}
