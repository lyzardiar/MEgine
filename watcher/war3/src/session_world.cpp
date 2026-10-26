// Author: MiYu. Spatial handles and map camera/environment mutations consumed by the native world.
#include "session.h"

namespace war3 {
void ScriptSession::bindWorldNatives() {
    bind("GetFloatGameState","real",{"fgamestate"},[this](auto& vm,auto args){return vm.real(args[0].bits==2?requireWorld().clock().time():jass::Real{});});
    bind("SetFloatGameState","nothing",{"fgamestate","real"},[this](auto& vm,auto args){if(args[0].bits==2)requireWorld().clock().time(jass::Real::fromBits(args[1].bits));return vm.nothing();});
    bind("GetTimeOfDayScale","real",{},[this](auto& vm,auto){return vm.real(requireWorld().clock().scale());});
    bind("SetTimeOfDayScale","nothing",{"real"},[this](auto& vm,auto args){requireWorld().clock().scale(jass::Real::fromBits(args[0].bits));return vm.nothing();});
    bind("SuspendTimeOfDay","nothing",{"boolean"},[this](auto& vm,auto args){requireWorld().clock().suspend(args[0].bits!=0);return vm.nothing();});
    auto point=[this](jass::Value value)->WorldPoint&{return std::get<WorldPoint>(object(value,NativeKind::Location).state);};
    auto rect=[this](jass::Value value)->WorldRect&{return std::get<WorldRect>(object(value,NativeKind::Rect).state);};
    auto makeRect=[this](WorldRect value){auto handle=create(NativeKind::Rect);std::get<WorldRect>(object(handle,NativeKind::Rect).state)=value;return handle;};
    bind("Location","location",{"real","real"},[this](auto&,auto args){auto value=create(NativeKind::Location);std::get<WorldPoint>(object(value,NativeKind::Location).state)={jass::Real::fromBits(args[0].bits),jass::Real::fromBits(args[1].bits)};return value;});
    bind("MoveLocation","nothing",{"location","real","real"},[point](auto& vm,auto args){point(args[0])={jass::Real::fromBits(args[1].bits),jass::Real::fromBits(args[2].bits)};return vm.nothing();});
    bind("RemoveLocation","nothing",{"location"},[this](auto& vm,auto args){destroy(args[0],NativeKind::Location);return vm.nothing();});
    bind("GetLocationX","real",{"location"},[point](auto& vm,auto args){return vm.real(point(args[0]).x);});
    bind("GetLocationY","real",{"location"},[point](auto& vm,auto args){return vm.real(point(args[0]).y);});
    bind("Rect","rect",{"real","real","real","real"},[this,makeRect](auto&,auto args){return makeRect(requireWorld().rectangle({jass::Real::fromBits(args[0].bits),jass::Real::fromBits(args[1].bits)},{jass::Real::fromBits(args[2].bits),jass::Real::fromBits(args[3].bits)}));});
    bind("RectFromLoc","rect",{"location","location"},[this,point,makeRect](auto&,auto args){return makeRect(requireWorld().rectangle(point(args[0]),point(args[1])));});
    bind("SetRect","nothing",{"rect","real","real","real","real"},[this,rect](auto& vm,auto args){rect(args[0])=requireWorld().rectangle({jass::Real::fromBits(args[1].bits),jass::Real::fromBits(args[2].bits)},{jass::Real::fromBits(args[3].bits),jass::Real::fromBits(args[4].bits)});return vm.nothing();});
    bind("SetRectFromLoc","nothing",{"rect","location","location"},[this,rect,point](auto& vm,auto args){rect(args[0])=requireWorld().rectangle(point(args[1]),point(args[2]));return vm.nothing();});
    bind("RemoveRect","nothing",{"rect"},[this](auto& vm,auto args){destroy(args[0],NativeKind::Rect);return vm.nothing();});
    for(auto [name,member]:std::initializer_list<std::pair<const char*,jass::Real WorldRect::*>>{{"GetRectMinX",&WorldRect::minX},{"GetRectMinY",&WorldRect::minY},{"GetRectMaxX",&WorldRect::maxX},{"GetRectMaxY",&WorldRect::maxY}})bind(name,"real",{"rect"},[rect,member](auto& vm,auto args){return vm.real(rect(args[0]).*member);});
    bind("GetRectCenterX","real",{"rect"},[rect](auto& vm,auto args){auto& r=rect(args[0]);return vm.real(r.minX.add(r.maxX).multiply(jass::Real::fromBits(0x3f000000)));});
    bind("GetRectCenterY","real",{"rect"},[rect](auto& vm,auto args){auto& r=rect(args[0]);return vm.real(r.minY.add(r.maxY).multiply(jass::Real::fromBits(0x3f000000)));});
    bind("GetWorldBounds","rect",{},[this,makeRect](auto&,auto){return makeRect(requireWorld().bounds());});
    bind("GetCameraMargin","real",{"integer"},[this](auto& vm,auto args){return vm.real(requireWorld().cameraMargin(args[0].bits));});
    bind("SetCameraBounds","nothing",{"real","real","real","real","real","real","real","real"},[this](auto& vm,auto args){auto& environment=requireWorld().environment();for(unsigned i=0;i<8;++i)environment.cameraBounds[i]=jass::Real::fromBits(args[i].bits);environment.cameraChanged=true;return vm.nothing();});
    bind("SetDayNightModels","nothing",{"string","string"},[this](auto& vm,auto args){auto& environment=requireWorld().environment();environment.terrainDayNight=args[0].text?*args[0].text:std::string{};environment.unitDayNight=args[1].text?*args[1].text:std::string{};environment.dayNightChanged=true;return vm.nothing();});
    bind("SetWaterBaseColor","nothing",{"integer","integer","integer","integer"},[this](auto& vm,auto args){auto& environment=requireWorld().environment();for(unsigned i=0;i<4;++i)environment.waterColor[i]=std::uint8_t(args[i].bits);environment.waterChanged=true;return vm.nothing();});
}
}
