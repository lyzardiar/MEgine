// Author: MiYu. Script configuration, typed object lifetime and enum native evidence.
#include "session.h"
#include "replay.h"
#include <bit>
#include <iostream>

using namespace war3;
using namespace war3::jass;
namespace {
struct EnumNative {const char* name;const char* type;std::uint32_t entry;};
constexpr EnumNative enums[]={
#include "jass_enums.inc"
};
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
Module compile(std::string text) {return Module::compile(Program::parse({{"session.j",std::move(text),"authored native session test"}}));}
template<class F> void rejects(F run,std::string_view message) {try{run();}catch(const std::exception& e){require(std::string_view(e.what()).find(message)!=std::string_view::npos,"Unexpected session diagnostic");return;}throw std::runtime_error("Invalid session operation accepted");}
}
int wmain(int argc,wchar_t** argv) {
    if(argc!=2){std::cerr<<"Usage: war3_session_tests <enum-fixture.json>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    test("restore_sleeping_trigger_context",[&]{
        const std::string source=R"jass(type widget extends handle
type unit extends widget
type trigger extends handle
type triggeraction extends handle
type event extends handle
type eventid extends handle
type gameevent extends eventid
native CreateTrigger takes nothing returns trigger
native TriggerAddAction takes trigger t, code callback returns triggeraction
native TriggerRegisterGameEvent takes trigger t, gameevent value returns event
native TriggerWaitOnSleeps takes trigger t, boolean flag returns nothing
native ConvertGameEvent takes integer value returns gameevent
native GetTriggeringTrigger takes nothing returns trigger
native GetTriggerEventId takes nothing returns eventid
native GetHandleId takes handle value returns integer
native TriggerSleepAction takes real seconds returns nothing
native TriggerExecuteWait takes trigger t returns nothing
globals
trigger active=null
integer observedTrigger=0
integer observedEvent=0
integer completed=0
integer waitReturned=0
endglobals
function action takes nothing returns integer
call TriggerSleepAction(0.125)
set observedTrigger=GetHandleId(GetTriggeringTrigger())
set observedEvent=GetHandleId(GetTriggerEventId())
set completed=completed+1
return 42
endfunction
function join takes nothing returns nothing
call TriggerExecuteWait(active)
set waitReturned=1
endfunction
function setup takes nothing returns nothing
set active=CreateTrigger()
call TriggerAddAction(active,function action)
call TriggerRegisterGameEvent(active,ConvertGameEvent(9))
endfunction
)jass";
        ScriptSession original(compile(source),{}),restored(compile(source),{});original.initialize();restored.initialize();auto& a=original.runtime();auto& b=restored.runtime();a.invoke("setup");b.invoke("CreateTrigger");b.invoke("setup");auto first=a.global("active").bits,second=b.global("active").bits;require(first!=second,"Fixture trigger handles did not differ");original.commandMenuOpened(true);require(a.threadCount()==1,"Trigger action did not suspend");rejects([&]{original.snapshotSleepingScript({});},"handle mapping");unsigned encoded=0;auto snapshot=original.snapshotSleepingScript([&](std::string_view type,std::uint32_t id){require(type=="trigger" && id==first,"Unexpected source context handle");++encoded;return 77u;});require(encoded==1 && snapshot.script.hasContext && !snapshot.contexts.empty(),"Trigger context was not captured");rejects([&]{restored.restoreSleepingScript(snapshot,[](auto,auto){return 0u;});},"handle mapping");auto inconsistent=snapshot;inconsistent.contexts.back().triggerUnit=33;inconsistent.contexts.back().triggerWidget=33;rejects([&]{restored.restoreSleepingScript(inconsistent,[&](std::string_view type,std::uint32_t){return type=="unit"?101u:type=="widget"?102u:second;});},"mapping across types");require(!b.threadCount(),"Invalid context mapping created a thread");b.threadClock(10);unsigned decoded=0;restored.restoreSleepingScript(snapshot,[&](std::string_view type,std::uint32_t id){require(type=="trigger" && id==77,"Unexpected stable context handle");++decoded;return second;});require(decoded==1,"Trigger context did not reuse its stable identity");b.advanceThreads(10.09375);require(!b.global("observedTrigger").bits,"Restored trigger woke early");b.advanceThreads(10.125);require(b.global("observedTrigger").bits==second && b.global("observedEvent").bits==9 && !b.threadCount(),"Restored trigger lost event or remapped context");a.advanceThreads(.125);require(a.global("observedTrigger").bits==first && a.global("observedEvent").bits==9,"Source trigger context changed");
        original.commandMenuOpened(true);original.commandMenuOpened(true);require(a.threadCount()==2,"Parallel trigger actions did not suspend");encoded=0;auto batch=original.snapshotSleepingScripts([&](std::string_view type,std::uint32_t id){require(type=="trigger" && id==first,"Unexpected batch context handle");++encoded;return 77u;});require(batch.threads.size()==2 && batch.scripts.threads.size()==2 && encoded==1,"Parallel contexts or shared identity were not captured");auto augmented=batch;auto& extra=augmented.threads[0].contexts.back();extra.chat="hello";extra.chatMatch="match";extra.orderPoint={Real::fromBits(0x3f800000),Real::fromBits(0xc0000000)};extra.spellPoint={Real::fromBits(0x40400000),Real::fromBits(0x40800000)};extra.damage=Real::fromBits(0x40a00000);extra.damageAttack=true;extra.damageRanged=true;extra.learnedSkill=0x12345678;extra.constructed=45;augmented.threads[0].selections.emplace();(*augmented.threads[0].selections)[2].insert(99);auto augmentedDecoded=restored.decodeSleepingScripts(original.encodeSleepingScripts(augmented));auto& read=augmentedDecoded.threads[0].contexts.back();require(read.chat=="hello" && read.chatMatch=="match" && read.orderPoint.x.bits()==0x3f800000 && read.orderPoint.y.bits()==0xc0000000 && read.spellPoint.x.bits()==0x40400000 && read.spellPoint.y.bits()==0x40800000 && read.damage.bits()==0x40a00000 && read.damageAttack && read.damageRanged && read.learnedSkill==0x12345678 && read.constructed==45 && augmentedDecoded.threads[0].selections->at(2).contains(99),"Context or selection fields did not round trip");auto wire=original.encodeSleepingScripts(batch);auto path=fs::absolute(argv[1]).parent_path()/L"sleeping-threads.bin";fs::create_directories(path.parent_path());{std::ofstream file(path,std::ios::binary);file.write(reinterpret_cast<const char*>(wire.data()),std::streamsize(wire.size()));require(bool(file),"Could not write sleeping snapshot");}Bytes disk;{std::ifstream file(path,std::ios::binary);disk.assign(std::istreambuf_iterator<char>(file),std::istreambuf_iterator<char>());require(file.eof() || bool(file),"Could not read sleeping snapshot");}require(disk==wire,"Sleeping snapshot file changed bytes");auto shortWire=disk;shortWire.pop_back();rejects([&]{restored.decodeSleepingScripts(shortWire);},"digest");auto badWire=disk;badWire[0]^=1;rejects([&]{restored.decodeSleepingScripts(badWire);},"digest");auto oversized=disk;for(unsigned i=0;i<4;++i)oversized[8+i]=0xff;auto digest=sha256(std::span<const std::uint8_t>(oversized.data(),oversized.size()-64));std::copy(digest.begin(),digest.end(),oversized.end()-64);rejects([&]{restored.decodeSleepingScripts(oversized);},"exceeds budget");require(!b.threadCount(),"Invalid snapshot decode changed live threads");ScriptSession different(compile(source+"\n"),{});different.initialize();rejects([&]{different.decodeSleepingScripts(disk);},"source differs");batch=restored.decodeSleepingScripts(disk);require(batch.threads.size()==2 && batch.threads[0].contexts.size()==snapshot.contexts.size(),"Sleeping context file did not round trip");auto broken=batch;broken.scripts.threads[1].execution.frames.back().pc=0;auto decode=[&](std::string_view type,std::uint32_t id){require(type=="trigger" && id==77,"Unexpected batch stable handle");return second;};rejects([&]{restored.restoreSleepingScripts(broken,decode);},"call frame");require(!b.threadCount(),"Failed context batch left a thread");auto ids=restored.restoreSleepingScripts(batch,decode);require(ids.size()==2 && b.threadCount()==2,"Parallel trigger context restore failed");b.advanceThreads(10.25);a.advanceThreads(.25);require(b.global("completed").bits==3 && a.global("completed").bits==3 && b.global("observedTrigger").bits==second && b.global("observedEvent").bits==9 && !b.threadCount(),"Restored parallel trigger contexts differ");b.start("join");require(!b.global("waitReturned").bits && b.threadCount()==2,"Single action wait did not suspend caller");b.advanceThreads(10.375);require(b.global("waitReturned").bits==1 && !b.threadCount() && !b.invoke("GetTriggeringTrigger").bits,"Single action wait or host context differed");
    });
    test("single_trigger_deferred_lifetime",[]{auto module=compile(R"jass(type trigger extends handle
type triggeraction extends handle
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native TriggerAddAction takes trigger t, code callback returns triggeraction
native TriggerRemoveAction takes trigger t, triggeraction action returns nothing
native TriggerExecute takes trigger t returns nothing
globals
trigger active=null
triggeraction entry=null
integer calls=0
endglobals
function action takes nothing returns nothing
set calls=calls+1
endfunction
function setup takes nothing returns nothing
set active=CreateTrigger()
set entry=TriggerAddAction(active,function action)
endfunction
)jass");ScriptSession session(std::move(module),{});session.initialize();auto& vm=session.runtime();vm.invoke("setup");auto trigger=vm.global("active");vm.invoke("TriggerExecute",std::array{trigger});require(vm.global("calls").bits==1 && !vm.threadCount(),"Single trigger action did not execute");vm.pauseThreads(true);vm.invoke("TriggerExecute",std::array{trigger});vm.invoke("DestroyTrigger",std::array{trigger});vm.pauseThreads(false);vm.advanceThreads(0);require(vm.global("calls").bits==1 && !vm.threadCount(),"Deferred action ran after trigger destruction");vm.invoke("setup");trigger=vm.global("active");auto entry=vm.global("entry");vm.pauseThreads(true);vm.invoke("TriggerExecute",std::array{trigger});vm.invoke("TriggerRemoveAction",std::array{trigger,entry});vm.pauseThreads(false);vm.advanceThreads(0);require(vm.global("calls").bits==1 && !vm.threadCount(),"Deferred action ran after removal");});
    test("game_command_menu_events",[]{auto module=compile(R"jass(type trigger extends handle
type triggeraction extends handle
type event extends handle
type eventid extends handle
type gameevent extends eventid
type player extends handle
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native DisableTrigger takes trigger t returns nothing
native TriggerAddAction takes trigger t, code callback returns triggeraction
native TriggerRegisterGameEvent takes trigger t, gameevent value returns event
native ConvertGameEvent takes integer value returns gameevent
native GetTriggerEventId takes nothing returns eventid
native GetTriggerPlayer takes nothing returns player
native GetHandleId takes handle value returns integer
globals
integer trace=0
integer wrong=0
trigger first=null
trigger build=null
endglobals
function firstAction takes nothing returns nothing
if GetHandleId(GetTriggerEventId())!=9 or GetTriggerPlayer()!=null then
set wrong=1
endif
set trace=trace*10+1
call DestroyTrigger(first)
endfunction
function secondAction takes nothing returns nothing
set trace=trace*10+2
endfunction
function buildAction takes nothing returns nothing
if GetHandleId(GetTriggerEventId())!=10 or GetTriggerPlayer()!=null then
set wrong=1
endif
set trace=trace*10+3
endfunction
function setup takes nothing returns nothing
local trigger second=CreateTrigger()
set first=CreateTrigger()
set build=CreateTrigger()
call TriggerRegisterGameEvent(first,ConvertGameEvent(9))
call TriggerAddAction(first,function firstAction)
call TriggerRegisterGameEvent(second,ConvertGameEvent(9))
call TriggerAddAction(second,function secondAction)
call TriggerRegisterGameEvent(build,ConvertGameEvent(10))
call TriggerAddAction(build,function buildAction)
endfunction
function disableBuild takes nothing returns nothing
call DisableTrigger(build)
endfunction
)jass");ScriptSession session(std::move(module),{});session.initialize();auto& vm=session.runtime();vm.invoke("setup");session.commandMenuOpened(true);require(vm.global("trace").bits==12 && !vm.global("wrong").bits,"Skill menu event context or registration order differs");session.commandMenuOpened(true);session.commandMenuOpened(false);require(vm.global("trace").bits==1223 && !vm.global("wrong").bits,"Command menu event routing or destruction differs");vm.invoke("disableBuild");session.commandMenuOpened(false);require(vm.global("trace").bits==1223,"Disabled build menu trigger fired");});
    test("id_to_string_null_and_known_order",[]{ScriptSession session(compile(R"jass(native OrderId takes string name returns integer
native OrderId2String takes integer id returns string
native UnitId2String takes integer id returns string
function probe takes nothing returns boolean
return OrderId2String(0)==null and UnitId2String(0)==null and OrderId2String(OrderId("move"))=="move"
endfunction
)jass"),{});session.initialize();auto& vm=session.runtime();require(vm.invoke("probe").bits,"Known order or missing ID did not follow JASS string semantics");require(!vm.invoke("OrderId2String",std::array{vm.integer(-1)}).text,"Unknown order did not return null");});
    test("map_density_natives",[]{ScriptSession session(compile("type mapdensity extends handle\nnative SetResourceDensity takes mapdensity d returns nothing\nnative SetCreatureDensity takes mapdensity d returns nothing\nnative GetResourceDensity takes nothing returns mapdensity\nnative GetCreatureDensity takes nothing returns mapdensity\n"),{});session.initialize();auto& vm=session.runtime();vm.invoke("SetResourceDensity",std::array{vm.handle("mapdensity",0x123)});vm.invoke("SetCreatureDensity",std::array{vm.handle("mapdensity",2)});require(vm.invoke("GetResourceDensity").bits==0x23 && vm.invoke("GetCreatureDensity").bits==2,"Independent map density values differ");vm.invoke("SetResourceDensity",std::array{vm.handle("mapdensity",0)});require(vm.invoke("GetResourceDensity").bits==0 && vm.invoke("GetCreatureDensity").bits==2,"Map density updates interfered");});
    test("original_angle_conversion",[]{ScriptSession session(compile("native Deg2Rad takes real x returns real\nnative Rad2Deg takes real x returns real\n"),{});session.initialize();auto& vm=session.runtime();for(auto [name,factor]:std::initializer_list<std::pair<const char*,std::uint32_t>>{{"Deg2Rad",0x3c8efa35u},{"Rad2Deg",0x42652ee1u}}){require(vm.invoke(name,std::array{vm.real(Real::fromBits(0))}).bits==0,"Zero angle conversion differs");require(vm.invoke(name,std::array{vm.real(Real::fromBits(0x3f800000u))}).bits==factor,"Unit angle conversion differs");require(vm.invoke(name,std::array{vm.real(Real::fromBits(0xbf800000u))}).bits==(factor|0x80000000u),"Negative unit angle conversion differs");}});
    test("original_string_hash",[]{ScriptSession session(compile("native StringHash takes string s returns integer\n"),{});session.initialize();auto& vm=session.runtime();for(auto [text,bits]:std::initializer_list<std::pair<const char*,std::uint32_t>>{{"",0},{"a",0xa1614b4du},{"Warcraft",0xe3dcf3a3u},{"foo/bar",0x8753ed49u},{"ABCDEFGHIJK",0x98ab491fu},{"ABCDEFGHIJKL",0xea9c4f7au},{"ABCDEFGHIJKLM",0xc9a8ad4du},{"0123456789abcdefghijklmn",0xdaa6f61eu}})require(vm.invoke("StringHash",std::array{vm.string(text)}).bits==bits,"Source StringHash mismatch");auto a=std::string(1023,'a'),b=a+"ignored";require(vm.invoke("StringHash",std::array{vm.string(a)}).bits==vm.invoke("StringHash",std::array{vm.string(b)}).bits,"Source StringHash length limit differs");});
    test("replay_product_and_session_version",[]{require(replayProductVersion(0x57415233u)==std::optional<unsigned>{0} && replayProductVersion(0x57335850u)==std::optional<unsigned>{1},"Classic replay product version differs");require(!replayProductVersion(0) && !replayProductVersion(0x12345678u),"Missing or unknown replay product was guessed");auto source=R"jass(type version extends handle
native VersionGet takes nothing returns version
native VersionCompatible takes version value returns boolean
native VersionSupported takes version value returns boolean
native GetHandleId takes handle value returns integer
globals
integer versionAtGlobals=GetHandleId(VersionGet())
integer versionAtConfig=-1
endglobals
function config takes nothing returns nothing
set versionAtConfig=GetHandleId(VersionGet())
endfunction
)jass";for(unsigned version:{0u,1u}){ScriptSession session(compile(source),{});session.versionContext(version);session.configure();auto& vm=session.runtime();auto roc=vm.handle("version",0),tft=vm.handle("version",1),invalid=vm.handle("version",0xffffffffu);require(vm.global("versionAtGlobals").bits==version && vm.global("versionAtConfig").bits==version && vm.invoke("VersionGet").bits==version,"Version was not set before globals and config");require(vm.invoke("VersionCompatible",std::array{roc}).bits && bool(vm.invoke("VersionCompatible",std::array{tft}).bits)==bool(version) && !vm.invoke("VersionCompatible",std::array{invalid}).bits,"Version compatibility matrix differs");require(vm.invoke("VersionSupported",std::array{roc}).bits && vm.invoke("VersionSupported",std::array{tft}).bits && !vm.invoke("VersionSupported",std::array{invalid}).bits,"Installed support was coupled to replay version");rejects([&]{session.versionContext(1-version);},"fresh session");}ScriptSession bad(compile(source),{});rejects([&]{bad.versionContext(2);},"fresh session");});
    test("replay_chat_decode_and_private_audience",[]{ReplayRecord record{};record.kind=ReplayRecordKind::Chat;record.playerId=2;record.payload={0x20,5,0,0,0,'h','i',0};auto chat=decodeReplayChat(record);require(!chat.startup && chat.sender==2 && chat.scope==5 && chat.text=="hi","Replay private chat decoded incorrectly");ScriptSession session(compile(""),{});session.chat(1,chat.text,ChatChannel::All,2);require(session.texts().back().audience==((1u<<1)|(1u<<2)),"Private chat audience differs");record.payload={0x10,'x',0};chat=decodeReplayChat(record);require(chat.startup && chat.text=="x","Startup chat decoded incorrectly");record.payload={0x20,0,0,0,0,'x'};rejects([&]{decodeReplayChat(record);},"Unterminated string");record.payload={0x20,0,0,0,0,'x',0,0};rejects([&]{decodeReplayChat(record);},"Unconsumed binary record");record.payload={0x20,19,0,0,0,0};rejects([&]{decodeReplayChat(record);},"slot outside classic range");rejects([&]{session.chat(1,"x",ChatChannel::All,16);},"Invalid player chat input");});
    test("cache_sync_scalar_actions",[]{std::string source="type gamecache extends handle\nnative InitGameCache takes string name returns gamecache\nnative GetStoredInteger takes gamecache c,string m,string k returns integer\nnative GetStoredString takes gamecache c,string m,string k returns string\nnative HaveStoredInteger takes gamecache c,string m,string k returns boolean\n";ScriptSession first(compile(source),{}),second(compile(source),{});first.initialize();second.initialize();auto& a=first.runtime();auto& b=second.runtime();auto cacheName="codex-cache-sync-"+std::to_string(GetCurrentProcessId());auto ca=a.invoke("InitGameCache",std::array{a.string(cacheName)}),cb=b.invoke("InitGameCache",std::array{b.string(cacheName)});require(ca.bits && cb.bits,"Cannot initialize cache");LanActionCacheSync integer{0x6b,cacheName,"mission","integer",{},0xffffffd6u},text{0x6f,cacheName,"mission","text","payload",0},erase{0x70,cacheName,"mission","integer",{},0};std::array<LanDecodedAction,3> input{integer,text,erase};auto bytes=encodeLanActions(input);auto actions=decodeLanActions(bytes);require(actions.size()==3 && std::get<LanActionCacheSync>(actions[0])==integer && std::get<LanActionCacheSync>(actions[1])==text && std::get<LanActionCacheSync>(actions[2])==erase,"Cache synchronization encoding differs");std::array<LanDecodedAction,1> vector{LanActionCacheSync{0x6b,"a","b","c",{},0x12345678u}};require(encodeLanActions(vector)==std::vector<std::uint8_t>({0x6b,'a',0,'b',0,'c',0,0x78,0x56,0x34,0x12}),"Original cache integer wire vector differs");LanCacheSyncProjection pa,pb;for(auto& action:actions){auto& value=std::get<LanActionCacheSync>(action);require(first.validateCacheSync(value,pa) && second.validateCacheSync(value,pb),"Cache sync preflight failed");}for(auto& action:actions){auto& value=std::get<LanActionCacheSync>(action);require(first.applyCacheSync(value) && second.applyCacheSync(value),"Cache sync apply failed");if(value.opcode==0x6b)require(a.invoke("GetStoredInteger",std::array{ca,a.string("mission"),a.string("integer")}).bits==0xffffffd6u && b.invoke("GetStoredInteger",std::array{cb,b.string("mission"),b.string("integer")}).bits==0xffffffd6u,"Signed cache integer did not reach both sessions");}require(!a.invoke("HaveStoredInteger",std::array{ca,a.string("mission"),a.string("integer")}).bits && !b.invoke("HaveStoredInteger",std::array{cb,b.string("mission"),b.string("integer")}).bits,"Cache deletion was not delivered");require(*a.invoke("GetStoredString",std::array{ca,a.string("mission"),a.string("text")}).text=="payload" && *b.invoke("GetStoredString",std::array{cb,b.string("mission"),b.string("text")}).text=="payload","Cache value was not delivered");auto truncated=bytes;truncated.pop_back();rejects([&]{decodeLanActions(truncated);},"Truncated LAN action");LanActionCacheSync missing{0x6b,"not-initialized","m","k",{},1};LanCacheSyncProjection projected;require(!first.validateCacheSync(missing,projected),"Unknown cache passed preflight");});
    test("cache_sync_native_snapshot",[]{std::string source="type gamecache extends handle\nnative InitGameCache takes string name returns gamecache\nnative StoreInteger takes gamecache c,string m,string k,integer v returns nothing\nnative SyncStoredInteger takes gamecache c,string m,string k returns nothing\nnative FlushStoredInteger takes gamecache c,string m,string k returns nothing\nnative GetStoredInteger takes gamecache c,string m,string k returns integer\n";ScriptSession first(compile(source),{}),second(compile(source),{});first.initialize();second.initialize();auto& a=first.runtime();auto& b=second.runtime();auto name="codex-native-sync-"+std::to_string(GetCurrentProcessId());auto ca=a.invoke("InitGameCache",std::array{a.string(name)}),cb=b.invoke("InitGameCache",std::array{b.string(name)});auto args=std::array{ca,a.string("m"),a.string("k")};a.invoke("StoreInteger",std::array{ca,a.string("m"),a.string("k"),a.integer(-42)});a.invoke("SyncStoredInteger",args);require(first.pendingCacheSync() && first.pendingCacheSync()->opcode==0x6b && first.pendingCacheSync()->value==0xffffffd6u,"SyncStoredInteger did not queue value");a.invoke("StoreInteger",std::array{ca,a.string("m"),a.string("k"),a.integer(17)});std::array<LanDecodedAction,1> packet{*first.pendingCacheSync()};auto decoded=decodeLanActions(encodeLanActions(packet));auto action=std::get<LanActionCacheSync>(decoded.front());first.popCacheSync();LanCacheSyncProjection projected;require(second.validateCacheSync(action,projected) && second.applyCacheSync(action) && std::bit_cast<std::int32_t>(b.invoke("GetStoredInteger",std::array{cb,b.string("m"),b.string("k")}).bits)==-42,"Queued snapshot changed before remote delivery");a.invoke("FlushStoredInteger",args);a.invoke("SyncStoredInteger",args);require(first.pendingCacheSync() && first.pendingCacheSync()->opcode==0x70,"SyncStoredInteger did not queue deletion");action=*first.pendingCacheSync();first.popCacheSync();require(second.applyCacheSync(action) && b.invoke("GetStoredInteger",std::array{cb,b.string("m"),b.string("k")}).bits==0,"Queued deletion did not apply");a.invoke("SyncStoredInteger",std::array{a.handle("gamecache",0),a.string("m"),a.string("k")});require(!first.pendingCacheSync(),"Null cache queued a synchronization");});
    std::vector<std::uint32_t> values={0,1,2,7,12,31,32,63,64,128,255,256,1024,0x80000000,0x7fffffff,0xffffffff,0x100000};std::uint32_t state=0x12705224;for(unsigned i=0;i<48;++i){state=state*1664525u+1013904223u;values.push_back(state);}
    std::vector<std::pair<std::string,std::vector<std::uint32_t>>> converted;
    test("session_original_enum_native_bits",[&]{std::string source;for(auto entry:enums)source+="type "+std::string(entry.type)+" extends handle\n";for(auto entry:enums)source+="native "+std::string(entry.name)+" takes integer value returns "+entry.type+"\n";source+="native GetHandleId takes handle value returns integer\n";ScriptSession session(compile(source),{});session.initialize();for(auto entry:enums){std::vector<std::uint32_t> results;for(auto bits:values){Value args[]={session.runtime().integer(std::bit_cast<std::int32_t>(bits))};auto result=session.runtime().invoke(entry.name,args);require(result.type==session.runtime().module().typeId(entry.type) && result.bits==bits,"Enum conversion changed type or bits");results.push_back(result.bits);}converted.emplace_back(entry.name,std::move(results));}std::vector<std::uint32_t> results;for(auto bits:values){Value args[]={session.runtime().handle("handle",bits)};auto result=session.runtime().invoke("GetHandleId",args);require(result.bits==bits,"GetHandleId changed raw bits");results.push_back(result.bits);}converted.emplace_back("GetHandleId",std::move(results));});
    const std::string objectSource=R"jass(type group extends handle
type timer extends handle
type trigger extends handle
type unit extends handle
native CreateGroup takes nothing returns group
native DestroyGroup takes group g returns nothing
native FirstOfGroup takes group g returns unit
native CreateTimer takes nothing returns timer
native DestroyTimer takes timer t returns nothing
native TimerGetTimeout takes timer t returns real
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native DisableTrigger takes trigger t returns nothing
native IsTriggerEnabled takes trigger t returns boolean
globals
group g=CreateGroup()
timer clock=CreateTimer()
trigger t=CreateTrigger()
endglobals
function inspect takes nothing returns boolean
return FirstOfGroup(g)==null and TimerGetTimeout(clock)==0.0 and IsTriggerEnabled(t)
endfunction
function disable takes nothing returns boolean
call DisableTrigger(t)
return IsTriggerEnabled(t)
endfunction
function release takes nothing returns nothing
call DestroyGroup(g)
call DestroyTimer(clock)
call DestroyTrigger(t)
endfunction
)jass";
    test("session_global_objects_have_persistent_state",[&]{ScriptSession session(compile(objectSource),{});require(session.liveObjects(NativeKind::Group)==0,"Constructor executed JASS globals");session.initialize();require(session.liveObjects(NativeKind::Group)==1 && session.liveObjects(NativeKind::Timer)==1 && session.liveObjects(NativeKind::Trigger)==1,"Creation did not retain native objects");auto& vm=session.runtime();require(vm.global("g").bits && vm.global("clock").bits!=vm.global("g").bits && vm.invoke("inspect").bits,"Initial object state differs");require(!vm.invoke("disable").bits,"Trigger flag update not retained");rejects([&]{session.initialize();},"fresh instance");require(session.initialized(),"Repeated initialize poisoned the ready session");});
    test("session_native_destruction_and_fresh_lifetime",[&]{ScriptSession session(compile(objectSource),{});session.initialize();session.runtime().invoke("release");require(session.liveObjects(NativeKind::Group)==0 && session.liveObjects(NativeKind::Timer)==0 && session.liveObjects(NativeKind::Trigger)==0,"Destroy did not release native state");rejects([&]{session.runtime().invoke("inspect");},"Destroyed or incompatible");ScriptSession next(compile(objectSource),{});next.initialize();require(next.runtime().invoke("inspect").bits && next.liveObjects(NativeKind::Trigger)==1,"Native state leaked into fresh session");});
    test("session_variable_event_crossing_and_destruction",[]{auto module=compile(R"jass(type trigger extends handle
type triggeraction extends handle
type event extends handle
type eventid extends handle
type limitop extends handle
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native TriggerAddAction takes trigger t, code action returns triggeraction
native TriggerRegisterVariableEvent takes trigger t, string name, limitop op, real limit returns event
native ConvertLimitOp takes integer value returns limitop
native GetTriggerEventId takes nothing returns eventid
native GetHandleId takes handle value returns integer
globals
real watched=0.
integer hits=0
integer eventKind=0
trigger t=null
endglobals
function onLimit takes nothing returns nothing
set hits=hits+1
set eventKind=GetHandleId(GetTriggerEventId())
endfunction
function setup takes nothing returns nothing
set t=CreateTrigger()
call TriggerAddAction(t,function onLimit)
call TriggerRegisterVariableEvent(t,"watched",ConvertLimitOp(4),1.)
endfunction
function cross takes nothing returns nothing
set watched=2.
set watched=3.
set watched=0.
set watched=2.
endfunction
function release takes nothing returns nothing
call DestroyTrigger(t)
set watched=0.
set watched=2.
endfunction
)jass");ScriptSession session(std::move(module),{});session.initialize();auto& vm=session.runtime();vm.invoke("setup");vm.invoke("cross");require(vm.global("hits").bits==2 && vm.global("eventKind").bits==2,"Variable threshold crossing or event context differs");vm.invoke("release");require(vm.global("hits").bits==2,"Destroyed trigger still receives variable events");});
    test("trigger_owned_children_destroy_during_dispatch",[]{auto module=compile(R"jass(type trigger extends handle
type triggeraction extends handle
type triggercondition extends handle
type boolexpr extends handle
type conditionfunc extends boolexpr
type event extends handle
type limitop extends handle
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native TriggerAddAction takes trigger t, code action returns triggeraction
native TriggerRemoveAction takes trigger t, triggeraction action returns nothing
native TriggerAddCondition takes trigger t, boolexpr condition returns triggercondition
native TriggerClearConditions takes trigger t returns nothing
native Condition takes code callback returns conditionfunc
native TriggerRegisterVariableEvent takes trigger t, string name, limitop op, real limit returns event
native TriggerRegisterTimerEvent takes trigger t, real timeout, boolean periodic returns event
native ConvertLimitOp takes integer value returns limitop
globals
real watched=0.
integer firstHits=0
integer secondHits=0
trigger first=null
trigger second=null
endglobals
function accept takes nothing returns boolean
return true
endfunction
function firstAction takes nothing returns nothing
set firstHits=firstHits+1
call DestroyTrigger(first)
endfunction
function laterAction takes nothing returns nothing
set firstHits=firstHits+100
endfunction
function secondAction takes nothing returns nothing
set secondHits=secondHits+1
endfunction
function setup takes nothing returns nothing
local triggeraction removed
set first=CreateTrigger()
set second=CreateTrigger()
set removed=TriggerAddAction(first,function laterAction)
call TriggerRemoveAction(first,removed)
call TriggerAddCondition(first,Condition(function accept))
call TriggerClearConditions(first)
call TriggerAddCondition(first,Condition(function accept))
call TriggerAddAction(first,function firstAction)
call TriggerAddAction(first,function laterAction)
call TriggerAddAction(second,function secondAction)
call TriggerRegisterVariableEvent(first,"watched",ConvertLimitOp(4),1.)
call TriggerRegisterTimerEvent(first,10.,false)
call TriggerRegisterVariableEvent(second,"watched",ConvertLimitOp(4),1.)
endfunction
function cross takes nothing returns nothing
set watched=0.
set watched=2.
endfunction
function release takes nothing returns nothing
call DestroyTrigger(second)
endfunction
)jass");ScriptSession session(std::move(module),{});session.initialize();auto& vm=session.runtime();vm.invoke("setup");require(session.liveObjects(NativeKind::Event)==3 && session.liveObjects(NativeKind::Action)==3 && session.liveObjects(NativeKind::Condition)==1,"Unexpected trigger child setup");for(unsigned i=0;i<300;++i){auto transient=vm.invoke("CreateTrigger");vm.invoke("TriggerRegisterVariableEvent",std::array{transient,vm.string("watched"),vm.handle("limitop",4),vm.real(Real::fromBits(0x3f800000))});vm.invoke("DestroyTrigger",std::array{transient});}vm.invoke("cross");require(vm.global("firstHits").bits==1 && vm.global("secondHits").bits==1,"Destroy during dispatch changed action or independent trigger ordering");require(session.liveObjects(NativeKind::Event)==1 && session.liveObjects(NativeKind::Action)==1 && session.liveObjects(NativeKind::Condition)==0,"Destroyed trigger retained children or removed another trigger's children");vm.invoke("cross");require(vm.global("firstHits").bits==1 && vm.global("secondHits").bits==2,"Destroyed or surviving trigger dispatch differs");vm.invoke("release");require(session.liveObjects(NativeKind::Event)==0 && session.liveObjects(NativeKind::Action)==0 && session.liveObjects(NativeKind::Trigger)==0,"Final trigger children remained live");});
    test("session_integer_game_states_and_events",[]{auto module=compile(R"jass(type gamestate extends handle
type igamestate extends gamestate
type trigger extends handle
type triggeraction extends handle
type event extends handle
type eventid extends handle
type limitop extends handle
native ConvertIGameState takes integer value returns igamestate
native ConvertLimitOp takes integer value returns limitop
native CreateTrigger takes nothing returns trigger
native DestroyTrigger takes trigger t returns nothing
native TriggerAddAction takes trigger t, code action returns triggeraction
native TriggerRegisterGameStateEvent takes trigger t, gamestate state, limitop op, real limit returns event
native GetEventGameState takes nothing returns gamestate
native GetTriggerEventId takes nothing returns eventid
native GetHandleId takes handle value returns integer
native GetIntegerGameState takes igamestate state returns integer
native SetIntegerGameState takes igamestate state, integer value returns nothing
globals
integer firstHits=0
integer secondHits=0
integer disconnectedHits=0
integer stateSeen=-1
integer eventSeen=0
boolean nested=true
trigger second=null
endglobals
function firstAction takes nothing returns nothing
set firstHits=firstHits+1
set stateSeen=GetHandleId(GetEventGameState())
set eventSeen=GetHandleId(GetTriggerEventId())
if nested then
set nested=false
call SetIntegerGameState(ConvertIGameState(0),0)
endif
endfunction
function secondAction takes nothing returns nothing
set secondHits=secondHits+1
endfunction
function disconnectedAction takes nothing returns nothing
set disconnectedHits=disconnectedHits+1
set stateSeen=GetHandleId(GetEventGameState())
endfunction
function setup takes nothing returns nothing
local trigger first=CreateTrigger()
local trigger disconnected=CreateTrigger()
set second=CreateTrigger()
call TriggerAddAction(first,function firstAction)
call TriggerAddAction(second,function secondAction)
call TriggerAddAction(disconnected,function disconnectedAction)
call TriggerRegisterGameStateEvent(first,ConvertIGameState(0),ConvertLimitOp(4),1.)
call TriggerRegisterGameStateEvent(second,ConvertIGameState(0),ConvertLimitOp(4),1.)
call TriggerRegisterGameStateEvent(disconnected,ConvertIGameState(1),ConvertLimitOp(4),1.)
endfunction
function destroySecond takes nothing returns nothing
call DestroyTrigger(second)
endfunction
)jass");ScriptSession session(std::move(module),{});session.initialize();auto& vm=session.runtime();auto zero=vm.handle("igamestate",0),one=vm.handle("igamestate",1);auto set=[&](jass::Value state,int value){vm.invoke("SetIntegerGameState",std::array{state,vm.integer(value)});};auto get=[&](jass::Value state){return std::bit_cast<std::int32_t>(vm.invoke("GetIntegerGameState",std::array{state}).bits);};require(get(zero)==0 && get(one)==0,"Initial integer game states differ");for(auto id:{2u,0xffffffffu}){auto invalid=vm.handle("igamestate",id);set(invalid,42);require(get(invalid)==0,"Out-of-range state was accepted");}auto nullTrigger=vm.handle("trigger",0);require(!vm.invoke("TriggerRegisterGameStateEvent",std::array{nullTrigger,zero,vm.handle("limitop",4),vm.real(jass::Real::fromBits(std::bit_cast<std::uint32_t>(1.f)))}).bits,"Null trigger registered an event");vm.invoke("setup");set(zero,2);require(get(zero)==0 && vm.global("firstHits").bits==1 && vm.global("secondHits").bits==0 && vm.global("eventSeen").bits==3 && vm.global("stateSeen").bits==0,"Reentrant state callback or event context differs");set(zero,2);set(zero,2);require(vm.global("firstHits").bits==2 && vm.global("secondHits").bits==1,"Threshold crossing or equal assignment differs");set(one,2);require(vm.global("disconnectedHits").bits==1 && vm.global("stateSeen").bits==1 && get(zero)==2,"Integer game states are not independent");vm.invoke("destroySecond");set(zero,0);set(zero,2);require(vm.global("firstHits").bits==3 && vm.global("secondHits").bits==1,"Destroyed game-state trigger fired");set(zero,INT32_MIN);set(one,INT32_MAX);require(get(zero)==INT32_MIN && get(one)==INT32_MAX,"Integer game-state bits changed");});
    test("session_config_updates_metadata_slots_and_priorities",[]{auto module=compile(R"jass(type player extends handle
type playercolor extends handle
type mapcontrol extends handle
type startlocprio extends handle
type location extends handle
native Player takes integer i returns player
native GetPlayerId takes player p returns integer
native ConvertPlayerColor takes integer i returns playercolor
native ConvertMapControl takes integer i returns mapcontrol
native ConvertStartLocPrio takes integer i returns startlocprio
native SetMapName takes string s returns nothing
native SetPlayers takes integer n returns nothing
native SetTeams takes integer n returns nothing
native DefineStartLocation takes integer i, real x, real y returns nothing
native DefineStartLocationLoc takes integer i, location p returns nothing
native Location takes real x, real y returns location
native RemoveLocation takes location p returns nothing
native ForcePlayerStartLocation takes player p, integer i returns nothing
native SetPlayerTeam takes player p, integer i returns nothing
native SetPlayerColor takes player p, playercolor c returns nothing
native SetPlayerController takes player p, mapcontrol c returns nothing
native SetStartLocPrioCount takes integer i, integer n returns nothing
native SetStartLocPrio takes integer i, integer n, integer other, startlocprio priority returns nothing
function config takes nothing returns nothing
local location p=Location(500.,-100.)
call SetMapName("TRIGSTR_001")
call SetPlayers(2)
call SetTeams(2)
call DefineStartLocation(0,3328.0,-3072.0)
call DefineStartLocationLoc(1,p)
call RemoveLocation(p)
call ForcePlayerStartLocation(Player(3),0)
call SetPlayerTeam(Player(3),1)
call SetPlayerColor(Player(3),ConvertPlayerColor(7))
call SetPlayerController(Player(3),ConvertMapControl(1))
call SetStartLocPrioCount(0,1)
call SetStartLocPrio(0,0,1,ConvertStartLocPrio(2))
endfunction
)jass");ScriptSession session(std::move(module),{},{{1,"Authored map"}});session.configure();auto& c=session.config();require(session.configured() && c.name=="Authored map" && c.playerCount==2 && c.teamCount==2,"Metadata not updated by config");require(c.players[3].start==0 && c.players[3].forcedStart && c.players[3].team==1 && c.players[3].color==7 && c.players[3].controller==1,"Player config was not retained");require(c.starts[0].defined && c.starts[0].position[0].bits()==Real::fromDecimal("3328.0").bits() && c.starts[0].position[1].bits()==(Real::fromDecimal("3072.0").bits()^0x80000000) && c.starts[0].priorities[0].other==1 && c.starts[0].priorities[0].priority==2,"Start definition or priority differs");require(c.starts[1].defined && c.starts[1].position[0].bits()==Real::fromDecimal("500.").bits() && c.starts[1].position[1].bits()==(Real::fromDecimal("100.").bits()^0x80000000),"Location start did not retain its coordinates");rejects([&]{session.configure();},"unconfigured instance");});
    test("session_selected_game_type_and_source_metadata",[]{auto source=std::string("type gametype extends handle\nnative GetGameTypeSelected takes nothing returns gametype\nfunction config takes nothing returns nothing\nendfunction\n");MapInfo info;info.flags=4;info.name="Source map";info.players.push_back({3,2,3,1,"Source slot",{100.0f,-200.0f},0,0});info.forces.push_back({0,1u<<3,"Source force"});ScriptSession melee(compile(source),info);melee.configure();require(melee.config().gameType==1 && melee.runtime().invoke("GetGameTypeSelected").bits==1 && melee.config().name=="Source map","Melee source game type differs");require(melee.config().players[3].controller==1 && melee.config().players[3].racePreference==8 && melee.config().players[3].forcedStart && melee.config().players[3].start==0,"Source player defaults lost");info.flags=0x40;ScriptSession custom(compile(source),info);custom.configure();require(custom.runtime().invoke("GetGameTypeSelected").bits==4 && custom.config().players[3].team==0,"Custom source game type or force differs");ScriptSession flags(compile(source),info,{},9);flags.configure();require(flags.runtime().invoke("GetGameTypeSelected").bits==1,"Original selected game type mask differs");});
    test("session_unknown_native_prevents_configured_state",[]{ScriptSession session(compile("native Missing takes nothing returns nothing\nfunction config takes nothing returns nothing\ncall Missing()\nendfunction\n"),{});rejects([&]{session.configure();},"session.j:3:6: Unbound JASS native: Missing");require(!session.configured() && !session.initialized(),"Failed config was accepted");rejects([&]{session.configure();},"unconfigured instance");});
    test("session_rejects_mismatched_native_signature",[]{rejects([]{ScriptSession session(compile("native ConvertRace takes integer i returns integer\n"),{});},"Invalid session native signature: ConvertRace");});
    if(!failed){auto output=fs::absolute(argv[1]);fs::create_directories(output.parent_path());std::ofstream file(output,std::ios::binary);require(bool(file),"Cannot write enum fixture");file<<"{\"values\":[";bool first=true;for(auto value:values){if(!first)file<<',';first=false;file<<value;}file<<"],\"natives\":[";first=true;for(size_t i=0;i<converted.size();++i){if(!first)file<<',';first=false;auto entry=i<std::size(enums)?enums[i].entry:0x6f1e27a0u;file<<"{\"name\":\""<<converted[i].first<<"\",\"entry\":"<<entry<<",\"results\":[";bool next=false;for(auto bits:converted[i].second){if(next)file<<',';next=true;file<<bits;}file<<"]}";}file<<"]}\n";file.close();require(bool(file),"Cannot complete enum fixture");}
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into session tests");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
