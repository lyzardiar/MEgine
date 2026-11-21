// Author: MiYu. Apply and verify real player commands in a three-process LAN match.
#include "lan_long_match.h"
#include "replay_writer.h"
#include "session.h"
#include <bit>
#include <chrono>
#include <fstream>
#include <iostream>
#include <thread>

using namespace war3;
namespace {
constexpr unsigned slots=22500,intervalMs=32,trainingInterval=3600;
void require(bool condition,std::string_view error){if(!condition)throw std::runtime_error(std::string(error));}

std::uint64_t actionDigest(const LanTimeSlot& slot){
    std::uint64_t digest=14695981039346656037ull;
    auto byte=[&](std::uint8_t value){digest=(digest^value)*1099511628211ull;};
    for(const auto& action:slot.actions){
        byte(action.playerId);
        byte(std::uint8_t(action.bytes.size()));
        byte(std::uint8_t(action.bytes.size()>>8));
        for(auto value:action.bytes)byte(value);
    }
    return digest;
}

void verifyReplay(const ReplayWriter& writer,const std::vector<LanTimeSlot>& applied,const std::filesystem::path& path){
    auto bytes=writer.serialize();
    std::ofstream out(path,std::ios::binary);
    out.write(reinterpret_cast<const char*>(bytes.data()),std::streamsize(bytes.size()));
    out.close();
    require(bool(out),"Could not publish the host replay");
    auto replay=Replay::read(path);
    require(replay.header().durationMs==slots*intervalMs && replay.game().playerCount==3,"Incorrect replay metadata");
    std::size_t index=0;
    for(const auto& record:replay.records()){
        if(record.kind!=ReplayRecordKind::TimeSlot)continue;
        require(!record.fragment && index<applied.size(),"Unexpected replay slot");
        const auto& seen=applied[index++];
        require(record.slot.elapsedMs==seen.elapsedMs && record.slot.actions.size()==seen.actions.size(),"Replay slot differs from the applied event sequence");
        for(std::size_t i=0;i<seen.actions.size();++i){
            const auto& expected=seen.actions[i];
            const auto& action=record.slot.actions[i];
            require(action.playerId==expected.playerId && action.bytes==expected.bytes,"Replay action bytes or order differ from the applied slot");
        }
    }
    require(index==applied.size(),"Host replay ended before the match");
    std::cout<<"REPLAY slots="<<index<<" bytes="<<bytes.size()<<" duration_ms="<<replay.header().durationMs<<"\n";
}
}

