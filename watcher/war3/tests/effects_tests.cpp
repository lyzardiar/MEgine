// Author: MiYu. Narrow CPU import checks for original pure PRE2 and mixed model effects; GPU stays in the stage queue.
#include "scene_assets.h"
#include "model.h"
#include "world.h"
#include "slk.h"
#include <bit>
#include <cmath>
#include <iostream>

using namespace war3;
int wmain(int argc,wchar_t** argv) {
    try {
        if(argc!=3 && argc!=4)throw std::runtime_error("Usage: war3_effects_tests <data-root> <log> [--ribbons|--autocast]");Archives archives(argv[1]);SceneAssets assets(archives);Log log(argv[2]);unsigned count=0;

        if(argc==4){
            if(!wcscmp(argv[3],L"--autocast")){auto& model=assets.model("UI\\Feedback\\Autocast\\UI-ModalButtonOn.mdl",log);if(model.particleEmitters()!=4 || model.particleLifetime()<=0)throw std::runtime_error("Original autocast PRE2 model was not consumed");if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll loaded");std::cout<<"PASS original autocast model: PRE2=4 GPU=pending\n";return 0;}
            if(wcscmp(argv[3],L"--ribbons"))throw std::runtime_error("Unknown effect import mode");
            for(auto path:{"Abilities\\Spells\\Undead\\DeathCoil\\DeathCoilMissile.mdl","Abilities\\Spells\\NightElf\\FanOfKnives\\FanOfKnivesCaster.mdl","Abilities\\Spells\\Undead\\FrostNova\\FrostNovaTarget.mdl"}){auto& model=assets.model(path,log);if(!model.ribbonEmitters() || model.particleLifetime()<=0 || model.radius()<=0)throw std::runtime_error("Source ribbon definition was not consumed");std::cout<<path<<" ribbons="<<model.ribbonEmitters()<<" life="<<model.particleLifetime()<<'\n';++count;}
            auto table=SourceTable::read(archives,"Splats\\LightningData.slk");for(auto type:{"CLPB","CLSB","HWPB","HWSB"}){bool found=false;for(auto& row:table.rows())if(row.at("Name")==type){auto& image=assets.image(row.at("Dir")+"\\"+row.at("file"));if(!image.width || !image.height || std::stof(row.at("AvgSegLen"))<=0 || std::stof(row.at("Width"))<=0)throw std::runtime_error("Invalid source lightning dimensions");found=true;}if(!found)throw std::runtime_error("Missing source lightning type");}
            auto real=[](float v){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(v));};MapData flat;flat.terrain.width=flat.terrain.height=2;flat.terrain.corners={{8192,0,0,0,2},{8448,0,0,0,2},{8704,0,0,0,2},{8960,0,0,0,2}};World heights(std::move(flat),{});if(std::abs(heights.height({real(64),real(64)})-96)>.001f || heights.height({real(0),real(0)})!=0 || heights.height({real(128),real(128)})!=192)throw std::runtime_error("Source height interpolation differs");MapData ramp;ramp.terrain.width=ramp.terrain.height=2;ramp.terrain.corners={{8192,0,0x10,0,2},{8192,0,0x10,0,3},{8192,0,0x10,0,2},{8192,0,0x10,0,2}};World incline(std::move(ramp),{});if(incline.height({real(64),real(64)})!=80)throw std::runtime_error("Source shared ramp surface differs");
            if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll loaded");std::cout<<"PASS source ribbon imports="<<count<<" lightning definitions/textures=4 height fixtures=2 GPU=pending\n";return 0;
        }
        for(auto path:{"Abilities\\Spells\\Undead\\CarrionSwarm\\CarrionSwarmDamage.mdl","Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl","Abilities\\Spells\\Human\\HolyBolt\\HolyBoltSpecialArt.mdl"}){auto& model=assets.model(path,log);if(!model.particleEmitters() || model.particleLifetime()<=0 || model.radius()<=0)throw std::runtime_error("Source PRE2 definition was not consumed");std::cout<<path<<" emitters="<<model.particleEmitters()<<" life="<<model.particleLifetime()<<" radius="<<model.radius()<<'\n';++count;}
        if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll loaded");std::cout<<"PASS source effect imports="<<count<<" pure_PRE2=2 mixed=1 GPU=pending\n";return 0;
    }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<'\n';return 1;}
}
