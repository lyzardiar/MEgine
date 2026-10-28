// Author: MiYu. Camera setup handles store field transitions and apply them to the live camera.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>
namespace war3 {
void ScriptSession::bindCameraSetupNatives(){
    auto number=[](jass::Value value){float result=std::bit_cast<float>(value.bits);if(!std::isfinite(result))throw std::runtime_error("Non-finite camera setup value");return result;};
    auto real=[](float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));};
    auto setup=[this](jass::Value value)->ScriptCameraSetup&{return std::get<ScriptCameraSetup>(object(value,NativeKind::CameraSetup).state);};
    bind("CreateCameraSetup","camerasetup",{},[this,setup](auto&,auto){auto& environment=requireWorld().environment();auto position=environment.cameraMotion.value(simulationTime_);ScriptCameraSetup initial;initial.x=position.first;initial.y=position.second;for(unsigned i=0;i<initial.fields.size();++i)initial.fields[i]=environment.cameraFields[i].value(simulationTime_);auto handle=create(NativeKind::CameraSetup);setup(handle)=initial;return handle;});
    bind("CameraSetupSetField","nothing",{"camerasetup","camerafield","real","real"},[setup,number](auto& vm,auto args){if(!args[0].bits)return vm.nothing();auto index=args[1].bits;if(index>=7)throw std::runtime_error("Invalid camera setup field");auto value=number(args[2]),duration=std::max(0.f,number(args[3]));auto& state=setup(args[0]);state.fields[index]=value;state.durations[index]=duration;return vm.nothing();});
    bind("CameraSetupGetField","real",{"camerasetup","camerafield"},[setup,real](auto& vm,auto args){if(!args[0].bits)return vm.real(jass::Real{});auto index=args[1].bits;if(index>=7)throw std::runtime_error("Invalid camera setup field");return vm.real(real(setup(args[0]).fields[index]));});
    bind("CameraSetupSetDestPosition","nothing",{"camerasetup","real","real","real"},[setup,number](auto& vm,auto args){if(!args[0].bits)return vm.nothing();auto x=number(args[1]),y=number(args[2]),duration=std::max(0.f,number(args[3]));auto& state=setup(args[0]);state.x=x;state.y=y;state.panDuration=duration;return vm.nothing();});
    bind("CameraSetupGetDestPositionLoc","location",{"camerasetup"},[this,setup,real](auto& vm,auto args){if(!args[0].bits)return vm.handle("location",0);auto state=setup(args[0]);auto handle=create(NativeKind::Location);std::get<WorldPoint>(object(handle,NativeKind::Location).state)={real(state.x),real(state.y)};return handle;});
    for(auto [name,x]:std::initializer_list<std::pair<const char*,bool>>{{"CameraSetupGetDestPositionX",true},{"CameraSetupGetDestPositionY",false}})bind(name,"real",{"camerasetup"},[setup,real,x](auto& vm,auto args){if(!args[0].bits)return vm.real(jass::Real{});auto& state=setup(args[0]);return vm.real(real(x?state.x:state.y));});
    auto apply=[this,setup,real](jass::Value value,bool pan,bool panTimed,std::optional<float> force,std::optional<float> z){if(!value.bits)return;auto state=setup(value);auto& world=requireWorld();auto& environment=world.environment();for(unsigned i=0;i<state.fields.size();++i){auto target=i==6 && z?*z:state.fields[i];environment.cameraFields[i].set(target,simulationTime_,force?*force:state.durations[i]);}if(pan){auto point=world.clamp({real(state.x),real(state.y)});float x=std::bit_cast<float>(point.x.bits()),y=std::bit_cast<float>(point.y.bits());cameraControl().targetUnit=0;cameraControl().orientUnit=0;environment.cameraTarget=point;environment.cameraMotion.set(x,y,simulationTime_,force?*force:panTimed?state.panDuration:0);}};
    bind("CameraSetupApply","nothing",{"camerasetup","boolean","boolean"},[apply](auto& vm,auto args){apply(args[0],args[1].bits!=0,args[2].bits!=0,std::nullopt,std::nullopt);return vm.nothing();});
    bind("CameraSetupApplyWithZ","nothing",{"camerasetup","real"},[apply,number](auto& vm,auto args){apply(args[0],true,true,std::nullopt,number(args[1]));return vm.nothing();});
    bind("CameraSetupApplyForceDuration","nothing",{"camerasetup","boolean","real"},[apply,number](auto& vm,auto args){apply(args[0],args[1].bits!=0,true,std::max(0.f,number(args[2])),std::nullopt);return vm.nothing();});
    bind("CameraSetupApplyForceDurationWithZ","nothing",{"camerasetup","real","real"},[apply,number](auto& vm,auto args){apply(args[0],true,true,std::max(0.f,number(args[2])),number(args[1]));return vm.nothing();});
}
}
