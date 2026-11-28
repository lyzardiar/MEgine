// Author: MiYu. Ground texture atlases share tile indices across source resolutions.
#pragma once
#include "image.h"

namespace war3 {
// Square textures hold the 4x4 transition tiles; double-width textures append 16 base variations.
// Custom maps ship higher-resolution tilesets with the same layout, sampled proportionally.
inline bool extendedGroundTexture(const Image& image) {return image.width==image.height*2;}
inline bool validGroundTexture(const Image& image) {
    return image.height>=16 && image.height<=4096 && image.height%4==0 && (image.width==image.height || extendedGroundTexture(image)) && image.pixels.size()==size_t(image.width)*image.height;
}

inline unsigned groundBaseTile(const Image& image,unsigned variation) {
    if(extendedGroundTexture(image) && variation<16)return 16+variation;
    return variation==16 || (!extendedGroundTexture(image) && variation)?15:0;
}

inline std::uint32_t groundTilePixel(const Image& image,unsigned tile,unsigned x,unsigned y) {
    unsigned sourceSize=image.height/4;
    unsigned sx=(tile<16?tile%4:4+(tile-16)%4)*sourceSize+x*sourceSize/64;
    unsigned sy=(tile<16?tile/4:(tile-16)/4)*sourceSize+y*sourceSize/64;
    return image.pixels[size_t(sy)*image.width+sx];
}
}
