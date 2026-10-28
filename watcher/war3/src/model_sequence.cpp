// Author: MiYu. Read source animation metadata without requiring a graphics device.
#include "model_sequence.h"
#include "binary.h"
#include <algorithm>
#include <cctype>

namespace war3::mdx {
std::string modelPath(std::string path){for(auto& c:path){if(c=='/')c='\\';c=char(std::tolower(static_cast<unsigned char>(c)));}if(path.ends_with(".mdl"))path.replace(path.size()-4,4,".mdx");if(!path.ends_with(".mdx"))path+=".mdx";return path;}
std::vector<Sequence> readSequences(std::span<const std::uint8_t> bytes){
    if(bytes.size()>32*1024*1024)throw std::runtime_error("MDX input budget exceeded");Binary b(bytes);b.expect(tag("MDLX"));std::vector<Sequence> sequences;bool seen=false;unsigned chunks=0;
    while(b.left()){if(++chunks>64)throw std::runtime_error("MDX chunk budget exceeded");auto kind=b.u32(),length=b.u32();Binary r(b.take(length));if(kind!=tag("SEQS"))continue;if(seen)throw std::runtime_error("Duplicate MDX sequence chunk");seen=true;while(r.left()){Sequence s;s.name=r.string(80);s.start=r.i32();s.end=r.i32();r.take(4);s.flags=r.u32();r.take(36);if(s.end<s.start || sequences.size()>=4096)throw std::runtime_error("Invalid sequence");sequences.push_back(std::move(s));}}
    return sequences;
}
int findSequence(std::span<const Sequence> sequences,const std::string& name){
    auto words=[](const std::string& text){std::vector<std::string> result;std::string token;auto add=[&]{if(token.empty())return;if(token=="eattree"){result.push_back("eat");result.push_back("tree");}else result.push_back(token);token.clear();};for(auto c:text){auto value=static_cast<unsigned char>(c);if(std::isalnum(value))token+=char(std::tolower(value));else add();}add();return result;};
    auto requested=words(name);auto contains=[](const auto& list,const auto& word){return std::find(list.begin(),list.end(),word)!=list.end();};bool alternate=contains(requested,std::string("alternate"));int index=-1;size_t best=SIZE_MAX;
    for(unsigned i=0;i<sequences.size();++i){auto candidate=words(sequences[i].name);if(contains(candidate,std::string("alternate"))!=alternate)continue;if(!std::all_of(requested.begin(),requested.end(),[&](auto& word){return contains(candidate,word);}))continue;size_t score=0;for(auto& word:candidate)if(!contains(requested,word) && !std::all_of(word.begin(),word.end(),[](auto c){return std::isdigit(static_cast<unsigned char>(c));}))++score;if(score<best){index=int(i);best=score;}}
    return index;
}
}
