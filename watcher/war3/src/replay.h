// Author: MiYu. Bounded classic W3G archive metadata and replay record stream.
#pragma once
#include "lan_join.h"
#include "lan_simulation.h"
#include <array>
#include <filesystem>
#include <optional>
#include <span>
#include <string>
#include <vector>

namespace war3 {
struct ReplayHeader {std::uint32_t version=0,product=0,durationMs=0;std::uint16_t build=0;bool singlePlayer=false;};
std::optional<unsigned> replayProductVersion(std::uint32_t product);
struct ReplayPlayer {std::uint8_t id=0;std::string name;std::uint32_t runtime=0,race=0;};
struct ReplayGame {std::string name,mapPath,hostName;std::uint32_t flags=0,mapChecksum=0,playerCount=0,gameType=0,language=0;std::uint16_t width=0,height=0;std::optional<std::array<std::uint8_t,20>> mapSha1;ReplayPlayer host;};
struct ReplaySetup {std::vector<LanSlot> slots;std::uint32_t randomSeed=0;std::uint8_t layout=0,players=0;};
enum class ReplayRecordKind {Player,PlayerLeft,Setup,CountdownStart,CountdownEnd,GameStart,TimeSlot,Chat,Checksum,Desync,EndTimer,Extra};
struct ReplayRecord {ReplayRecordKind kind;ReplayPlayer player;ReplaySetup setup;LanTimeSlot slot;bool fragment=false;std::uint8_t playerId=0;std::vector<std::uint8_t> payload;};
struct ReplayChat {std::uint8_t sender=0;std::uint32_t scope=0;bool startup=false;std::string text;};
ReplayChat decodeReplayChat(const ReplayRecord& record);
struct ReplayDeparture {std::uint8_t playerId=0;std::uint32_t reason=0,result=0,counter=0;};
ReplayDeparture decodeReplayDeparture(const ReplayRecord& record);
class Replay {
    ReplayHeader header_;
    ReplayGame game_;
    std::vector<ReplayRecord> records_;
public:
    static Replay read(std::span<const std::uint8_t> bytes);
    static Replay read(const std::filesystem::path& path);
    const ReplayHeader& header() const {return header_;}
    const ReplayGame& game() const {return game_;}
    const std::vector<ReplayRecord>& records() const {return records_;}
};
// The caller must configure the original player/seed/object mapping before using this adapter.
// Fragment records do not advance the simulation; other records are returned to the caller.
class ReplayCursor {
    const Replay& replay_;
    std::size_t index_=0,fragmentBytes_=0;
    bool fragmentPending_=false,slotPending_=false;
    std::vector<LanAction> fragments_;
public:
    explicit ReplayCursor(const Replay& replay):replay_(replay) {}
    const ReplayRecord* next();
    std::optional<LanStepResult> consume(LanSimulation& simulation,const ReplayRecord& record);
    bool complete() const {return index_==replay_.records().size() && !fragmentPending_ && !slotPending_;}
};
}
