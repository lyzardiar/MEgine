// Author: MiYu. Exercise the original map script from hero purchase through souls, casting, death and revival.
#include "session.h"
#include "setup.h"
#include "player_commands.h"
#include <iostream>
#include <bit>
#include <cmath>
using namespace war3;
float num(jass::Real r){return std::bit_cast<float>(r.bits());}
jass::Real real(float f){return jass::Real::fromBits(std::bit_cast<std::uint32_t>(f));}

int wmain(int c,wchar_t**argv){
    try{
        if(c!=3)throw std::runtime_error("Usage: war3_dota_soul_tests <data-root> <dota-map>");Archives a(argv[1]);a.mountMap(argv[2]);
        auto w=World::read(a);
        auto info=w->data().info;MapStrings strings;
        if(auto x=a.readCandidates({"war3map.wts"},ArchiveScope::Map))strings=mapStrings(x->bytes);
        ScriptSession s(jass::Module::compile(jass::Program::read(a)),info,std::move(strings));s.attachWorld(std::move(w));s.audioMuted(true);s.audioSimulationClock();s.configure();PlayerSetup setup(info,s.config());s.applySetup(setup);s.startMain();
        s.advance(1);
        auto local=s.localPlayer().value_or(0);s.chat(local,"-ap");
        for(int k=0;k<240;++k)s.advance(.25);std::uint32_t shop=0;
        for(auto&[id,u]:s.units())for(auto& entry:u->stock)if(entry.type==ObjectData::code("Nfir") && entry.current>0)shop=id;
        if(!shop)throw std::runtime_error("hero tavern unavailable");PlayerCommand cmd;cmd.player=local;cmd.kind=PlayerCommandKind::PurchaseUnit;cmd.units={shop};cmd.objectType=ObjectData::code("Nfir");
        if(!dispatchPlayerCommand(s,cmd))throw std::runtime_error("hero purchase rejected");std::shared_ptr<UnitState> hero;
        for(int k=0;k<20;++k){s.advance(.25);for(auto&[id,u]:s.units())if(u->hero && u->owner==local && u->type==ObjectData::code("Nfir") && !u->removing)hero=u;}
        if(!hero)throw std::runtime_error("purchased hero missing");
        auto buttons=s.abilityCommands(hero->handle,local,true);
        std::cout<<"learning buttons="<<buttons.size()<<"\n";
        std::cout<<"purchase hero="<<hero->handle<<" hp="<<num(hero->life)<<" max="<<num(hero->maxLife)<<"\n";auto& vm=s.runtime();
        auto call=[&](const char* n,std::initializer_list<jass::Value> a){return vm.invoke(n,{a.begin(),a.size()});};
        auto hu=vm.handle("unit",hero->handle);call("SetHeroLevel",{hu,vm.integer(10),vm.boolean(false)});
        auto passive=ObjectData::code("A0BR");call("SelectHeroSkill",{hu,vm.integer(int(passive))});
        if(!hero->abilities.contains(passive))throw std::runtime_error("necromastery learn failed");
        auto ability=ObjectData::code("A29J");call("SelectHeroSkill",{hu,vm.integer(int(ability))});
        if(!hero->abilities.contains(ability))throw std::runtime_error("requiem learn failed");call("SetUnitPosition",{hu,vm.real(real(0)),vm.real(real(0))});hero->mana=hero->maxMana=real(2000);hero->acquireRange={};
        auto target=call("CreateUnit",{vm.handle("player",0x100000+(local==0?1:0)),vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(200)),vm.real(real(0)),vm.real(real(0))});
        auto v=s.units().at(target.bits);v->healthRegen=0;v->life=v->maxLife=real(5000);v->paused=true;
        for(auto&[id,u]:s.units())if(id!=hero->handle)u->paused=true;call("FogEnable",{vm.boolean(false)});call("FogMaskEnable",{vm.boolean(false)});
        auto enemy=vm.handle("player",0x100000+(local==0?1:0)),owner=vm.handle("player",0x100000+local);call("SetPlayerAlliance",{owner,enemy,vm.handle("alliancetype",0),vm.boolean(false)});call("SetPlayerAlliance",{enemy,owner,vm.handle("alliancetype",0),vm.boolean(false)});
        auto initialLevel=call("GetUnitAbilityLevel",{hu,vm.integer(int(ObjectData::code("A0CQ")))}).bits;
        auto initialCombat=s.unitCombatDisplay(hero->handle);
        for(int i=0;i<5;++i){
            auto sacrifice=call("CreateUnit",{enemy,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(100)),vm.real(real(0)),vm.real(real(0))});
            auto dead=s.units().at(sacrifice.bits);dead->life=real(25);dead->healthRegen=0;dead->paused=true;
            if(!s.attackUnit(hero->handle,sacrifice.bits))throw std::runtime_error("soul attack rejected");
            for(int k=0;k<40 && num(dead->life)>0;++k)s.advance(.25);
            if(num(dead->life)>0)throw std::runtime_error("soul victim survived");hero->paused=true;s.advance(1);hero->paused=false;
        }
        s.advance(2);
        auto gained=call("GetUnitAbilityLevel",{hu,vm.integer(int(ObjectData::code("A0CQ")))}).bits;
        auto souls=call("LoadInteger",{vm.global("LY"),call("GetHandleId",{hu}),vm.integer(710)}).bits;
        auto boosted=s.unitCombatDisplay(hero->handle);
        std::cout<<"soul level="<<initialLevel<<" -> "<<gained<<" count="<<souls<<" damage="<<(initialCombat?initialCombat->weapons[0].bonus:0)<<" -> "<<(boosted?boosted->weapons[0].bonus:0)<<"\n";
        if(gained<6 || souls<6 || !initialCombat || !boosted || boosted->weapons[0].bonus<=initialCombat->weapons[0].bonus)throw std::runtime_error("soul gain or attack bonus missing");
        auto buttons2=s.abilityCommands(hero->handle,local);bool enabled=false;
        for(auto& button:buttons2)if(button.type==ability)enabled=button.enabled;
        auto& spec=s.spellInfo(ability,1);
        std::cout<<"button="<<enabled<<" order="<<spec.order<<" cast="<<spec.castDelay<<" mana="<<num(hero->mana)<<"\n";
        if(!enabled || !s.castImmediateOrder(hero->handle,spec.order))throw std::runtime_error("requiem command rejected");
        s.advance(.5);
        std::cout<<"halfsecond hp="<<num(v->life)<<" mana="<<num(hero->mana)<<"\n";
        if(num(v->life)!=5000)throw std::runtime_error("requiem effect before cast time");
        s.advance(4);
        std::cout<<"target life="<<num(v->life)<<" mana="<<num(hero->mana)<<" cooldown="<<s.spellCooldown(hero->handle,ability)<<"\n";
        if(num(v->life)>=5000 || s.spellCooldown(hero->handle,ability)<=0)throw std::runtime_error("requiem damage or cooldown missing");
        auto beforeDeathLife=num(v->life);
        auto killer=call("CreateUnit",{enemy,vm.integer(int(ObjectData::code("hfoo"))),vm.real(real(100)),vm.real(real(0)),vm.real(real(0))});
        if(!call("UnitDamageTarget",{killer,hu,vm.real(real(10000)),vm.boolean(true),vm.boolean(false),vm.handle("attacktype",5),vm.handle("damagetype",26),vm.handle("weapontype",0)}).bits)throw std::runtime_error("hero kill rejected");
        s.advance(2);
        auto retained=call("LoadInteger",{vm.global("LY"),call("GetHandleId",{hu}),vm.integer(710)}).bits;
        auto afterLevel=call("GetUnitAbilityLevel",{hu,vm.integer(int(ObjectData::code("A0CQ")))}).bits;
        std::cout<<"death life="<<num(hero->life)<<" souls="<<retained<<" ability="<<afterLevel<<" death_target="<<beforeDeathLife<<" -> "<<num(v->life)<<"\n";
        if(num(hero->life)>0 || retained>=souls || afterLevel!=retained || num(v->life)>=beforeDeathLife)throw std::runtime_error("death soul reduction missing");
        if(!call("ReviveHero",{hu,vm.real(real(0)),vm.real(real(0)),vm.boolean(false)}).bits)throw std::runtime_error("hero revive rejected");
        auto revived=s.unitCombatDisplay(hero->handle);
        std::cout<<"revived life="<<num(hero->life)<<" soul level="<<call("GetUnitAbilityLevel",{hu,vm.integer(int(ObjectData::code("A0CQ")))}).bits<<" bonus="<<(revived?revived->weapons[0].bonus:0)<<"\n";
        if(num(hero->life)<=0 || !revived || revived->weapons[0].bonus!=float((retained-1)*2))throw std::runtime_error("soul bonus not preserved on revive");
        if(GetModuleHandleW(L"Game.dll"))throw std::runtime_error("Game.dll loaded");
        std::cout<<"PASS DotA soul gain, Requiem, death and revival\nRESULT passed=1 failed=0 game_dll_loaded=false\n";return 0;
    }catch(const std::exception&e){std::cerr<<"FAIL "<<e.what()<<"\n";return 1;}
}
