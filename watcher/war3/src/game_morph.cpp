// Author: MiYu. Temporary creature models and source Cyclone attachment tracks share the same rendered unit transform.
#include "game_view.h"
#include <algorithm>
#include <bit>
#include <cstring>

namespace war3 {
namespace {float number(jass::Real value){return std::bit_cast<float>(value.bits());}DirectX::XMMATRIX matrix(const D3DMATRIX& value){DirectX::XMFLOAT4X4 result;std::memcpy(&result,&value,sizeof(value));return DirectX::XMLoadFloat4x4(&result);}}
std::optional<D3DMATRIX> GameView::unitWorld(const UnitState& u) const {
    auto& session=*data_->session;float x=number(u.x),y=number(u.y),z=data_->terrain->height(x,y)+u.displayFlyHeight();auto unit=DirectX::XMMatrixScaling(u.displayScale()*u.visualScale[0],u.displayScale()*u.visualScale[1],u.displayScale()*u.visualScale[2])*DirectX::XMMatrixRotationZ(number(u.facing)*DirectX::XM_PI/180);auto world=unit*DirectX::XMMatrixTranslation(x,y,z);auto cyclone=u.cyclone();if(!cyclone)return sceneMatrix(world);
    for(auto id:cyclone->visuals){auto found=session.effects().find(id);if(found==session.effects().end() || !found->second->groundAnchor || found->second->destroyed)continue;auto e=found->second;auto carrier=data_->assets->cachedModel(e->model);if(!carrier)return {};if(!carrier->hasAttachment(cyclone->cycloneAttachment))throw std::runtime_error("Cyclone carrier lacks source attachment: "+cyclone->cycloneAttachment);auto age=std::uint64_t(std::max(0.,session.simulationTime()-e->born)*1000);bool birth=carrier->sequence("Birth");auto duration=birth?carrier->sequenceDuration():0;if(birth && age<duration)carrier->sequence("Birth");else if(carrier->sequence("Stand"))age-=std::min<std::uint64_t>(age,duration);else if(!birth)throw std::runtime_error("Cyclone carrier lacks source animation");auto base=DirectX::XMMatrixScaling(e->scale,e->scale,e->scale)*DirectX::XMMatrixRotationZ(e->facing)*DirectX::XMMatrixTranslation(x,y,data_->terrain->height(x,y)+u.flyHeight);auto pose=carrier->attachment(cyclone->cycloneAttachment,sceneMatrix(base),age,view_);if(!pose)return {};return sceneMatrix(unit*matrix(*pose));}
    return {};
}
}
