// Author: MiYu. Internal classic model records shared by parser and pose evaluator.
#pragma once
#include "model.h"
#include "binary.h"
#include <DirectXMath.h>
#include <map>
#include <array>
namespace war3 {
namespace mdx {
using namespace DirectX;
struct Key { int time; XMFLOAT4 value{}, incoming{}, outgoing{}; };
struct Track { unsigned mode = 0; int global = -1; std::vector<Key> keys; };
struct Transform { Track translation, rotation, scale; };
struct Sequence { std::string name; int start, end; unsigned flags; };
struct Node { int id, parent; unsigned flags; std::string name;XMFLOAT4 pivot{}; Transform tracks; };
struct ParticleEmitter2 {
    unsigned node=0,filter=0,rows=1,columns=1,headOrTail=0,squirt=0,texture=0,replacement=0;
    int priority=0;
    float speed=0,variation=0,latitude=0,gravity=0,life=0,rate=0,width=0,length=0,tail=0,middle=0;
    std::array<XMFLOAT4,3> colors{};
    std::array<float,3> scales{};
    std::array<std::array<unsigned,3>,4> intervals{};
    Track speedTrack,variationTrack,latitudeTrack,gravityTrack,rateTrack,widthTrack,lengthTrack,visibility;
};
struct Attachment {unsigned node=0,id=0;std::string path;Track visibility;};
struct Layer { unsigned filter, flags, texture, coord; int animation; float alpha; Track opacity, textureTrack; };
struct Material { int priority; std::vector<Layer> layers; };
struct Texture { std::string path; unsigned flags,replacement=0; Com<IDirect3DTexture9> gpu; };
struct Vertex { float x, y, z; DWORD color; float u, v; };
struct Geoset {
    std::vector<XMFLOAT4> positions;
    std::vector<std::vector<XMFLOAT4>> uv;
    std::vector<std::uint16_t> indices;
    std::vector<unsigned char> group;
    std::vector<std::vector<int>> matrices;
    std::vector<Vertex> sampled;
    unsigned material;
    float alpha = 1;
    XMFLOAT4 color{1,1,1,1};
    Track opacity, colorTrack;
};
}
struct Model::Data {
    Renderer* renderer;
    std::vector<mdx::Sequence> sequences;
    std::vector<unsigned> globals;
    std::vector<mdx::Node> nodes;
    std::vector<unsigned> order;
    std::vector<DirectX::XMFLOAT4X4> world;
    std::vector<mdx::Material> materials;
    std::vector<mdx::Texture> textures;
    std::vector<mdx::Transform> textureAnimations;
    std::vector<mdx::Geoset> geosets;
    std::vector<mdx::ParticleEmitter2> emitters;
    std::vector<mdx::Attachment> attachments;
    ModelInstance defaultInstance;
    std::optional<std::uint64_t> globalTime;
    std::vector<std::pair<unsigned, unsigned>> draws;
    DirectX::XMFLOAT4 eye{0,-1000,500,0}, target{0,0,100,0};
    mdx::Track cameraPosition, cameraTarget;
    float fov = 0.7854f, nearPlane = 8, farPlane = 10000;
    unsigned sequence = 0;
    std::optional<std::uint64_t> poseTime;
    unsigned poseSequence=0;
    std::optional<std::uint64_t> poseGlobalTime;
    float radius=0;
    bool billboard=false,globalPose=false;
    std::uint64_t poseRevision=0,skinRevision=UINT64_MAX;
    std::map<std::string,int> sequenceNames;
    explicit Data(Renderer* renderer) : renderer(renderer) {}
    DirectX::XMVECTOR sample(const mdx::Track& track, std::uint64_t elapsed, DirectX::FXMVECTOR rest, bool rotation = false) const;
    void parse(std::span<const std::uint8_t> bytes, Log& log);
    void pose(std::uint64_t elapsed,const D3DMATRIX& view,const D3DMATRIX& worldMatrix,bool skin=true);
};
}
