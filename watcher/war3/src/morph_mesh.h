// Author: MiYu. In-memory source morph animation mesh for model cinematics.
#pragma once
#include "archive.h"
#include "image.h"
#include "renderer.h"
#include <array>
#include <map>
namespace war3 {
class MorphMesh {
    struct Position {float x,y,z,nx,ny,nz;};
    struct Vertex {float x,y,z,nx,ny,nz;DWORD color;float u,v;};
    std::vector<std::uint16_t> indices_;
    std::vector<std::array<float,2>> uv_;
    std::vector<Position> frames_;
    std::vector<Vertex> vertices_;
    Com<IDirect3DTexture9> texture_;
    float interval_=0;
    size_t frameCount_=0;
public:
    MorphMesh(Archives& archives,Images& images,Renderer& renderer,const std::string& path,std::map<std::string,Com<IDirect3DTexture9>>& textures);
    void draw(Renderer& renderer,double seconds);
};
}
