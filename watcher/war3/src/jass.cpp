// Author: MiYu. Bounded classic JASS lexer/parser, retaining syntax for native execution.
#include "jass.h"
#include "fdf.h"
#include <algorithm>
#include <cctype>
#include <set>

namespace war3::jass {
namespace {
enum class TokenKind {Word,Integer,Real,String,Rawcode,Symbol,Newline,End};
struct Token {TokenKind kind=TokenKind::End;std::string text;Position position;};
[[noreturn]] void error(const Source& source,Position p,const std::string& reason) {throw std::runtime_error(source.name+":"+std::to_string(p.line)+":"+std::to_string(p.column)+": "+reason);}
bool digit(char c) {return c>='0' && c<='9';}
bool letter(char c) {return (c>='A' && c<='Z') || (c>='a' && c<='z') || c=='_';}
bool hex(char c) {return digit(c) || (c>='a' && c<='f') || (c>='A' && c<='F');}
class Lexer {
    const Source& source_;
    size_t at_=0,tokens_=0;
    Position position_;
    char peek(size_t n=0) const {return at_+n<source_.text.size()?source_.text[at_+n]:0;}
    char take() {auto c=source_.text[at_++];++position_.column;return c;}
public:
    Lexer(const Source& source,unsigned index) : source_(source) {position_.source=index;}
    Token next() {
        while(at_<source_.text.size()){auto c=peek();if(c==' ' || c=='\t' || c=='\v' || c=='\f'){take();continue;}if(c=='/' && peek(1)=='/'){while(at_<source_.text.size() && peek()!='\r' && peek()!='\n')take();continue;}break;}
        Token t;t.position=position_;if(++tokens_>4000000)error(source_,position_,"JASS token budget exceeded");if(at_==source_.text.size())return t;auto c=take();
        if(c=='\r' || c=='\n'){if(c=='\r' && peek()=='\n')take();++position_.line;position_.column=1;t.kind=TokenKind::Newline;return t;}
        if(letter(c)){t.kind=TokenKind::Word;t.text=c;while(letter(peek()) || digit(peek()))t.text+=take();return t;}
        if(c=='"' || c=='\''){t.kind=c=='"'?TokenKind::String:TokenKind::Rawcode;bool closed=false;while(at_<source_.text.size()){auto n=take();if(n==c){closed=true;break;}if(n=='\r' || n=='\n' || n==0)error(source_,t.position,"Unclosed JASS literal");t.text+=n;if(c=='"' && n=='\\'){if(!peek() || peek()=='\r' || peek()=='\n')error(source_,t.position,"Truncated JASS string escape");t.text+=take();}}if(!closed)error(source_,t.position,"Unclosed JASS literal");if(t.kind==TokenKind::Rawcode && (t.text.empty() || t.text.size()>4))error(source_,t.position,"Rawcode must contain 1 to 4 bytes");return t;}
        if(digit(c) || c=='$' || (c=='.' && digit(peek()))){t.kind=TokenKind::Integer;t.text=c;
            if(c=='$' || (c=='0' && (peek()=='x' || peek()=='X'))){if(c=='0')t.text+=take();size_t begin=at_;while(hex(peek()))t.text+=take();if(at_==begin)error(source_,t.position,"Missing hexadecimal digits");}
            else {while(digit(peek()))t.text+=take();if(c=='.' || peek()=='.'){t.kind=TokenKind::Real;if(peek()=='.'){t.text+=take();while(digit(peek()))t.text+=take();}}if(peek()=='e' || peek()=='E'){t.kind=TokenKind::Real;t.text+=take();if(peek()=='+' || peek()=='-')t.text+=take();size_t begin=at_;while(digit(peek()))t.text+=take();if(begin==at_)error(source_,t.position,"Missing real exponent");}}
            if(peek()=='.')error(source_,t.position,"Invalid JASS number");return t;
        }
        if(std::string_view("()+-*/[]=,<>!").find(c)==std::string_view::npos)error(source_,t.position,"Unexpected JASS byte");t.kind=TokenKind::Symbol;t.text=c;if((c=='=' || c=='!' || c=='<' || c=='>') && peek()=='=')t.text+=take();if(t.text=="!")error(source_,t.position,"Use not for JASS negation");return t;
    }
};
int precedence(const std::string& op) {if(op=="or")return 1;if(op=="and")return 2;if(op=="==" || op=="!=")return 3;if(op=="<" || op==">" || op=="<=" || op==">=")return 4;if(op=="+" || op=="-")return 5;if(op=="*" || op=="/")return 6;return -1;}
}
class Parser {
    Program& program_;
    const Source& source_;
    Lexer lexer_;
    Token token_;
    unsigned expressionDepth_=0,blockDepth_=0,loops_=0;
    [[noreturn]] void fail(const std::string& message) const {error(source_,token_.position,message);}
    void next() {token_=lexer_.next();}
    bool consume(const std::string& text) {if(token_.text!=text || (token_.kind!=TokenKind::Word && token_.kind!=TokenKind::Symbol))return false;next();return true;}
    void expect(const std::string& text) {if(!consume(text))fail("Expected "+text);}
    std::string name() {if(token_.kind!=TokenKind::Word)fail("Expected JASS identifier");auto value=token_.text;next();return value;}
    void lines() {while(token_.kind==TokenKind::Newline)next();}
    void endline() {if(token_.kind!=TokenKind::Newline && token_.kind!=TokenKind::End)fail("Expected end of JASS line");lines();}
    Id expression(Expression e) {if(program_.expressions_.size()>=1000000)fail("JASS expression budget exceeded");auto id=Id(program_.expressions_.size());program_.expressions_.push_back(std::move(e));return id;}
    Id statement(Statement s) {if(program_.statements_.size()>=1000000)fail("JASS statement budget exceeded");auto id=Id(program_.statements_.size());program_.statements_.push_back(std::move(s));return id;}
    Id value(int minimum=0) {
        if(++expressionDepth_>128)fail("JASS expression nesting exceeded");auto position=token_.position;Id left=none;
        if((token_.kind==TokenKind::Symbol && (token_.text=="-" || token_.text=="+")) || (token_.kind==TokenKind::Word && token_.text=="not")){auto op=token_.text;next();left=expression({ExpressionKind::Unary,std::move(op),{value(7)},position});}
        else if(consume("(")){left=value();expect(")");}
        else if(consume("function"))left=expression({ExpressionKind::Function,name(),{},position});
        else if(token_.kind==TokenKind::Integer || token_.kind==TokenKind::Real || token_.kind==TokenKind::String || token_.kind==TokenKind::Rawcode){auto token=std::move(token_);next();auto kind=token.kind==TokenKind::Integer?ExpressionKind::Integer:token.kind==TokenKind::Real?ExpressionKind::Real:token.kind==TokenKind::String?ExpressionKind::String:ExpressionKind::Rawcode;left=expression({kind,std::move(token.text),{},position});}
        else if(token_.kind==TokenKind::Word){auto text=name();if(text=="true" || text=="false")left=expression({ExpressionKind::Boolean,std::move(text),{},position});else if(text=="null")left=expression({ExpressionKind::Null,{}, {},position});else if(consume("(")){std::vector<Id> arguments;if(!consume(")")){do {arguments.push_back(value());if(arguments.size()>256)fail("JASS argument budget exceeded");}while(consume(","));expect(")");}left=expression({ExpressionKind::Call,std::move(text),std::move(arguments),position});}else if(consume("[")){auto index=value();expect("]");left=expression({ExpressionKind::Array,std::move(text),{index},position});}else left=expression({ExpressionKind::Variable,std::move(text),{},position});}
        else fail("Expected JASS expression");
        while((token_.kind==TokenKind::Word || token_.kind==TokenKind::Symbol) && precedence(token_.text)>=minimum){auto op=token_.text;int priority=precedence(op);next();auto right=value(priority+1);left=expression({ExpressionKind::Binary,std::move(op),{left,right},position});}
        --expressionDepth_;return left;
    }
    Variable variable(bool constant) {Variable v;v.position=token_.position;v.constant=constant;v.type=name();v.array=consume("array");v.name=name();if(consume("=")){if(v.array)fail("JASS arrays cannot have initializers");v.initializer=value();}endline();return v;}
    std::vector<Id> block(const std::set<std::string>& ends) {
        if(++blockDepth_>64)fail("JASS block nesting exceeded");std::vector<Id> result;lines();while(!ends.contains(token_.text)){if(token_.kind==TokenKind::End)fail("Unclosed JASS block");result.push_back(command());}--blockDepth_;return result;
    }
    Id command() {
        Statement s;s.position=token_.position;s.debug=consume("debug");
        if(consume("set")){s.kind=StatementKind::Set;s.variable=name();if(consume("[")){s.index=value();expect("]");}expect("=");s.value=value();endline();}
        else if(consume("call")){s.kind=StatementKind::Call;s.value=value();if(program_.expression(s.value).kind!=ExpressionKind::Call)fail("JASS call requires a function invocation");endline();}
        else if(consume("if")){s.kind=StatementKind::If;auto condition=value();expect("then");endline();s.branches.push_back({condition,block({"elseif","else","endif"})});while(consume("elseif")){condition=value();expect("then");endline();s.branches.push_back({condition,block({"elseif","else","endif"})});}if(consume("else")){endline();s.branches.push_back({none,block({"endif"})});}expect("endif");endline();}
        else if(consume("loop")){s.kind=StatementKind::Loop;endline();++loops_;s.body=block({"endloop"});--loops_;expect("endloop");endline();}
        else if(consume("exitwhen")){if(!loops_)fail("exitwhen outside JASS loop");s.kind=StatementKind::ExitWhen;s.value=value();endline();}
        else if(consume("return")){s.kind=StatementKind::Return;if(token_.kind!=TokenKind::Newline && token_.kind!=TokenKind::End)s.value=value();endline();}
        else fail("Expected JASS statement");return statement(std::move(s));
    }
    void function(bool native,bool constant,Position position) {
        Function f;f.position=position;f.name=name();f.native=native;f.constant=constant;expect("takes");std::set<std::string> locals;if(!consume("nothing")){do {Parameter p{ name(),name() };if(!locals.insert(p.name).second)fail("Duplicate JASS parameter: "+p.name);f.parameters.push_back(std::move(p));if(f.parameters.size()>256)fail("JASS parameter budget exceeded");}while(consume(","));}expect("returns");f.result=name();endline();
        if(!native){while(consume("local")){auto v=variable(false);if(!locals.insert(v.name).second)fail("Duplicate JASS local: "+v.name);f.locals.push_back(std::move(v));}f.body=block({"endfunction"});expect("endfunction");endline();}
        if(program_.functions_.size()>=100000)fail("JASS function budget exceeded");if(!program_.functionNames_.emplace(f.name,program_.functions_.size()).second)fail("Duplicate JASS function: "+f.name);program_.functions_.push_back(std::move(f));
    }
public:
    Parser(Program& program,unsigned index) : program_(program),source_(program.sources_[index]),lexer_(source_,index) {next();}
    void parse() {
        lines();while(token_.kind!=TokenKind::End){auto position=token_.position;bool constant=consume("constant");
            if(consume("type")){if(constant)fail("Constant JASS type");Type type;type.position=position;type.name=name();expect("extends");type.parent=name();endline();if(program_.types_.size()>=4096 || !program_.typeNames_.emplace(type.name,program_.types_.size()).second)fail("Duplicate or excessive JASS type: "+type.name);program_.types_.push_back(std::move(type));}
            else if(consume("globals")){if(constant)fail("Constant globals block");endline();while(!consume("endglobals")){if(token_.kind==TokenKind::End)fail("Unclosed JASS globals");auto v=variable(consume("constant"));if(program_.globals_.size()>=100000 || !program_.globalNames_.emplace(v.name,program_.globals_.size()).second)fail("Duplicate or excessive JASS global: "+v.name);program_.globals_.push_back(std::move(v));}endline();}
            else if(consume("native"))function(true,constant,position);
            else if(consume("function"))function(false,constant,position);
            else fail("Expected JASS type, globals, native or function");
        }
    }
};
Program Program::parse(std::vector<Source> sources) {Program result;if(sources.size()>32)throw std::runtime_error("JASS source count exceeded");size_t bytes=0;for(auto& source:sources){if(source.text.size()>16*1024*1024 || source.text.size()>32*1024*1024-bytes)throw std::runtime_error("JASS source byte budget exceeded");bytes+=source.text.size();}result.sources_=std::move(sources);for(unsigned i=0;i<result.sources_.size();++i)Parser(result,i).parse();return result;}
const Function* Program::function(const std::string& name) const {auto found=functionNames_.find(name);return found==functionNames_.end()?nullptr:&functions_[found->second];}
Program Program::read(Archives& archives) {
    std::vector<Source> sources;auto add=[&](const std::string& name,const Member& member){if(member.bytes.size()>16*1024*1024)throw std::runtime_error("JASS source byte budget exceeded: "+name);sources.push_back({name,sourceText(member.bytes),member.source});};for(auto name:{"Scripts\\common.j","Scripts\\Blizzard.j"}){auto member=archives.readCandidates({name},ArchiveScope::Common);if(!member)throw std::runtime_error(std::string("Missing common JASS source: ")+name);add(name,*member);}
    std::shared_ptr<const Member> map;std::string path;for(auto name:{"war3map.j","Scripts\\war3map.j"})if((map=archives.readCandidates({name},ArchiveScope::Map))){path=name;break;}if(!map)throw std::runtime_error("Missing map JASS source");add(path,*map);auto result=parse(std::move(sources));for(auto name:{"config","main"}){auto f=result.function(name);if(!f || f->position.source!=unsigned(result.sources().size()-1) || f->native || !f->parameters.empty() || f->result!="nothing")throw std::runtime_error(std::string("Invalid map JASS entry: ")+name);}return result;
}
}
