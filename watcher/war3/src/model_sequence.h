// Author: MiYu. Shared classic model sequence lookup for simulation and rendering.
#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace war3::mdx {
struct Sequence {std::string name;int start,end;unsigned flags;float rarity=0;};
std::vector<Sequence> readSequences(std::span<const std::uint8_t> bytes);
int findSequence(std::span<const Sequence> sequences,const std::string& name,int rarity=-1);
std::string modelPath(std::string path);
}
