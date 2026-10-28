// Author: MiYu. Preserve and restore fixed-function D3D9 depth fog around the world pass.
#include "terrain_fog_render.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <stdexcept>

namespace war3 {
namespace {
constexpr std::array<D3DRENDERSTATETYPE,8> keys{D3DRS_FOGENABLE,D3DRS_FOGCOLOR,D3DRS_FOGTABLEMODE,D3DRS_FOGVERTEXMODE,D3DRS_FOGSTART,D3DRS_FOGEND,D3DRS_FOGDENSITY,D3DRS_RANGEFOGENABLE};
}
TerrainFogRender::TerrainFogRender(IDirect3DDevice9* device,const TerrainFog& fog) : device_(device) {
    if(!device_)throw std::runtime_error("Missing terrain fog rendering device");for(size_t i=0;i<keys.size();++i)if(FAILED(device_->GetRenderState(keys[i],&states_[i])))throw std::runtime_error("Cannot read terrain fog render state");D3DCAPS9 caps{};if(FAILED(device_->GetDeviceCaps(&caps)))throw std::runtime_error("Cannot query terrain fog support");DWORD mode=fog.style==1?D3DFOG_LINEAR:fog.style==2?D3DFOG_EXP:fog.style==3?D3DFOG_EXP2:D3DFOG_NONE;bool table=(caps.RasterCaps&D3DPRASTERCAPS_FOGTABLE)!=0,vertex=(caps.RasterCaps&D3DPRASTERCAPS_FOGVERTEX)!=0;bool active=mode!=D3DFOG_NONE && (table || vertex) && std::isfinite(fog.start) && std::isfinite(fog.end) && std::isfinite(fog.density);float start=std::isfinite(fog.start)?fog.start:0,end=std::isfinite(fog.end)?fog.end:1,density=std::isfinite(fog.density)?std::max(0.f,fog.density):0;if(end<=start)end=start+1;device_->SetRenderState(D3DRS_FOGENABLE,active);device_->SetRenderState(D3DRS_FOGCOLOR,fog.color);device_->SetRenderState(D3DRS_FOGTABLEMODE,active && table?mode:D3DFOG_NONE);device_->SetRenderState(D3DRS_FOGVERTEXMODE,active && !table?mode:D3DFOG_NONE);device_->SetRenderState(D3DRS_FOGSTART,std::bit_cast<DWORD>(start));device_->SetRenderState(D3DRS_FOGEND,std::bit_cast<DWORD>(end));device_->SetRenderState(D3DRS_FOGDENSITY,std::bit_cast<DWORD>(density));device_->SetRenderState(D3DRS_RANGEFOGENABLE,FALSE);
}
TerrainFogRender::~TerrainFogRender(){end();}
void TerrainFogRender::end() {if(!device_)return;for(size_t i=0;i<keys.size();++i)device_->SetRenderState(keys[i],states_[i]);device_=nullptr;}
}
