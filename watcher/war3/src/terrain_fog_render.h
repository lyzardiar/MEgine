// Author: MiYu. Scope D3D9 terrain depth fog separately from the player's visibility texture.
#pragma once
#include "world.h"
#include <d3d9.h>
#include <array>

namespace war3 {
class TerrainFogRender {
    IDirect3DDevice9* device_=nullptr;
    std::array<DWORD,8> states_{};
public:
    TerrainFogRender(IDirect3DDevice9* device,const TerrainFog& fog);
    ~TerrainFogRender();
    TerrainFogRender(const TerrainFogRender&)=delete;
    TerrainFogRender& operator=(const TerrainFogRender&)=delete;
    void end();
};
}
