// Author: MiYu. Interactive Win32 console for map Lua scripts.
#pragma once
#include <windows.h>
#include <optional>
#include <string>
#include <string_view>

namespace war3 {
class LuaNativeConsole {
    HANDLE input_=INVALID_HANDLE_VALUE,output_=INVALID_HANDLE_VALUE;
    std::wstring line_;
    bool enabled_=false,owned_=false;
public:
    LuaNativeConsole()=default;
    ~LuaNativeConsole();
    LuaNativeConsole(const LuaNativeConsole&)=delete;
    LuaNativeConsole& operator=(const LuaNativeConsole&)=delete;
    bool enabled() const {return enabled_;}
    void setEnabled(bool enabled);
    void write(std::string_view text);
    std::optional<std::string> read();
};
}
