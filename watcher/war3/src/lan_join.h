// Author: MiYu. Non-blocking classic LAN join and lobby state.
#pragma once
#include "lan_discovery.h"
#include <array>
#include <chrono>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace war3 {
enum class LanJoinState {Connecting,Joining,Lobby,Rejected,Closed,Error};
struct LanSlot {std::uint8_t playerId=0,download=0,status=0,computer=0,team=0,color=0,race=0,difficulty=0,handicap=0;};
struct LanPlayer {std::uint8_t id=0;std::string name;};
struct LanChatMessage {std::uint8_t sender=0;std::string text;};
struct LanMapAnnouncement {bool received=false;std::string path;std::uint32_t size=0,info=0,crc=0;std::array<std::uint8_t,20> sha1{};};
struct LanMapCheck;
class LanJoin {
    std::uintptr_t socket_=~std::uintptr_t{};
    bool winsock_=false;
    LanJoinState state_=LanJoinState::Connecting;
    std::string error_,name_;
    std::uint32_t rejectionCode_=0,hostCounter_=0,entryKey_=0;
    std::uint8_t localPlayerId_=0;
    std::vector<LanSlot> slots_;
    std::vector<LanPlayer> players_;
    std::vector<LanChatMessage> chat_;
    LanMapAnnouncement map_;
    bool mapReadyReported_=false;
    std::vector<std::uint8_t> input_,output_;
    std::size_t sent_=0;
    std::chrono::steady_clock::time_point activity_{};
    void connected();
    void process(const std::uint8_t* data,std::size_t length);
    void fail(std::string reason);
    void closeSocket();
public:
    LanJoin(const LanGame& game,std::string playerName);
    ~LanJoin();
    LanJoin(const LanJoin&)=delete;
    LanJoin& operator=(const LanJoin&)=delete;
    void poll();
    void cancel();
    bool sendChat(std::string_view message);
    bool requestSlotChange(std::uint8_t field,std::uint8_t value);
    // Queue readiness only after every announced map field has been checked.
    bool reportMapReady(const LanMapCheck& checked);
    LanJoinState state() const {return state_;}
    const std::string& error() const {return error_;}
    std::uint32_t rejectionCode() const {return rejectionCode_;}
    std::uint8_t localPlayerId() const {return localPlayerId_;}
    const std::vector<LanSlot>& slots() const {return slots_;}
    const std::vector<LanPlayer>& players() const {return players_;}
    const std::vector<LanChatMessage>& chat() const {return chat_;}
    const LanMapAnnouncement& mapCheck() const {return map_;}
};
}
