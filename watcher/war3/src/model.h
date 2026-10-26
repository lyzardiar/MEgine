// Author: MiYu. Classic MDX animated scene rendering.
#pragma once
#include "archive.h"
#include "image.h"
#include "renderer.h"
namespace war3 {
class SceneAssets;
struct ModelVertex {float x,y,z,u,v;};
struct ModelGeometry {std::vector<ModelVertex> vertices;std::vector<std::uint16_t> indices;};
class Model {
    struct Data;
    std::unique_ptr<Data> data_;
public:
    Model(Archives& archives, Images& images, Renderer* renderer, const char* name, Log& log,SceneAssets* shared=nullptr);
    ~Model();
    Model(const Model&) = delete;
    Model& operator=(const Model&) = delete;
    void draw(std::uint64_t elapsed, float aspect, bool twoSided = false);
    void draw(std::uint64_t elapsed,const D3DMATRIX& view,const D3DMATRIX& projection,const D3DMATRIX& world,bool twoSided=false);
    void upload(Renderer& renderer,SceneAssets& assets);
    void replace(unsigned id,IDirect3DTexture9* texture);
    bool sequence(const std::string& prefix);
    ModelGeometry geometry() const;
    float radius() const;
    std::uint64_t sequenceDuration() const;
};
}
