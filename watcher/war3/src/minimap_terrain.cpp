// Author: MiYu. Ground changes update affected minimap pixels without replacing original map artwork.
#include "minimap_terrain.h"
#include <algorithm>

namespace war3 {
Image renderTerrainMinimap(const World& world,SceneAssets& assets,unsigned width,unsigned height) {
    auto& terrain=world.data().terrain;std::vector<const Image*> textures;for(unsigned i=0;i<world.terrainTypes().size();++i)textures.push_back(&assets.image(world.terrainTexture(i)));Image result{width,height,{}};result.pixels.resize(size_t(result.width)*result.height);
    for(unsigned y=0;y<result.height;++y){assets.check();for(unsigned x=0;x<result.width;++x){float gx=(float(x)+.5f)*float(terrain.width-1)/result.width,gy=(float(result.height-y)-.5f)*float(terrain.height-1)/result.height;unsigned tx=std::min(unsigned(gx),terrain.width-2),ty=std::min(unsigned(gy),terrain.height-2);auto& corner=terrain.corners[size_t(ty)*terrain.width+tx];unsigned slot=world.terrainSlot(size_t(ty)*terrain.width+tx);if(slot>=textures.size())slot=0;auto& source=*textures[slot];unsigned variation=corner.variation&31,tile=source.width==512 && variation<16?16+variation:variation==16 || (source.width!=512 && variation)?15:0;unsigned sx=(tile<16?tile%4:4+(tile-16)%4)*64+std::min(63u,unsigned((gx-tx)*64)),sy=(tile<16?tile/4:(tile-16)/4)*64+std::min(63u,unsigned((1-(gy-ty))*64));auto color=source.pixels[size_t(sy)*source.width+sx]|0xff000000u;if(corner.flags&0x40){unsigned r=((color>>16)&255),g=((color>>8)&255),b=color&255;color=0xff000000u|(((r+49)/2)<<16)|(((g+88)/2)<<8)|((b+112)/2);}result.pixels[size_t(y)*result.width+x]=color;}}
    return result;
}
MinimapTerrain::MinimapTerrain(const World& world):chunks_(world.terrainChunks()) {
    auto& corners=world.data().terrain.corners;corners_.reserve(corners.size());for(size_t i=0;i<corners.size();++i)corners_.push_back((world.terrainSlot(i)<<8)|(corners[i].variation&31));
}
MinimapTerrain::MinimapTerrain(const World& world,const Image& original):MinimapTerrain(world) {source(original);}
void MinimapTerrain::source(const Image& original) {if(!original.width || !original.height || original.pixels.size()!=size_t(original.width)*original.height)throw std::runtime_error("Invalid source minimap image");image_=original;}
bool MinimapTerrain::refresh(const World& world,SceneAssets& assets) {
    if(!image_.width)throw std::runtime_error("Minimap source image not set");if(chunks_==world.terrainChunks())return false;for(unsigned slot=0;slot<world.terrainTypes().size();++slot)if(!assets.hasImage(world.terrainTexture(slot)))return false;auto& terrain=world.data().terrain;if(corners_.size()!=terrain.corners.size())throw std::runtime_error("Minimap terrain geometry changed");std::vector<std::uint8_t> changed(corners_.size());bool any=false;for(size_t i=0;i<changed.size();++i){auto value=(world.terrainSlot(i)<<8)|(terrain.corners[i].variation&31);changed[i]=value!=corners_[i];any=any || changed[i]!=0;}if(!any){chunks_=world.terrainChunks();return false;}auto updated=renderTerrainMinimap(world,assets,image_.width,image_.height);for(unsigned y=0;y<image_.height;++y)for(unsigned x=0;x<image_.width;++x){float gx=(float(x)+.5f)*float(terrain.width-1)/image_.width,gy=(float(image_.height-y)-.5f)*float(terrain.height-1)/image_.height;unsigned tx=std::min(unsigned(gx),terrain.width-2),ty=std::min(unsigned(gy),terrain.height-2);if(changed[size_t(ty)*terrain.width+tx])image_.pixels[size_t(y)*image_.width+x]=updated.pixels[size_t(y)*image_.width+x];}for(size_t i=0;i<changed.size();++i)if(changed[i])corners_[i]=(world.terrainSlot(i)<<8)|(terrain.corners[i].variation&31);chunks_=world.terrainChunks();return true;
}
}
