// Author: MiYu. Source-model effects retain script handles, world/attachment placement and visual retirement state.
#pragma once
#include "world.h"
namespace war3 {
struct ScriptEffect {
    std::uint32_t id=0,target=0;
    std::string model,attachment,texture;
    unsigned replacement=0;
    std::optional<unsigned> teamColor;
    std::uint32_t tint=0xffffffff;
    WorldPoint point;
    float z=0,facing=0,scale=1;
    double born=0;
    std::optional<double> destroyed,expires,fallbackExpires;
    bool automatic=false,groundAnchor=false;
};
struct LightningInfo {std::string type,texture;float segment=100,width=0,noise=0,texCoordScale=1,duration=0;std::array<float,4> color{1,1,1,1};};
struct ScriptLightning {std::uint32_t id=0,fromUnit=0,toUnit=0;LightningInfo source;std::array<jass::Real,3> from{},to{};std::array<float,4> color{1,1,1,1};double born=0;std::optional<double> expires;std::optional<PathMovement> fromSurface,toSurface;float fromHeight=0,toHeight=0;bool checkVisibility=true;};
struct ScriptImage {
    std::string texture;
    std::array<float,3> size{},position{},origin{};
    std::uint32_t color=0xffffffff;
    int type=0,blendMode=0;
    float constantHeight=0;
    bool visible=false,render=true,renderAlways=false,fixedHeight=false,aboveWater=false,useWaterAlpha=false;
};
struct UbersplatInfo {
    std::string texture,sound;
    float scale=0,birth=0,pause=0,decay=0;
    int blendMode=0;
    std::array<std::array<float,4>,3> colors{};
};
struct ScriptUbersplat {
    UbersplatInfo source;
    std::shared_ptr<ScriptImage> image;
    std::array<float,4> tint{1,1,1,1};
    double elapsed=0;
    bool paused=false,initialPaused=false;
};
}
