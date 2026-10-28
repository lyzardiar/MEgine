// Author: MiYu. Original DOO placements, source definition overrides and visible model instances.
#pragma once
#include "scene_assets.h"
#include "scene_math.h"
#include "session.h"
#include "model.h"

namespace war3 {
struct SceneObject {
    std::uint32_t type=0,handle=0;
    size_t doodadIndex=SIZE_MAX;
    std::shared_ptr<DestructableState> source;
    Model* model=nullptr;
    ModelInstance particles;
    std::array<float,3> position{},scale{1,1,1};
    float angle=0,radius=0;
    float occlusionHeight=0,occlusionRadius=0,fadeFrom=0,fadeTo=0;
    double fadeStart=0;
    std::uint64_t occlusionFrame=0,occlusionVisit=0;
    unsigned replacement=0;
    std::string texture;
    bool visible=true,dead=false;
};
class SceneObjects {
    SceneAssets& assets_;
    ScriptSession& session_;
    std::set<std::uint32_t> liveHandles_;
    std::uint64_t liveRevision_=0;
    std::uint64_t occlusionFrame_=0,occlusionVisit_=0;
    std::array<unsigned,4> occlusionColor_{128,255,255,255};
    double occlusionFade_=0.3;
    void append(SceneObject object);
    void sync();
    void occlude(const std::array<float,3>& eye,const DirectX::XMMATRIX& viewProjection);
    DWORD tint(SceneObject& object,double now);
    std::vector<SceneObject> placed_;
    std::map<std::pair<int,int>,std::pair<SceneBounds,std::vector<size_t>>> blocks_;
public:
    SceneObjects(ScriptSession& session,SceneAssets& assets,Log& log);
    size_t size() const {return placed_.size();}
    size_t draw(Renderer& renderer,const D3DMATRIX& view,const D3DMATRIX& projection,std::uint64_t elapsed,const std::array<float,3>& eye);
};
}