void runLanLongMatch(LanHost* host,LanJoin* peer,ScriptSession& session,LanLocalIdentity& identity,const LanSessionSetup& setup,std::string_view mapPath,const std::filesystem::path& replayPath){
    auto& vm=session.runtime();
    const auto owner=session.networkPlayer(setup.localPeerId).value();
    const auto actor=vm.global(owner==0?"builder":owner==1?"barracks":"captain").bits;
    const auto captain=vm.global("captain").bits,escort=vm.global("escort").bits,potion=vm.global("potion").bits;
    require(owner<3 && session.units().contains(actor) && session.units().contains(escort) && session.items().contains(potion),"Long match fixture actors unavailable");
    auto captainLife=std::bit_cast<float>(session.units().at(captain)->life.bits());
    auto escortLife=std::bit_cast<float>(session.units().at(escort)->life.bits());
    bool potionHealed=false,spellHealed=false;
    auto tick=[&]{if(host)host->poll();else peer->poll();};
    auto wait=[&](auto ready,std::string_view error){
        const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(12);
        while(!ready()){
            tick();
            if(host && host->checksumMismatch())throw std::runtime_error("Host detected a state checksum mismatch");
            require(std::chrono::steady_clock::now()<deadline,error);
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    };
    auto send=[&](std::span<const std::uint8_t> bytes){require(host?host->submitHostAction(bytes):peer->sendAction(bytes),"Player action could not be queued");};
    auto issue=[&](PlayerCommand command){
        command.player=owner;
        command.units={actor};
        const auto fields=identity.fields(command);
        require(bool(fields),"Unsupported player command fields");
        send(encodeLanPlayerCommand(session,setup.localPeerId,command,*fields,[&](auto id){return identity.wire(id);},true));
    };
    LanSimulation simulation(session,[&](LanObjectId id){return identity.resolve(id);},true);
    std::optional<ReplayWriter> writer;
    std::vector<LanTimeSlot> applied;
    if(host){
        ReplayGame game;
        game.name="Quartermaster Trial";
        game.mapPath=mapPath;
        game.hostName="Host";
        game.host={1,"Host"};
        game.playerCount=3;
        game.width=20;
        game.height=20;
        writer.emplace(ReplayHeader{27,0x50583357u,0,52240,false},game,std::vector<ReplayPlayer>{{2,"Peer"},{3,"Guest"}},ReplaySetup{setup.slots,setup.randomSeed,0,3});
        applied.reserve(slots);
    }
    const auto selection=identity.wire(actor);
    require(bool(selection),"No LAN object identity for actor");
    const std::array<LanDecodedAction,1> select{LanActionSelection{1,{*selection}}};
    send(encodeLanActions(select,true));
    unsigned commands=0,actionSlots=0,mixedSlots=0,actionCount=0;
    for(unsigned frame=0;frame<slots;++frame){
        if(session.playerSelection(owner).contains(actor)){
            PlayerCommand command;
            if(owner==0 && commands==0){
                command.kind=PlayerCommandKind::BuildAt;
                command.objectType=ObjectData::code("hhou");
                command.xBits=std::bit_cast<std::uint32_t>(704.f);
                command.yBits=std::bit_cast<std::uint32_t>(640.f);
                issue(command);
                ++commands;
            }else if(owner==1 && commands<6 && frame>=commands*trainingInterval){
                command.kind=PlayerCommandKind::Train;
                command.objectType=ObjectData::code("hfoo");
                issue(command);
                ++commands;
            }else if(owner==2){
                if(commands==0){
                    command.kind=PlayerCommandKind::SpellUnit;
                    command.ability=ObjectData::code("AHhb");
                    command.target=escort;
                    issue(command);
                    ++commands;
                }else if(commands==1 && vm.global("casts").bits==1 && frame>=100){
                    command.kind=PlayerCommandKind::ItemImmediate;
                    command.item=potion;
                    issue(command);
                    ++commands;
                }else if(commands==2 && frame>=slots-288){
                    command.kind=PlayerCommandKind::GroundMove;
                    command.xBits=std::bit_cast<std::uint32_t>(1344.f);
                    command.yBits=std::bit_cast<std::uint32_t>(1792.f);
                    issue(command);
                    ++commands;
                }
            }
        }
        if(host){
            tick();
            if(frame<2){
                const auto until=std::chrono::steady_clock::now()+std::chrono::milliseconds(350);
                while(std::chrono::steady_clock::now()<until){tick();std::this_thread::sleep_for(std::chrono::milliseconds(1));}
            }
            wait([&]{return host->emitTimeSlot(intervalMs);},"Could not emit long match slot");
        }
        std::optional<LanTimeSlot> slot;
        wait([&]{slot=host?host->takeTimeSlot():peer->takeTimeSlot();return bool(slot);},"Long match slot missing");
        const auto step=simulation.consume(frame+1,*slot);
        require(step==LanStepResult::Applied,simulation.error());
        const auto newCaptainLife=std::bit_cast<float>(session.units().at(captain)->life.bits());
        const auto newEscortLife=std::bit_cast<float>(session.units().at(escort)->life.bits());
        potionHealed|=newCaptainLife-captainLife>100.f;
        spellHealed|=newEscortLife-escortLife>100.f;
        captainLife=newCaptainLife;
        escortLife=newEscortLife;
        const auto checksum=session.localNetworkChecksum();
        require(host?host->submitHostChecksum(checksum):peer->sendChecksum(checksum),"Long match checksum could not be queued");
        if(!slot->actions.empty()){
            ++actionSlots;
            actionCount+=unsigned(slot->actions.size());
            if(std::any_of(slot->actions.begin()+1,slot->actions.end(),[&](const auto& a){return a.playerId!=slot->actions.front().playerId;}))++mixedSlots;
        }
        tick();
        require(!host || !host->checksumMismatch(),"Long match state checksum differs");
        std::cout<<"FRAME "<<frame<<" sum="<<checksum<<" actions="<<slot->actions.size()<<" digest="<<actionDigest(*slot)<<"\n";
        if(writer){writer->appendTimeSlot(*slot);applied.push_back(std::move(*slot));}
    }
    const auto buildings=vm.global("buildings").bits,recruits=vm.global("recruits").bits,casts=vm.global("casts").bits,items=vm.global("itemsUsed").bits,wins=vm.global("wins").bits,winner=vm.global("winner").bits;
    std::cout<<"MATCH buildings="<<buildings<<" recruits="<<recruits<<" spells="<<casts<<" items="<<items<<" win_events="<<wins<<" winner="<<winner<<" action_slots="<<actionSlots<<" mixed_slots="<<mixedSlots<<" actions="<<actionCount<<"\n";
    require(commands==(owner==0?1u:owner==1?6u:3u),"Player input did not reach the scheduled command count");
    require(buildings==1 && recruits==6 && casts==1 && items==1 && wins==1 && winner==2,"Long match gameplay or victory events differ");
    require(potionHealed && spellHealed,"Item or spell did not heal its target");
    require(session.units().at(captain)->inventory[0]==0,"Potion was not consumed");
    require(session.results()[0]==1 && session.results()[1]==1 && session.results()[2]==0 && session.takeNetworkLocalEnd()==true,"Long match did not request score settlement");
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded");
    if(writer)verifyReplay(*writer,applied,replayPath);
    const auto end=std::chrono::steady_clock::now()+std::chrono::milliseconds(host?600:250);
    while(std::chrono::steady_clock::now()<end){tick();require(!host || !host->checksumMismatch(),"Late long match state checksum differs");std::this_thread::sleep_for(std::chrono::milliseconds(1));}
    std::cout<<"PASS long_match slots="<<slots<<" simulated_ms="<<simulation.elapsedMilliseconds()<<" peer="<<unsigned(setup.localPeerId)<<"\n";
}
