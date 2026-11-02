// Author: MiYu. Minimap ground sampling and bounded updates retain unchanged source artwork.
#pragma once
#include "scene_assets.h"
#include "world.h"

namespace war3 {
Image renderTerrainMinimap(const World& world,SceneAssets& assets,unsigned width=256,unsigned height=256);
class MinimapTerrain {
    Image image_;
    std::vector<std::uint32_t> corners_;
    std::vector<std::uint64_t> chunks_;
public:
    MinimapTerrain(const World& world,const Image& original);
    bool refresh(const World& world,SceneAssets& assets);
    const Image& image() const {return image_;}
};
}
