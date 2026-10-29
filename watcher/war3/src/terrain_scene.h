// Author: MiYu. Source terrain compilation and culled static D3D9 chunks without disk conversion.
#pragma once
#include "scene_assets.h"
#include "scene_math.h"
#include "world.h"
#include <climits>

namespace war3 {
struct SceneVertex {float x,y,z;DWORD color;float u,v;};
struct TerrainChunk {
    std::vector<SceneVertex> vertices;
    std::vector<std::uint32_t> indices;
    std::vector<float> baseHeights;
    std::string texture;
    SceneBounds bounds;
    bool water=false;
    unsigned groundIndex=UINT_MAX;
    size_t dynamicTextureBytes=0;
    std::uint64_t deformationSeen=0;
    bool deformationAffected=false;
    Com<IDirect3DTexture9> dynamicTexture;
    Com<IDirect3DVertexBuffer9> vertexBuffer;
    Com<IDirect3DIndexBuffer9> indexBuffer;
};
struct TerrainCliff {std::string family,ramp,texture;unsigned ground=0;};
struct TerrainCell {std::array<unsigned,4> corners;std::array<unsigned,4> textures;unsigned x,y,variation;std::array<bool,4> blightable{true,true,true,true};};
class TerrainScene {
    const World& world_;
    const MapTerrain& source_;
    SceneAssets& assets_;
    std::vector<float> ground_;
    std::span<const float> surface_;
    std::vector<TerrainChunk> chunks_;
    std::map<std::tuple<unsigned,unsigned,std::string,bool>,size_t> lookup_;
    std::vector<std::string> waterFrames_;
    float waterRate_=0,waterOffset_=0;
    std::array<float,4> waterAlpha_{};
    size_t uploaded_=0;
    size_t meshBytes_=0;
    size_t dynamicTextureBytes_=0;
    std::vector<std::string> groundNames_;
    std::vector<std::uint64_t> groundSeen_;
    std::vector<TerrainChunk> blightChunks_;
    std::vector<std::vector<TerrainCell>> blightCells_;
    std::vector<std::uint64_t> blightSeen_;
    std::vector<unsigned> initialBlightUploads_;
    std::string blightTexture_;
    unsigned blightWidth_=0,blightHeight_=0;
    void initializeBlight(const std::vector<TerrainCell>& cells);
    void rebuildBlight(unsigned index);
    bool rebuildGround(unsigned index,TerrainChunk& target,Renderer& renderer);
    void uploadChunk(Renderer& renderer,TerrainChunk& chunk);
    void refreshDeformation(TerrainChunk& chunk);
    bool deformationVisible(const TerrainChunk& chunk,const DirectX::XMMATRIX& viewProjection) const;
    size_t drawBlight(Renderer& renderer,const DirectX::XMMATRIX& viewProjection);
    void compile(Log& log);
    std::vector<TerrainCell> layout(const std::vector<TerrainCliff>& definitions,Log& log);
    TerrainChunk& chunk(unsigned x,unsigned y,const std::string& texture,bool water=false);
    void append(TerrainChunk& target,std::span<const SceneVertex> vertices,std::span<const std::uint32_t> indices);
    float relief(std::span<const float> heights,float x,float y) const;
    void water();
public:
    TerrainScene(const World& world,SceneAssets& assets,Log& log);
    bool uploadOne(Renderer& renderer);
    size_t uploadCount() const {return chunks_.size()+initialBlightUploads_.size();}
    size_t uploaded() const {return uploaded_;}
    size_t draw(Renderer& renderer,const D3DMATRIX& view,const D3DMATRIX& projection,std::uint64_t elapsed,bool water,const WorldEnvironment& environment);
    float height(float x,float y) const {return relief(surface_,(x-source_.origin[0])/128,(y-source_.origin[1])/128)+world_.deformation(x,y);}
    std::optional<float> waterHeight(float x,float y) const;
    float waterAlpha(float x,float y,const WorldEnvironment& environment) const;
    float visibleHeight(float x,float y) const {auto ground=height(x,y);auto water=waterHeight(x,y);return water?std::max(ground,*water):ground;}
    float unitHeight(float x,float y,PathMovement movement) const {return movement==PathMovement::Water || movement==PathMovement::Amphibious?visibleHeight(x,y):height(x,y);}
};
}
