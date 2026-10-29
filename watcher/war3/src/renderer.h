// Author: MiYu. D3D9 device ownership and native client drawing.
#pragma once
#include "platform.h"
#include <d3d9.h>
#include <wrl/client.h>
#include <array>
#include <optional>

namespace war3 {
template<class T> using Com = Microsoft::WRL::ComPtr<T>;
struct WorldLight {std::array<float,3> direction{},diffuse{},ambient{};};
class Renderer {
    Com<IDirect3D9> api_;
    Com<IDirect3DDevice9> device_;
    Com<IDirect3DDevice9Ex> extended_;
    D3DPRESENT_PARAMETERS parameters_{};
    HWND window_;
    bool resize_ = false;
    bool translated_ = false;
    bool reference_ = false;
    unsigned particleDetail_=2;
    unsigned lightDetail_=2;
    std::optional<WorldLight> worldLight_,terrainLight_;
public:
    explicit Renderer(HWND window, bool reference = false);
    void resize(unsigned width, unsigned height);
    bool begin();
    bool end(const fs::path& capture = {});
    void capture(const fs::path& path);
    void rect(float x, float y, float w, float h, DWORD color, IDirect3DTexture9* texture = nullptr, float u0 = 0, float v0 = 0, float u1 = 1, float v1 = 1, bool tile = false, bool additive = false, bool transpose = false);
    void cineFilter(float x,float y,float w,float h,DWORD color,IDirect3DTexture9* texture,const std::array<float,4>& uv,unsigned blend,unsigned flags);
    Com<IDirect3DTexture9> texture(unsigned width, unsigned height, std::span<const std::uint32_t> pixels);
    IDirect3DDevice9* device() const { return device_.Get(); }
    D3DPOOL resourcePool() const {return extended_?D3DPOOL_DEFAULT:D3DPOOL_MANAGED;}
    unsigned width() const { return parameters_.BackBufferWidth; }
    unsigned height() const { return parameters_.BackBufferHeight; }
    unsigned particleDetail() const {return particleDetail_;}
    void particleDetail(unsigned detail) {particleDetail_=detail<=2?detail:2;}
    unsigned lightDetail() const {return lightDetail_;}
    void lightDetail(unsigned detail) {lightDetail_=detail<=2?detail:2;}
    const std::optional<WorldLight>& worldLight() const {return worldLight_;}
    const std::optional<WorldLight>& terrainLight() const {return terrainLight_;}
    void worldLight(std::optional<WorldLight> value) {worldLight_=std::move(value);}
    void terrainLight(std::optional<WorldLight> value) {terrainLight_=std::move(value);}
    const char* driver() const { return reference_ ? (extended_ ? "d3d9ex-reference" : "d3d9-reference") : translated_ ? (extended_ ? "d3d9on12ex" : "d3d9on12") : extended_ ? "d3d9ex" : "d3d9"; }
};
}
