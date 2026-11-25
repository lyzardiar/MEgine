// Author: MiYu. Ground texture atlases share tile indices across source resolutions.
#pragma once
#include "image.h"

namespace war3 {
inline bool validGroundTexture(const Image& image) {
    return (image.width==64 && image.height==64) || ((image.width==256 || image.width==512) && image.height==256);
}

inline unsigned groundBaseTile(const Image& image,unsigned variation) {
    if(image.width==512 && variation<16)return 16+variation;
    return variation==16 || (image.width!=512 && variation)?15:0;
}

inline std::uint32_t groundTilePixel(const Image& image,unsigned tile,unsigned x,unsigned y) {
    unsigned sourceSize=image.height/4;
    unsigned sx=(tile<16?tile%4:4+(tile-16)%4)*sourceSize+x*sourceSize/64;
    unsigned sy=(tile<16?tile/4:(tile-16)/4)*sourceSize+y*sourceSize/64;
    return image.pixels[size_t(sy)*image.width+sx];
}
}
