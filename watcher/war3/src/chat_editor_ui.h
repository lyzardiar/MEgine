// Author: MiYu. Fit and hit-test lobby chat without splitting UTF-16 characters.
#pragma once
#include "chat_editor.h"
#include "media.h"

namespace war3 {
inline std::wstring chatUiText(std::wstring_view value){std::wstring result(value);for(auto& c:result)if(c==L'|')c=L'｜';return result;}
inline std::pair<size_t,size_t> chatUiRange(Text& text,std::wstring_view value,size_t cursor,bool focused,float width,float height){cursor=std::min(cursor,value.size());size_t first=0,last=value.size();auto measure=[&]{auto part=chatUiText(value.substr(first,last-first));if(focused)part.insert(cursor-first,1,L'|');return text.width(part,height,false);};while(first<last && measure()>width){if(first<cursor)first=chatNext(value,first);else last=chatPrevious(value,last);}return {first,last};}
inline std::string chatUiDisplay(Text& text,std::wstring_view value,size_t cursor,bool focused,float width,float height){cursor=std::min(cursor,value.size());auto [first,last]=chatUiRange(text,value,cursor,focused,width,height);auto before=chatUiText(value.substr(first,cursor-first)),after=chatUiText(value.substr(cursor,last-cursor));return utf8(before)+(focused && (GetTickCount64()/500)%2==0?"||":"")+utf8(after);}
inline size_t chatUiClick(Text& text,std::wstring_view value,size_t cursor,bool focused,float width,float height,float x){cursor=std::min(cursor,value.size());auto [first,last]=chatUiRange(text,value,cursor,focused,width,height);bool caret=focused && (GetTickCount64()/500)%2==0;auto position=[&](size_t at){auto part=chatUiText(value.substr(first,at-first));if(caret && at>cursor)part.insert(cursor-first,1,L'|');return text.width(part,height,false);};for(size_t at=first;at<last;){auto next=chatNext(value,at);if(x<(position(at)+position(next))/2)return at;at=next;}return last;}
}
