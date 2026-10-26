// Author: MiYu. Bounded FDF source parsing without executing game scripts.
#include "fdf.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <charconv>

namespace war3 {
std::optional<std::uint32_t> inlineTextColor(std::string_view token) {if(token.size()!=10 || token[0]!='|' || (token[1]!='c' && token[1]!='C'))return std::nullopt;std::uint32_t value=0;auto [end,error]=std::from_chars(token.data()+2,token.data()+10,value,16);if(error!=std::errc{} || end!=token.data()+10)return std::nullopt;return value|0xff000000u;}
std::string sourceText(std::span<const std::uint8_t> bytes) {
    if(bytes.size()>=3 && bytes[0]==0xef && bytes[1]==0xbb && bytes[2]==0xbf)bytes=bytes.subspan(3);
    if(bytes.size()>=2 && ((bytes[0]==0xff && bytes[1]==0xfe)||(bytes[0]==0xfe && bytes[1]==0xff))) {
        bool little=bytes[0]==0xff;bytes=bytes.subspan(2);if(bytes.size()%2)throw std::runtime_error("Truncated UTF-16 source");std::wstring value;value.reserve(bytes.size()/2);for(size_t i=0;i<bytes.size();i+=2)value+=wchar_t(little?bytes[i]|(unsigned(bytes[i+1])<<8):(unsigned(bytes[i])<<8)|bytes[i+1]);return utf8(value);
    }
    std::string value(reinterpret_cast<const char*>(bytes.data()),bytes.size());if(value.empty())return value;
    if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0)>0)return value;
    int count=MultiByteToWideChar(CP_ACP,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0);if(!count)throw std::runtime_error("Invalid source text encoding");std::wstring legacy(count,0);MultiByteToWideChar(CP_ACP,MB_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),legacy.data(),count);return utf8(legacy);
}
std::string skinValue(Archives& archives,const std::string& key,const std::string& fallback) {
    auto member=archives.read("UI\\war3skins.txt");if(!member)return fallback;auto text=sourceText(member->bytes);size_t at=0;
    while(at<text.size()) {auto end=text.find('\n',at);auto line=text.substr(at,end==std::string::npos?end:end-at);at=end==std::string::npos?text.size():end+1;auto split=line.find('=');if(split==std::string::npos)continue;auto name=line.substr(0,split);auto first=name.find_first_not_of(" \t\r");auto last=name.find_last_not_of(" \t\r");if(first==std::string::npos || name.substr(first,last-first+1)!=key)continue;auto value=line.substr(split+1);auto tail=value.find_last_not_of(" \t\r");auto head=value.find_first_not_of(" \t\r");return head==std::string::npos?fallback:value.substr(head,tail-head+1);}
    return fallback;
}
namespace {
struct Token { std::string value; unsigned line; };
std::vector<Token> lex(std::string_view source) {
    std::vector<Token> out; size_t at = 0; unsigned line = 1;
    while (at < source.size()) {
        char c = source[at];
        if (std::isspace(static_cast<unsigned char>(c))) { if (c=='\n') ++line; ++at; continue; }
        if (source.substr(at,2)=="//") { while (at<source.size() && source[at]!='\n') ++at; continue; }
        if (source.substr(at,2)=="/*") { at+=2; while (at<source.size() && source.substr(at,2)!="*/") { if (source[at]=='\n') ++line; ++at; } if (at==source.size()) throw std::runtime_error("Unclosed FDF comment"); at+=2; continue; }
        Token token{{},line};
        if (c=='"') {
            ++at; bool closed = false;
            while (at<source.size()) { char next=source[at++]; if (next=='"') {closed=true;break;} if(next=='\\' && at<source.size() && source[at]=='"') next=source[at++]; if(next=='\n') ++line; token.value+=next; }
            if (!closed) throw std::runtime_error("Unclosed FDF string");
        } else if (c=='{' || c=='}' || c==',' || c==';') { token.value=c; ++at; }
        else { auto start=at; while(at<source.size() && !std::isspace(static_cast<unsigned char>(source[at])) && source[at]!='{' && source[at]!='}' && source[at]!=',' && source[at]!=';') ++at; token.value=std::string(source.substr(start,at-start)); }
        if (out.size()>=250000 || token.value.size()>65536) throw std::runtime_error("FDF token budget exceeded"); out.push_back(std::move(token));
    }
    return out;
}
class Parser {
    std::vector<Token> tokens_;
    size_t at_=0;
    unsigned frames_=0;
public:
    explicit Parser(std::string_view source) : tokens_(lex(source)) {}
    bool empty() const { return at_==tokens_.size(); }
    const Token& peek() const { if (empty()) throw std::runtime_error("Truncated FDF"); return tokens_[at_]; }
    Token take() { auto t=peek(); ++at_; return t; }
    bool consume(std::string_view value) { if(!empty() && peek().value==value) {++at_;return true;} return false; }
    void expect(std::string_view value) { if(!consume(value)) throw std::runtime_error("Expected FDF token: "+std::string(value)); }
    FrameDefinition frame(unsigned depth=0) {
        if (depth>32 || ++frames_>16384) throw std::runtime_error("FDF frame budget exceeded");
        FrameDefinition f; f.type=take().value; f.name=take().value;
        if (consume("INHERITS")) { f.inheritChildren=consume("WITHCHILDREN"); f.inherits=take().value; }
        expect("{");
        while (!consume("}")) {
            if (consume(",") || consume(";")) continue;
            if (consume("Frame")) { f.children.push_back(frame(depth+1)); continue; }
            auto key=take(); std::vector<std::string> values;
            while(!empty() && peek().line==key.line && peek().value!="}" && peek().value!="Frame") { auto value=take().value; if(value!="," && value!=";") values.push_back(std::move(value)); }
            if(key.value=="SetPoint") f.points.push_back(std::move(values));else if(key.value=="MenuItem")f.menuItems.push_back(std::move(values));else f.properties[key.value]=std::move(values);
        }
        return f;
    }
};
}
const std::vector<std::string>& FrameDefinition::property(const std::string& key) const { static const std::vector<std::string> empty; auto it=properties.find(key); return it==properties.end() ? empty : it->second; }
FrameDefinition frameContext(FrameDefinition frame,const std::string& prefix) {
    if(prefix.empty())return frame;std::set<std::string> names;auto collect=[&](auto&& self,const FrameDefinition& f)->void{names.insert(f.name);for(auto& child:f.children)self(self,child);};collect(collect,frame);
    const std::set<std::string> references={"ControlBackdrop","ControlDisabledBackdrop","ControlPushedBackdrop","ControlMouseOverHighlight","ButtonText","PopupTitleFrame","PopupArrowFrame","PopupMenuFrame","TabFocusNext","EditTextFrame","SliderThumbButtonFrame","ScrollBarIncButtonFrame","ScrollBarDecButtonFrame","ListBoxScrollBar"};
    auto apply=[&](auto&& self,FrameDefinition& f)->void{f.name=prefix+"/"+f.name;for(auto& p:f.points)if(p.size()>1 && names.contains(p[1]))p[1]=prefix+"/"+p[1];for(auto& [key,values]:f.properties)if(references.contains(key))for(auto& value:values)if(names.contains(value))value=prefix+"/"+value;for(auto& child:f.children)self(self,child);};apply(apply,frame);return frame;
}
std::string nextFrameFocus(const std::vector<FrameFocus>& frames,const std::string& current,bool reverse) {
    std::map<std::string,size_t> names;std::vector<size_t> enabled;for(size_t i=0;i<frames.size();++i){names.try_emplace(frames[i].name,i);if(frames[i].enabled)enabled.push_back(i);}if(enabled.empty())return {};
    auto follow=[&](size_t index,bool include){for(size_t i=0;i<=frames.size();++i){if(include && frames[index].enabled)return frames[index].name;auto next=names.find(frames[index].next);if(next==names.end())break;index=next->second;include=true;}return std::string{};};
    if(current.empty()){for(size_t i=0;i<frames.size();++i)if(frames[i].initial){auto first=follow(i,true);if(!first.empty())return first;}return frames[enabled.front()].name;}
    if(!reverse){auto found=names.find(current);if(found!=names.end()){auto next=follow(found->second,false);if(!next.empty() && next!=current)return next;}}
    else for(auto i:enabled){auto next=follow(i,false);if(next==current && frames[i].name!=current)return frames[i].name;}
    auto found=std::find_if(enabled.begin(),enabled.end(),[&](auto i){return frames[i].name==current;});if(found==enabled.end())return frames[reverse?enabled.back():enabled.front()].name;auto index=size_t(found-enabled.begin());return frames[enabled[(index+(reverse?enabled.size()-1:1))%enabled.size()]].name;
}
float FrameDefinition::number(const std::string& key, float fallback) const { auto& p=property(key); if(p.empty())return fallback; size_t end=0; float value=std::stof(p.front(),&end); if(end<p.front().size() && p.front()[end]=='f')++end; if(end!=p.front().size() || !std::isfinite(value))throw std::runtime_error("Invalid FDF number"); return value; }
void FrameDefinitions::registerFrame(const FrameDefinition& frame) {if(frames_.size()>=16384)throw std::runtime_error("FDF definition budget exceeded");frames_[frame.name]=frame;for(auto& child:frame.children)registerFrame(child);}
void FrameDefinitions::load(Archives& archives, const std::string& member) {
    if (std::find(loaded_.begin(),loaded_.end(),member)!=loaded_.end())return;
    if (loading_.size()>=16 || loaded_.size()>=128 || std::find(loading_.begin(),loading_.end(),member)!=loading_.end()) throw std::runtime_error("Cyclic FDF include");
    auto bytes=archives.read(member); if(!bytes || bytes->bytes.size()>2*1024*1024)throw std::runtime_error("Missing or oversized FDF: "+member);
    if(bytes->bytes.size()>8*1024*1024-sourceBytes_)throw std::runtime_error("FDF source budget exceeded");sourceBytes_+=bytes->bytes.size();
    loading_.push_back(member);
    try {
        auto text=sourceText(bytes->bytes);Parser p(text);
        while(!p.empty()) {
            if(p.consume(",") || p.consume(";"))continue;
            if(p.consume("IncludeFile")) { auto include=p.take().value; load(archives,include); }
            else if(p.consume("Frame"))registerFrame(p.frame());
            else if(p.consume("StringList")) { p.expect("{"); while(!p.consume("}")) {if(p.consume(",") || p.consume(";"))continue; auto key=p.take().value; auto value=p.take().value;strings_[key]=std::move(value);} }
            else throw std::runtime_error("Unsupported FDF declaration: "+p.take().value);
        }
        loaded_.push_back(member); loading_.pop_back();
    } catch (...) {loading_.pop_back();throw;}
}
FrameDefinition FrameDefinitions::resolve(const FrameDefinition& source, unsigned depth, unsigned& budget) const {
    if(depth>32 || !budget)throw std::runtime_error("FDF inheritance or expansion budget exceeded");--budget;
    FrameDefinition result=source;
    if(!source.inherits.empty()) {
        auto base=frames_.find(source.inherits); if(base==frames_.end())throw std::runtime_error("Missing FDF template: "+source.inherits);
        auto parent=resolve(base->second,depth+1,budget); result.properties=std::move(parent.properties); for(auto& [key,value]:source.properties)result.properties[key]=value;
        if(source.points.empty()) result.points=std::move(parent.points);
        if(source.menuItems.empty())result.menuItems=std::move(parent.menuItems);
        if(source.inheritChildren) {result.children=std::move(parent.children);for(auto& child:source.children){auto it=std::find_if(result.children.begin(),result.children.end(),[&](auto& f){return f.name==child.name;});if(it==result.children.end())result.children.push_back(child);else *it=child;}}
    }
    result.inherits.clear();for(auto& child:result.children)child=resolve(child,depth+1,budget);return result;
}
FrameDefinition FrameDefinitions::frame(const std::string& name) const {auto it=frames_.find(name);if(it==frames_.end())throw std::runtime_error("Missing FDF frame: "+name);unsigned budget=32768;return resolve(it->second,0,budget);}
std::string FrameDefinitions::string(const std::string& key) const { auto it=strings_.find(key);return it==strings_.end()?key:it->second; }
}
