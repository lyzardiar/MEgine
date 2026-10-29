// Author: MiYu. Non-blocking classic LAN join and lobby state.
#pragma once
#include "lan_discovery.h"
#include <array>
#include <chrono>
#include <cstdint>
#include <deque>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace war3 {
enum class LanJoinState {Connecting,Joining,Lobby,Rejected,Closed,Error};
enum class LanMapDownloadState {Idle,Requested,Receiving,Complete};
enum class LanLoadPhase {Lobby,Countdown,Loading,Ready,Failed};
struct LanSlot {std::uint8_t playerId=0,download=0,status=0,computer=0,team=0,color=0,race=0,difficulty=0,handicap=0;};
struct LanPlayer {std::uint8_t id=0;std::string name;};
struct LanChatMessage {std::uint8_t sender=0;std::string text;};
struct LanAction {std::uint8_t playerId=0;std::vector<std::uint8_t> bytes;};
struct LanTimeSlot {std::uint16_t elapsedMs=0;std::vector<LanAction> actions;};
struct LanMapAnnouncement {bool received=false;std::string path;std::uint32_t size=0,info=0,crc=0;std::array<std::uint8_t,20> sha1{};};
struct LanMapCheck;
class LanJoin {
    std::uintptr_t socket_=~std::uintptr_t{};
    bool winsock_=false;
    LanJoinState state_=LanJoinState::Connecting;
    std::string error_,name_;
    std::uint32_t rejectionCode_=0,hostCounter_=0,entryKey_=0;
    std::uint8_t localPlayerId_=0;
    std::optional<std::uint32_t> randomSeed_;
    std::vector<LanSlot> slots_;
    std::vector<LanPlayer> players_;
    std::vector<LanChatMessage> chat_;
    LanMapAnnouncement map_;
    bool mapReadyReported_=false;
    bool experimentalHandshake_=false,handshakeVerified_=false;
    std::vector<std::uint8_t> handshakePacket_,deferredJoin_;
    std::chrono::steady_clock::time_point handshakeStarted_{};
    bool loadingEnabled_=false,localLoaded_=false;
    LanLoadPhase loadPhase_=LanLoadPhase::Lobby;
    std::chrono::steady_clock::time_point loadStarted_{};
    std::vector<std::uint8_t> loadPlayers_,loadedPlayers_;
    bool timeSlotsEnabled_=false;
    std::vector<LanAction> timeSlotFragments_;
    std::deque<LanTimeSlot> timeSlots_;
    std::size_t fragmentBytes_=0,queuedTimeSlotBytes_=0,fragmentCount_=0;
    LanMapDownloadState downloadState_=LanMapDownloadState::Idle;
    std::uint8_t downloadHostId_=0;
    std::vector<std::uint8_t> downloading_;
    std::shared_ptr<const std::vector<std::uint8_t>> downloadedMap_;
    std::chrono::steady_clock::time_point downloadActivity_{};
    std::vector<std::uint8_t> input_,output_;
    std::size_t sent_=0;
    std::chrono::steady_clock::time_point activity_{};
    void connected();
    void process(const std::uint8_t* data,std::size_t length);
    void fail(std::string reason);
    void closeSocket();
    void clearDownload();
    void updateLoadPhase();
    void receiveTimeSlot(const std::uint8_t* data,std::size_t length);
public:
    LanJoin(const LanGame& game,std::string playerName);
    ~LanJoin();
    LanJoin(const LanJoin&)=delete;
    LanJoin& operator=(const LanJoin&)=delete;
    void poll();
    void cancel();
    // Must be enabled before the first transport poll; waits for an identical executable response before joining.
    bool enableExperimentalHandshake();
    bool sendChat(std::string_view message);
    bool requestSlotChange(std::uint8_t field,std::uint8_t value);
    // Queue readiness only after every announced map field has been checked.
    bool reportMapReady(const LanMapCheck& checked);
    // Opt in only when a session can actually prepare and synchronize the game.
    bool enableLoadingProtocol();
    bool reportLocalLoaded();
    // Arm after countdown begins, before reporting local load; frames still require the ready barrier.
    // Action bytes are not decoded by this layer.
    bool enableTimeSlotProtocol();
    bool sendAction(std::span<const std::uint8_t> action);
    bool sendChecksum(std::uint32_t checksum);
    std::optional<LanTimeSlot> takeTimeSlot();
    LanLoadPhase loadPhase() const {return loadPhase_;}
    const std::vector<std::uint8_t>& loadPlayers() const {return loadPlayers_;}
    const std::vector<std::uint8_t>& loadedPlayers() const {return loadedPlayers_;}
    bool requestMapDownload();
    void discardDownloadedMap();
    LanMapDownloadState mapDownloadState() const {return downloadState_;}
    std::size_t mapDownloadBytes() const {return downloadedMap_?downloadedMap_->size():downloading_.size();}
    // Complete transport bytes are untrusted until the map declaration fields are verified.
    std::shared_ptr<const std::vector<std::uint8_t>> downloadedMap() const {return downloadedMap_;}
    LanJoinState state() const {return state_;}
    const std::string& error() const {return error_;}
    std::uint32_t rejectionCode() const {return rejectionCode_;}
    std::uint8_t localPlayerId() const {return localPlayerId_;}
    std::optional<std::uint32_t> randomSeed() const {return randomSeed_;}
    const std::vector<LanSlot>& slots() const {return slots_;}
    const std::vector<LanPlayer>& players() const {return players_;}
    const std::vector<LanChatMessage>& chat() const {return chat_;}
    const LanMapAnnouncement& mapCheck() const {return map_;}
};
}
