// Author: MiYu. Owned classic JASS syntax and source locations for the native runtime.
#pragma once
#include "archive.h"
#include <map>

namespace war3::jass {
using Id=std::uint32_t;
inline constexpr Id none=UINT32_MAX;
struct Position {unsigned source=0,line=1,column=1;};
struct Source {std::string name,text,origin;};
enum class ExpressionKind {Integer,Real,String,Rawcode,Boolean,Null,Variable,Array,Call,Function,Unary,Binary};
struct Expression {ExpressionKind kind;std::string text;std::vector<Id> operands;Position position;std::uint32_t realBits=0;};
enum class StatementKind {Set,Call,If,Loop,ExitWhen,Return};
struct Branch {Id condition=none;std::vector<Id> statements;};
struct Statement {StatementKind kind;std::string variable;Id index=none,value=none;std::vector<Id> body;std::vector<Branch> branches;bool debug=false;Position position;};
struct Variable {std::string type,name;bool array=false,constant=false;Id initializer=none;Position position;};
struct Parameter {std::string type,name;};
struct Function {std::string name,result;std::vector<Parameter> parameters;std::vector<Variable> locals;std::vector<Id> body;bool native=false,constant=false;Position position;};
struct Type {std::string name,parent;Position position;};
class Parser;
class Program {
    friend class Parser;
    std::vector<Source> sources_;
    std::vector<Type> types_;
    std::vector<Variable> globals_;
    std::vector<Function> functions_;
    std::vector<Expression> expressions_;
    std::vector<Statement> statements_;
    std::map<std::string,size_t> typeNames_,globalNames_,functionNames_;
public:
    static Program parse(std::vector<Source> sources);
    static Program read(Archives& archives);
    const std::vector<Source>& sources() const {return sources_;}
    const std::vector<Type>& types() const {return types_;}
    const std::vector<Variable>& globals() const {return globals_;}
    const std::vector<Function>& functions() const {return functions_;}
    const Expression& expression(Id id) const {return expressions_.at(id);}
    const Statement& statement(Id id) const {return statements_.at(id);}
    size_t expressionCount() const {return expressions_.size();}
    size_t statementCount() const {return statements_.size();}
    const Function* function(const std::string& name) const;
};
}
