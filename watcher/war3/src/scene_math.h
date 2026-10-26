// Author: MiYu. Native Z-up transforms and homogeneous bounds shared by world drawing and picking.
#pragma once
#include "renderer.h"
#include <DirectXMath.h>
#include <algorithm>
#include <array>
#include <cstring>

namespace war3 {
inline D3DMATRIX sceneMatrix(DirectX::FXMMATRIX value) {DirectX::XMFLOAT4X4 v;DirectX::XMStoreFloat4x4(&v,value);D3DMATRIX result;std::memcpy(&result,&v,sizeof(result));return result;}
inline DirectX::XMMATRIX sceneMatrix(const D3DMATRIX& value) {DirectX::XMFLOAT4X4 v;std::memcpy(&v,&value,sizeof(v));return DirectX::XMLoadFloat4x4(&v);}
struct SceneBounds {
    std::array<float,3> low{FLT_MAX,FLT_MAX,FLT_MAX},high{-FLT_MAX,-FLT_MAX,-FLT_MAX};
    void add(float x,float y,float z) {std::array p{x,y,z};for(unsigned i=0;i<3;++i){low[i]=std::min(low[i],p[i]);high[i]=std::max(high[i],p[i]);}}
    bool visible(DirectX::FXMMATRIX viewProjection) const {
        unsigned outside=63;
        for(unsigned i=0;i<8;++i){auto p=DirectX::XMVector4Transform(DirectX::XMVectorSet(i&1?high[0]:low[0],i&2?high[1]:low[1],i&4?high[2]:low[2],1),viewProjection);DirectX::XMFLOAT4 q;DirectX::XMStoreFloat4(&q,p);unsigned bits=(q.x < -q.w?1u:0)|(q.x>q.w?2u:0)|(q.y < -q.w?4u:0)|(q.y>q.w?8u:0)|(q.z<0?16u:0)|(q.z>q.w?32u:0);outside&=bits;if(!outside)return true;}return false;
    }
};
}
