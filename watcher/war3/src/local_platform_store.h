// Author: MiYu. Persist simulated offline platform records through the user's gamecache store.
#pragma once
#include <optional>
#include <string>
#include <string_view>

namespace war3 {
class ScriptSession;
// Map-scoped local platform archive shared by the Lua JAPI bridge and JASS DzAPI natives.
// Records live in gamecache "11-local/<map digest>", mission "Player N", so both script paths see the same data.
class LocalPlatformStore {
    ScriptSession& session_;
    std::string cacheName_;
public:
    explicit LocalPlatformStore(ScriptSession& session);
    const std::string& cacheName() const {return cacheName_;}
    bool save(unsigned player,std::string_view key,std::string_view data);
    std::optional<std::string> read(unsigned player,std::string_view key);
    // Map-wide records that belong to no player (DzAPI global store).
    bool saveShared(std::string_view key,std::string_view data);
    std::optional<std::string> readShared(std::string_view key);
private:
    bool saveMission(const std::string& mission,std::string_view key,std::string_view data);
    std::optional<std::string> readMission(const std::string& mission,std::string_view key);
};
}
