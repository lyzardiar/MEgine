// Author: MiYu. Native JASS execution, host boundary failures and original literal fixtures.
#include "jass_runtime.h"
#include "jass_literal.h"
#include <array>
#include <bit>
#include <iostream>

using namespace war3;
using namespace war3::jass;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
Module compile(std::string text) {return Module::compile(Program::parse({{"runtime.j",std::move(text),"authored execution test"}}));}
template<class F> void rejects(F run,std::string_view message) {try{run();}catch(const std::exception& e){require(std::string_view(e.what()).find(message)!=std::string_view::npos,"Unexpected runtime diagnostic");return;}throw std::runtime_error("Invalid JASS execution succeeded");}
std::string hex(std::string_view bytes) {std::string result;constexpr char digits[]="0123456789abcdef";for(unsigned char c:bytes){result+=digits[c>>4];result+=digits[c&15];}return result;}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=2){std::cerr<<"Usage: war3_jass_runtime_tests <literal-fixture.json>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    test("void_false_return_compatibility",[]{Runtime r(compile("globals\ninteger result=0\nendglobals\nfunction stop takes nothing returns nothing\nif true then\nreturn false\nendif\nset result=99\nendfunction\nfunction flag takes nothing returns boolean\nreturn false\nendfunction\nfunction root takes nothing returns nothing\ncall stop()\nif not flag() then\nset result=7\nendif\nendfunction\n"));r.initialize();r.invoke("root");require(r.global("result").bits==7,"Void false return corrupted control flow or return stack");for(auto value:{"true","0","not false","side()"}){std::string source="function side takes nothing returns boolean\nreturn false\nendfunction\nfunction invalid takes nothing returns nothing\nreturn ";source+=value;source+="\nendfunction\n";rejects([&]{compile(source);},"Void JASS function returns a value");}rejects([&]{compile("function invalid takes nothing returns integer\nreturn false\nendfunction\n");},"Return expects integer");});
    test("runtime_primitive_global_snapshot_transaction",[]{
        const std::string source=R"jass(type unit extends handle
native Make takes nothing returns unit
globals
integer n=7
real r=1.25
boolean b=true
string empty=""
string absent=null
integer array values
unit actor=null
endglobals
function mutate takes nothing returns nothing
set n=41
set r=2.5
set b=false
set empty="changed"
set absent="present"
set values[3]=9
set values[8191]=-12
set actor=Make()
endfunction
)jass";
        Runtime original(compile(source)),restored(compile(source));auto bind=[](Runtime& r){r.bind("Make",[](auto& vm,auto){return vm.handle("unit",17);});r.initialize();};bind(original);bind(restored);auto emptySnapshot=original.encodePrimitiveGlobals();Runtime emptyTarget(compile(source));bind(emptyTarget);emptyTarget.restorePrimitiveGlobals(emptySnapshot.bytes);require(emptyTarget.global("empty").text && emptyTarget.global("empty").text->empty() && !emptyTarget.global("absent").text,"Null and empty string lost");original.invoke("mutate");auto snapshot=original.encodePrimitiveGlobals();require(snapshot.excludedGlobals==1 && snapshot.excludedNonDefaultGlobals==1,"Snapshot must report nondefault handle");auto report=restored.restorePrimitiveGlobals(snapshot.bytes);require(report.excludedGlobals==1 && report.excludedNonDefaultGlobals==1,"Restore lost exclusion report");require(restored.global("n").bits==41 && restored.global("r").bits==Real::fromDecimal("2.5").bits() && !restored.global("b").bits,"Primitive values changed");require(restored.global("empty").text && *restored.global("empty").text=="changed" && restored.global("absent").text && *restored.global("absent").text=="present","Strings changed");require(restored.global("values",3).bits==9 && std::bit_cast<std::int32_t>(restored.global("values",8191).bits)==-12 && !restored.global("actor").bits,"Array or excluded handle changed");
        auto initial=restored.encodePrimitiveGlobals();auto truncated=snapshot.bytes;truncated.pop_back();rejects([&]{restored.restorePrimitiveGlobals(truncated);},"Truncated");require(restored.encodePrimitiveGlobals().bytes==initial.bytes,"Failed decode changed globals");Runtime different(compile("globals\ninteger other=7\nendglobals\n"));different.initialize();rejects([&]{different.restorePrimitiveGlobals(snapshot.bytes);},"schema");require(different.global("other").bits==7,"Schema rejection changed globals");
    });
    test("runtime_global_initialization_and_entry_guard",[]{Runtime r(compile("native Next takes nothing returns integer\nglobals\ninteger first=Next()\ninteger second=Next()\nendglobals\nfunction sum takes nothing returns integer\nreturn first*10+second\nendfunction\n"));unsigned calls=0;r.bind("Next",[&](auto& vm,auto){return vm.integer(++calls);});rejects([&]{r.invoke("sum");},"not initialized");require(calls==0,"Constructor ran global initializer");r.initialize();require(r.ready() && calls==2 && r.invoke("sum").bits==12 && r.global("second").bits==2,"Global initializer order differs");rejects([&]{r.initialize();},"fresh instance");});
    test("runtime_bound_storage_and_arrays",[]{Runtime r(compile("globals\ninteger x=5\ninteger array values\nendglobals\nfunction f takes integer x returns integer\nlocal integer array a\nset a[3]=x\nset values[7]=a[3]+values[0]\nreturn a[3]\nendfunction\nfunction read takes nothing returns integer\nlocal integer array a\nreturn a[3]+x\nendfunction\nfunction bad takes nothing returns integer\nset values[-1]=41\nset values[8192]=42\nset values[8191]=17\nreturn values[-1]+values[8192]+values[8191]\nendfunction\n"));r.initialize();Value args[]={r.integer(9)};require(r.invoke("f",args).bits==9 && r.global("values",7).bits==9 && r.global("x").bits==5 && r.invoke("read").bits==5,"Local/global/array slots differ");require(r.invoke("bad").bits==17 && r.global("values",8191).bits==17,"Array out-of-range reads or writes differ");});
    test("runtime_branch_loop_exit_and_early_return",[]{Runtime r(compile("function f takes integer n returns integer\nlocal integer i=0\nlocal integer sum=0\nloop\nexitwhen i>=n\nif i==2 then\nset sum=sum+20\nelseif i==3 then\nreturn sum\nelse\nset sum=sum+i\nendif\nset i=i+1\nendloop\nreturn sum\nendfunction\n"));r.initialize();Value args[]={r.integer(8)};require(r.invoke("f",args).bits==21,"Loop/elseif/early return differs");args[0]=r.integer(2);require(r.invoke("f",args).bits==1,"Execution state leaked across calls");});
    test("runtime_shortcircuit_and_argument_order",[]{Runtime r(compile("native Probe takes integer id, boolean value returns boolean\nnative Mark takes integer id returns integer\nnative Combine takes integer a, integer b returns integer\nfunction f takes nothing returns boolean\nreturn Probe(1,false) and Probe(2,true) or Probe(3,false)\nendfunction\nfunction g takes nothing returns boolean\nreturn Probe(1,true) or Probe(2,false) and Probe(3,true)\nendfunction\nfunction h takes nothing returns integer\nreturn Combine(Mark(1),Mark(2))\nendfunction\n"));std::vector<unsigned> trace;r.bind("Probe",[&](auto&,auto args){trace.push_back(args[0].bits);return args[1];});r.bind("Mark",[&](auto&,auto args){trace.push_back(args[0].bits);return args[0];});r.bind("Combine",[](auto& vm,auto args){return vm.integer(std::int32_t(args[0].bits*100+args[1].bits));});r.initialize();require(!r.invoke("f").bits && trace==std::vector<unsigned>{1},"False and evaluated right operand");trace.clear();require(r.invoke("g").bits && trace==std::vector<unsigned>({1,3}),"Original or/and grouping or short circuit differs");trace.clear();require(r.invoke("h").bits==102 && trace==std::vector<unsigned>({1,2}),"Argument order differs");});
    test("runtime_explicit_frames_recursion_and_code_reentry",[]{Runtime r(compile("native Run takes code callback returns integer\nfunction factorial takes integer n returns integer\nif n<=1 then\nreturn 1\nendif\nreturn n*factorial(n-1)\nendfunction\nfunction callback takes nothing returns integer\nreturn 42\nendfunction\nfunction f takes nothing returns integer\nreturn Run(function callback)\nendfunction\n"));r.bind("Run",[](auto& vm,auto args){return vm.invoke(args[0]);});r.initialize();Value args[]={r.integer(10)};require(r.invoke("factorial",args).bits==3628800 && r.invoke("f").bits==42,"Call frames or code reentry differs");});
    test("runtime_original_integer_real_conversion_and_arithmetic",[]{Runtime r(compile("native I2R takes integer i returns real\nnative R2I takes real r returns integer\nfunction widen takes nothing returns real\nreturn 16777219\nendfunction\nfunction sum takes nothing returns real\nreturn I2R(16777219)+0.5\nendfunction\nfunction convert takes nothing returns integer\nreturn R2I(-3.75)\nendfunction\nfunction wrap takes nothing returns integer\nreturn $7FFFFFFF+1\nendfunction\nfunction divide takes nothing returns integer\nreturn -7/3\nendfunction\nfunction zero takes nothing returns real\nreturn 1.0/-0.0\nendfunction\n"));r.initialize();require(r.invoke("widen").bits==0x4b800001 && r.invoke("sum").bits==Real::fromInteger(16777219).add(Real::fromDecimal("0.5")).bits(),"Original real conversion/arithmetic not consumed");require(std::bit_cast<std::int32_t>(r.invoke("convert").bits)==-3 && r.invoke("wrap").bits==0x80000000 && std::bit_cast<std::int32_t>(r.invoke("divide").bits)==-2,"Integer or conversion execution differs");rejects([&]{r.invoke("zero");},"runtime.j:19:");});
    test("runtime_real_equality",[]{Runtime r(compile("function equal takes real a, real b returns boolean\nreturn a==b\nendfunction\nfunction unequal takes real a, real b returns boolean\nreturn a!=b\nendfunction\nfunction count takes integer n returns boolean\nreturn n==(2.75-0.25)/.05\nendfunction\n"));r.initialize();auto call=[&](const char* name,std::uint32_t a,std::uint32_t b){std::array args{r.real(Real::fromBits(a)),r.real(Real::fromBits(b))};return r.invoke(name,args).bits!=0;};require(call("equal",0x42480000,0x42480001) && call("unequal",0x42480000,0x42480001),"Real equality and inequality differ from source");require(call("equal",0,0x3a83126e) && !call("equal",0,0x3a83126f),"Real equality threshold differs");require(call("equal",0,0x80000000) && call("unequal",0,0x80000000),"Signed zero comparison differs");std::array count{r.integer(50)};require(r.invoke("count",count).bits,"Mixed integer and real timer comparison failed");});
    test("runtime_strings_rawcodes_and_null",[]{Runtime r(compile(R"jass(function text takes nothing returns string
return "a\n"+"b\\c\"d"
endfunction
function empty takes nothing returns boolean
return null==""
endfunction
function same takes nothing returns boolean
return "abc"=="a"+"bc"
endfunction
function raw takes nothing returns integer
return 'hfoo'+'\u1234'
endfunction
)jass"));r.initialize();require(*r.invoke("text").text=="a\nb\\c\"d" && !r.invoke("empty").bits && r.invoke("same").bits && r.invoke("raw").bits==0x68666f6f+0x1234,"String/rawcode/null semantics differ");});
    test("runtime_native_failures_preserve_call_site_and_types",[]{Runtime r(compile("native Missing takes nothing returns integer\nfunction f takes nothing returns integer\nreturn Missing()\nendfunction\n"));r.initialize();rejects([&]{r.invoke("f");},"runtime.j:3:8: Unbound JASS native: Missing");r.bind("Missing",[](auto& vm,auto){return vm.boolean(true);});rejects([&]{r.invoke("f");},"value type differs from integer");r.bind("Missing",[](auto& vm,auto){return vm.integer(7);});require(r.invoke("f").bits==7,"Native repair or call state failed");});
    test("runtime_handle_parameter_covariance",[]{Runtime r(compile("type agent extends handle\ntype unit extends agent\nnative Make takes nothing returns unit\nnative Read takes handle h returns integer\nfunction f takes nothing returns integer\nreturn Read(Make())\nendfunction\n"));r.bind("Make",[](auto& vm,auto){return vm.handle("unit",17);});r.bind("Read",[](auto& vm,auto args){require(args[0].type==vm.module().typeId("handle"),"Handle parameter not converted to declared ancestor");return vm.integer(std::int32_t(args[0].bits));});r.initialize();require(r.invoke("f").bits==17,"Handle bits changed during covariance");});
    test("runtime_faulted_initialization_and_local_defaults",[]{Runtime failedRuntime(compile("native Missing takes nothing returns integer\nglobals\ninteger x=Missing()\nendglobals\nfunction f takes nothing returns nothing\nendfunction\n"));rejects([&]{failedRuntime.initialize();},"Unbound JASS native");require(!failedRuntime.ready(),"Partial global initialization marked ready");rejects([&]{failedRuntime.invoke("f");},"not initialized");Runtime r(compile(R"jass(type unit extends handle
function integerDefault takes nothing returns integer
local integer value
return value
endfunction
function realDefault takes nothing returns real
local real value
return value
endfunction
function boolDefault takes nothing returns boolean
local boolean value
return value
endfunction
function textDefault takes nothing returns string
local string value
return value
endfunction
function unitDefault takes nothing returns unit
local unit value
return value
endfunction
function compare takes nothing returns boolean
local string value
return value=="" and value!=null
endfunction
function missing takes nothing returns integer
endfunction
)jass"));r.initialize();require(!r.invoke("integerDefault").bits && !r.invoke("realDefault").bits && !r.invoke("boolDefault").bits && !r.invoke("unitDefault").bits,"Local numeric, boolean or handle default differs");auto text=r.invoke("textDefault");require(text.text && text.text->empty() && r.invoke("compare").bits,"Local string default differs");rejects([&]{r.invoke("missing");},"without return value");});
    test("runtime_limits_reset_and_debug_policy",[]{RuntimeLimits limits;limits.steps=64;limits.frames=8;Runtime r(compile("function forever takes nothing returns nothing\nloop\nendloop\nendfunction\nfunction recurse takes nothing returns nothing\ncall recurse()\nendfunction\nfunction fine takes nothing returns integer\nreturn 7\nendfunction\n"),limits);r.initialize();rejects([&]{r.invoke("forever");},"instruction budget");rejects([&]{r.invoke("recurse");},"call frame budget");require(r.invoke("fine").bits==7,"Failed execution did not release frames");for(bool debug:{false,true}){limits.debug=debug;Runtime d(compile("native Trace takes nothing returns nothing\nfunction f takes nothing returns nothing\ndebug call Trace()\nendfunction\n"),limits);unsigned trace=0;d.bind("Trace",[&](auto& vm,auto){++trace;return vm.nothing();});d.initialize();d.invoke("f");require(trace==unsigned(debug),"Debug statement execution differs");}});
    test("runtime_nested_loop_targets_and_shared_native_budget",[]{Runtime r(compile("function nested takes nothing returns integer\nlocal integer i=0\nlocal integer j\nlocal integer sum=0\nloop\nexitwhen i>=2\nset j=0\nloop\nexitwhen j>=3\nif j==1 then\nexitwhen true\nendif\nset sum=sum+10+i\nset j=j+1\nendloop\nset i=i+1\nendloop\nreturn sum\nendfunction\n"));r.initialize();require(r.invoke("nested").bits==21,"exitwhen patched the outer loop target");RuntimeLimits limits;limits.steps=64;Runtime b(compile("native Retry takes nothing returns integer\nfunction forever takes nothing returns nothing\nloop\nendloop\nendfunction\nfunction f takes nothing returns integer\nreturn Retry()\nendfunction\nfunction fine takes nothing returns integer\nreturn 7\nendfunction\n"),limits);b.bind("Retry",[](auto& vm,auto){rejects([&]{vm.invoke("forever");},"instruction budget");return vm.integer(1);});b.initialize();rejects([&]{b.invoke("f");},"instruction budget");require(b.invoke("fine").bits==7,"Nested fault left native execution active");});
    test("runtime_long_expression_avoids_host_recursion",[]{std::string text="function f takes nothing returns integer\nreturn 1";for(unsigned i=0;i<20000;++i)text+="+1";text+="\nendfunction\n";Runtime r(compile(text));r.initialize();require(r.invoke("f").bits==20001 && r.instructionCount()>40000,"Long expression execution differs");});
    if(!failed){auto output=fs::absolute(argv[1]);fs::create_directories(output.parent_path());std::ofstream file(output,std::ios::binary);require(bool(file),"Cannot write runtime fixture");file<<"{\"strings\":[";bool first=true;for(auto text:{"","plain","a\\nb","Units\\\\Human\\\\Footman.mdx","\\r\\n\\b\\f\\t\\'\\\"\\\\"}){if(!first)file<<',';first=false;file<<"[\""<<hex(text)<<"\",\""<<hex(stringLiteral(text))<<"\"]";}file<<"],\"rawcodes\":[";first=true;std::vector<std::string> raw={"hfoo","AHbz","RAlr","\\r","\\n","\\b","\\f","\\t","\\'","\\\"","\\\\","\\q","\\u0000","\\Uffff","\\u1234"};for(unsigned c=1;c<256;++c)if(c!=39 && c!=92)raw.emplace_back(1,char(c));for(auto& text:raw){if(!first)file<<',';first=false;file<<"[\""<<hex(text)<<"\","<<rawcodeLiteral(text)<<']';}file<<"]}\n";file.close();require(bool(file),"Cannot complete runtime fixture");}
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into runtime checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
