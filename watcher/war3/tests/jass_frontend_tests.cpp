// Author: MiYu. Native expression trees and integer bits for pinned original parser comparison.
#include "jass.h"
#include "jass_literal.h"
#include <functional>
#include <iostream>
#include <sstream>

using namespace war3;
using namespace war3::jass;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
Program parse(const std::string& expression) {return Program::parse({{"fixture.j","function f takes nothing returns nothing\nreturn "+expression+"\nendfunction\n","authored expression"}});}
std::string tree(const Program& p,Id id) {auto& e=p.expression(id);if(e.kind==ExpressionKind::Unary)return "("+e.text+" "+tree(p,e.operands[0])+")";if(e.kind==ExpressionKind::Binary)return "("+e.text+" "+tree(p,e.operands[0])+" "+tree(p,e.operands[1])+")";return e.text;}
std::string tree(const std::string& text) {auto p=parse(text);return tree(p,p.statement(p.function("f")->body[0]).value);}
std::string baseText(std::uint32_t bits,int base) {std::ostringstream text;if(base==16)text<<std::hex;else if(base==8)text<<std::oct;text<<bits;return text.str();}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=2){std::cerr<<"Usage: war3_jass_frontend_tests <fixture-output.json>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    std::vector<std::pair<std::string,std::string>> expressions;std::vector<std::pair<std::string,std::uint32_t>> integers;
    test("frontend_original_boolean_priority",[]{require(tree("true or false and false")=="(and (or true false) false)","or must bind more tightly than and");require(tree("true and false or true")=="(and true (or false true))","and must consume or on its right");require(tree("true and false and true")=="(and true (and false true))" && tree("true or false or true")=="(or true (or false true))","Boolean associativity differs");require(tree("not true == false")=="(== (not true) false)","not precedence differs");});
    test("frontend_operator_pair_fixture",[&]{for(auto a:{"+","-","*","/","and","or","==","!=","<",">","<=",">="})for(auto b:{"+","-","*","/","and","or","==","!=","<",">","<=",">="}){std::string text=std::string("1 ")+a+" 2 "+b+" 3";expressions.emplace_back(text,tree(text));}});
    test("frontend_unary_and_parenthesized_fixture",[&]{for(auto op:{"+","-","*","/","and","or","==","!=","<",">","<=",">="}){for(auto unary:{"-","+","not"}){std::string a=std::string(unary)+" 1 "+op+" 2",b=std::string("1 ")+op+" "+unary+" 2";expressions.emplace_back(a,tree(a));expressions.emplace_back(b,tree(b));}for(auto text:{std::string("( 1 ")+op+" 2 ) * 3",std::string("1 * ( 2 ")+op+" 3 )"})expressions.emplace_back(text,tree(text));}for(auto text:{"true or false and false","true and false or true","not true == false","not not true","- - 1"})expressions.emplace_back(text,tree(text));});
    test("frontend_integer_boundaries_and_ast",[&]{require(integerLiteral("010")==8 && integerLiteral("$FFFFFFFF")==UINT32_MAX && integerLiteral("0X80000000")==0x80000000 && integerLiteral("4294967296")==0 && integerLiteral("0x100000001")==1,"Integer radix or wrap differs");for(auto text:{"0","00","1","010","077777777777","037777777777","2147483647","2147483648","4294967295","4294967296","18446744073709551616","$aBcDeF","0XFFFFFFFF","0x100000001","$123456789ABCDEF0123456789"})integers.emplace_back(text,integerLiteral(text));std::uint32_t state=0x83d12740;for(unsigned i=0;i<192;++i){state=state*1664525u+1013904223u;integers.emplace_back(baseText(state,10),integerLiteral(baseText(state,10)));auto hex=std::string(i%3==0?"$":i%3==1?"0x":"0X")+baseText(state,16),oct="0"+baseText(state,8);integers.emplace_back(hex,integerLiteral(hex));integers.emplace_back(oct,integerLiteral(oct));}for(auto& [text,bits]:integers){auto p=parse(text);auto& e=p.expression(p.statement(p.function("f")->body[0]).value);require(e.kind==ExpressionKind::Integer && e.integerBits==bits,"Integer bits absent from AST");}});
    test("frontend_invalid_integer_diagnostics",[]{for(auto text:{"","$","0x","08","019","$G","0xFG","-1","1.0"}){bool rejected=false;try{integerLiteral(text);}catch(const std::exception&){rejected=true;}require(rejected,"Invalid integer accepted");}try{parse("08");throw std::runtime_error("Expected source diagnostic");}catch(const std::exception& e){require(std::string(e.what()).starts_with("fixture.j:2:"),"Integer diagnostic lacks source position");}});
    if(!failed){fs::path output=fs::absolute(argv[1]);fs::create_directories(output.parent_path());std::ofstream file(output,std::ios::binary);require(bool(file),"Cannot write frontend fixture");file<<"{\"integers\":[";bool first=true;for(auto& [text,bits]:integers){if(!first)file<<',';first=false;file<<"[\""<<text<<"\","<<bits<<']';}file<<"],\"expressions\":[";first=true;for(auto& [text,shape]:expressions){if(!first)file<<',';first=false;file<<"[\""<<text<<"\",\""<<shape<<"\"]";}file<<"]}\n";file.close();require(bool(file),"Cannot complete frontend fixture");}
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into frontend checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<" expression_cases="<<expressions.size()<<" integer_cases="<<integers.size()<<'\n';return failed?1:0;
}
