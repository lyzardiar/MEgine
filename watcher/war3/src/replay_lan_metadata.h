// Author: MiYu. Versioned identity stored in the game name of same-build LAN replays.
#pragma once
#include "lan_handshake.h"
#include <charconv>
#include <optional>

namespace war3 {
inline constexpr std::string_view lanReplayV1Prefix="MEgine LAN v1 ",lanReplayV2Prefix="MEgine LAN v2 ",lanReplaySeparator=" | ";

struct LanReplayMetadata {
    std::string executableDigest;
    std::optional<std::uint8_t> perspective;
    std::optional<std::string> commonDigest,mapDigest;
};

inline std::optional<LanReplayMetadata> readLanReplayMetadata(std::string_view title) {
    const bool v2=title.starts_with(lanReplayV2Prefix);
    if(!v2 && !title.starts_with(lanReplayV1Prefix))return {};
    title.remove_prefix(v2?lanReplayV2Prefix.size():lanReplayV1Prefix.size());
    auto field=[&](std::string_view prefix)->std::optional<std::string_view>{
        if(!title.starts_with(prefix))return {};
        const auto end=title.find(lanReplaySeparator,prefix.size());if(end==std::string_view::npos)return {};
        auto value=title.substr(prefix.size(),end-prefix.size());title.remove_prefix(end+lanReplaySeparator.size());return value;
    };
    auto executable=field("sha256=");if(!executable || !validLanDigest(*executable))return {};
    LanReplayMetadata result;result.executableDigest=*executable;
    if(auto peer=field("peer=")){
        unsigned value=0;const auto end=peer->data()+peer->size();const auto [last,error]=std::from_chars(peer->data(),end,value);
        if(error==std::errc{} && last==end && value>0 && value<255)result.perspective=std::uint8_t(value);
    }
    if(v2){
        if(!result.perspective)return {};
        auto common=field("commonsha256=");if(!common || !validLanDigest(*common))return {};
        result.commonDigest.emplace(*common);
    }
    if(result.perspective)if(auto map=field("mapsha256=");map && validLanDigest(*map))result.mapDigest.emplace(*map);
    return result;
}
}
