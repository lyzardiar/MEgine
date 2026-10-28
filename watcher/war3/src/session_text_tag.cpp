// Author: MiYu. Script text tags retain actual state, lifetime and world position for the game view.
#include "session.h"
#include <algorithm>
#include <bit>
#include <cmath>

namespace war3 {
namespace {
float textTagReal(jass::Value value) {float v=std::bit_cast<float>(value.bits);if(!std::isfinite(v) || std::abs(v)>1000000000.f)throw std::runtime_error("Invalid text tag value");return v;}
std::uint8_t textTagByte(jass::Value value) {return std::uint8_t(std::clamp(std::bit_cast<std::int32_t>(value.bits),0,255));}
}
void ScriptSession::textTagsTick(double delta) {
    std::vector<std::uint32_t> expired;for(auto& [id,tag]:textTags_){if(tag->suspended)continue;tag->age+=float(delta);tag->x+=tag->vx*float(delta)*4096.f;tag->y+=tag->vy*float(delta)*4096.f;if(!tag->permanent && tag->age>=tag->lifespan)expired.push_back(id);}for(auto id:expired){textTags_.erase(id);destroy(runtime_.handle("texttag",id),NativeKind::TextTag);}
}
void ScriptSession::bindTextTagNatives() {
    auto get=[this](jass::Value h)->std::shared_ptr<ScriptTextTag>{if(!h.bits)return {};return std::get<std::shared_ptr<ScriptTextTag>>(object(h,NativeKind::TextTag).state);};
    bind("CreateTextTag","texttag",{},[this](auto&,auto){if(textTags_.size()>=8192)throw std::runtime_error("Text tag instance budget exceeded");auto h=create(NativeKind::TextTag);textTags_[h.bits]=std::get<std::shared_ptr<ScriptTextTag>>(object(h,NativeKind::TextTag).state);return h;});
    bind("DestroyTextTag","nothing",{"texttag"},[this](auto& vm,auto a){if(a[0].bits){object(a[0],NativeKind::TextTag);textTags_.erase(a[0].bits);destroy(a[0],NativeKind::TextTag);}return vm.nothing();});
    bind("SetTextTagText","nothing",{"texttag","string","real"},[get](auto& vm,auto a){if(auto tag=get(a[0])){auto value=a[1].text?*a[1].text:std::string{};if(value.size()>4096)throw std::runtime_error("Text tag text exceeds budget");tag->text=std::move(value);tag->height=std::max(0.f,textTagReal(a[2]));}return vm.nothing();});
    bind("SetTextTagPos","nothing",{"texttag","real","real","real"},[this,get](auto& vm,auto a){if(auto tag=get(a[0])){tag->x=textTagReal(a[1]);tag->y=textTagReal(a[2]);auto z=textTagReal(a[3]);WorldPoint p{jass::Real::fromBits(a[1].bits),jass::Real::fromBits(a[2].bits)};tag->z=requireWorld().height(p)+z;}return vm.nothing();});
    bind("SetTextTagPosUnit","nothing",{"texttag","unit","real"},[this,get](auto& vm,auto a){if(auto tag=get(a[0]);tag && a[1].bits){auto u=std::get<std::shared_ptr<UnitState>>(object(a[1],NativeKind::Unit).state);tag->x=std::bit_cast<float>(u->x.bits());tag->y=std::bit_cast<float>(u->y.bits());tag->z=requireWorld().height({u->x,u->y})+u->displayFlyHeight()+textTagReal(a[2]);}return vm.nothing();});
    bind("SetTextTagColor","nothing",{"texttag","integer","integer","integer","integer"},[get](auto& vm,auto a){if(auto tag=get(a[0]))for(unsigned i=0;i<4;++i)tag->color[i]=textTagByte(a[i+1]);return vm.nothing();});
    bind("SetTextTagVelocity","nothing",{"texttag","real","real"},[get](auto& vm,auto a){if(auto tag=get(a[0])){tag->vx=textTagReal(a[1]);tag->vy=textTagReal(a[2]);}return vm.nothing();});
    bind("SetTextTagVisibility","nothing",{"texttag","boolean"},[get](auto& vm,auto a){if(auto tag=get(a[0]))tag->visible=a[1].bits!=0;return vm.nothing();});
    bind("SetTextTagSuspended","nothing",{"texttag","boolean"},[get](auto& vm,auto a){if(auto tag=get(a[0]))tag->suspended=a[1].bits!=0;return vm.nothing();});
    bind("SetTextTagPermanent","nothing",{"texttag","boolean"},[get](auto& vm,auto a){if(auto tag=get(a[0]))tag->permanent=a[1].bits!=0;return vm.nothing();});
    bind("SetTextTagAge","nothing",{"texttag","real"},[get](auto& vm,auto a){if(auto tag=get(a[0]))tag->age=std::max(0.f,textTagReal(a[1]));return vm.nothing();});
    bind("SetTextTagLifespan","nothing",{"texttag","real"},[get](auto& vm,auto a){if(auto tag=get(a[0]))tag->lifespan=std::max(0.f,textTagReal(a[1]));return vm.nothing();});
    bind("SetTextTagFadepoint","nothing",{"texttag","real"},[get](auto& vm,auto a){if(auto tag=get(a[0]))tag->fadepoint=std::max(0.f,textTagReal(a[1]));return vm.nothing();});
}
}
