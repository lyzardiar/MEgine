// Author: MiYu. Resizable D3D9 rendering with lost-device recovery.
#include "renderer.h"
#include <cstring>
#include <wincodec.h>
#include <d3d9on12.h>

namespace war3 {
namespace {
void check(HRESULT result, const char* operation) { if (FAILED(result)) throw std::runtime_error(std::string(operation) + ": HRESULT " + std::to_string(static_cast<unsigned long>(result))); }
struct Vertex { float x, y, z, rhw; DWORD color; float u, v; };
}
Renderer::Renderer(HWND window, bool reference) : window_(window), reference_(reference) {
    api_.Attach(Direct3DCreate9(D3D_SDK_VERSION));
    if (!api_) throw std::runtime_error("Direct3D 9 unavailable");
    auto deviceType = reference ? D3DDEVTYPE_REF : D3DDEVTYPE_HAL;
    D3DCAPS9 initialCaps{};
    if (FAILED(api_->GetDeviceCaps(D3DADAPTER_DEFAULT, deviceType, &initialCaps))) {
        Com<IDirect3D9Ex> compatible;
        if (SUCCEEDED(Direct3DCreate9Ex(D3D_SDK_VERSION, &compatible)) && SUCCEEDED(compatible->GetDeviceCaps(D3DADAPTER_DEFAULT, deviceType, &initialCaps))) api_ = compatible;
    }
    if (!reference && FAILED(api_->GetDeviceCaps(D3DADAPTER_DEFAULT, deviceType, &initialCaps))) {
        auto createOn12 = reinterpret_cast<PFN_Direct3DCreate9On12Ex>(GetProcAddress(GetModuleHandleW(L"d3d9.dll"), "Direct3DCreate9On12Ex"));
        if (createOn12) {
            D3D9ON12_ARGS override{}; override.Enable9On12 = TRUE;
            Com<IDirect3D9Ex> compatible;
            if (SUCCEEDED(createOn12(D3D_SDK_VERSION, &override, 1, &compatible)) && SUCCEEDED(compatible->GetDeviceCaps(D3DADAPTER_DEFAULT, deviceType, &initialCaps))) { api_ = compatible; translated_ = true; }
        }
    }
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
    D3DDISPLAYMODE display{};
    check(api_->GetAdapterDisplayMode(D3DADAPTER_DEFAULT, &display), "Adapter display mode");
    parameters_.AutoDepthStencilFormat = D3DFMT_D16;
    for (auto format : {D3DFMT_D24S8, D3DFMT_D24X8, D3DFMT_D16}) {
        if (SUCCEEDED(api_->CheckDeviceFormat(D3DADAPTER_DEFAULT, deviceType, display.Format, D3DUSAGE_DEPTHSTENCIL, D3DRTYPE_SURFACE, format)) && SUCCEEDED(api_->CheckDepthStencilMatch(D3DADAPTER_DEFAULT, deviceType, display.Format, display.Format, format))) { parameters_.AutoDepthStencilFormat = format; break; }
    }
    parameters_.PresentationInterval = D3DPRESENT_INTERVAL_ONE;
    auto attempt = parameters_;
    auto result = api_->CreateDevice(D3DADAPTER_DEFAULT, deviceType, window, D3DCREATE_HARDWARE_VERTEXPROCESSING | D3DCREATE_FPU_PRESERVE, &attempt, &device_);
    if (FAILED(result)) { attempt = parameters_; result = api_->CreateDevice(D3DADAPTER_DEFAULT, deviceType, window, D3DCREATE_SOFTWARE_VERTEXPROCESSING | D3DCREATE_FPU_PRESERVE, &attempt, &device_); }
    if (FAILED(result)) {
        D3DCAPS9 caps{}; auto capability = api_->GetDeviceCaps(D3DADAPTER_DEFAULT, deviceType, &caps);
        throw std::runtime_error("Create D3D9 device: HRESULT " + std::to_string(static_cast<unsigned long>(result)) + " caps=" + std::to_string(static_cast<unsigned long>(capability)) + " adapters=" + std::to_string(api_->GetAdapterCount()) + " depth=" + std::to_string(parameters_.AutoDepthStencilFormat));
    }
    device_.As(&extended_);
}
void Renderer::resize(unsigned width, unsigned height) {
    if (!width || !height || (width == parameters_.BackBufferWidth && height == parameters_.BackBufferHeight)) return;
    parameters_.BackBufferWidth = width;
    parameters_.BackBufferHeight = height;
    resize_ = true;
}
bool Renderer::begin() {
    auto state = extended_ ? extended_->CheckDeviceState(window_) : device_->TestCooperativeLevel();
    if (state == D3DERR_DEVICELOST) return false;
    if (state == D3DERR_DEVICENOTRESET || state == S_PRESENT_MODE_CHANGED || resize_) {
        auto reset = parameters_;
        auto result = extended_ ? extended_->ResetEx(&reset, nullptr) : device_->Reset(&reset);
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
bool Renderer::end(const fs::path& path) {
    check(device_->EndScene(), "End scene");
    if (!path.empty()) capture(path);
    auto result = device_->Present(nullptr, nullptr, nullptr, nullptr);
    if (result == D3DERR_DEVICELOST) return false;
    check(result, "Present");
    return true;
}
void Renderer::capture(const fs::path& path) {
    Com<IDirect3DSurface9> back, memory;
    check(device_->GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO, &back), "Capture back buffer");
    D3DSURFACE_DESC description{}; check(back->GetDesc(&description), "Back buffer description");
    if (description.Format != D3DFMT_X8R8G8B8 && description.Format != D3DFMT_A8R8G8B8) throw std::runtime_error("Unsupported capture format");
    check(device_->CreateOffscreenPlainSurface(description.Width, description.Height, description.Format, D3DPOOL_SYSTEMMEM, &memory, nullptr), "Capture surface");
    check(device_->GetRenderTargetData(back.Get(), memory.Get()), "Read rendered pixels");
    D3DLOCKED_RECT lock{}; check(memory->LockRect(&lock, nullptr, D3DLOCK_READONLY), "Lock captured pixels");
    std::vector<std::uint32_t> pixels(size_t(description.Width) * description.Height);
    for (unsigned y = 0; y < description.Height; ++y) { std::memcpy(pixels.data() + y * description.Width, static_cast<char*>(lock.pBits) + y * lock.Pitch, description.Width * 4); for (unsigned x = 0; x < description.Width; ++x) pixels[y * description.Width + x] |= 0xff000000; }
    check(memory->UnlockRect(), "Unlock capture");
    auto initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(initialized) && initialized != RPC_E_CHANGED_MODE) check(initialized, "Initialize image encoder");
    struct CloseCom { bool active; ~CloseCom() { if (active) CoUninitialize(); } } close{SUCCEEDED(initialized)};
    Com<IWICImagingFactory> factory; check(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory)), "Create image encoder");
    Com<IWICStream> stream; check(factory->CreateStream(&stream), "Create capture stream");
    if (!path.parent_path().empty()) fs::create_directories(path.parent_path());
    check(stream->InitializeFromFilename(path.c_str(), GENERIC_WRITE), "Open capture");
    Com<IWICBitmapEncoder> encoder; check(factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder), "Create PNG encoder"); check(encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache), "Initialize PNG");
    Com<IWICBitmapFrameEncode> frame; check(encoder->CreateNewFrame(&frame, nullptr), "Create PNG frame"); check(frame->Initialize(nullptr), "Initialize PNG frame"); check(frame->SetSize(description.Width, description.Height), "PNG dimensions");
    auto format = GUID_WICPixelFormat32bppBGRA; check(frame->SetPixelFormat(&format), "PNG format");
    if (format != GUID_WICPixelFormat32bppBGRA) throw std::runtime_error("PNG encoder rejected BGRA");
    check(frame->WritePixels(description.Height, description.Width * 4, static_cast<UINT>(pixels.size() * 4), reinterpret_cast<BYTE*>(pixels.data())), "Write PNG pixels"); check(frame->Commit(), "Commit PNG frame"); check(encoder->Commit(), "Commit PNG");
}
void Renderer::rect(float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture, float u0, float v0, float u1, float v1, bool tile, bool additive, bool transpose) {
    x -= 0.5f; y -= 0.5f;
    Vertex vertices[] = {{x,y,0,1,color,u0,v0}, {x+w,y,0,1,color,u1,v0}, {x,y+h,0,1,color,u0,v1}, {x+w,y+h,0,1,color,u1,v1}};
    if(transpose) {vertices[1].u=u0;vertices[1].v=v1;vertices[2].u=u1;vertices[2].v=v0;}
    device_->SetRenderState(D3DRS_ZENABLE, FALSE);
    device_->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE);
    device_->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
    device_->SetRenderState(D3DRS_DESTBLEND, additive ? D3DBLEND_ONE : D3DBLEND_INVSRCALPHA);
    device_->SetTexture(0, texture);
    device_->SetTextureStageState(0, D3DTSS_COLOROP, texture ? D3DTOP_MODULATE : D3DTOP_SELECTARG2);
    device_->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
    device_->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
    device_->SetTextureStageState(0, D3DTSS_ALPHAOP, texture ? D3DTOP_MODULATE : D3DTOP_SELECTARG2);
    device_->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
    device_->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
    device_->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_LINEAR);
    device_->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_LINEAR);
    device_->SetSamplerState(0, D3DSAMP_ADDRESSU, tile ? D3DTADDRESS_WRAP : D3DTADDRESS_CLAMP);
    device_->SetSamplerState(0, D3DSAMP_ADDRESSV, tile ? D3DTADDRESS_WRAP : D3DTADDRESS_CLAMP);
    device_->SetFVF(D3DFVF_XYZRHW | D3DFVF_DIFFUSE | D3DFVF_TEX1);
    check(device_->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP, 2, vertices, sizeof(Vertex)), "Draw quad");
}
Com<IDirect3DTexture9> Renderer::texture(unsigned width, unsigned height, std::span<const std::uint32_t> pixels) {
    if (!width || !height || width > 8192 || height > 8192 || pixels.size() != static_cast<size_t>(width) * height) throw std::runtime_error("Invalid texture dimensions");
    Com<IDirect3DTexture9> texture;
    check(device_->CreateTexture(width, height, 1, 0, D3DFMT_A8R8G8B8, extended_ ? D3DPOOL_SYSTEMMEM : D3DPOOL_MANAGED, &texture, nullptr), "Create texture");
    D3DLOCKED_RECT lock{};
    check(texture->LockRect(0, &lock, nullptr, 0), "Lock texture");
    for (unsigned y = 0; y < height; ++y) std::memcpy(static_cast<char*>(lock.pBits) + y * lock.Pitch, pixels.data() + y * width, width * 4);
    check(texture->UnlockRect(0), "Unlock texture");
    if (extended_) {
        Com<IDirect3DTexture9> gpu;
        check(device_->CreateTexture(width, height, 1, 0, D3DFMT_A8R8G8B8, D3DPOOL_DEFAULT, &gpu, nullptr), "Create GPU texture");
        check(device_->UpdateTexture(texture.Get(), gpu.Get()), "Upload GPU texture");
        return gpu;
    }
    return texture;
}
}
