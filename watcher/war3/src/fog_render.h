// Author: MiYu. Native fog texture projection over terrain, water, selection patches and model instances.
#pragma once
#include "session.h"
#include "scene_math.h"

namespace war3 {
class FogRender {
    Renderer& renderer_;
    Com<IDirect3DTexture9> texture_;
    unsigned width_=0,height_=0;
    std::uint64_t stamp_=0;
    bool dynamic_=false;
    bool discard_=false;
public:
    explicit FogRender(Renderer& renderer) : renderer_(renderer) {}
    ~FogRender() {end();}
    void begin(const FogGrid& grid,const D3DMATRIX& view);
    void end();
};
}
