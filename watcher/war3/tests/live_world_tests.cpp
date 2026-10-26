// Author: MiYu. Narrow source-map integration for delayed entities, region/item events, fog and typed storage.
#include "session.h"
#include "setup.h"
#include "scene_streaming.h"
#include "model.h"
#include <iostream>
#include <bit>
#include <cmath>

using namespace war3;
int wmain(int argc,wchar_t** argv) {
    try {
        if(argc!=4)throw std::runtime_error("Usage: war3_live_world_tests <data-root> <generated-map> <log>");
        Archives archives(argv[1]);archives.mountMap(argv[2]);auto world=World::read(archives);auto info=world->data().info;MapStrings strings;if(auto member=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(member->bytes);
        ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info,std::move(strings));session.attachWorld(std::move(world));session.audioMuted(true);session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();auto before=session.units().size();session.advance(1.125);
        if(session.runtime().global("native_probe_stage").bits!=2 || session.units().size()!=before+1)throw std::runtime_error("Delayed original-map probe did not finish");auto handle=session.runtime().global("native_probe_unit").bits;auto& unit=*session.units().at(handle);if(unit.color!=1u || unit.tint[3]!=128 || std::abs(unit.visualScale[0]-.8f)>.00001f || unit.flyHeight<=0 || !unit.inventory[0])throw std::runtime_error("Unit presentation/inventory state not consumed: color="+std::to_string(unit.color.value_or(99))+" alpha="+std::to_string(unit.tint[3])+" scale="+std::to_string(unit.visualScale[0])+" height="+std::to_string(unit.flyHeight)+" item="+std::to_string(unit.inventory[0]));if(!session.audio() || session.audio()->voices()!=0 || session.audio()->banks()!=0)throw std::runtime_error("Muted map unexpectedly opened audio output");
        Log log(argv[3]);SceneAssets assets(session.world()->resources());SceneStreaming stream(session.world()->resources(),log);stream.request({unit.model},{unit.icon},{});auto deadline=GetTickCount64()+10000;std::optional<StreamedScene> result;while(GetTickCount64()<deadline && !result){result=stream.poll();if(!result)Sleep(10);}if(!result || !result->error.empty() || !result->assets)throw std::runtime_error(result?result->error:"Streaming result timed out");assets.adopt(*result->assets);if(assets.uploadCount()==0 || assets.model(unit.model,log).radius()<=0 || assets.cachedModel(unit.model))throw std::runtime_error("CPU streaming upload boundary differs");if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll was loaded");
        std::cout<<"PASS live source-map consumers: delayed unit, inventory/events, region, fog, storage, silent audio, CPU streaming; GPU upload pending stage verification\n";return 0;
    }catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}
}
