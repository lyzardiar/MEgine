// Author: MiYu. Resizable D3D9 rendering with lost-device recovery.
#include "renderer.h"
#include <cstring>
#include <array>
#include <wincodec.h>
#include <d3d9on12.h>

namespace war3 {
namespace {
void check(HRESULT result, const char* operation) { if (FAILED(result)) throw std::runtime_error(std::string(operation) + ": HRESULT " + std::to_string(static_cast<unsigned long>(result))); }
struct Vertex { float x, y, z, rhw; DWORD color; float u, v; };
}
Renderer::Renderer(HWND window, bool reference) : window_(window), reference_(reference) {
    auto deviceType = reference ? D3DDEVTYPE_REF : D3DDEVTYPE_HAL;
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
    parameters_.PresentationInterval = D3DPRESENT_INTERVAL_ONE;
    std::string failures;
    for(unsigned backend=0;backend<3;++backend) {
        Com<IDirect3D9> candidate;
        const char* name=backend==0?"d3d9":backend==1?"d3d9ex":"d3d9on12ex";
        if(backend==0)candidate.Attach(Direct3DCreate9(D3D_SDK_VERSION));
        else {Com<IDirect3D9Ex> extended;HRESULT result=E_NOTIMPL;if(backend==1)result=Direct3DCreate9Ex(D3D_SDK_VERSION,&extended);else if(!reference){auto create=reinterpret_cast<PFN_Direct3DCreate9On12Ex>(GetProcAddress(GetModuleHandleW(L"d3d9.dll"),"Direct3DCreate9On12Ex"));if(create){D3D9ON12_ARGS args{};args.Enable9On12=TRUE;result=create(D3D_SDK_VERSION,&args,1,&extended);}}if(SUCCEEDED(result))candidate=extended;}
        if(!candidate){failures+=std::string(name)+" unavailable; ";continue;}
        D3DCAPS9 caps{};D3DDISPLAYMODE display{};auto capability=candidate->GetDeviceCaps(D3DADAPTER_DEFAULT,deviceType,&caps),mode=candidate->GetAdapterDisplayMode(D3DADAPTER_DEFAULT,&display);
        if(FAILED(capability) || FAILED(mode)){failures+=std::string(name)+" caps="+std::to_string(ULONG(capability))+" mode="+std::to_string(ULONG(mode))+"; ";continue;}
        HRESULT result=D3DERR_NOTAVAILABLE;
        for(auto depth:{D3DFMT_D24S8,D3DFMT_D24X8,D3DFMT_D16}) {
            if(FAILED(candidate->CheckDeviceFormat(D3DADAPTER_DEFAULT,deviceType,display.Format,D3DUSAGE_DEPTHSTENCIL,D3DRTYPE_SURFACE,depth)) || FAILED(candidate->CheckDepthStencilMatch(D3DADAPTER_DEFAULT,deviceType,display.Format,display.Format,depth)))continue;
            parameters_.AutoDepthStencilFormat=depth;
            for(auto processing:{D3DCREATE_HARDWARE_VERTEXPROCESSING,D3DCREATE_SOFTWARE_VERTEXPROCESSING}){auto attempt=parameters_;Com<IDirect3DDevice9> gpu;result=candidate->CreateDevice(D3DADAPTER_DEFAULT,deviceType,window,processing|D3DCREATE_FPU_PRESERVE,&attempt,&gpu);if(SUCCEEDED(result)){api_=candidate;device_=gpu;device_.As(&extended_);translated_=backend==2;return;}}
        }
        failures+=std::string(name)+" create="+std::to_string(ULONG(result))+"; ";
    }
    throw std::runtime_error("Create D3D9 device: "+failures);
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
bool Renderer::end(const fs::path& path,std::string* captureError) {
    check(device_->EndScene(), "End scene");
    if (!path.empty()){if(captureError){try{capture(path);}catch(const std::exception& e){*captureError=e.what();}}else capture(path);}
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
void Renderer::cineFilter(float x,float y,float w,float h,DWORD color,IDirect3DTexture9* texture,const std::array<float,4>& uv,unsigned blend,unsigned flags) {
    if(!texture || blend>5 || flags>3)throw std::runtime_error("Invalid cinematic filter draw");x-=.5f;y-=.5f;
    Vertex vertices[]={{x,y,0,1,color,uv[0],uv[1]},{x+w,y,0,1,color,uv[2],uv[1]},{x,y+h,0,1,color,uv[0],uv[3]},{x+w,y+h,0,1,color,uv[2],uv[3]}};
    device_->SetRenderState(D3DRS_ZENABLE,FALSE);device_->SetRenderState(D3DRS_ZWRITEENABLE,FALSE);device_->SetRenderState(D3DRS_ALPHATESTENABLE,blend==1);device_->SetRenderState(D3DRS_ALPHAREF,128);device_->SetRenderState(D3DRS_ALPHAFUNC,D3DCMP_GREATEREQUAL);device_->SetRenderState(D3DRS_ALPHABLENDENABLE,blend>=2);
    device_->SetRenderState(D3DRS_SRCBLEND,blend==4?D3DBLEND_ZERO:blend==5?D3DBLEND_DESTCOLOR:D3DBLEND_SRCALPHA);device_->SetRenderState(D3DRS_DESTBLEND,blend>=4?D3DBLEND_SRCCOLOR:blend==3?D3DBLEND_ONE:D3DBLEND_INVSRCALPHA);
    device_->SetTexture(0,texture);device_->SetTextureStageState(0,D3DTSS_COLOROP,D3DTOP_MODULATE);device_->SetTextureStageState(0,D3DTSS_COLORARG1,D3DTA_TEXTURE);device_->SetTextureStageState(0,D3DTSS_COLORARG2,D3DTA_DIFFUSE);device_->SetTextureStageState(0,D3DTSS_ALPHAOP,D3DTOP_MODULATE);device_->SetTextureStageState(0,D3DTSS_ALPHAARG1,D3DTA_TEXTURE);device_->SetTextureStageState(0,D3DTSS_ALPHAARG2,D3DTA_DIFFUSE);
    device_->SetSamplerState(0,D3DSAMP_MINFILTER,D3DTEXF_LINEAR);device_->SetSamplerState(0,D3DSAMP_MAGFILTER,D3DTEXF_LINEAR);device_->SetSamplerState(0,D3DSAMP_ADDRESSU,flags&1?D3DTADDRESS_WRAP:D3DTADDRESS_CLAMP);device_->SetSamplerState(0,D3DSAMP_ADDRESSV,flags&2?D3DTADDRESS_WRAP:D3DTADDRESS_CLAMP);device_->SetFVF(D3DFVF_XYZRHW|D3DFVF_DIFFUSE|D3DFVF_TEX1);auto result=device_->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP,2,vertices,sizeof(Vertex));device_->SetRenderState(D3DRS_ALPHATESTENABLE,FALSE);check(result,"Draw cinematic filter");
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
