// Author: MiYu. Script-controlled unit presentation consumed by the native world renderer.
#include "session.h"
#include <bit>
#include <algorithm>
#include <cmath>
#include <cctype>

namespace war3 {
namespace {float number(jass::Value v){auto n=std::bit_cast<float>(v.bits);if(!std::isfinite(n))throw std::runtime_error("Non-finite unit presentation value");return n;}}
void ScriptSession::bindVisualNatives() {
    bind("SetUnitColor","nothing",{"unit","playercolor"},[this](auto& vm,auto a){if(a[1].bits>=16)throw std::runtime_error("Unit player color outside classic palette");unit(a[0]).color=a[1].bits;return vm.nothing();});
    bind("SetUnitVertexColor","nothing",{"unit","integer","integer","integer","integer"},[this](auto& vm,auto a){auto& state=unit(a[0]);for(unsigned i=0;i<4;++i)state.tint[i]=std::uint8_t(std::clamp(std::bit_cast<std::int32_t>(a[i+1].bits),0,255));return vm.nothing();});
    bind("SetUnitScale","nothing",{"unit","real","real","real"},[this](auto& vm,auto a){std::array<float,3> scale;for(unsigned i=0;i<3;++i){scale[i]=number(a[i+1]);if(scale[i]<0 || scale[i]>100)throw std::runtime_error("Unit scale exceeds supported range");}unit(a[0]).visualScale=scale;return vm.nothing();});
    bind("SetUnitFlyHeight","nothing",{"unit","real","real"},[this](auto& vm,auto a){float height=number(a[1]),rate=number(a[2]);if(rate<0)throw std::runtime_error("Negative unit height rate");auto& u=unit(a[0]);u.targetFlyHeight=height;u.flyRate=rate;if(!rate)u.flyHeight=height;return vm.nothing();});
    bind("GetUnitFlyHeight","real",{"unit"},[this](auto& vm,auto a){return vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(unit(a[0]).displayFlyHeight())));});
    bind("GetUnitDefaultFlyHeight","real",{"unit"},[this](auto& vm,auto a){auto& u=unit(a[0]);return vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(definitions().number(u.type,"UnitData","moveHeight"))));});
    bind("SetUnitBlendTime","nothing",{"unit","real"},[this](auto& vm,auto a){float seconds=number(a[1]);if(seconds<0 || seconds>300)throw std::runtime_error("Unit animation blend time outside supported range");unit(a[0]).animationBlendTime=seconds;return vm.nothing();});
    bind("SetUnitTimeScale","nothing",{"unit","real"},[this](auto& vm,auto a){float rate=number(a[1]);if(rate<0 || rate>1000)throw std::runtime_error("Unit animation rate exceeds supported range");unit(a[0]).animationRate=rate;return vm.nothing();});
    bind("SetUnitAnimation","nothing",{"unit","string"},[this](auto& vm,auto a){if(!a[1].text)throw std::runtime_error("Null animation name");auto& u=unit(a[0]);u.animation=*a[1].text;u.animationIndex.reset();u.animationQueue.clear();u.animationTime=0;++u.animationGeneration;return vm.nothing();});
    bind("SetUnitAnimationWithRarity","nothing",{"unit","string","raritycontrol"},[this](auto& vm,auto a){if(!a[1].text)throw std::runtime_error("Null animation name");if(a[2].bits>1)throw std::runtime_error("Invalid animation rarity");auto& u=unit(a[0]);u.animation=*a[1].text;u.animationIndex.reset();u.animationQueue.clear();u.animationTime=0;++u.animationGeneration;if(!u.displayModel().empty()){auto& sequences=sequencesForModel(u.displayModel());int index=mdx::findSequence(sequences,u.sequenceName(u.animation),int(a[2].bits));if(index<0)index=mdx::findSequence(sequences,u.animation,int(a[2].bits));if(index>=0)u.animationIndex=unsigned(index);}return vm.nothing();});
    bind("AddUnitAnimationProperties","nothing",{"unit","string","boolean"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(!a[1].text || a[1].text->empty())return vm.nothing();if(a[1].text->size()>1024)throw std::runtime_error("Animation property text exceeds budget");auto properties=u.scriptAnimationProperties;std::string word;auto apply=[&]{if(word.empty())return;properties[word]=a[2].bits!=0;word.clear();if(properties.size()>32)throw std::runtime_error("Animation property count exceeds budget");};for(unsigned char c:*a[1].text){if(std::isalnum(c))word+=char(std::tolower(c));else apply();}apply();u.scriptAnimationProperties=std::move(properties);return vm.nothing();});
    bind("SetUnitAnimationByIndex","nothing",{"unit","integer"},[this](auto& vm,auto a){auto& u=unit(a[0]);u.animation.clear();u.animationIndex=a[1].bits;u.animationQueue.clear();u.animationTime=0;++u.animationGeneration;return vm.nothing();});
    bind("QueueUnitAnimation","nothing",{"unit","string"},[this](auto& vm,auto a){auto& u=unit(a[0]);if(!a[1].text)throw std::runtime_error("Null queued animation");if(u.animationQueue.size()>=64)throw std::runtime_error("Unit animation queue exceeds budget");u.animationQueue.push_back(*a[1].text);return vm.nothing();});
}
}
