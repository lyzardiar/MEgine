// Author: MiYu. Same-directory temporary paths for atomic Win32 file publication.
#pragma once
#include "platform.h"
#include <atomic>
namespace war3 {
inline fs::path sameDirectoryTemporaryPath(const fs::path& target){
    static std::atomic<unsigned> serial=0;
    const auto prefix=target.filename().native().front()==L'.'?L"~tmp-":L".tmp-";
    auto temporary=target.parent_path()/(prefix+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64())+L"-"+std::to_wstring(++serial));
    if(temporary.native().size()<MAX_PATH)return temporary;
    auto normalized=(fs::canonical(temporary.parent_path())/temporary.filename()).make_preferred().wstring();
    if(normalized.starts_with(LR"(\\?\)") || normalized.starts_with(LR"(\\.\)"))return normalized;
    if(normalized.starts_with(LR"(\\)"))return LR"(\\?\UNC\)"+normalized.substr(2);
    return LR"(\\?\)"+normalized;
}
}
