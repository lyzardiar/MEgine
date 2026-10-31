// Author: MiYu. Exercise rectangle movement using live and invalid script handles.
#include "session.h"
#include <iostream>

using namespace war3;
int wmain(int argc,wchar_t** argv){
    try{
        if(argc!=3)throw std::runtime_error("Usage: war3_spatial_handle_tests <data-root> <map>");
        Archives archives(argv[1]);archives.mountMap(argv[2]);auto world=World::read(archives);auto info=world->data().info;
        ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info);session.attachWorld(std::move(world));session.audioMuted(true);session.configure();auto& vm=session.runtime();
        auto call=[&](const char* name,std::initializer_list<jass::Value> args){return vm.invoke(name,{args.begin(),args.size()});};auto real=[&](int value){return vm.real(jass::Real::fromInteger(value));};auto require=[](bool condition,const char* message){if(!condition)throw std::runtime_error(message);};
        auto rect=call("Rect",{real(-10),real(-20),real(10),real(20)}),loc=call("Location",{real(100),real(50)}),nullRect=vm.handle("rect",0),nullLoc=vm.handle("location",0);
        call("MoveRectToLoc",{rect,nullLoc});call("MoveRectToLoc",{rect,vm.handle("location",rect.bits)});require(!call("GetRectCenterX",{rect}).bits && !call("GetRectCenterY",{rect}).bits,"Invalid location changed rectangle");call("MoveRectToLoc",{nullRect,loc});call("MoveRectToLoc",{vm.handle("rect",loc.bits),loc});call("MoveRectToLoc",{rect,loc});require(call("GetRectCenterX",{rect}).bits==real(100).bits && call("GetRectCenterY",{rect}).bits==real(50).bits,"Valid location did not move rectangle");
        call("RemoveLocation",{loc});call("MoveRectToLoc",{rect,loc});require(call("GetRectCenterX",{rect}).bits==real(100).bits && call("GetRectCenterY",{rect}).bits==real(50).bits,"Destroyed location changed rectangle");auto other=call("Location",{real(50),real(50)});call("RemoveRect",{rect});call("MoveRectToLoc",{rect,other});
        require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");std::cout<<"PASS rectangle movement and invalid handles\nRESULT passed=1 failed=0 game_dll_loaded=false\n";return 0;
    }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<'\n';return 1;}
}
