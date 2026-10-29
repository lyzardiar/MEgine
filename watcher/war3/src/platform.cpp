// Author: MiYu. Native options, diagnostics and version-pinned DLL loading.
#include "platform.h"
#include <shellapi.h>
#include <bcrypt.h>
#include <algorithm>
#include <array>
#include <iomanip>
#include <sstream>
#include <memory>

namespace war3 {
std::string utf8(std::wstring_view text) {
    if (text.empty()) return {};
    int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    if (!count) throw std::runtime_error("Invalid UTF-16");
    std::string result(count, 0);
    WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), result.data(), count, nullptr, nullptr);
    return result;
}
std::wstring wide(std::string_view text) {
    if (text.empty()) return {};
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), nullptr, 0);
    if (!count) throw std::runtime_error("Invalid UTF-8");
    std::wstring result(count, 0);
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()), result.data(), count);
    return result;
}
std::string winError(DWORD code) { return std::to_string(code) + " (Win32)"; }
fs::path war3UserDirectory() {wchar_t buffer[32768]{};DWORD length=GetEnvironmentVariableW(L"MEGINE_WAR3_USER_DIR",buffer,32768);if(length>=32768)throw std::runtime_error("War3 user directory is too long");if(length){fs::path path(buffer);if(!path.is_absolute())throw std::runtime_error("War3 user directory must be absolute");return path;}length=GetEnvironmentVariableW(L"LOCALAPPDATA",buffer,32768);if(!length || length>=32768)throw std::runtime_error("LOCALAPPDATA unavailable for War3 user directory");return fs::path(buffer)/L"MEgine"/L"War3";}
void validateWar3UserDirectory(const fs::path& dataRoot) {auto root=fs::canonical(dataRoot).wstring();if(root.empty())throw std::runtime_error("Invalid War3 data root");if(root.back()!=L'\\')root+=L'\\';for(auto part:{L"Campaign",L"GameCache",L"Settings"}){auto target=fs::weakly_canonical(war3UserDirectory()/part).wstring();bool same=target.size()+1==root.size() && CompareStringOrdinal(target.c_str(),int(target.size()),root.c_str(),int(root.size()-1),TRUE)==CSTR_EQUAL;bool inside=target.size()>=root.size() && CompareStringOrdinal(target.c_str(),int(root.size()),root.c_str(),int(root.size()),TRUE)==CSTR_EQUAL;if(same || inside)throw std::runtime_error("War3 user data directory overlaps the read-only game installation");}}
std::string sha256(const fs::path& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Cannot read " + utf8(path.wstring()));
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) throw std::runtime_error("SHA-256 unavailable");
    BCRYPT_HASH_HANDLE hash = nullptr;
    auto status = BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0);
    std::array<unsigned char, 65536> buffer{};
    while (status >= 0 && file) {
        file.read(reinterpret_cast<char*>(buffer.data()), buffer.size());
        if (file.gcount()) status = BCryptHashData(hash, buffer.data(), static_cast<ULONG>(file.gcount()), 0);
    }
    std::array<unsigned char, 32> digest{};
    if (status >= 0 && !file.bad()) status = BCryptFinishHash(hash, digest.data(), digest.size(), 0);
    else status = -1;
    if (hash) BCryptDestroyHash(hash);
    BCryptCloseAlgorithmProvider(algorithm, 0);
    if (status < 0) throw std::runtime_error("SHA-256 failed");
    std::ostringstream result;
    for (auto byte : digest) result << std::hex << std::setw(2) << std::setfill('0') << unsigned(byte);
    return result.str();
}
std::string sha256(std::span<const std::uint8_t> bytes) {
    BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)throw std::runtime_error("SHA-256 unavailable");auto status=BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0);for(size_t at=0;status>=0 && at<bytes.size();){auto size=ULONG(std::min<size_t>(bytes.size()-at,65536));status=BCryptHashData(hash,const_cast<PUCHAR>(bytes.data()+at),size,0);at+=size;}std::array<unsigned char,32> digest{};if(status>=0)status=BCryptFinishHash(hash,digest.data(),ULONG(digest.size()),0);if(hash)BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(algorithm,0);if(status<0)throw std::runtime_error("SHA-256 failed");std::ostringstream result;for(auto byte:digest)result<<std::hex<<std::setw(2)<<std::setfill('0')<<unsigned(byte);return result.str();
}
void verifyPe32(const fs::path& path) {
    std::ifstream file(path, std::ios::binary);
    IMAGE_DOS_HEADER dos{};
    file.read(reinterpret_cast<char*>(&dos), sizeof(dos));
    if (!file || dos.e_magic != IMAGE_DOS_SIGNATURE || dos.e_lfanew < sizeof(dos) || dos.e_lfanew > 16 * 1024 * 1024) throw std::runtime_error("Invalid PE library");
    file.seekg(dos.e_lfanew);
    DWORD signature = 0;
    IMAGE_FILE_HEADER header{};
    file.read(reinterpret_cast<char*>(&signature), sizeof(signature));
    file.read(reinterpret_cast<char*>(&header), sizeof(header));
    if (!file || signature != IMAGE_NT_SIGNATURE || header.Machine != IMAGE_FILE_MACHINE_I386) throw std::runtime_error("Library must be Win32 x86");
}
Options Options::parse() {
    Options options;
    int count = 0;
    auto arguments = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!arguments) throw std::runtime_error("Cannot parse command line");
    auto freeArguments = std::unique_ptr<wchar_t*, decltype(&LocalFree)>(arguments, LocalFree);
    auto value = [&](int& index) -> std::wstring { if (++index >= count) throw std::runtime_error("Option requires a value"); return arguments[index]; };
    for (int i = 1; i < count; ++i) {
        std::wstring argument = arguments[i];
        if (argument == L"--data-root") options.dataRoot = value(i);
        else if (argument == L"--map") options.map = value(i);
        else if (argument == L"--renderer") options.renderer = utf8(value(i));
        else if (argument == L"--log") options.log = value(i);
        else if (argument == L"--capture") options.capture = value(i);
        else if (argument == L"--frames") { auto text = value(i); size_t end = 0; auto n = std::stoul(text, &end); if (end != text.size() || n == 0 || n > 1000000) throw std::runtime_error("Invalid frame limit"); options.frames = n; }
        else if (argument == L"--probe") options.probe = true;
        else if (argument == L"--hidden") options.hidden = true;
        else if (argument == L"--mute") options.mute = true;
        else if (argument == L"--window-check") options.windowCheck = true;
        else if (argument == L"--menu-check") options.menuCheck = true;
        else if (argument == L"--script-check") options.scriptCheck = true;
        else if (argument == L"--config-check") options.configCheck = true;
        else if (argument == L"--main-check") options.mainCheck = true;
        else if (argument == L"--play") options.play = true;
        else if (argument == L"--experimental-local-lan") options.experimentalLocalLan = true;
        else if(argument==L"--simulate-ms"){auto text=value(i);size_t end=0;auto n=std::stoul(text,&end);if(end!=text.size() || n>600000)throw std::runtime_error("Invalid simulation interval");options.simulateMs=unsigned(n);}
        else if (argument == L"--time-ms") {auto text=value(i);size_t end=0;auto n=std::stoull(text,&end);if(end!=text.size() || n>86400000)throw std::runtime_error("Invalid animation time");options.timeMs=n;}
        else throw std::runtime_error("Unknown option: " + utf8(argument));
    }
    if (options.dataRoot.empty()) throw std::runtime_error("Usage: war3.exe --data-root <Warcraft III directory> [--map <w3x/w3m>] [--renderer d3d9]");
    options.dataRoot = fs::canonical(options.dataRoot);
    if (options.renderer != "d3d9" && options.renderer != "d3d9-reference") throw std::runtime_error("Renderer not implemented: " + options.renderer);
    if(options.play && (options.map.empty() || options.probe || options.mainCheck || options.configCheck || options.scriptCheck || options.menuCheck || options.windowCheck))throw std::runtime_error("Play requires --map and no check mode");
    if (!options.map.empty()) { if (options.map.is_relative()) options.map = options.dataRoot / options.map; options.map = fs::canonical(options.map); }
    if (options.hidden && !options.probe && !options.scriptCheck && !options.configCheck && !options.mainCheck && !options.frames) throw std::runtime_error("Hidden run requires --frames or a native check");
    if (!options.capture.empty() && !options.frames) throw std::runtime_error("Capture requires --frames");
    if (options.windowCheck && (options.probe || options.frames<120)) throw std::runtime_error("Window check requires a render run with at least 120 frames");
    if (options.menuCheck && (options.probe || options.windowCheck || options.map.empty() || options.frames<240)) throw std::runtime_error("Menu check requires --map, at least 240 frames, and no other check mode");
    if(options.scriptCheck && (options.map.empty() || options.probe || options.configCheck || options.mainCheck || options.windowCheck || options.menuCheck || options.frames || !options.capture.empty()))throw std::runtime_error("Script check requires --map and no render/check options");
    if(options.configCheck && (options.map.empty() || options.probe || options.scriptCheck || options.mainCheck || options.windowCheck || options.menuCheck || options.frames || !options.capture.empty()))throw std::runtime_error("Config check requires --map and no render/check options");
    if(options.mainCheck && (options.map.empty() || options.probe || options.scriptCheck || options.configCheck || options.windowCheck || options.menuCheck || options.frames || !options.capture.empty()))throw std::runtime_error("Main check requires --map and no render/check options");
    if(options.simulateMs && !options.mainCheck)throw std::runtime_error("Simulation interval requires --main-check");
    if (options.log.empty()) {
        wchar_t directory[32768]{};
        DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", directory, 32768);
        if (!length || length >= 32768) throw std::runtime_error("LOCALAPPDATA unavailable; specify --log");
        options.log = fs::path(directory) / L"MEgine" / L"War3" / L"Logs" / L"client.log";
    }
    return options;
}
Log::Log(const fs::path& path) {
    if (!path.parent_path().empty()) fs::create_directories(path.parent_path());
    stream_.open(path, std::ios::binary | std::ios::trunc);
    if (!stream_) throw std::runtime_error("Cannot create diagnostic log");
}
void Log::write(std::string_view message) { std::lock_guard lock(mutex_);stream_ << message << '\n'; stream_.flush(); }
Library::Library(const fs::path& path, std::string_view digest) {
    verifyPe32(path);
    if (sha256(path) != digest) throw std::runtime_error("Unsupported DLL version: " + utf8(path.wstring()));
    module_ = LoadLibraryExW(fs::canonical(path).c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!module_) throw std::runtime_error("Cannot load DLL: " + winError());
}
Library::~Library() { if (module_) FreeLibrary(module_); }
}
