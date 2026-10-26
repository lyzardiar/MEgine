// Author: MiYu. Internal classic model records shared by parser and pose evaluator.
#pragma once
#include "model.h"
#include "binary.h"
#include <DirectXMath.h>
namespace war3 {
namespace mdx {
using namespace DirectX;
struct Key { int time; XMFLOAT4 value{}, incoming{}, outgoing{}; };
struct Track { unsigned mode = 0; int global = -1; std::vector<Key> keys; };
struct Transform { Track translation, rotation, scale; };
struct Sequence { std::string name; int start, end; unsigned flags; };
struct Node { int id, parent; unsigned flags; XMFLOAT4 pivot{}; Transform tracks; };
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
    std::vector<std::pair<unsigned, unsigned>> draws;
    DirectX::XMFLOAT4 eye{0,-1000,500,0}, target{0,0,100,0};
    mdx::Track cameraPosition, cameraTarget;
    float fov = 0.7854f, nearPlane = 8, farPlane = 10000;
    unsigned sequence = 0;
    std::optional<std::uint64_t> poseTime;
    unsigned poseSequence=0;
    float radius=0;
    bool billboard=false;
    explicit Data(Renderer* renderer) : renderer(renderer) {}
    DirectX::XMVECTOR sample(const mdx::Track& track, std::uint64_t elapsed, DirectX::FXMVECTOR rest, bool rotation = false) const;
    void parse(std::span<const std::uint8_t> bytes, Log& log);
};
}
