// Author: MiYu. Source-model effects retain script handles, world/attachment placement and visual retirement state.
#pragma once
#include "world.h"
namespace war3 {
struct ScriptEffect {
    std::uint32_t id=0,target=0;
    std::string model,attachment;
    WorldPoint point;
    float z=0,facing=0,scale=1;
    double born=0;
    std::optional<double> destroyed,expires;
    bool automatic=false,groundAnchor=false;
};
struct LightningInfo {std::string type,texture;float segment=100,width=0,noise=0,texCoordScale=1,duration=0;std::array<float,4> color{1,1,1,1};};
struct ScriptLightning {std::uint32_t id=0,fromUnit=0,toUnit=0;LightningInfo source;std::array<jass::Real,3> from{},to{};std::array<float,4> color{1,1,1,1};double born=0;std::optional<double> expires;float fromHeight=0,toHeight=0;bool checkVisibility=true;};
}
