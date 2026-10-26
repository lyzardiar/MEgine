// Author: MiYu. Original integer accumulation, signed rawcode bytes and string escapes.
#include "jass_literal.h"
#include <stdexcept>

namespace war3::jass {
namespace {
char escaped(char c) {switch(c){case '\\':return '\\';case '\'':return '\'';case '"':return '"';case 'r':return '\r';case 'n':return '\n';case 'b':return '\b';case 'f':return '\f';case 't':return '\t';default:throw std::runtime_error("Unsupported JASS string escape");}}
}
std::uint32_t integerLiteral(std::string_view token) {
    if(token.empty())throw std::runtime_error("Empty JASS integer");
    unsigned base=10;size_t at=0;
    if(token[0]=='$'){base=16;at=1;}
    else if(token.size()>1 && token[0]=='0'){if(token[1]=='x' || token[1]=='X'){base=16;at=2;}else {base=8;at=1;}}
    if(at==token.size())throw std::runtime_error("Missing JASS integer digits");
    std::uint32_t result=0;
    for(;at<token.size();++at){unsigned char c=token[at];unsigned digit=c>='0' && c<='9'?c-'0':c>='a' && c<='f'?c-'a'+10:c>='A' && c<='F'?c-'A'+10:16;if(digit>=base)throw std::runtime_error("Invalid JASS integer digit");result=result*base+digit;}
    return result;
}
std::uint32_t rawcodeLiteral(std::string_view text) {
    if(text.starts_with('\\')){if(text.size()==6 && (text[1]=='u' || text[1]=='U'))return integerLiteral("$"+std::string(text.substr(2)));if(text.size()!=2)throw std::runtime_error("Invalid JASS rawcode escape");try{return static_cast<unsigned char>(escaped(text[1]));}catch(const std::runtime_error&){return 0;}}
    if(text.size()!=1 && text.size()!=4)throw std::runtime_error("JASS rawcode requires 1 or 4 bytes");std::uint32_t result=0;for(unsigned char c:text){auto signedByte=c<128?std::int32_t(c):std::int32_t(c)-256;result=(result<<8)+std::uint32_t(signedByte);}return result;
}
std::string stringLiteral(std::string_view text) {std::string result;result.reserve(text.size());for(size_t i=0;i<text.size();++i){char c=text[i];if(c=='\\'){if(++i==text.size())throw std::runtime_error("Truncated JASS string escape");c=escaped(text[i]);}result+=c;}return result;}
}
