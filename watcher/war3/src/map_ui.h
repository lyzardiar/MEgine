// Author: MiYu. Original map UI settings and source runtime anchor rules.
#pragma once
#include "map.h"

namespace war3 {
class SourceSettings {
    std::map<std::string,std::map<std::string,std::string>> sections_;
    bool exactSections_=false;
public:
    explicit SourceSettings(bool exactSections=false) : exactSections_(exactSections) {}
    void parse(std::span<const std::uint8_t> bytes);
    void load(Archives& archives,const std::string& member);
    std::string value(std::string section,std::string key,const std::string& fallback={}) const;
    std::optional<std::string> entry(std::string section,std::string key) const;
};
struct FrameAnchor {const char* frame;const char* point;const char* relative;const char* target;float x,y;};
std::array<FrameAnchor,5> mapInfoAnchors();
float mapInfoTitleOffset(float nameWidth,float iconWidth,float authWidth,bool authenticated);
class MapUiData {
    SourceSettings data_,strings_,ui_;
public:
    explicit MapUiData(Archives& archives);
    float fontHeight(const std::string& key,float fallback) const;
    std::string sizeName(unsigned width,unsigned height) const;
    std::string sizeName(const MapInfo& info) const;
    std::string tilesetName(char tileset) const;
};
}
