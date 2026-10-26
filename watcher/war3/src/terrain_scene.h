// Author: MiYu. Source terrain compilation and culled static D3D9 chunks without disk conversion.
#pragma once
#include "scene_assets.h"
#include "scene_math.h"
#include "world.h"

namespace war3 {
struct SceneVertex {float x,y,z;DWORD color;float u,v;};
struct TerrainChunk {
    std::vector<SceneVertex> vertices;
    std::vector<std::uint32_t> indices;
    std::string texture;
    SceneBounds bounds;
    bool water=false;
    Com<IDirect3DVertexBuffer9> vertexBuffer;
    Com<IDirect3DIndexBuffer9> indexBuffer;
};
struct TerrainCliff {std::string family,ramp,texture;unsigned ground=0;};
struct TerrainCell {std::array<unsigned,4> corners;std::array<unsigned,4> textures;unsigned x,y,variation;};
class TerrainScene {
    const MapTerrain& source_;
    SceneAssets& assets_;
    std::vector<float> ground_,surface_;
    std::vector<TerrainChunk> chunks_;
    std::map<std::tuple<unsigned,unsigned,std::string,bool>,size_t> lookup_;
    std::vector<std::string> waterFrames_;
    float waterRate_=0;
    size_t uploaded_=0;
    size_t meshBytes_=0;
    void compile(Log& log);
    std::vector<TerrainCell> layout(const std::vector<TerrainCliff>& definitions,Log& log);
    TerrainChunk& chunk(unsigned x,unsigned y,const std::string& texture,bool water=false);
    void append(TerrainChunk& target,std::span<const SceneVertex> vertices,std::span<const std::uint32_t> indices);
    float relief(const std::vector<float>& heights,float x,float y) const;
    void water();
public:
    TerrainScene(const MapTerrain& source,SceneAssets& assets,Log& log);
    bool uploadOne(Renderer& renderer);
    size_t uploadCount() const {return chunks_.size();}
    size_t uploaded() const {return uploaded_;}
    size_t draw(Renderer& renderer,const D3DMATRIX& view,const D3DMATRIX& projection,std::uint64_t elapsed,bool water,const WorldEnvironment& environment);
    float height(float x,float y) const {return relief(surface_,(x-source_.origin[0])/128,(y-source_.origin[1])/128);}
};
}
