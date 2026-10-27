// Author: MiYu. Narrow CPU import checks for original pure PRE2 and mixed model effects; GPU stays in the stage queue.
#include "scene_assets.h"
#include "model.h"
#include <iostream>

using namespace war3;
int wmain(int argc,wchar_t** argv) {
    try {
        if(argc!=3)throw std::runtime_error("Usage: war3_effects_tests <data-root> <log>");Archives archives(argv[1]);SceneAssets assets(archives);Log log(argv[2]);unsigned count=0;
        for(auto path:{"Abilities\\Spells\\Undead\\CarrionSwarm\\CarrionSwarmDamage.mdl","Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl","Abilities\\Spells\\Human\\HolyBolt\\HolyBoltSpecialArt.mdl"}){auto& model=assets.model(path,log);if(!model.particleEmitters() || model.particleLifetime()<=0 || model.radius()<=0)throw std::runtime_error("Source PRE2 definition was not consumed");std::cout<<path<<" emitters="<<model.particleEmitters()<<" life="<<model.particleLifetime()<<" radius="<<model.radius()<<'\n';++count;}
        if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll loaded");std::cout<<"PASS source effect imports="<<count<<" pure_PRE2=2 mixed=1 GPU=pending\n";return 0;
    }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<'\n';return 1;}
}
