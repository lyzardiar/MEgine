// Author: MiYu. Classic map source records retained for native game sessions.
#pragma once
#include "archive.h"
#include <array>
#include <map>

namespace war3 {
using MapStrings = std::map<unsigned,std::string>;
struct MapHeader {
    unsigned reserved=0,flags=0,players=0;
    std::string name;
    static std::optional<MapHeader> parse(std::span<const std::uint8_t> bytes);
    static std::optional<MapHeader> read(const fs::path& path);
};
MapStrings mapStrings(std::span<const std::uint8_t> bytes);
std::string mapString(const std::string& value,const MapStrings& strings);
struct MapPlayer {
    int id,type,race,fixedStart;
    std::string name;
    std::array<float,2> start;
    unsigned allyLow,allyHigh;
};
struct MapForce { unsigned flags,players; std::string name; };
struct MapUpgrade { unsigned players,id; int level,availability; };
struct MapTech { unsigned players,id; };
struct MapRandomUnit { int chance; std::vector<unsigned> ids; };
struct MapUnitTable { int id; std::string name; std::vector<int> columns; std::vector<MapRandomUnit> units; };
struct MapRandomItem { int chance; unsigned id; };
struct MapItemTable { int id; std::string name; std::vector<std::vector<MapRandomItem>> sets; };
struct MapInfo {
    unsigned version=0,saves=0,editor=0,flags=0;
    std::string name,author,description,recommendedPlayers;
    std::array<float,8> camera{};
    std::array<int,4> complements{};
    std::array<unsigned,2> playable{};
    char tileset=0,lightEnvironment=0;
    int background=0,loadingScreen=0,useFog=0;
    std::string loadingModel,loadingText,loadingTitle,loadingSubtitle,prologueModel,prologueText,prologueTitle,prologueSubtitle,soundEnvironment;
    std::array<float,2> fogHeight{};
    float fogDensity=0;
    std::array<std::uint8_t,4> fogColor{},waterColor{};
    unsigned weather=0;
    std::vector<MapPlayer> players;
    std::vector<MapForce> forces;
    std::vector<MapUpgrade> upgrades;
    std::vector<MapTech> technologies;
    std::vector<MapUnitTable> randomUnits;
    std::vector<MapItemTable> randomItems;
    bool omittedEditorTables=false;
    unsigned playablePlayers() const;
    unsigned humanPlayers() const;
    static MapInfo parse(std::span<const std::uint8_t> bytes,const MapStrings& strings={});
};
struct TerrainCorner { std::int16_t ground; std::uint16_t water; std::uint8_t flags,variation,cliff; };
struct MapTerrain {
    char tileset=0;
    unsigned customTileset=0,width=0,height=0;
    std::array<float,2> origin{};
    std::vector<unsigned> groundTiles,cliffTiles;
    std::vector<TerrainCorner> corners;
    static MapTerrain parse(std::span<const std::uint8_t> bytes);
};
struct MapPathing {
    unsigned width=0,height=0;
    Bytes cells;
    static MapPathing parse(std::span<const std::uint8_t> bytes);
};
struct MapData {
    MapInfo info;
    MapTerrain terrain;
    std::optional<MapPathing> pathing;
    static MapData read(Archives& archives);
};
struct MapEntry { fs::path path; bool directory=false; };
std::vector<MapEntry> mapDirectory(const fs::path& directory);
}
