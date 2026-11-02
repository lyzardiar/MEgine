// Author: MiYu. Recognize and start the embedded 2SAJ map loader without executing native plugins.
#include "map_script_runtime.h"
#include "session.h"
#include "archive.h"
#include <algorithm>
#include <stdexcept>

namespace war3 {
std::unique_ptr<MapScriptRuntime> MapScriptRuntime::create(ScriptSession& session){
    if(!session.world() || !session.configured() || session.mainStarted())throw std::runtime_error("Map runtime requires a configured session");auto& archives=session.world()->resources();auto loader=archives.readCandidates({"callback"},ArchiveScope::Map);auto raw=archives.readCandidates({"war3map.bin"},ArchiveScope::Map);if(!loader || !raw || raw->bytes.size()<4 || !std::equal(raw->bytes.begin(),raw->bytes.begin()+4,"2SAJ"))return {};std::string_view source(reinterpret_cast<const char*>(loader->bytes.data()),loader->bytes.size());if(source.find("newUnlockMemory")==source.npos || source.find("ExportFileFromMpq")==source.npos)return {};if(!session.localPlayer())throw std::runtime_error("Binary map runtime requires a local player");auto program=std::make_shared<const JassBinaryProgram>(readJass2Binary(decodeJass2Binary(raw->bytes)));auto index=indexJass2Binary(*program);std::string initializer;for(auto& [name,bounds]:index.functions)if(name.starts_with("MainInitGlobalsFunction____")){if(!initializer.empty())throw std::runtime_error("Ambiguous 2SAJ map initializer");initializer=name;}if(initializer.empty() || !index.functions.contains("main"))throw std::runtime_error("Missing 2SAJ map entry or initializer");return std::unique_ptr<MapScriptRuntime>(new MapScriptRuntime(session,std::move(program),initializer));
}
MapScriptRuntime::MapScriptRuntime(ScriptSession& session,std::shared_ptr<const JassBinaryProgram> program,const std::string& initializer):session_(session),binary_(std::make_shared<JassBinarySession>(session.runtime(),std::move(program),initializer)){
    requiresLuaEntry_=std::any_of(binary_->program().symbols.begin(),binary_->program().symbols.end(),[](const std::string& value){return value.starts_with("exec-lua:");});auto& archives=session.world()->resources();lua_.attachConsole({[this]{return console_.enabled();},[this](bool value){console_.setEnabled(value);},[this](std::string_view value){console_.write(value);},[this]{return console_.read();}});lua_.attachJass(session.runtime(),binary_);lua_.attachJapi(session);if(!session.networkPlayerSlot(*session.localPlayer()))localSync_=std::make_unique<LuaLocalSync>(lua_,session);lua_.attachArchive(archives,LuaChunkFormat::MapOpcodes);lua_.attachStormArchiveOverlay(archives);lua_.attachBinaryExecuteScript(100000000);lua_.attachMapEntryHook(100000000);
}
MapScriptRuntime::~MapScriptRuntime(){if(started_)session_.runtime().cancelThreads();}
void MapScriptRuntime::pump(){if(localSync_)localSync_->pump();}
void MapScriptRuntime::start(){if(started_)throw std::runtime_error("Binary map runtime already started");started_=true;session_.startMain([this]{auto result=binary_->run("main");if(result.type)throw std::runtime_error("Binary map main returned a value");if(requiresLuaEntry_ && !lua_.mapEntryExecuted())throw std::runtime_error("Binary map main did not initialize its Lua entry");});}
}
