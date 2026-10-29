// Author: MiYu. Bounded non-blocking classic LAN game discovery.
#pragma once
#include <chrono>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <vector>

namespace war3 {
inline constexpr const char* experimentalLanPrefix="[M3-LAB] ";
struct LanGame {
    std::string address,name,mapPath,hostName;
    std::uint16_t port=0,width=0,height=0;
    std::uint32_t version=0,hostCounter=0,entryKey=0,slotsTotal=0,slotsUsed=0,slotsAvailable=0,uptime=0,mapFlags=0,mapChecksum=0,gameType=0,unknown=0;
    bool expansion=false;
    std::chrono::steady_clock::time_point lastSeen{};
};
// Parse one complete UDP GAMEINFO packet. Invalid and truncated packets return nullopt.
std::optional<LanGame> parseLanGameInfo(std::span<const std::uint8_t> bytes,std::string address);
class LanDiscovery {
    std::uintptr_t socket_=~std::uintptr_t{};
    bool winsock_=false,expansion_=true;
    std::uint32_t version_=27;
    std::chrono::steady_clock::time_point lastSearch_{};
    std::vector<LanGame> games_;
public:
    explicit LanDiscovery(bool expansion=true,std::uint32_t version=27);
    ~LanDiscovery();
    LanDiscovery(const LanDiscovery&)=delete;
    LanDiscovery& operator=(const LanDiscovery&)=delete;
    void refresh();
    void poll();
    const std::vector<LanGame>& games() const {return games_;}
};
}
