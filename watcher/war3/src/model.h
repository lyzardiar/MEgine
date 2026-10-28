// Author: MiYu. Classic MDX animated scene rendering.
#pragma once
#include "archive.h"
#include "image.h"
#include "renderer.h"
#include <array>
#include <span>
namespace war3 {
class SceneAssets;
class ModelInstance {
    struct Data;
    std::unique_ptr<Data> data_;
    friend class Model;
public:
    ModelInstance();
    ~ModelInstance();
    ModelInstance(ModelInstance&&) noexcept;
    ModelInstance& operator=(ModelInstance&&) noexcept;
    size_t particleCount() const;
};
struct ModelVertex {float x,y,z,u,v;};
struct ModelGeometry {std::vector<ModelVertex> vertices;std::vector<std::uint16_t> indices;};
struct ModelEvent {std::string name;int parent=-1,global=-1;bool animated=false;std::vector<int> times;};
struct ModelLookAt {std::string bone;std::array<float,3> target;};
class Model {
    struct Data;
    std::unique_ptr<Data> data_;
public:
    Model(Archives& archives, Images& images, Renderer* renderer, const char* name, Log& log,SceneAssets* shared=nullptr);
    ~Model();
    Model(const Model&) = delete;
    Model& operator=(const Model&) = delete;
    void draw(std::uint64_t elapsed, float aspect, bool twoSided = false,std::uint64_t clock=UINT64_MAX);
    void draw(std::uint64_t elapsed,const D3DMATRIX& view,const D3DMATRIX& projection,const D3DMATRIX& world,bool twoSided=false,DWORD tint=0xffffffff,ModelInstance* instance=nullptr,std::uint64_t clock=UINT64_MAX,bool emit=true,bool geometry=true,std::span<const ModelLookAt> lookAt={});
    void upload(Renderer& renderer,SceneAssets& assets);
    void replace(unsigned id,IDirect3DTexture9* texture);
    bool sequence(const std::string& prefix);
    bool sequenceIndex(unsigned index);
    size_t sequenceCount() const;
    int sequenceStart() const;
    const std::vector<ModelEvent>& events() const;
    bool cameraIndex(unsigned index);
    size_t cameraCount() const;
    std::string sequenceName() const;
    ModelGeometry geometry() const;
    float radius() const;
    std::uint64_t sequenceDuration() const;
    size_t particleEmitters() const;
    size_t ribbonEmitters() const;
    bool hasAttachment(const std::string& name) const;
    float particleLifetime() const;
    bool sequenceLoops() const;
    std::optional<D3DMATRIX> attachment(const std::string& name,const D3DMATRIX& world,std::uint64_t elapsed,const D3DMATRIX& view) const;
private:
    void ribbons(std::uint64_t elapsed,const D3DMATRIX& view,const D3DMATRIX& world,DWORD tint,ModelInstance& instance,bool emit,float delta);
    void particles(std::uint64_t elapsed,std::uint64_t clock,const D3DMATRIX& view,const D3DMATRIX& world,DWORD tint,ModelInstance& instance,bool emit);
};
}
