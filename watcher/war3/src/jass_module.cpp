// Author: MiYu. Resolve classic JASS scopes, handle ancestry and typed AST use sites.
#include "jass_module.h"
#include <algorithm>

namespace war3::jass {
namespace {
bool numeric(Category kind) {return kind==Category::Integer || kind==Category::Real;}
bool nullable(Category kind) {return kind==Category::String || kind==Category::Code || kind==Category::Handle || kind==Category::Null;}
}
Id Module::functionId(const std::string& name) const {auto found=functionNames_.find(name);return found==functionNames_.end()?none:found->second;}
Id Module::typeId(const std::string& name) const {auto found=typeNames_.find(name);return found==typeNames_.end()?none:found->second;}
bool Module::assignable(Id target,Id source) const {
    if(target==source)return true;auto to=type(target).category,from=type(source).category;if(to==Category::Real && from==Category::Integer)return true;if(from==Category::Null)return nullable(to);if(to!=Category::Handle || from!=Category::Handle)return false;for(auto at=types_[source].parent;at!=none;at=types_[at].parent)if(at==target)return true;return false;
}
class Linker {
    struct Symbol {Id type,index;Access access;bool array,constant;};
    Module& module_;
    const Program& program_;
    std::unordered_map<std::string,Symbol> locals_;
    Id currentFunction_=none;
    [[noreturn]] void fail(Position position,const std::string& message) const {auto& source=program_.sources().at(position.source);throw std::runtime_error(source.name+":"+std::to_string(position.line)+":"+std::to_string(position.column)+": "+message);}
    Id namedType(const std::string& name,Position position,bool result=false) const {auto id=module_.typeId(name);if(id==none)fail(position,"Unknown JASS type: "+name);auto kind=module_.types_[id].category;if(kind==Category::Null || (!result && kind==Category::Nothing))fail(position,"Invalid JASS value type: "+name);return id;}
    Symbol symbol(const std::string& name,Position position) const {if(auto found=locals_.find(name);found!=locals_.end())return found->second;auto global=module_.globalNames_.find(name);if(global==module_.globalNames_.end())fail(position,"Unknown JASS variable: "+name);auto index=global->second;auto& slot=module_.globals_[index];return {slot.type,index,Access::Global,slot.array,program_.globals()[index].constant};}
    void requireType(Id expected,Id actual,Position position,const std::string& operation) const {if(!module_.assignable(expected,actual))fail(position,operation+" expects "+module_.type(expected).name+", got "+module_.type(actual).name);}
    Binding resolve(const Expression& e) {
        auto id=[&](const char* name){return module_.typeId(name);};auto child=[&](size_t index){return module_.bindings_.at(e.operands.at(index)).type;};Binding result;
        switch(e.kind){
            case ExpressionKind::Integer:case ExpressionKind::Rawcode:result.type=id("integer");break;
            case ExpressionKind::Real:result.type=id("real");break;
            case ExpressionKind::String:result.type=id("string");break;
            case ExpressionKind::Boolean:result.type=id("boolean");break;
            case ExpressionKind::Null:result.type=id("<null>");break;
            case ExpressionKind::Variable:case ExpressionKind::Array:{auto s=symbol(e.text,e.position);if(s.array!=(e.kind==ExpressionKind::Array))fail(e.position,s.array?"JASS array requires index: "+e.text:"Scalar JASS variable indexed: "+e.text);if(s.array)requireType(id("integer"),child(0),e.position,"Array index");result={s.type,s.index,s.access};break;}
            case ExpressionKind::Call:case ExpressionKind::Function:{auto function=module_.functionId(e.text);if(function==none)fail(e.position,"Unknown JASS function: "+e.text);auto& signature=module_.functions_[function];result={e.kind==ExpressionKind::Function?id("code"):signature.result,function,Access::Function};if(e.kind==ExpressionKind::Call){if(e.operands.size()!=signature.parameters.size())fail(e.position,"JASS argument count differs: "+e.text);for(size_t i=0;i<e.operands.size();++i)requireType(signature.parameters[i],child(i),e.position,"Argument "+std::to_string(i+1)+" of "+e.text);}break;}
            case ExpressionKind::Unary:{auto kind=module_.type(child(0)).category;if(e.text=="not"){requireType(id("boolean"),child(0),e.position,"not");result.type=id("boolean");}else{if(!numeric(kind))fail(e.position,"JASS unary arithmetic requires number");result.type=child(0);}break;}
            case ExpressionKind::Binary:{auto a=child(0),b=child(1);auto left=module_.type(a).category,right=module_.type(b).category;
                if(e.text=="and" || e.text=="or"){requireType(id("boolean"),a,e.position,e.text);requireType(id("boolean"),b,e.position,e.text);result.type=id("boolean");}
                else if(e.text=="==" || e.text=="!="){bool compatible=(numeric(left) && numeric(right)) || (left==right && left!=Category::Nothing) || (left==Category::Null && nullable(right)) || (right==Category::Null && nullable(left));if(!compatible)fail(e.position,"Incompatible JASS equality operands");result.type=id("boolean");}
                else if(e.text=="+" && (left==Category::String || right==Category::String) && (left==Category::String || left==Category::Null) && (right==Category::String || right==Category::Null))result.type=id("string");
                else {if(!numeric(left) || !numeric(right))fail(e.position,"JASS numeric operator requires numbers: "+e.text);bool comparison=e.text=="<" || e.text==">" || e.text=="<=" || e.text==">=";result.type=comparison?id("boolean"):id(left==Category::Real || right==Category::Real?"real":"integer");}break;}
        }return result;
    }
    Id expression(Id root) {
        std::vector<std::pair<Id,bool>> work{{root,false}};while(!work.empty()){auto [index,ready]=work.back();work.pop_back();if(module_.bindings_.at(index).type!=none)continue;auto& e=program_.expression(index);if(ready){module_.bindings_[index]=resolve(e);continue;}work.emplace_back(index,true);for(auto at=e.operands.rbegin();at!=e.operands.rend();++at)if(module_.bindings_.at(*at).type==none)work.emplace_back(*at,false);}return module_.bindings_[root].type;
    }
    void statements(const std::vector<Id>& body) {
        for(auto index:body){auto& s=program_.statement(index);auto boolean=module_.typeId("boolean");switch(s.kind){
            case StatementKind::Set:{auto target=symbol(s.variable,s.position);if(target.constant)fail(s.position,"Assignment to JASS constant: "+s.variable);if(target.array!=(s.index!=none))fail(s.position,"JASS assignment array/scalar shape differs: "+s.variable);if(s.index!=none)requireType(module_.typeId("integer"),expression(s.index),s.position,"Array index");requireType(target.type,expression(s.value),s.position,"Assignment to "+s.variable);module_.assignments_[index]={target.type,target.index,target.access};break;}
            case StatementKind::Call:expression(s.value);break;
            case StatementKind::If:for(auto& branch:s.branches){if(branch.condition!=none)requireType(boolean,expression(branch.condition),s.position,"if");statements(branch.statements);}break;
            case StatementKind::Loop:statements(s.body);break;
            case StatementKind::ExitWhen:requireType(boolean,expression(s.value),s.position,"exitwhen");break;
            case StatementKind::Return:{auto expected=module_.functions_.at(currentFunction_).result;if(s.value==none){if(module_.type(expected).category!=Category::Nothing)fail(s.position,"JASS return value missing");}else {auto actual=expression(s.value);if(module_.type(expected).category==Category::Nothing){auto& value=program_.expression(s.value);if(value.kind!=ExpressionKind::Boolean || value.text!="false")fail(s.position,"Void JASS function returns a value");}else requireType(expected,actual,s.position,"Return");}break;}
        }}
    }
    void types() {
        for(auto [name,kind]:std::initializer_list<std::pair<const char*,Category>>{{"nothing",Category::Nothing},{"integer",Category::Integer},{"real",Category::Real},{"boolean",Category::Boolean},{"string",Category::String},{"code",Category::Code},{"handle",Category::Handle},{"<null>",Category::Null}}){module_.typeNames_.emplace(name,Id(module_.types_.size()));module_.types_.push_back({name,kind,none});}
        for(auto& source:program_.types()){if(!module_.typeNames_.emplace(source.name,Id(module_.types_.size())).second)fail(source.position,"Duplicate builtin JASS type: "+source.name);module_.types_.push_back({source.name,Category::Handle,none});}
        for(auto& source:program_.types()){auto parent=module_.typeId(source.parent);if(parent==none || module_.type(parent).category!=Category::Handle)fail(source.position,"JASS type must extend a handle: "+source.name);module_.types_[module_.typeId(source.name)].parent=parent;}
        for(auto& source:program_.types()){auto id=module_.typeId(source.name),at=module_.types_[id].parent;for(size_t n=0;at!=none;++n){if(n>=module_.types_.size() || at==id)fail(source.position,"Cyclic JASS type: "+source.name);at=module_.types_[at].parent;}}
    }
public:
    explicit Linker(Module& module) : module_(module),program_(module.program_) {}
    void link() {
        types();module_.bindings_.resize(program_.expressionCount());module_.assignments_.resize(program_.statementCount());for(auto& global:program_.globals()){auto type=namedType(global.type,global.position);if(global.constant && global.array)fail(global.position,"Constant JASS array");module_.globalNames_.emplace(global.name,Id(module_.globals_.size()));module_.globals_.push_back({type,global.array});}
        for(auto& function:program_.functions()){auto index=Id(module_.functions_.size());module_.functionNames_.emplace(function.name,index);FunctionInfo info;info.result=namedType(function.result,function.position,true);for(auto& parameter:function.parameters){auto type=namedType(parameter.type,function.position);info.parameters.push_back(type);info.slots.push_back({type,false});}for(auto& local:function.locals)info.slots.push_back({namedType(local.type,local.position),local.array});module_.functions_.push_back(std::move(info));}
        for(size_t i=0;i<program_.globals().size();++i){auto& global=program_.globals()[i];if(global.initializer!=none)requireType(module_.globals_[i].type,expression(global.initializer),global.position,"Global "+global.name);}
        for(size_t i=0;i<program_.functions().size();++i){currentFunction_=Id(i);locals_.clear();auto& function=program_.functions()[i];auto& signature=module_.functions_[i];for(size_t p=0;p<function.parameters.size();++p)locals_.emplace(function.parameters[p].name,Symbol{signature.parameters[p],Id(p),Access::Local,false,false});for(size_t l=0;l<function.locals.size();++l){auto& local=function.locals[l];auto slot=Id(function.parameters.size()+l);locals_.emplace(local.name,Symbol{signature.slots[slot].type,slot,Access::Local,local.array,false});if(local.initializer!=none)requireType(signature.slots[slot].type,expression(local.initializer),local.position,"Local "+local.name);}statements(function.body);}
    }
};
Module Module::compile(Program program) {Module result(std::move(program));Linker(result).link();return result;}
}
