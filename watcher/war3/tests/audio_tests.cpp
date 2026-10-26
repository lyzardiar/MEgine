// Author: MiYu. Real Miles MP3, PCM and original MIDI/DLS playback at zero output volume.
#include "audio.h"
#include <cstring>
#include <functional>
#include <future>
#include <iostream>

using namespace war3;
namespace {
void require(bool value,const char* message) {if(!value)throw std::runtime_error(message);}
template<class F> void rejects(F run) {try{run();}catch(const std::exception&){return;}throw std::runtime_error("Invalid audio input accepted");}
std::shared_ptr<const Member> pcm() {
    auto value=std::make_shared<Member>();value->source="authored 1-second silent PCM fixture";value->bytes.resize(44+88200);auto& b=value->bytes;auto u32=[&](unsigned at,unsigned n){for(unsigned i=0;i<4;++i)b[at+i]=std::uint8_t(n>>(i*8));};auto u16=[&](unsigned at,unsigned n){b[at]=std::uint8_t(n);b[at+1]=std::uint8_t(n>>8);};std::memcpy(b.data(),"RIFF",4);u32(4,unsigned(b.size()-8));std::memcpy(b.data()+8,"WAVEfmt ",8);u32(16,16);u16(20,1);u16(22,1);u32(24,44100);u32(28,88200);u16(32,2);u16(34,16);std::memcpy(b.data()+36,"data",4);u32(40,88200);return value;
}
void advances(AudioVoice& voice) {auto deadline=GetTickCount64()+2000;while(!voice.milliseconds().first && GetTickCount64()<deadline)Sleep(20);auto [current,total]=voice.milliseconds();require(current>0 && total>0,"Miles playback did not advance");}
}
int wmain(int argc,wchar_t** argv) {
    std::cout<<std::unitbuf;if(argc!=2){std::cerr<<"Usage: war3_audio_tests <data-root>\n";return 2;}
    unsigned passed=0,failed=0;auto test=[&](const char* name,const std::function<void()>& run){try{run();++passed;std::cout<<"PASS "<<name<<'\n';}catch(const std::exception& e){++failed;std::cout<<"FAIL "<<name<<": "<<e.what()<<'\n';}};
    try {
        Archives archives(argv[1]);auto menu=archives.read("Sound\\Music\\mp3Music\\War3XMainScreen.mp3"),day=archives.read("Sound\\Ambient\\LordaeronSummer\\LordaeronSummerDay.mid"),night=archives.read("Sound\\Ambient\\LordaeronSummer\\LordaeronSummerNight.mid"),bank=archives.read("Sound\\Ambient\\LordaeronSummer\\LordaeronSummer.dls");require(menu && day && night && bank,"Original audio members missing");auto device=MilesDevice::open(argv[1]);
        test("audio_shared_device_idle_state",[&]{require(MilesDevice::open(argv[1])==device && device->voices()==0 && device->banks()==0,"Miles device ownership not shared");});
        test("audio_pcm_play_pause_resume_seek_stop",[&]{auto voice=device->digital(pcm(),".wav");voice->volume(0);voice->start(true);require(voice->status()&4,"PCM voice not playing");advances(*voice);require(voice->milliseconds().second==1000,"PCM duration differs");voice->pause();require(!(voice->status()&4),"PCM pause failed");voice->position(500);require(voice->milliseconds().first>=490 && voice->milliseconds().first<=510,"PCM seek differs");voice->resume();require(voice->status()&4,"PCM resume failed");voice->stop();require(!(voice->status()&4),"PCM end failed");});
        test("audio_original_mp3_and_menu_device",[&]{auto voice=device->digital(menu,".mp3");voice->volume(0);voice->start(true);require(voice->status()&4,"Original MP3 voice not playing");advances(*voice);require(voice->milliseconds().second>1000,"MP3 duration unavailable");{Music legacy(argv[1],menu,0);require(device->voices()==2,"Menu music used another digital device");}require(device->voices()==1 && (voice->status()&4),"Menu music shutdown invalidated existing voice");});
        test("audio_original_midi_dls_bank_and_controls",[&]{std::cout<<"STAGE MIDI/DLS create\n";auto first=device->midi(day,bank),second=device->midi(night,bank);require(device->voices()==2 && device->banks()==1,"DLS bank was not shared");first->volume(0);second->volume(0);first->start(true);require(first->status()&4,"MIDI sequence not playing");advances(*first);first->pause();require(!(first->status()&4),"MIDI pause failed");first->position(500);first->resume();require(first->status()&4,"MIDI resume failed");first->stop();require(!(first->status()&4),"MIDI end failed");first.reset();require(device->voices()==1 && device->banks()==1,"DLS bank released while another sequence remained");second.reset();require(device->voices()==0 && device->banks()==0,"MIDI/DLS resources remained after release");});
        test("audio_invalid_input_preserves_device",[&]{auto empty=std::make_shared<Member>();rejects([&]{device->digital(empty,".mp3");});rejects([&]{device->digital(menu,".unknown");});rejects([&]{device->midi(empty,bank);});rejects([&]{device->midi(day,empty);});require(device->voices()==0 && device->banks()==0,"Rejected audio input left native handles");});
        test("audio_voice_keeps_device_alive",[&]{auto voice=device->digital(pcm(),".wav");std::weak_ptr<MilesDevice> weak=device;voice->volume(0);voice->start(true);device.reset();require(!weak.expired() && (voice->status()&4),"Device shut down with a live voice");voice.reset();require(weak.expired(),"Device survived its final voice");device=MilesDevice::open(argv[1]);require(device->voices()==0 && device->banks()==0,"Reopened device inherited native handles");});
        test("audio_device_parallel_reopen_lifetime",[&]{device.reset();std::vector<std::future<void>> readers;for(unsigned i=0;i<4;++i)readers.push_back(std::async(std::launch::async,[root=fs::path(argv[1])](){for(unsigned j=0;j<4;++j){auto current=MilesDevice::open(root);require(current->voices()==0 && current->banks()==0,"Concurrent device reopen inherited handles");}}));for(auto& reader:readers)reader.get();device=MilesDevice::open(argv[1]);require(device->voices()==0,"Reopened audio device not idle");});
    }catch(const std::exception& e){std::cerr<<"SETUP "<<e.what()<<'\n';return 2;}
    require(!GetModuleHandleW(L"Game.dll"),"Game.dll loaded into Miles checks");std::cout<<"RESULT passed="<<passed<<" failed="<<failed<<'\n';return failed?1:0;
}
