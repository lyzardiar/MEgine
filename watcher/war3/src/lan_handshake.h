// Author: MiYu. Same-executable capability handshake for opt-in local LAN experiments.
#pragma once
#include "platform.h"
#include <array>
#include <vector>

namespace war3 {
inline std::vector<std::uint8_t> localLanHandshake() {
    std::array<wchar_t,32768> path{};auto length=GetModuleFileNameW(nullptr,path.data(),DWORD(path.size()));if(!length || length>=path.size())throw std::runtime_error("Cannot identify LAN executable");auto digest=sha256(fs::path(std::wstring(path.data(),length)));if(digest.size()!=64)throw std::runtime_error("Invalid LAN executable digest");
    std::vector<std::uint8_t> bytes{0xf7,0x70,80,0,'M','3','L','H',1,0,0,0,15,0,0,0};bytes.insert(bytes.end(),digest.begin(),digest.end());return bytes;
}
}
