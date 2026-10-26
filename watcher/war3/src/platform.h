// Author: MiYu. Win32 process configuration and read-only library boundaries.
#pragma once
#include <windows.h>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <span>
#include <string>
#include <vector>
#include <stdexcept>
#include <optional>

namespace war3 {
using Bytes = std::vector<std::uint8_t>;
namespace fs = std::filesystem;
std::string utf8(std::wstring_view text);
std::wstring wide(std::string_view text);
std::string winError(DWORD code = GetLastError());
std::string sha256(const fs::path& path);
void verifyPe32(const fs::path& path);
struct Options {
    fs::path dataRoot;
    fs::path map;
    fs::path log;
    fs::path capture;
    std::string renderer = "d3d9";
    unsigned frames = 0;
    bool probe = false;
    bool hidden = false;
    bool mute = false;
    bool windowCheck = false;
    bool menuCheck = false;
    bool scriptCheck = false;
    bool configCheck = false;
    std::optional<std::uint64_t> timeMs;
    static Options parse();
};
class Log {
    std::ofstream stream_;
public:
    explicit Log(const fs::path& path);
    void write(std::string_view message);
};
class Library {
    HMODULE module_ = nullptr;
public:
    Library(const fs::path& path, std::string_view digest);
    ~Library();
    Library(const Library&) = delete;
    Library& operator=(const Library&) = delete;
    template<class T> T symbol(const char* name) const {
        auto address = GetProcAddress(module_, name);
        if (!address) throw std::runtime_error(std::string("Missing DLL export: ") + name);
        return reinterpret_cast<T>(address);
    }
};
}
