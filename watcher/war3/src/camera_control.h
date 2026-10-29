// Author: MiYu. Local camera controller and shake configuration from map scripts.
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
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
inline std::array<float,3> cameraEye(float x,float y,float z,float distance,float elevation,float rotation,const CameraControl& control,double now) {
    constexpr float radians=0.017453292519943295f;float a=elevation*radians,r=rotation*radians,d=std::max(1.f,distance);double phase=now*double(control.sourceVelocity)*6.283185307179586;
    return {x-std::cos(r)*std::cos(a)*d+(control.sourceVerticalOnly?0.f:control.sourceMagnitude*float(std::sin(phase))),y-std::sin(r)*std::cos(a)*d+(control.sourceVerticalOnly?0.f:control.sourceMagnitude*float(std::sin(phase*1.37+1.1))),z+std::sin(a)*d+control.sourceMagnitude*float(std::sin(phase*1.73+2.2))};
}
}
