// Author: MiYu. Execute supported register, stack, native call and script call instructions with limits.
#include "jass_binary_vm.h"
#include <array>
#include <bit>
#include <stdexcept>

namespace war3 {
JassBinaryNativeValue runJass2Function(const JassBinaryProgram& program,const JassBinaryIndex& index,const std::string& name,const JassBinaryHost& host,std::span<const JassBinaryNativeValue> arguments,size_t stepLimit){
    using Value=JassBinaryNativeValue;struct Frame{size_t start=0,pc=0,end=0,base=0,argc=0;std::array<Value,256> regs{};std::map<std::string,Value> locals;};std::vector<Frame> frames;std::vector<Value> stack(arguments.begin(),arguments.end());auto symbol=[&](std::uint32_t id)->const std::string&{if(!id || id>program.symbols.size())throw std::runtime_error("Invalid 2SAJ symbol");return program.symbols[id-1];};auto enter=[&](const std::string& function){auto found=index.functions.find(function);if(found==index.functions.end() || frames.size()>=256)throw std::runtime_error("Missing or excessive 2SAJ function: "+function);auto [start,end]=found->second;if(start>=end || end>=program.instructions.size())throw std::runtime_error("Invalid 2SAJ function bounds");size_t count=0;while(start+1+count<end && program.instructions[start+1+count].opcode==8)++count;if(stack.size()<count)throw std::runtime_error("2SAJ function arguments missing");Frame frame;frame.start=start;frame.pc=start+1;frame.end=end;frame.base=stack.size()-count;frame.argc=count;frames.push_back(std::move(frame));};enter(name);size_t steps=0;Value result;
    while(!frames.empty()){if(++steps>stepLimit)throw std::runtime_error("2SAJ instruction budget exceeded");auto& f=frames.back();if(f.pc>=f.end)throw std::runtime_error("2SAJ function did not return");auto ins=program.instructions[f.pc++];auto& reg=f.regs[ins.r1];switch(ins.opcode){
        case 5:if(ins.r1<4 || ins.r1>13 || !f.locals.emplace(symbol(ins.operand),Value{ins.r1,0,{}}).second)throw std::runtime_error("Invalid 2SAJ local");break;
        case 8:{auto arg=f.base+f.argc-size_t(ins.r2);if(!ins.r2 || ins.r2>f.argc || arg>=stack.size())throw std::runtime_error("Invalid 2SAJ function argument");auto value=stack[arg];if(value.type!=ins.r1 && !(value.type==2 && !value.bits && (ins.r1==6 || ins.r1==7)))throw std::runtime_error("Mismatched 2SAJ function argument");value.type=ins.r1;if(!f.locals.emplace(symbol(ins.operand),value).second)throw std::runtime_error("Duplicate 2SAJ function argument");break;}
        case 11:if(ins.r1>stack.size()-f.base)throw std::runtime_error("2SAJ stack underflow");stack.resize(stack.size()-ins.r1);break;
        case 12:if(!((ins.r2==0 && !ins.operand) || ins.r2==2 || (ins.r2>=4 && ins.r2<=8)))throw std::runtime_error("Unsupported 2SAJ literal type: "+std::to_string(ins.r2)+" at "+std::to_string(f.pc-1));if(ins.r2==6 && ins.operand>program.symbols.size())throw std::runtime_error("Invalid 2SAJ string");reg={ins.r2,ins.operand,{}};break;
        case 13:reg=f.regs[ins.r2];break;
        case 14:{auto local=f.locals.find(symbol(ins.operand));if(local!=f.locals.end())reg=local->second;else{if(!host.globalRead)throw std::runtime_error("2SAJ global callback missing");reg=host.globalRead(symbol(ins.operand));}break;}
        case 17:{auto local=f.locals.find(symbol(ins.operand));if(local==f.locals.end())throw std::runtime_error("Unsupported 2SAJ global write");auto type=local->second.type;if(reg.type!=type && !(reg.type==2 && !reg.bits && (type==6 || type==7)))throw std::runtime_error("Mismatched 2SAJ local assignment");local->second=reg;local->second.type=type;break;}
        case 19:if(stack.size()>=262144)throw std::runtime_error("2SAJ stack budget exceeded");stack.push_back(reg);break;
        case 20:if(stack.size()<=f.base)throw std::runtime_error("2SAJ stack underflow");reg=stack.back();stack.pop_back();break;
        case 21:{if(!host.nativeArity || !host.nativeCall)throw std::runtime_error("2SAJ native callback missing");auto& native=symbol(ins.operand);auto count=host.nativeArity(native);if(count>stack.size()-f.base)throw std::runtime_error("2SAJ native arguments missing: "+native);auto value=host.nativeCall(native,std::span<const Value>(stack).last(count));stack.resize(stack.size()-count);f.regs[0]=std::move(value);break;}
        case 22:enter(symbol(ins.operand));break;
        case 23:if(reg.type!=4)throw std::runtime_error("Invalid 2SAJ integer conversion");reg={5,jass::Real::fromInteger(std::bit_cast<std::int32_t>(reg.bits)).bits(),{}};break;
        case 37:if(reg.type==4)reg.bits=0u-reg.bits;else if(reg.type==5)reg.bits^=0x80000000u;else throw std::runtime_error("Invalid 2SAJ negate");break;
        case 39:result=f.regs[0];frames.pop_back();if(!frames.empty())frames.back().regs[0]=result;break;
        case 40:break;
        case 41:case 42:case 43:{bool branch=ins.opcode==43 || (ins.opcode==41?reg.bits!=0:reg.bits==0);if(branch){auto target=index.labels.find(ins.operand);if(target==index.labels.end() || target->second<=f.start || target->second>=f.end)throw std::runtime_error("Invalid 2SAJ jump");f.pc=target->second;}break;}
        default:throw std::runtime_error("Unsupported 2SAJ execution opcode: "+std::to_string(ins.opcode));}}
    return result;
}
}
