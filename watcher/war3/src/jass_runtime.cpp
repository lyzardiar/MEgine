// Author: MiYu. Explicit JASS call frames, bound slots, control flow and native dispatch.
#include "jass_runtime.h"
#include "jass_literal.h"
#include <bit>
#include <algorithm>
#include <map>

namespace war3::jass {
namespace {
enum class Op {Literal,Read,ReadArray,Write,WriteArray,InitLocal,InitGlobal,Call,Discard,Positive,Negate,Not,Add,Subtract,Multiply,Divide,Equal,NotEqual,Less,Greater,LessEqual,GreaterEqual,ShortFalse,ShortTrue,Jump,JumpFalse,JumpTrue,Return,MissingReturn};
struct Instruction {Op op;Id id=none;size_t target=0;Position position;};
using Code=std::vector<Instruction>;
struct Cell {Value value;bool initialized=false,array=false;std::unordered_map<std::uint32_t,Value> elements;};
struct Frame {Id function;size_t pc=0,base=0;std::vector<Cell> locals;};
enum class State {Created,Initializing,Ready,Failed};
std::int32_t signedBits(std::uint32_t bits) {return std::bit_cast<std::int32_t>(bits);}
bool zero(Real real) {return (real.bits()&0x7fffffff)==0;}
}
struct Runtime::Impl {
    Runtime& owner;
    Module module;
    RuntimeLimits limits;
    std::vector<Code> code;
    std::vector<Value> literals;
    std::vector<Native> natives;
    std::vector<Cell> globals;
    State state=State::Created;
    std::uint64_t remaining=0;
    size_t active=0;
    size_t noYield=0;
    bool paused=false;
    struct Domain {ThreadScheduler threads;std::vector<Impl*> members;std::map<ThreadId,bool> live;explicit Domain(size_t count):threads(count){}};
    std::shared_ptr<Domain> domain;
    struct Execution {std::uint64_t remaining=0;size_t active=0,noYield=0;};
    std::map<ThreadId,Execution> executions{{0,{}}};
    ThreadHooks threadHooks;
    Id integer,real,boolean,string,codeType,nothing;
    [[noreturn]] void fail(Position p,const std::string& message) const {auto& sources=module.program().sources();auto name=p.source<sources.size()?sources[p.source].name:"<runtime>";throw std::runtime_error(name+":"+std::to_string(p.line)+":"+std::to_string(p.column)+": "+message);}
    Value empty(Id type) const {return {type,0,{}};}
    Value coerce(Value value,Id target,Position p) const {
        if(value.type==none || value.type>=module.types().size() || !module.assignable(target,value.type))fail(p,"JASS value type differs from "+module.type(target).name);
        if(target==real && value.type==integer)value.bits=Real::fromInteger(signedBits(value.bits)).bits();value.type=target;return value;
    }
    std::string decodeString(std::string_view text,Position p) const {
        try{return stringLiteral(text);}catch(const std::exception& e){fail(p,e.what());}
    }
    Value literal(Id id) {
        auto& e=module.program().expression(id);auto type=module.binding(id).type;Value value=empty(type);
        switch(e.kind){
            case ExpressionKind::Integer:case ExpressionKind::Rawcode:value.bits=e.integerBits;break;
            case ExpressionKind::Real:value.bits=e.realBits;break;
            case ExpressionKind::Boolean:value.bits=e.text=="true";break;
            case ExpressionKind::Null:break;
            case ExpressionKind::Function:value.bits=module.binding(id).index+1;value.codeOwner=&owner;break;
            case ExpressionKind::String:value=owner.string(decodeString(e.text,e.position));break;
            default:fail(e.position,"Invalid JASS literal");
        }return value;
    }
    size_t emit(Code& out,Op op,Id id,Position p,size_t target=0) {out.push_back({op,id,target,p});return out.size()-1;}
    void expression(Code& out,Id root) {
        struct Work {Id id;unsigned phase=0;size_t branch=0;};std::vector<Work> work{{root}};
        while(!work.empty()){auto item=work.back();work.pop_back();auto& e=module.program().expression(item.id);
            if(item.phase==2){out[item.branch].target=out.size();continue;}
            if(item.phase==1){
                if(e.kind==ExpressionKind::Binary && (e.text=="and" || e.text=="or")){auto branch=emit(out,e.text=="and"?Op::ShortFalse:Op::ShortTrue,item.id,e.position);work.push_back({item.id,2,branch});work.push_back({e.operands[1]});continue;}
                if(e.kind==ExpressionKind::Call)emit(out,Op::Call,item.id,e.position);
                else if(e.kind==ExpressionKind::Array)emit(out,Op::ReadArray,item.id,e.position);
                else if(e.kind==ExpressionKind::Unary)emit(out,e.text=="not"?Op::Not:e.text=="-"?Op::Negate:Op::Positive,item.id,e.position);
                else {Op op;if(e.text=="+")op=Op::Add;else if(e.text=="-")op=Op::Subtract;else if(e.text=="*")op=Op::Multiply;else if(e.text=="/")op=Op::Divide;else if(e.text=="==")op=Op::Equal;else if(e.text=="!=")op=Op::NotEqual;else if(e.text=="<")op=Op::Less;else if(e.text==">")op=Op::Greater;else if(e.text=="<=")op=Op::LessEqual;else if(e.text==">=")op=Op::GreaterEqual;else fail(e.position,"Unknown JASS operator");emit(out,op,item.id,e.position);}continue;
            }
            if(e.kind==ExpressionKind::Variable){emit(out,Op::Read,item.id,e.position);continue;}
            if(e.kind==ExpressionKind::Call || e.kind==ExpressionKind::Array || e.kind==ExpressionKind::Unary || e.kind==ExpressionKind::Binary){work.push_back({item.id,1});if(e.kind==ExpressionKind::Binary && (e.text=="and" || e.text=="or"))work.push_back({e.operands[0]});else for(auto at=e.operands.rbegin();at!=e.operands.rend();++at)work.push_back({*at});continue;}
            auto index=Id(literals.size());literals.push_back(literal(item.id));emit(out,Op::Literal,index,e.position);
        }
    }
    void statements(Code& out,const std::vector<Id>& body,std::vector<std::vector<size_t>>& loops) {
        for(auto id:body){auto& s=module.program().statement(id);if(s.debug && !limits.debug)continue;switch(s.kind){
            case StatementKind::Set:if(s.index!=none)expression(out,s.index);expression(out,s.value);emit(out,s.index==none?Op::Write:Op::WriteArray,id,s.position);break;
            case StatementKind::Call:expression(out,s.value);emit(out,Op::Discard,id,s.position);break;
            case StatementKind::If:{std::vector<size_t> ends;for(size_t i=0;i<s.branches.size();++i){auto& branch=s.branches[i];size_t skip=SIZE_MAX;if(branch.condition!=none){expression(out,branch.condition);skip=emit(out,Op::JumpFalse,id,s.position);}statements(out,branch.statements,loops);if(i+1<s.branches.size())ends.push_back(emit(out,Op::Jump,id,s.position));if(skip!=SIZE_MAX)out[skip].target=out.size();}for(auto at:ends)out[at].target=out.size();break;}
            case StatementKind::Loop:{auto start=out.size();loops.emplace_back();statements(out,s.body,loops);emit(out,Op::Jump,id,s.position,start);for(auto at:loops.back())out[at].target=out.size();loops.pop_back();break;}
            case StatementKind::ExitWhen:expression(out,s.value);loops.back().push_back(emit(out,Op::JumpTrue,id,s.position));break;
            case StatementKind::Return:if(s.value!=none)expression(out,s.value);emit(out,Op::Return,s.value,s.position);break;
        }}
    }
    Impl(Runtime& runtime,Module source,RuntimeLimits budget) : owner(runtime),module(std::move(source)),limits(budget),domain(std::make_shared<Domain>(budget.threads)) {
        integer=module.typeId("integer");real=module.typeId("real");boolean=module.typeId("boolean");string=module.typeId("string");codeType=module.typeId("code");nothing=module.typeId("nothing");
        domain->members.push_back(this);auto* group=domain.get();domain->threads.hooks({[group](ThreadId id,ThreadId parent){group->live.emplace(id,true);for(auto* vm:group->members){vm->executions.emplace(id,Execution{});if(vm->threadHooks.created)vm->threadHooks.created(id,parent);}},[group](ThreadId from,ThreadId to){for(auto* vm:group->members){vm->executions.at(from)={vm->remaining,vm->active,vm->noYield};auto& next=vm->executions.at(to);vm->remaining=from==0 && next.active?vm->limits.steps:next.remaining;vm->active=next.active;vm->noYield=next.noYield;if(vm->threadHooks.switched)vm->threadHooks.switched(from,to);}},[group](ThreadId id){group->live.erase(id);for(auto* vm:group->members){vm->executions.erase(id);if(vm->threadHooks.finished)vm->threadHooks.finished(id);}}});
    }
    void compile() {
        auto& program=module.program();code.resize(program.functions().size()+1);natives.resize(program.functions().size());globals.reserve(module.globals().size());
        for(auto& slot:module.globals())globals.push_back({empty(slot.type),true,slot.array,{}});
        for(size_t i=0;i<program.globals().size();++i){auto& global=program.globals()[i];if(global.initializer!=none){expression(code.back(),global.initializer);emit(code.back(),Op::InitGlobal,Id(i),global.position);}}
        emit(code.back(),Op::Return,none,{});
        for(size_t i=0;i<program.functions().size();++i){auto& function=program.functions()[i];if(function.native)continue;auto& out=code[i];for(size_t l=0;l<function.locals.size();++l){auto& local=function.locals[l];if(local.initializer!=none){expression(out,local.initializer);emit(out,Op::InitLocal,Id(function.parameters.size()+l),local.position);}}std::vector<std::vector<size_t>> loops;statements(out,function.body,loops);emit(out,function.result=="nothing"?Op::Return:Op::MissingReturn,none,function.position);}
    }
    Cell& cell(Binding binding,Frame& frame) {return binding.access==Access::Global?globals.at(binding.index):frame.locals.at(binding.index);}
    Value load(const Cell& cell,std::optional<std::uint32_t> index,Position p) const {
        if(!cell.initialized)fail(p,"Read of uninitialized JASS local");if(cell.array!=index.has_value())fail(p,"JASS array/scalar storage differs");if(!index)return cell.value;if(*index>=8192)fail(p,"JASS array index outside 0..8191");auto found=cell.elements.find(*index);return found==cell.elements.end()?empty(cell.value.type):found->second;
    }
    void store(Cell& cell,Value value,std::optional<std::uint32_t> index,Position p) {
        if(cell.array!=index.has_value())fail(p,"JASS array/scalar storage differs");value=coerce(std::move(value),cell.value.type,p);if(index){if(*index>=8192)fail(p,"JASS array index outside 0..8191");cell.elements.insert_or_assign(*index,std::move(value));}else cell.value=std::move(value);cell.initialized=true;
    }
    Value binary(Op op,Value left,Value right,Position p) {
        bool numeric=left.type==integer || left.type==real;
        if(numeric && (right.type==integer || right.type==real)){
            if(left.type==real || right.type==real){auto a=Real::fromBits(coerce(left,real,p).bits),b=Real::fromBits(coerce(right,real,p).bits);switch(op){case Op::Add:return owner.real(a.add(b));case Op::Subtract:return owner.real(a.subtract(b));case Op::Multiply:return owner.real(a.multiply(b));case Op::Divide:if(zero(b))fail(p,"JASS division by zero");return owner.real(a.divide(b));default:break;}float x=std::bit_cast<float>(a.bits()),y=std::bit_cast<float>(b.bits());switch(op){case Op::Equal:return owner.boolean(x==y);case Op::NotEqual:return owner.boolean(x!=y);case Op::Less:return owner.boolean(x<y);case Op::Greater:return owner.boolean(x>y);case Op::LessEqual:return owner.boolean(x<=y);case Op::GreaterEqual:return owner.boolean(x>=y);default:fail(p,"Invalid real operator");}}
            switch(op){case Op::Add:return {integer,left.bits+right.bits,{}};case Op::Subtract:return {integer,left.bits-right.bits,{}};case Op::Multiply:return {integer,left.bits*right.bits,{}};case Op::Divide:{auto a=signedBits(left.bits),b=signedBits(right.bits);if(!b)fail(p,"JASS division by zero");if(a==INT32_MIN && b==-1)fail(p,"JASS integer division overflow");return owner.integer(a/b);}default:break;}
            auto a=signedBits(left.bits),b=signedBits(right.bits);switch(op){case Op::Equal:return owner.boolean(a==b);case Op::NotEqual:return owner.boolean(a!=b);case Op::Less:return owner.boolean(a<b);case Op::Greater:return owner.boolean(a>b);case Op::LessEqual:return owner.boolean(a<=b);case Op::GreaterEqual:return owner.boolean(a>=b);default:fail(p,"Invalid integer operator");}
        }
        if(op==Op::Add){auto a=left.text?std::string_view(*left.text):std::string_view{},b=right.text?std::string_view(*right.text):std::string_view{};if(a.size()>limits.stringBytes || b.size()>limits.stringBytes-a.size())fail(p,"JASS string byte budget exceeded");return owner.string(std::string(a)+std::string(b));}
        if(op==Op::Equal || op==Op::NotEqual){bool equal;if(left.type==string || right.type==string)equal=left.text && right.text?*left.text==*right.text:!left.text && !right.text;else equal=left.bits==right.bits && (left.type!=codeType || !left.bits || left.codeOwner==right.codeOwner);return owner.boolean(op==Op::Equal?equal:!equal);}fail(p,"Invalid JASS value operator");
    }
    Value run(Id function,std::span<const Value> arguments,Position caller) {
        if(active>=64)fail(caller,"JASS native reentry budget exceeded");if(!active)remaining=limits.steps;++active;struct Active {size_t& value;~Active(){--value;}}guard{active};
        std::vector<Value> values;std::vector<Frame> frames;size_t localCount=0;
        auto pop=[&](Position p){if(values.empty())fail(p,"JASS operand stack underflow");auto value=std::move(values.back());values.pop_back();return value;};
        auto pushFrame=[&](Id id,std::span<const Value> args,Position p){Frame frame{id,0,values.size(),{}};if(frames.size()>=limits.frames)fail(p,"JASS call frame budget exceeded");if(id<module.functions().size()){auto& signature=module.functions()[id];if(args.size()!=signature.parameters.size())fail(p,"JASS argument count differs");if(signature.slots.size()>limits.values-localCount)fail(p,"JASS local slot budget exceeded");for(auto& slot:signature.slots)frame.locals.push_back({empty(slot.type),slot.array,slot.array,{}});for(size_t i=0;i<args.size();++i){frame.locals[i].value=coerce(args[i],signature.parameters[i],p);frame.locals[i].initialized=true;}localCount+=frame.locals.size();}frames.push_back(std::move(frame));};
        auto callNative=[&](Id id,std::span<const Value> args,Position p){if(!natives.at(id))fail(p,"Unbound JASS native: "+module.program().functions()[id].name);std::vector<Value> converted;auto& signature=module.functions()[id];if(args.size()!=signature.parameters.size())fail(p,"JASS argument count differs");for(size_t i=0;i<args.size();++i)converted.push_back(coerce(args[i],signature.parameters[i],p));Value result;try{result=natives[id](owner,converted);}catch(const std::exception& e){fail(p,"Native "+module.program().functions()[id].name+": "+e.what());}return coerce(std::move(result),signature.result,p);};
        if(function<module.functions().size() && module.program().functions()[function].native)return callNative(function,arguments,caller);
        pushFrame(function,arguments,caller);
        while(!frames.empty()){
            if(paused && domain->threads.current())domain->threads.checkpoint();
            auto& frame=frames.back();auto& instructions=code.at(frame.function);if(frame.pc>=instructions.size())fail(caller,"JASS instruction pointer outside function");auto instruction=instructions[frame.pc++];auto p=instruction.position;if(!remaining)fail(p,"JASS instruction budget exceeded");--remaining;
            switch(instruction.op){
                case Op::Literal:values.push_back(literals.at(instruction.id));break;
                case Op::Read:values.push_back(load(cell(module.binding(instruction.id),frame),{},p));break;
                case Op::ReadArray:{auto index=pop(p).bits;values.push_back(load(cell(module.binding(instruction.id),frame),index,p));break;}
                case Op::Write:case Op::WriteArray:{auto value=pop(p);std::optional<std::uint32_t> index;if(instruction.op==Op::WriteArray)index=pop(p).bits;store(cell(module.assignment(instruction.id),frame),std::move(value),index,p);break;}
                case Op::InitLocal:store(frame.locals.at(instruction.id),pop(p),{},p);break;
                case Op::InitGlobal:store(globals.at(instruction.id),pop(p),{},p);break;
                case Op::Call:{auto id=module.binding(instruction.id).index;auto count=module.functions()[id].parameters.size();if(values.size()<count)fail(p,"JASS call arguments missing");std::vector<Value> args(values.end()-count,values.end());values.resize(values.size()-count);if(module.program().functions()[id].native)values.push_back(callNative(id,args,p));else pushFrame(id,args,p);break;}
                case Op::Discard:pop(p);break;
                case Op::Positive:break;
                case Op::Negate:{auto value=pop(p);value.bits=value.type==integer?0-value.bits:value.bits^0x80000000;values.push_back(std::move(value));break;}
                case Op::Not:{auto value=pop(p);values.push_back(owner.boolean(!value.bits));break;}
                case Op::Add:case Op::Subtract:case Op::Multiply:case Op::Divide:case Op::Equal:case Op::NotEqual:case Op::Less:case Op::Greater:case Op::LessEqual:case Op::GreaterEqual:{auto right=pop(p),left=pop(p);values.push_back(binary(instruction.op,std::move(left),std::move(right),p));break;}
                case Op::ShortFalse:case Op::ShortTrue:if(values.empty())fail(p,"JASS conditional stack empty");if(bool(values.back().bits)==(instruction.op==Op::ShortTrue))frame.pc=instruction.target;else pop(p);break;
                case Op::Jump:frame.pc=instruction.target;break;
                case Op::JumpFalse:case Op::JumpTrue:if(bool(pop(p).bits)==(instruction.op==Op::JumpTrue))frame.pc=instruction.target;break;
                case Op::Return:{auto type=frame.function<module.functions().size()?module.functions()[frame.function].result:nothing;auto value=instruction.id==none?empty(nothing):coerce(pop(p),type,p);values.resize(frame.base);localCount-=frame.locals.size();frames.pop_back();if(frames.empty())return value;values.push_back(std::move(value));break;}
                case Op::MissingReturn:fail(p,"JASS function reached end without return value");
            }
            if(values.size()>limits.values)fail(p,"JASS operand value budget exceeded");
        }fail(caller,"JASS execution ended without result");
    }
};
Runtime::Runtime(Module module,RuntimeLimits limits) : impl_(std::make_unique<Impl>(*this,std::move(module),limits)) {
    impl_->compile();for(auto name:{"I2R","R2I"}){auto id=this->module().functionId(name);if(id==none || !this->module().program().functions()[id].native)continue;auto& signature=this->module().functions()[id];bool toReal=std::string_view(name)=="I2R";if(signature.parameters!=std::vector<Id>{toReal?impl_->integer:impl_->real} || signature.result!=(toReal?impl_->real:impl_->integer))throw std::runtime_error("Invalid numeric native signature: "+std::string(name));bind(name,[toReal](Runtime& runtime,std::span<const Value> values){return toReal?runtime.real(Real::fromInteger(signedBits(values[0].bits))):runtime.integer(Real::fromBits(values[0].bits).toInteger());});}
}
Runtime::~Runtime(){if(!impl_->domain->threads.current())cancelThreads();impl_->domain->threads.pause(reinterpret_cast<ThreadOwner>(impl_.get()),false);auto& members=impl_->domain->members;members.erase(std::find(members.begin(),members.end(),impl_.get()));}
const Module& Runtime::module() const {return impl_->module;}
size_t Runtime::instructionCount() const {size_t count=0;for(auto& code:impl_->code)count+=code.size();return count;}
void Runtime::bind(const std::string& name,Native function) {auto id=module().functionId(name);if(impl_->active || (impl_->state!=State::Created && impl_->domain->threads.count()) || id==none || !module().program().functions()[id].native || !function)throw std::runtime_error("Invalid JASS native binding: "+name);impl_->natives[id]=std::move(function);}
void Runtime::shareThreads(Runtime& owner){if(impl_->state!=State::Created || impl_->active || impl_->domain->threads.count() || impl_->domain->members.size()!=1 || impl_->domain->members.front()!=impl_.get())throw std::runtime_error("Runtime thread linking requires an unlinked fresh instance");impl_->domain->members.clear();impl_->domain=owner.impl_->domain;impl_->domain->members.push_back(impl_.get());for(auto& [id,live]:impl_->domain->live)impl_->executions.emplace(id,Impl::Execution{});}
void Runtime::inheritNatives(const Runtime& owner){if(impl_->state!=State::Created)throw std::runtime_error("Native inheritance requires a fresh runtime");auto& shared=owner.module();for(Id id=0;id<shared.types().size();++id)if(id>=module().types().size() || module().type(id).name!=shared.type(id).name || module().type(id).parent!=shared.type(id).parent)throw std::runtime_error("Shared runtime type layout differs");for(Id id=0;id<module().functions().size();++id){auto& function=module().program().functions()[id];if(!function.native)continue;auto other=shared.functionId(function.name);if(other==none || !shared.program().functions()[other].native || !owner.impl_->natives[other])continue;auto& expected=shared.functions()[other];auto& actual=module().functions()[id];if(expected.result!=actual.result || expected.parameters!=actual.parameters)throw std::runtime_error("Shared native signature differs: "+function.name);impl_->natives[id]=owner.impl_->natives[other];}}
void Runtime::initialize() {if(impl_->state!=State::Created)throw std::runtime_error("JASS runtime initialization requires a fresh instance");impl_->state=State::Initializing;try{impl_->run(Id(module().functions().size()),{},{});impl_->state=State::Ready;}catch(...){impl_->state=State::Failed;throw;}}
bool Runtime::ready() const {return impl_->state==State::Ready;}
Value Runtime::invoke(const std::string& name,std::span<const Value> arguments) {if(!ready() && !(impl_->state==State::Initializing && (impl_->active || impl_->domain->threads.current())))throw std::runtime_error("JASS runtime is not initialized");auto id=module().functionId(name);if(id==none)throw std::runtime_error("Unknown JASS entry: "+name);return impl_->run(id,arguments,module().program().functions()[id].position);}
Value Runtime::invoke(const Value& code,std::span<const Value> arguments) {if(code.codeOwner && code.codeOwner!=this)return code.codeOwner->invoke(code,arguments);if(code.type!=impl_->codeType || !code.bits || code.bits-1>=module().functions().size())throw std::runtime_error("Invalid JASS code reference");return invoke(module().program().functions()[code.bits-1].name,arguments);}
Value Runtime::invokeNoYield(const Value& code,std::span<const Value> arguments){if(code.codeOwner && code.codeOwner!=this)return code.codeOwner->invokeNoYield(code,arguments);++impl_->noYield;struct Guard{size_t& value;~Guard(){--value;}}guard{impl_->noYield};return invoke(code,arguments);}
ThreadId Runtime::start(std::function<void()> entry){if(!ready() && !(impl_->state==State::Initializing && impl_->active))throw std::runtime_error("Script threads require initialized runtime state");return impl_->domain->threads.start(std::move(entry),reinterpret_cast<ThreadOwner>(impl_.get()));}
ThreadId Runtime::start(const std::string& name,std::span<const Value> arguments){auto id=module().functionId(name);if(id==none || module().functions()[id].result!=impl_->nothing)throw std::runtime_error("Invalid script thread entry: "+name);return start([this,name,args=std::vector<Value>(arguments.begin(),arguments.end())]{invoke(name,args);});}
ThreadId Runtime::start(const Value& code,std::span<const Value> arguments){if(code.codeOwner && code.codeOwner!=this)return code.codeOwner->start(code,arguments);if(code.type!=impl_->codeType || !code.bits || code.bits-1>=module().functions().size())throw std::runtime_error("Invalid script thread code");return start(module().program().functions()[code.bits-1].name,arguments);}
void Runtime::sleep(double seconds){if(impl_->noYield)throw std::runtime_error("Script wait is not allowed in a synchronous condition");impl_->domain->threads.sleep(seconds);}
void Runtime::waitThread(ThreadId thread){if(impl_->noYield)throw std::runtime_error("Trigger wait is not allowed in a synchronous condition");impl_->domain->threads.wait(thread);}
ExternalWaitToken Runtime::prepareExternalWait(){if(impl_->noYield)throw std::runtime_error("External wait is not allowed in a synchronous condition");return impl_->domain->threads.prepareExternalWait();}
void Runtime::waitExternal(ExternalWaitToken token){if(impl_->noYield)throw std::runtime_error("External wait is not allowed in a synchronous condition");impl_->domain->threads.waitExternal(token);}
bool Runtime::wakeExternal(ExternalWaitToken token){return impl_->domain->threads.wakeExternal(token);}
bool Runtime::cancelExternalWait(ExternalWaitToken token){return impl_->domain->threads.cancelExternalWait(token);}
void Runtime::threadClock(double time){impl_->domain->threads.clock(time);}
void Runtime::advanceThreads(double time){impl_->domain->threads.advance(time);}
void Runtime::pauseThreads(bool paused){impl_->paused=paused;impl_->domain->threads.pause(reinterpret_cast<ThreadOwner>(impl_.get()),paused);}
bool Runtime::threadsPaused() const{return impl_->paused;}
void Runtime::cancelThreads(){impl_->domain->threads.cancelAll();}
void Runtime::threadHooks(ThreadHooks hooks){if(impl_->domain->threads.count())throw std::runtime_error("Cannot change active script contexts");impl_->threadHooks=std::move(hooks);}
ThreadId Runtime::currentThread() const{return impl_->domain->threads.current();}
size_t Runtime::threadCount() const{return impl_->domain->threads.count();}
Value Runtime::global(const std::string& name,std::optional<std::uint32_t> index) const {if(!ready())throw std::runtime_error("JASS runtime is not initialized");auto& list=module().program().globals();for(size_t i=0;i<list.size();++i)if(list[i].name==name)return impl_->load(impl_->globals[i],index,list[i].position);throw std::runtime_error("Unknown JASS global: "+name);}
Value Runtime::integer(std::int32_t value) const {return {impl_->integer,std::bit_cast<std::uint32_t>(value),{}};}
Value Runtime::real(Real value) const {return {impl_->real,value.bits(),{}};}
Value Runtime::boolean(bool value) const {return {impl_->boolean,std::uint32_t(value),{}};}
Value Runtime::string(std::string value) const {if(value.size()>impl_->limits.stringBytes)throw std::runtime_error("JASS string byte budget exceeded");return {impl_->string,0,std::make_shared<const std::string>(std::move(value))};}
Value Runtime::handle(const std::string& type,std::uint32_t value) const {auto id=module().typeId(type);if(id==none || module().type(id).category!=Category::Handle)throw std::runtime_error("Invalid JASS handle type: "+type);return {id,value,{}};}
Value Runtime::nothing() const {return {impl_->nothing,0,{}};}
}
