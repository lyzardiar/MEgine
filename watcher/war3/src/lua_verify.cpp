// Author: MiYu. Validate bounded Lua instruction references without assuming runtime value types.
#include "lua_verify.h"
extern "C" {
#include <lstate.h>
#include <lopcodes.h>
}
#include <stdexcept>
#include <limits>
#include <vector>
namespace war3 {
namespace {
[[noreturn]] void invalid(){throw std::runtime_error("Invalid Lua instruction");}
void verify(const Proto* p,unsigned depth){
    if(depth>200 || p->sizecode<1)invalid();auto stack=int(p->maxstacksize);
    std::vector<bool> extra(p->sizecode,false);
    for(int pc=0;pc<p->sizecode;++pc){auto instruction=p->code[pc];auto opcode=GET_OPCODE(instruction);if(unsigned(opcode)>=NUM_OPCODES)invalid();if(opcode==OP_LOADKX || (opcode==OP_SETLIST && GETARG_C(instruction)==0)){if(pc+1>=p->sizecode || GET_OPCODE(p->code[pc+1])!=OP_EXTRAARG)invalid();extra[++pc]=true;}}
    auto reg=[&](int n){if(n<0 || n>=stack)invalid();};auto rk=[&](int n){if(ISK(n)){if(INDEXK(n)>=p->sizek)invalid();}else reg(n);};
    auto jump=[&](int pc,Instruction i){auto target=pc+1+GETARG_sBx(i);if(target<0 || target>=p->sizecode || extra[target])invalid();};
    auto next=[&](int pc){if(pc+1>=p->sizecode || extra[pc+1])invalid();};
    auto test=[&](int pc){if(pc+2>=p->sizecode || extra[pc+1] || extra[pc+2] || GET_OPCODE(p->code[pc+1])!=OP_JMP)invalid();};
    for(int pc=0;pc<p->sizecode;++pc){if(extra[pc])continue;auto i=p->code[pc];auto op=GET_OPCODE(i);int a=GETARG_A(i),b=GETARG_B(i),c=GETARG_C(i);if(op!=OP_JMP && op!=OP_EQ && op!=OP_LT && op!=OP_LE && op!=OP_SETTABUP && op!=OP_EXTRAARG)reg(a);
        switch(op){
        case OP_MOVE:case OP_UNM:case OP_BNOT:case OP_NOT:case OP_LEN:reg(b);break;
        case OP_LOADK:if(GETARG_Bx(i)>=unsigned(p->sizek))invalid();break;
        case OP_LOADKX:if(GETARG_Ax(p->code[pc+1])>=unsigned(p->sizek))invalid();break;
        case OP_LOADBOOL:if(b>1 || c>1)invalid();if(c){if(pc+2>=p->sizecode || extra[pc+2])invalid();}break;
        case OP_LOADNIL:reg(a+b);break;
        case OP_GETUPVAL:case OP_SETUPVAL:if(b>=p->sizeupvalues)invalid();break;
        case OP_GETTABUP:if(b>=p->sizeupvalues)invalid();rk(c);break;
        case OP_GETTABLE:reg(b);rk(c);break;
        case OP_SETTABUP:if(a>=p->sizeupvalues)invalid();rk(b);rk(c);break;
        case OP_SETTABLE:rk(b);rk(c);break;
        case OP_NEWTABLE:if(b>231 || c>231)invalid();break;
        case OP_SELF:reg(a+1);reg(b);rk(c);if(ISK(c) && !ttisstring(&p->k[INDEXK(c)]))invalid();break;
        case OP_ADD:case OP_SUB:case OP_MUL:case OP_MOD:case OP_POW:case OP_DIV:case OP_IDIV:case OP_BAND:case OP_BOR:case OP_BXOR:case OP_SHL:case OP_SHR:rk(b);rk(c);break;
        case OP_CONCAT:reg(b);reg(c);if(b>=c)invalid();break;
        case OP_JMP:if(a>stack)invalid();jump(pc,i);break;
        case OP_EQ:case OP_LT:case OP_LE:if(a>1)invalid();rk(b);rk(c);test(pc);break;
        case OP_TEST:if(c>1)invalid();test(pc);break;
        case OP_TESTSET:if(c>1)invalid();reg(b);test(pc);break;
        case OP_CALL:case OP_TAILCALL:if(b)reg(a+b-1);if(c>1)reg(a+c-2);if(op==OP_TAILCALL && c)invalid();break;
        case OP_RETURN:if(b>1)reg(a+b-2);break;
        case OP_FORLOOP:case OP_FORPREP:reg(a+3);jump(pc,i);break;
        case OP_TFORCALL:reg(a+5);if(c)reg(a+2+c);if(pc+1>=p->sizecode || GET_OPCODE(p->code[pc+1])!=OP_TFORLOOP)invalid();break;
        case OP_TFORLOOP:reg(a+1);jump(pc,i);break;
        case OP_SETLIST:{if(b)reg(a+b);auto block=c?unsigned(c):GETARG_Ax(p->code[pc+1]);if(!block || block>unsigned((std::numeric_limits<int>::max()-511)/50+1))invalid();break;}
        case OP_CLOSURE:if(GETARG_Bx(i)>=unsigned(p->sizep))invalid();break;
        case OP_VARARG:if(!p->is_vararg)invalid();if(b>1)reg(a+b-2);break;
        default:invalid();
        }
        if(op!=OP_RETURN && op!=OP_JMP && op!=OP_FORPREP){if(op==OP_LOADKX || (op==OP_SETLIST && !c)){if(pc+2>=p->sizecode || extra[pc+2])invalid();}else next(pc);}
    }
    for(int i=0;i<p->sizep;++i)verify(p->p[i],depth+1);
}
}
void validateLuaInstructions(const Proto* proto){if(!proto)invalid();verify(proto,0);}
}
