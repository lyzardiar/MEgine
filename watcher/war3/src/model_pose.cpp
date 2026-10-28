// Author: MiYu. Source-space skeletal animation and classic D3D9 material submission.
#include "model_data.h"
#include <cmath>
#include <string_view>

namespace war3 {
using namespace mdx;
namespace {
DWORD packedColor(FXMVECTOR value, float alpha) { XMFLOAT4 f; XMStoreFloat4(&f,value); auto byte = [](float x) { return unsigned(std::clamp(x,0.f,1.f)*255+.5f); }; return (byte(alpha)<<24)|(byte(f.x)<<16)|(byte(f.y)<<8)|byte(f.z); }
bool sameBone(std::string_view a,std::string_view b) {if(a.size()!=b.size())return false;for(size_t i=0;i<a.size();++i){auto lower=[](unsigned char c){return c>='A' && c<='Z'?c+('a'-'A'):c;};if(lower(a[i])!=lower(b[i]))return false;}return true;}
}
XMVECTOR Model::Data::sample(const Track& t, std::uint64_t elapsed, FXMVECTOR rest, bool rotation) const {
    if (t.keys.empty()) return rest;
    auto begin = t.keys.begin(), end = t.keys.end(); std::int64_t time = 0;
    if (t.global >= 0) { if (unsigned(t.global) >= globals.size()) throw std::runtime_error("Animation global missing"); auto period = globals[t.global]; time = period ? globalTime.value_or(elapsed)%period : 0; }
    else if (!sequences.empty()) { auto& s = sequences[sequence]; auto duration = std::uint64_t(std::int64_t(s.end)-s.start); time = s.start + std::int64_t(s.flags&1 ? std::min(elapsed,duration) : duration ? elapsed%duration : 0); begin = std::lower_bound(begin,end,s.start,[](const Key& k,int t) { return k.time<t; }); end = std::upper_bound(begin,end,s.end,[](int t,const Key& k) { return t<k.time; }); }
    else return rest;
    if (begin == end) return rest;
    if (time <= begin->time) return XMLoadFloat4(&begin->value);
    if (time >= (end-1)->time) return XMLoadFloat4(&(end-1)->value);
    auto b = std::upper_bound(begin,end,time,[](std::int64_t t,const Key& k) { return t<k.time; }); auto a = b-1;
    float u = float(time-a->time)/float(std::int64_t(b->time)-a->time); auto x = XMLoadFloat4(&a->value), y = XMLoadFloat4(&b->value);
    if (!t.mode) return x;
    if (t.mode == 1) return rotation ? XMQuaternionSlerp(x,y,u) : XMVectorLerp(x,y,u);
    auto out = XMLoadFloat4(&a->outgoing), in = XMLoadFloat4(&b->incoming);
    if (rotation) return XMQuaternionSlerp(XMQuaternionSlerp(x,y,u),XMQuaternionSlerp(out,in,u),2*u*(1-u));
    if (t.mode == 2) return XMVectorHermite(x,out,y,in,u);
    return x*((1-u)*(1-u)*(1-u))+out*(3*(1-u)*(1-u)*u)+in*(3*(1-u)*u*u)+y*(u*u*u);
}
void Model::Data::pose(std::uint64_t elapsed,const D3DMATRIX& sourceView,const D3DMATRIX& worldMatrix,bool skin,std::span<const ModelLookAt> lookAt) {
    auto& d=*this;XMFLOAT4X4 v,w;std::memcpy(&v,&sourceView,sizeof(v));std::memcpy(&w,&worldMatrix,sizeof(w));auto view=XMLoadFloat4x4(&w)*XMLoadFloat4x4(&v);
    bool sample=!d.poseTime || *d.poseTime!=elapsed || d.poseSequence!=d.sequence || d.billboard || !lookAt.empty() || d.poseLookAt || (d.globalPose && d.poseGlobalTime!=d.globalTime);
    if(sample) {
    XMVECTOR determinant;auto inverseWorld=XMMatrixInverse(&determinant,XMLoadFloat4x4(&w));bool invertible=std::isfinite(XMVectorGetX(determinant)) && std::abs(XMVectorGetX(determinant))>1e-12f;
    for (auto i : d.order) {
        auto& n = d.nodes[i]; auto p = XMLoadFloat4(&n.pivot); auto t = d.sample(n.tracks.translation,elapsed,XMVectorZero()); auto q = d.sample(n.tracks.rotation,elapsed,XMQuaternionIdentity(),true); auto s = d.sample(n.tracks.scale,elapsed,XMVectorSet(1,1,1,0)); auto parent = n.parent>=0 ? XMLoadFloat4x4(&d.world[n.parent]) : XMMatrixIdentity();
        if (n.flags&4) { XMVECTOR ps,pq,pt; if (XMMatrixDecompose(&ps,&pq,&pt,parent)) q = XMQuaternionMultiply(q,XMQuaternionInverse(pq)); }
        auto posed = XMMatrixTranslationFromVector(-p)*XMMatrixScalingFromVector(s)*XMMatrixRotationQuaternion(q)*XMMatrixTranslationFromVector(p+t)*parent;
        if (n.flags&8) { XMVECTOR ws,wq,wt; if (XMMatrixDecompose(&ws,&wq,&wt,posed)) { auto position = XMVector3TransformCoord(p,posed); auto facing = XMMatrixInverse(nullptr,view); facing.r[3] = XMVectorSet(0,0,0,1); posed = XMMatrixTranslationFromVector(-p)*XMMatrixScalingFromVector(ws)*facing*XMMatrixTranslationFromVector(position); } }
        if(invertible)for(auto& aim:lookAt)if(sameBone(n.name,aim.bone)) {
            auto position=XMVector3TransformCoord(p,posed);auto destination=XMVector3TransformCoord(XMVectorSet(aim.target[0],aim.target[1],aim.target[2],1),inverseWorld);auto forward=XMVector3TransformNormal(XMVectorSet(1,0,0,0),posed);auto direction=destination-position;
            float f=XMVectorGetX(XMVector3LengthSq(forward)),length=XMVectorGetX(XMVector3LengthSq(direction));if(std::isfinite(f) && std::isfinite(length) && f>1e-12f && length>1e-12f){forward=XMVector3Normalize(forward);direction=XMVector3Normalize(direction);float dot=std::clamp(XMVectorGetX(XMVector3Dot(forward,direction)),-1.f,1.f);auto axis=XMVector3Cross(forward,direction);if(dot<-.999999f){axis=XMVector3Cross(forward,XMVectorSet(0,0,1,0));if(XMVectorGetX(XMVector3LengthSq(axis))<1e-12f)axis=XMVector3Cross(forward,XMVectorSet(0,1,0,0));}if(XMVectorGetX(XMVector3LengthSq(axis))>1e-12f){auto rotation=XMMatrixRotationAxis(axis,std::acos(dot));posed=posed*XMMatrixTranslationFromVector(-position)*rotation*XMMatrixTranslationFromVector(position);}}break;
        }
        XMStoreFloat4x4(&d.world[i],posed);
    }
    ++d.poseRevision;d.poseTime=elapsed;d.poseSequence=d.sequence;d.poseGlobalTime=d.globalTime;d.poseLookAt=!lookAt.empty();
    }
    if(skin && d.skinRevision!=d.poseRevision){
    for (auto& g : d.geosets) for (unsigned i = 0; i < g.positions.size(); ++i) { auto p = XMLoadFloat4(&g.positions[i]); if (!g.matrices.empty()) { auto sum = XMVectorZero(); auto& group = g.matrices[g.group[i]]; for (auto node : group) sum += XMVector3TransformCoord(p,XMLoadFloat4x4(&d.world[node])); p = sum/float(group.size()); } XMFLOAT4 position; XMStoreFloat4(&position,p); g.sampled[i].x = position.x; g.sampled[i].y = position.y; g.sampled[i].z = position.z; }
    d.skinRevision=d.poseRevision;
    }
}
void Model::draw(std::uint64_t elapsed, float aspect, bool twoSided,std::uint64_t clock) {
    auto& d = *data_;d.globalTime=clock==UINT64_MAX?elapsed:clock; if (!d.renderer) throw std::runtime_error("Model has no rendering device");
    auto eye = XMLoadFloat4(&d.eye)+d.sample(d.cameraPosition,elapsed,XMVectorZero()); auto target = XMLoadFloat4(&d.target)+d.sample(d.cameraTarget,elapsed,XMVectorZero());
    float roll=XMVectorGetX(d.sample(d.cameraRoll,elapsed,XMVectorZero()));auto direction=XMVector3Normalize(target-eye);auto up=XMVector3Rotate(XMVectorSet(0,0,1,0),XMQuaternionRotationAxis(direction,roll));auto view=XMMatrixLookAtRH(eye,target,up);XMFLOAT4X4 v,p,w;XMStoreFloat4x4(&v,view);XMStoreFloat4x4(&p,XMMatrixPerspectiveFovRH(d.fov,aspect,d.nearPlane,d.farPlane));XMStoreFloat4x4(&w,XMMatrixIdentity());D3DMATRIX dv,dp,dw;std::memcpy(&dv,&v,sizeof(dv));std::memcpy(&dp,&p,sizeof(dp));std::memcpy(&dw,&w,sizeof(dw));draw(elapsed,dv,dp,dw,twoSided,0xffffffff,nullptr,clock);
}
void Model::draw(std::uint64_t elapsed,const D3DMATRIX& sourceView,const D3DMATRIX& projection,const D3DMATRIX& worldMatrix,bool twoSided,DWORD instanceColor,ModelInstance* instance,std::uint64_t clock,bool emit,bool geometry,std::span<const ModelLookAt> lookAt) {
    if(!(instanceColor>>24))return;auto& d=*data_;d.globalTime=clock==UINT64_MAX?elapsed:clock;if(!d.renderer)throw std::runtime_error("Model has no rendering device");auto device=d.renderer->device();device->SetTransform(D3DTS_VIEW,&sourceView);device->SetTransform(D3DTS_PROJECTION,&projection);device->SetTransform(D3DTS_WORLD,&worldMatrix);
    d.pose(elapsed,sourceView,worldMatrix,true,lookAt);
    device->SetFVF(D3DFVF_XYZ|D3DFVF_DIFFUSE|D3DFVF_TEX1);
    device->SetTextureStageState(0,D3DTSS_COLOROP,D3DTOP_MODULATE); device->SetTextureStageState(0,D3DTSS_COLORARG1,D3DTA_TEXTURE); device->SetTextureStageState(0,D3DTSS_COLORARG2,D3DTA_DIFFUSE);
    device->SetTextureStageState(0,D3DTSS_ALPHAOP,D3DTOP_MODULATE); device->SetTextureStageState(0,D3DTSS_ALPHAARG1,D3DTA_TEXTURE); device->SetTextureStageState(0,D3DTSS_ALPHAARG2,D3DTA_DIFFUSE);
    device->SetSamplerState(0,D3DSAMP_MINFILTER,D3DTEXF_LINEAR); device->SetSamplerState(0,D3DSAMP_MAGFILTER,D3DTEXF_LINEAR);
    if(geometry)for (auto [gi,li] : d.draws) {
        auto& g = d.geosets[gi]; auto& l = d.materials[g.material].layers[li]; float a = XMVectorGetX(d.sample(g.opacity,elapsed,XMVectorReplicate(g.alpha)))*XMVectorGetX(d.sample(l.opacity,elapsed,XMVectorReplicate(l.alpha)));
        if (a <= .01f || g.indices.empty()) continue;
        float textureIndex = XMVectorGetX(d.sample(l.textureTrack,elapsed,XMVectorReplicate(float(l.texture)))); if (!std::isfinite(textureIndex) || textureIndex < 0 || textureIndex >= d.textures.size()) throw std::runtime_error("Animated texture out of range"); auto texture = unsigned(textureIndex);
        auto tint = d.sample(g.colorTrack,elapsed,XMLoadFloat4(&g.color)); if (!g.colorTrack.keys.empty()) tint = XMVectorSwizzle<2,1,0,3>(tint); tint*=XMVectorSet(float((instanceColor>>16)&255)/255,float((instanceColor>>8)&255)/255,float(instanceColor&255)/255,1);auto color = packedColor(tint,a*float(instanceColor>>24)/255); auto uvMatrix = XMMatrixIdentity();
        if (l.animation >= 0) { auto& t = d.textureAnimations[l.animation]; uvMatrix = XMMatrixTranslation(-.5f,-.5f,0)*XMMatrixScalingFromVector(d.sample(t.scale,elapsed,XMVectorSet(1,1,1,0)))*XMMatrixRotationQuaternion(d.sample(t.rotation,elapsed,XMQuaternionIdentity(),true))*XMMatrixTranslationFromVector(XMVectorSet(.5f,.5f,0,0)+d.sample(t.translation,elapsed,XMVectorZero())); }
        for (unsigned i = 0; i < g.sampled.size(); ++i) { XMFLOAT4 uv; XMStoreFloat4(&uv,XMVector3TransformCoord(XMLoadFloat4(&g.uv[l.coord][i]),uvMatrix)); g.sampled[i].color = color; g.sampled[i].u = uv.x; g.sampled[i].v = uv.y; }
        device->SetTexture(0,d.textures[texture].gpu.Get()); device->SetSamplerState(0,D3DSAMP_ADDRESSU,d.textures[texture].flags&1 ? D3DTADDRESS_WRAP : D3DTADDRESS_CLAMP); device->SetSamplerState(0,D3DSAMP_ADDRESSV,d.textures[texture].flags&2 ? D3DTADDRESS_WRAP : D3DTADDRESS_CLAMP);
        device->SetRenderState(D3DRS_ZENABLE,!(l.flags&0x40)); device->SetRenderState(D3DRS_ZWRITEENABLE,l.filter<=1 && !(l.flags&0xc0) && (instanceColor>>24)==255); device->SetRenderState(D3DRS_ZFUNC,D3DCMP_LESSEQUAL); device->SetRenderState(D3DRS_CULLMODE,twoSided || l.flags&0x10 ? D3DCULL_NONE : D3DCULL_CW);
        device->SetRenderState(D3DRS_ALPHATESTENABLE,l.filter==1 || l.filter>=5); device->SetRenderState(D3DRS_ALPHAFUNC,D3DCMP_GREATER); device->SetRenderState(D3DRS_ALPHAREF,l.filter==1 ? 191 : 5); device->SetRenderState(D3DRS_ALPHABLENDENABLE,l.filter>=2 || (instanceColor>>24)<255);
        D3DBLEND src = (instanceColor>>24)<255?D3DBLEND_SRCALPHA:D3DBLEND_ONE, dst = (instanceColor>>24)<255?D3DBLEND_INVSRCALPHA:D3DBLEND_ZERO; if (l.filter>=2 && l.filter<=4) { src = D3DBLEND_SRCALPHA; dst = l.filter==2 ? D3DBLEND_INVSRCALPHA : D3DBLEND_ONE; } if (l.filter==5) { src = D3DBLEND_ZERO; dst = D3DBLEND_SRCCOLOR; } if (l.filter==6) { src = D3DBLEND_DESTCOLOR; dst = D3DBLEND_SRCCOLOR; } device->SetRenderState(D3DRS_SRCBLEND,src); device->SetRenderState(D3DRS_DESTBLEND,dst);
        auto result = device->DrawIndexedPrimitiveUP(D3DPT_TRIANGLELIST,0,static_cast<UINT>(g.sampled.size()),static_cast<UINT>(g.indices.size()/3),g.indices.data(),D3DFMT_INDEX16,g.sampled.data(),sizeof(Vertex)); if (FAILED(result)) throw std::runtime_error("MDX draw failed");
    }
    particles(elapsed,clock==UINT64_MAX?elapsed:clock,sourceView,worldMatrix,instanceColor,instance?*instance:d.defaultInstance,emit);
    device->SetRenderState(D3DRS_ALPHATESTENABLE,FALSE); device->SetRenderState(D3DRS_CULLMODE,D3DCULL_NONE);
}
}
