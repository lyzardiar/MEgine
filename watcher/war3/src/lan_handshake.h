// Author: MiYu. Same-executable capability handshake for opt-in local LAN experiments.
#pragma once
#include "platform.h"
#include <algorithm>
#include <array>
#include <span>
#include <vector>

namespace war3 {
inline constexpr std::uint32_t lanRejectNameInUse=0x4d334c01,lanRejectRoomFull=0x4d334c02,lanRejectBuildMismatch=0x4d334c03,lanRejectCommonResources=0x4d334c04,lanRejectMatchStarting=0x4d334c05;
inline constexpr std::size_t lanHandshakeHeaderSize=16;
inline constexpr std::uint8_t lanCommonDigestOpcode=0x71;
inline constexpr std::uint8_t lanCountdownCancelOpcode=0x72;
enum class LanCountdownCancelReason : std::uint8_t {Manual=1,Departure=2};

template<class Range> bool validLanDigest(const Range& digest) {
    return digest.size()==64 && std::all_of(digest.begin(),digest.end(),[](auto c){return (c>='0' && c<='9') || (c>='a' && c<='f');});
}
inline std::vector<std::uint8_t> lanCommonDigestPacket(std::string_view digest) {
    if(!validLanDigest(digest))throw std::runtime_error("Invalid LAN common resource digest");
    std::vector<std::uint8_t> bytes{0xf7,lanCommonDigestOpcode,68,0};bytes.insert(bytes.end(),digest.begin(),digest.end());return bytes;
}
inline bool hasLanCommonDigest(std::span<const std::uint8_t> packet) {
    return packet.size()==68 && packet[0]==0xf7 && packet[1]==lanCommonDigestOpcode && packet[2]==68 && packet[3]==0 && validLanDigest(packet.subspan(4));
}

inline const std::string& executableDigest() {
    static const auto digest=[] {
        std::array<wchar_t,32768> path{};auto length=GetModuleFileNameW(nullptr,path.data(),DWORD(path.size()));
        if(!length || length>=path.size())throw std::runtime_error("Cannot identify current executable");
        return sha256(fs::path(std::wstring(path.data(),length)));
    }();
    return digest;
}
inline std::vector<std::uint8_t> localLanHandshake() {
    const auto& digest=executableDigest();std::vector<std::uint8_t> bytes{0xf7,0x70,80,0,'M','3','L','H',1,0,0,0,15,0,0,0};bytes.insert(bytes.end(),digest.begin(),digest.end());return bytes;
}
inline bool hasLanHandshakeDigest(std::span<const std::uint8_t> expected,std::span<const std::uint8_t> received) {
    return expected.size()==lanHandshakeHeaderSize+64 && received.size()==expected.size() && std::equal(expected.begin(),expected.begin()+lanHandshakeHeaderSize,received.begin()) &&
        validLanDigest(received.subspan(lanHandshakeHeaderSize));
}
}
