// Author: MiYu. Interactive Win32 console for map Lua scripts.
#include "lua_native_console.h"
#include "platform.h"
#include <mutex>
#include <algorithm>

namespace war3 {
namespace {std::mutex consoleMutex;LuaNativeConsole* consoleOwner=nullptr;}
LuaNativeConsole::~LuaNativeConsole(){
    std::lock_guard lock(consoleMutex);if(input_!=INVALID_HANDLE_VALUE)CloseHandle(input_);if(output_!=INVALID_HANDLE_VALUE)CloseHandle(output_);if(owned_)FreeConsole();if(consoleOwner==this)consoleOwner=nullptr;
}
void LuaNativeConsole::setEnabled(bool enabled){
    std::lock_guard lock(consoleMutex);if(enabled==enabled_)return;if(enabled && input_==INVALID_HANDLE_VALUE){if(consoleOwner)throw std::runtime_error("Map console is already in use");if(!GetConsoleCP()){if(!AllocConsole())throw std::runtime_error("Cannot create map console: "+winError());owned_=true;}consoleOwner=this;input_=CreateFileW(L"CONIN$",GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,0,nullptr);output_=CreateFileW(L"CONOUT$",GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,0,nullptr);if(input_==INVALID_HANDLE_VALUE || output_==INVALID_HANDLE_VALUE){auto error=GetLastError();if(input_!=INVALID_HANDLE_VALUE)CloseHandle(input_);if(output_!=INVALID_HANDLE_VALUE)CloseHandle(output_);input_=output_=INVALID_HANDLE_VALUE;if(owned_)FreeConsole();owned_=false;consoleOwner=nullptr;throw std::runtime_error("Cannot open map console: "+winError(error));}}if(owned_){auto window=GetConsoleWindow();if(!window)throw std::runtime_error("Map console window unavailable");ShowWindow(window,enabled?SW_SHOW:SW_HIDE);}enabled_=enabled;
}
void LuaNativeConsole::write(std::string_view text){
    if(!enabled_)return;auto value=wide(text);DWORD count=0;if(!value.empty() && (!WriteConsoleW(output_,value.data(),DWORD(value.size()),&count,nullptr) || count!=value.size()))throw std::runtime_error("Cannot write map console: "+winError());
}
std::optional<std::string> LuaNativeConsole::read(){
    if(!enabled_)return {};DWORD available=0;if(!GetNumberOfConsoleInputEvents(input_,&available))throw std::runtime_error("Cannot query map console input: "+winError());while(available--){INPUT_RECORD event{};DWORD count=0;if(!ReadConsoleInputW(input_,&event,1,&count) || count!=1)throw std::runtime_error("Cannot read map console: "+winError());if(event.EventType!=KEY_EVENT || !event.Event.KeyEvent.bKeyDown)continue;auto key=event.Event.KeyEvent;auto character=key.uChar.UnicodeChar;if(character==L'\r'){auto result=utf8(line_);line_.clear();DWORD written=0;WriteConsoleW(output_,L"\r\n",2,&written,nullptr);return result;}if(character==L'\b'){if(!line_.empty()){auto last=line_.back();line_.pop_back();if(last>=0xdc00 && last<=0xdfff && !line_.empty() && line_.back()>=0xd800 && line_.back()<=0xdbff)line_.pop_back();DWORD written=0;WriteConsoleW(output_,L"\b \b",3,&written,nullptr);}continue;}if(character>=L' ' && line_.size()<524288){auto repeats=std::min<size_t>(key.wRepeatCount,524288-line_.size());line_.append(repeats,character);DWORD written=0;for(size_t i=0;i<repeats;++i)WriteConsoleW(output_,&character,1,&written,nullptr);}}return {};
}
}
