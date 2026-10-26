// Author: MiYu. Original decimal, octal and hexadecimal 32-bit token accumulation.
#include "jass_literal.h"
#include <stdexcept>

namespace war3::jass {
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
}
