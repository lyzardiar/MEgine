// Author: MiYu. Exercise original DotA hero skills through its map script and live session state.
#include "session.h"
#include "setup.h"
#include "player_commands.h"
#include <bit>
#include <cmath>
#include <iostream>

using namespace war3;
namespace {
float number(jass::Real value){return std::bit_cast<float>(value.bits());}
jass::Real real(float value){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(value));}
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void expectNear(float value,float expected,const char* message){check(std::abs(value-expected)<.01f,message);}

void run(const wchar_t* root,const wchar_t* map,bool lina){
    Archives archives(root);archives.mountMap(map);auto world=World::read(archives);auto info=world->data().info;MapStrings strings;
    if(auto wts=archives.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(wts->bytes);
    ScriptSession session(jass::Module::compile(jass::Program::read(archives)),info,std::move(strings));session.attachWorld(std::move(world));session.audioMuted(true);session.audioSimulationClock();session.configure();PlayerSetup setup(info,session.config());session.applySetup(setup);session.startMain();session.advance(1);
    auto player=session.localPlayer().value_or(0);session.chat(player,"-ap");for(int i=0;i<240;++i)session.advance(.25);
    auto heroType=ObjectData::code(lina?"H004":"Usyl");std::uint32_t tavern=0;
    for(auto& [id,unit]:session.units())for(auto& entry:unit->stock)if(entry.type==heroType && entry.current>0)tavern=id;
    check(tavern!=0,"hero tavern unavailable");PlayerCommand command;command.player=player;command.kind=PlayerCommandKind::PurchaseUnit;command.units={tavern};command.objectType=heroType;check(dispatchPlayerCommand(session,command)!=0,"hero purchase rejected");
    std::shared_ptr<UnitState> hero;for(int i=0;i<20;++i){session.advance(.25);for(auto& [id,unit]:session.units())if(unit->hero && unit->owner==player && unit->type==heroType && !unit->removing)hero=unit;}
    check(bool(hero),"purchased hero missing");auto& vm=session.runtime();auto call=[&](const char* name,std::initializer_list<jass::Value> args){return vm.invoke(name,{args.begin(),args.size()});};auto self=vm.handle("unit",hero->handle);
    call("SetHeroLevel",{self,vm.integer(10),vm.boolean(false)});call("SetUnitPosition",{self,vm.real(real(0)),vm.real(real(0))});hero->mana=hero->maxMana=real(2000);hero->acquireRange={};
    auto enemy=player==0?1u:0u;auto target=call("CreateUnit",{vm.handle("player",0x100000+enemy),vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(200)),vm.real(real(0)),vm.real(real(0))});auto victim=session.units().at(target.bits);victim->healthRegen=0;victim->regenType="none";victim->life=victim->maxLife=real(5000);victim->paused=true;
    for(auto& [id,unit]:session.units())if(id!=hero->handle)unit->paused=true;call("FogEnable",{vm.boolean(false)});call("FogMaskEnable",{vm.boolean(false)});
    for(auto [a,b]:{std::pair{player,enemy},std::pair{enemy,player}})call("SetPlayerAlliance",{vm.handle("player",0x100000+a),vm.handle("player",0x100000+b),vm.handle("alliancetype",0),vm.boolean(false)});
    auto learn=[&](const char* name){auto ability=ObjectData::code(name);call("SelectHeroSkill",{self,vm.integer(int(ability))});check(hero->abilities.contains(ability),"hero skill learn failed");return ability;};
    auto damage=[&](std::uint32_t ability,bool point,float amount){call("UnitResetCooldown",{self});auto before=number(victim->life);bool accepted=point?session.castSpellAt(hero->handle,ability,{victim->x,victim->y}):session.castSpell(hero->handle,ability,target.bits);check(accepted,"hero spell rejected");for(int i=0;i<20;++i)session.advance(.25);expectNear(before-number(victim->life),amount,"unexpected target damage");};
    if(lina){
        auto dragon=learn("A01F"),light=learn("A027"),ultimate=learn("A01P");damage(dragon,true,110);damage(light,true,120);damage(ultimate,false,450);
        auto passive=learn("A18X");check(hero->abilities.at(passive)==1,"Fiery Soul level mismatch");auto initial=session.unitCombatDisplay(hero->handle);check(bool(initial),"hero combat state missing");auto period=initial->weapons[0].period,move=hero->spellMoveFactor();
        for(int stack=1;stack<=3;++stack){call("UnitResetCooldown",{self});check(session.castSpellAt(hero->handle,dragon,{victim->x,victim->y}),"repeat cast rejected");for(int i=0;i<4;++i)session.advance(.25);auto display=session.unitCombatDisplay(hero->handle);check(display && display->weapons[0].period<period && hero->spellMoveFactor()>move,"Fiery Soul stack missing");period=display->weapons[0].period;move=hero->spellMoveFactor();}
        for(int i=0;i<80;++i)session.advance(.25);auto expired=session.unitCombatDisplay(hero->handle);check(bool(expired),"hero combat state missing after expiry");expectNear(expired->weapons[0].period,initial->weapons[0].period,"Fiery Soul attack bonus did not expire");expectNear(hero->spellMoveFactor(),1,"Fiery Soul movement bonus did not expire");
    }else{
        auto rangeAbility=ObjectData::code("A03U");for(int level=1;level<=4;++level){learn("A03U");check(hero->abilities.at(rangeAbility)==level,"Take Aim level mismatch");auto display=session.unitCombatDisplay(hero->handle);check(bool(display),"hero combat state missing");expectNear(display->weapons[0].range,550.f+100.f*level,"Take Aim range mismatch");}
        damage(learn("A04P"),false,355);
    }
    check(!GetModuleHandleW(L"Game.dll"),"original Game.dll loaded");
}
}
int wmain(int argc,wchar_t** argv){try{if(argc!=3){std::cerr<<"usage: war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>\n";return 2;}run(argv[1],argv[2],true);std::cout<<"PASS Lina\n";run(argv[1],argv[2],false);std::cout<<"PASS Sniper\n";return 0;}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}}
