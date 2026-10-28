// Author: MiYu. Persist camera preferences separately from the original game resources.
#include "game_preferences.h"
#include <algorithm>
#include <array>
#include <atomic>

namespace war3 {
namespace {
constexpr std::array<std::uint8_t,8> magic{'W','3','C','A','M',1,0,0};
std::atomic<unsigned> serial=0;
fs::path path(const fs::path& root){validateWar3UserDirectory(root);return war3UserDirectory()/L"Settings"/L"camera.bin";}
}
bool loadEdgeScrollPreference(const fs::path& root){
    auto file=path(root);std::error_code error;if(!fs::exists(file,error)){if(error)throw std::runtime_error("Cannot inspect camera preferences");return true;}auto length=fs::file_size(file,error);if(error || length!=magic.size()+1)throw std::runtime_error("Unsupported camera preferences size");std::ifstream input(file,std::ios::binary);std::array<std::uint8_t,magic.size()+1> bytes{};if(!input || !input.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size())) || input.peek()!=std::char_traits<char>::eof())throw std::runtime_error("Cannot read camera preferences");if(!std::equal(magic.begin(),magic.end(),bytes.begin()) || bytes.back()>1)throw std::runtime_error("Unsupported camera preferences format");return bytes.back()!=0;
}
void saveEdgeScrollPreference(const fs::path& root,bool enabled){
    loadEdgeScrollPreference(root);auto file=path(root);fs::create_directories(file.parent_path());std::array<std::uint8_t,magic.size()+1> bytes{};std::copy(magic.begin(),magic.end(),bytes.begin());bytes.back()=enabled?1:0;fs::path temp;HANDLE handle=INVALID_HANDLE_VALUE;DWORD createError=ERROR_FILE_EXISTS;for(unsigned attempt=0;attempt<32 && handle==INVALID_HANDLE_VALUE;++attempt){temp=file;temp+=L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(++serial)+L".tmp";handle=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(handle==INVALID_HANDLE_VALUE){createError=GetLastError();if(createError!=ERROR_FILE_EXISTS && createError!=ERROR_ALREADY_EXISTS)break;}}if(handle==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot create camera preferences: "+winError(createError));DWORD written=0;bool good=WriteFile(handle,bytes.data(),DWORD(bytes.size()),&written,nullptr) && written==bytes.size() && FlushFileBuffers(handle);DWORD error=good?ERROR_SUCCESS:GetLastError();CloseHandle(handle);if(!good){DeleteFileW(temp.c_str());throw std::runtime_error("Cannot write camera preferences: "+winError(error));}if(!MoveFileExW(temp.c_str(),file.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){error=GetLastError();DeleteFileW(temp.c_str());throw std::runtime_error("Cannot publish camera preferences: "+winError(error));}
}
}
