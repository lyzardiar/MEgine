// Author: MiYu. Resizable D3D9 rendering with lost-device recovery.
#include "renderer.h"
#include <cstring>

namespace war3 {
namespace {
void check(HRESULT result, const char* operation) { if (FAILED(result)) throw std::runtime_error(std::string(operation) + ": HRESULT " + std::to_string(static_cast<unsigned long>(result))); }
struct Vertex { float x, y, z, rhw; DWORD color; float u, v; };
}
Renderer::Renderer(HWND window) : window_(window) {
    api_.Attach(Direct3DCreate9(D3D_SDK_VERSION));
    if (!api_) throw std::runtime_error("Direct3D 9 unavailable");
    RECT area{};
    GetClientRect(window, &area);
    parameters_.BackBufferWidth = area.right;
    parameters_.BackBufferHeight = area.bottom;
    parameters_.BackBufferFormat = D3DFMT_UNKNOWN;
    parameters_.BackBufferCount = 1;
    parameters_.SwapEffect = D3DSWAPEFFECT_DISCARD;
    parameters_.hDeviceWindow = window;
    parameters_.Windowed = TRUE;
    parameters_.EnableAutoDepthStencil = TRUE;
    parameters_.AutoDepthStencilFormat = D3DFMT_D24S8;
    parameters_.PresentationInterval = D3DPRESENT_INTERVAL_ONE;
    auto result = api_->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, window, D3DCREATE_HARDWARE_VERTEXPROCESSING | D3DCREATE_FPU_PRESERVE, &parameters_, &device_);
    if (FAILED(result)) result = api_->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, window, D3DCREATE_SOFTWARE_VERTEXPROCESSING | D3DCREATE_FPU_PRESERVE, &parameters_, &device_);
    check(result, "Create D3D9 device");
}
void Renderer::resize(unsigned width, unsigned height) {
    if (!width || !height || (width == parameters_.BackBufferWidth && height == parameters_.BackBufferHeight)) return;
    parameters_.BackBufferWidth = width;
    parameters_.BackBufferHeight = height;
    resize_ = true;
}
bool Renderer::begin() {
    auto state = device_->TestCooperativeLevel();
    if (state == D3DERR_DEVICELOST) return false;
    if (state == D3DERR_DEVICENOTRESET || resize_) {
        auto result = device_->Reset(&parameters_);
        if (result == D3DERR_DEVICELOST) return false;
        check(result, "Reset D3D9 device");
        resize_ = false;
    } else check(state, "D3D9 cooperative state");
    check(device_->Clear(0, nullptr, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER, 0xff080d18, 1, 0), "Clear");
    check(device_->BeginScene(), "Begin scene");
    device_->SetRenderState(D3DRS_LIGHTING, FALSE);
    device_->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
    return true;
}
bool Renderer::end() {
    check(device_->EndScene(), "End scene");
    auto result = device_->Present(nullptr, nullptr, nullptr, nullptr);
    if (result == D3DERR_DEVICELOST) return false;
    check(result, "Present");
    return true;
}
void Renderer::rect(float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture) {
    x -= 0.5f; y -= 0.5f;
    Vertex vertices[] = {{x,y,0,1,color,0,0}, {x+w,y,0,1,color,1,0}, {x,y+h,0,1,color,0,1}, {x+w,y+h,0,1,color,1,1}};
    device_->SetRenderState(D3DRS_ZENABLE, FALSE);
    device_->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE);
    device_->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
    device_->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
    device_->SetTexture(0, texture);
    device_->SetTextureStageState(0, D3DTSS_COLOROP, texture ? D3DTOP_MODULATE : D3DTOP_SELECTARG2);
    device_->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
    device_->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
    device_->SetTextureStageState(0, D3DTSS_ALPHAOP, texture ? D3DTOP_MODULATE : D3DTOP_SELECTARG2);
    device_->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
    device_->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
    device_->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_LINEAR);
    device_->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_LINEAR);
    device_->SetSamplerState(0, D3DSAMP_ADDRESSU, D3DTADDRESS_CLAMP);
    device_->SetSamplerState(0, D3DSAMP_ADDRESSV, D3DTADDRESS_CLAMP);
    device_->SetFVF(D3DFVF_XYZRHW | D3DFVF_DIFFUSE | D3DFVF_TEX1);
    check(device_->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP, 2, vertices, sizeof(Vertex)), "Draw quad");
}
Com<IDirect3DTexture9> Renderer::texture(unsigned width, unsigned height, std::span<const std::uint32_t> pixels) {
    if (!width || !height || width > 8192 || height > 8192 || pixels.size() != static_cast<size_t>(width) * height) throw std::runtime_error("Invalid texture dimensions");
    Com<IDirect3DTexture9> texture;
    check(device_->CreateTexture(width, height, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture, nullptr), "Create texture");
    D3DLOCKED_RECT lock{};
    check(texture->LockRect(0, &lock, nullptr, 0), "Lock texture");
    for (unsigned y = 0; y < height; ++y) std::memcpy(static_cast<char*>(lock.pBits) + y * lock.Pitch, pixels.data() + y * width, width * 4);
    check(texture->UnlockRect(0), "Unlock texture");
    return texture;
}
}
