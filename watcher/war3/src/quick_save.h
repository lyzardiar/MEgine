// Author: MiYu. Keep the replaceable quick checkpoint separate from manual save names.
#pragma once
#include "platform.h"

namespace war3 {
inline constexpr char quickSavePath[]="Quick\\QuickSave.w3z";
inline constexpr wchar_t quickSaveEntry[]=L"\\QuickSave";
inline bool quickSaveExists() {
    auto base=war3UserDirectory()/L"Saves",directory=base/L"Quick",file=directory/L"QuickSave.w3z";auto safe=[](const fs::path& path,bool directory){auto attributes=GetFileAttributesW(path.c_str());return attributes!=INVALID_FILE_ATTRIBUTES && !(attributes&FILE_ATTRIBUTE_REPARSE_POINT) && bool(attributes&FILE_ATTRIBUTE_DIRECTORY)==directory;};return safe(base,true) && safe(directory,true) && safe(file,false);
}
}
