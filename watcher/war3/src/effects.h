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
    bool automatic=false;
};
}
