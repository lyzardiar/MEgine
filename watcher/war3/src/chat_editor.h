// Author: MiYu. Edit the in-game chat draft on UTF-16 character boundaries.
#pragma once
#include <windows.h>
#include <algorithm>
#include <string>
#include <string_view>

namespace war3 {
inline bool chatHigh(wchar_t c){return c>=0xd800 && c<=0xdbff;}
inline bool chatLow(wchar_t c){return c>=0xdc00 && c<=0xdfff;}
inline size_t chatPrevious(std::wstring_view value,size_t at){if(!at)return 0;--at;if(at && chatLow(value[at]) && chatHigh(value[at-1]))--at;return at;}
inline size_t chatNext(std::wstring_view value,size_t at){if(at>=value.size())return value.size();++at;if(at<value.size() && chatHigh(value[at-1]) && chatLow(value[at]))++at;return at;}
inline void editChat(std::wstring& value,size_t& cursor,wchar_t& pending,unsigned key,std::wstring_view characters){
    cursor=std::min(cursor,value.size());if(key==VK_LEFT){cursor=chatPrevious(value,cursor);pending=0;}else if(key==VK_RIGHT){cursor=chatNext(value,cursor);pending=0;}else if(key==VK_HOME){cursor=0;pending=0;}else if(key==VK_END){cursor=value.size();pending=0;}else if(key==VK_DELETE){value.erase(cursor,chatNext(value,cursor)-cursor);pending=0;}
    for(auto c:characters){if(c==8){if(pending)pending=0;else{auto start=chatPrevious(value,cursor);value.erase(start,cursor-start);cursor=start;}}else if(chatHigh(c))pending=c;else if(chatLow(c)){if(pending && value.size()<=254){value.insert(cursor,1,pending);value.insert(cursor+1,1,c);cursor+=2;}pending=0;}else{pending=0;if(c>=32 && c!=127 && value.size()<256)value.insert(cursor++,1,c);}}
}
}
