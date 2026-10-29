// Author: MiYu. Classic MDX animated scene rendering.
#pragma once
#include "archive.h"
#include "image.h"
#include "renderer.h"
#include <array>
#include <DirectXMath.h>
#include <span>
namespace war3 {
class SceneAssets;
class ModelInstance {
    struct Data;
    struct BlendNode {DirectX::XMFLOAT4 translation{},rotation{0,0,0,1},scale{1,1,1,0};};
    std::unique_ptr<Data> data_;
    const void* blendOwner_=nullptr;
    std::vector<BlendNode> blendFrom_,blendCurrent_;
    std::uint64_t blendStart_=0,blendClock_=0,blendFrame_=0,blendGeneration_=0;
    unsigned blendSequence_=0;
    bool blendActive_=false;
    const void* childOwner_=nullptr;
    std::vector<std::unique_ptr<ModelInstance>> children_;
    std::vector<std::uint64_t> childStarts_;
    std::vector<bool> childVisible_;
    void discardParticles();
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
struct ModelEvent {std::string name;int parent=-1,global=-1,node=-1;bool animated=false;std::vector<int> times;};
struct ModelSoundEvent {std::string name;std::array<float,3> position{};float angle=0;D3DMATRIX transform{};};
struct ModelCamera {D3DMATRIX view{};std::array<float,3> position{},right{};float fov=0,nearPlane=0,farPlane=0;};
struct ModelLookAt {std::string bone;std::array<float,3> target;};
class Model {
    struct Data;
    std::unique_ptr<Data> data_;
public:
    Model(Archives& archives, Images& images, Renderer* renderer, const char* name, Log& log,SceneAssets* shared=nullptr);
    ~Model();
    Model(const Model&) = delete;
    Model& operator=(const Model&) = delete;
    ModelCamera camera(std::uint64_t elapsed,std::uint64_t clock=UINT64_MAX);
    void draw(std::uint64_t elapsed, float aspect, bool twoSided = false,std::uint64_t clock=UINT64_MAX);
    void draw(std::uint64_t elapsed,const D3DMATRIX& view,const D3DMATRIX& projection,const D3DMATRIX& world,bool twoSided=false,DWORD tint=0xffffffff,ModelInstance* instance=nullptr,std::uint64_t clock=UINT64_MAX,bool emit=true,bool geometry=true,std::span<const ModelLookAt> lookAt={},float blendSeconds=0,std::uint64_t blendClock=UINT64_MAX,std::uint64_t animationGeneration=0);
    void upload(Renderer& renderer,SceneAssets& assets);
    void replace(unsigned id,IDirect3DTexture9* texture);
    bool sequence(const std::string& prefix);
    bool sequenceIndex(unsigned index);
    size_t sequenceCount() const;
    int sequenceStart() const;
    const std::vector<ModelEvent>& events() const;
    bool hasSoundEvents() const;
    std::vector<ModelSoundEvent> soundEvents(ModelInstance& instance,std::uint64_t elapsed,std::uint64_t clock,const D3DMATRIX& world,const D3DMATRIX& view,bool refreshPose=false) const;
    bool cameraIndex(unsigned index);
    size_t cameraCount() const;
    std::string sequenceName() const;
    ModelGeometry geometry() const;
    float radius() const;
    float blendTime() const;
    std::uint64_t sequenceDuration() const;
    size_t particleEmitters() const;
    size_t ribbonEmitters() const;
    bool hasAttachment(const std::string& name) const;
    bool hasAttachmentModels() const;
    void advanceAttachmentClocks(ModelInstance& instance,std::uint64_t elapsed,std::uint64_t clock,bool geometry=true) const;
    std::vector<std::string> attachmentModels() const;
    float particleLifetime() const;
    bool sequenceLoops() const;
    std::optional<D3DMATRIX> attachment(const std::string& name,const D3DMATRIX& world,std::uint64_t elapsed,const D3DMATRIX& view,ModelInstance* instance=nullptr,float blendSeconds=0,std::uint64_t clock=UINT64_MAX,std::span<const ModelLookAt> lookAt={},std::uint64_t blendClock=UINT64_MAX,std::uint64_t animationGeneration=0) const;
private:
    void ribbons(std::uint64_t elapsed,const D3DMATRIX& view,const D3DMATRIX& world,DWORD tint,ModelInstance& instance,bool emit,float delta);
    void particles(std::uint64_t elapsed,std::uint64_t clock,const D3DMATRIX& view,const D3DMATRIX& world,DWORD tint,ModelInstance& instance,bool emit);
};
}
