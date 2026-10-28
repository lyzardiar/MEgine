// Author: MiYu. Original campaign AVI playback through the local Blizzard decoder.
#pragma once
#include "platform.h"
#include <memory>
namespace war3 {
class Cinematic {
    struct Data;
    std::unique_ptr<Data> data_;
public:
    Cinematic(const fs::path& root,const std::string& name,HWND owner,bool muted);
    ~Cinematic();
    Cinematic(const Cinematic&)=delete;
    Cinematic& operator=(const Cinematic&)=delete;
    bool update(unsigned width,unsigned height);
};
}
