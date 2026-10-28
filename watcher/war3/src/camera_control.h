// Author: MiYu. Local camera controller and shake configuration from map scripts.
#pragma once
#include <cstdint>
namespace war3 {
struct CameraControl {
    std::uint32_t targetUnit=0,orientUnit=0;
    float targetX=0,targetY=0,orientX=0,orientY=0;
    bool inheritOrientation=false;
    float smoothing=0;
    float sourceMagnitude=0,sourceVelocity=0,targetMagnitude=0,targetVelocity=0;
    bool sourceVerticalOnly=false,targetVerticalOnly=false;
};
}
