// Author: MiYu. Durable local campaign availability, selection, cinematic flags and difficulty.
#include "campaign_profile.h"
#include <algorithm>
#include <atomic>
#include <fstream>
#include <iterator>
#include <mutex>

namespace war3 {
namespace {
constexpr std::array<std::uint8_t,8> magic{'W','3','C','P','R','F',1,0};
constexpr size_t size=8+2*5+2*5*128+2*5*2+4;
std::recursive_mutex ioMutex;
std::atomic<unsigned> temporarySerial=0;
struct ProcessLock {HANDLE handle=nullptr;ProcessLock(){handle=CreateMutexW(nullptr,FALSE,L"Local\\MEgineWar3CampaignProfile");if(!handle)throw std::runtime_error("Cannot create campaign profile lock: "+winError());auto result=WaitForSingleObject(handle,5000);if(result!=WAIT_OBJECT_0 && result!=WAIT_ABANDONED){auto error=result==WAIT_FAILED?GetLastError():ERROR_TIMEOUT;CloseHandle(handle);handle=nullptr;throw std::runtime_error("Cannot acquire campaign profile lock: "+winError(error));}}~ProcessLock(){if(handle){ReleaseMutex(handle);CloseHandle(handle);}}};
void check(bool expansion,unsigned campaign,unsigned mission=0){if(campaign>=5 || (expansion && campaign>=4) || mission>=128)throw std::runtime_error("Campaign progress index outside source bounds");}
bool state(std::uint8_t value,bool fallback){if(value>2)throw std::runtime_error("Invalid campaign profile flag");return value?value==2:fallback;}
}
fs::path CampaignProfile::path() {return war3UserDirectory()/L"Campaign"/L"profile.bin";}
CampaignProfile::CampaignProfile(){load();}
void CampaignProfile::load(){
    std::lock_guard lock(ioMutex);campaigns_={};missions_={};cinematics_={};tutorial_=mode_=selected_=0;difficulty_=1;auto file=path();std::error_code error;if(!fs::exists(file,error)){if(error)throw std::runtime_error("Cannot inspect campaign profile");return;}auto length=fs::file_size(file,error);if(error || length!=size)throw std::runtime_error("Unsupported or corrupt campaign profile size");std::ifstream input(file,std::ios::binary);if(!input)throw std::runtime_error("Cannot open campaign profile");Bytes bytes(size,0);input.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size()));if(!input || input.peek()!=std::char_traits<char>::eof())throw std::runtime_error("Cannot read campaign profile");if(!std::equal(magic.begin(),magic.end(),bytes.begin()))throw std::runtime_error("Unsupported or corrupt campaign profile");size_t at=magic.size();for(auto& mode:campaigns_)for(auto& item:mode)item=bytes[at++];for(auto& mode:missions_)for(auto& campaign:mode)for(auto& item:campaign)item=bytes[at++];for(auto& mode:cinematics_)for(auto& campaign:mode)for(auto& item:campaign)item=bytes[at++];tutorial_=bytes[at++];mode_=bytes[at++];selected_=bytes[at++];difficulty_=bytes[at++];for(auto& mode:campaigns_)for(auto item:mode)state(item,false);for(auto& mode:missions_)for(auto& campaign:mode)for(auto item:campaign)state(item,false);for(auto& mode:cinematics_)for(auto& campaign:mode)for(auto item:campaign)state(item,false);state(tutorial_,false);if(mode_>1 || selected_>=5 || (mode_ && selected_>=4) || difficulty_>2)throw std::runtime_error("Invalid campaign profile settings");
}
void CampaignProfile::save() const {
    std::lock_guard lock(ioMutex);auto file=path();fs::create_directories(file.parent_path());Bytes bytes(magic.begin(),magic.end());for(auto& mode:campaigns_)for(auto item:mode)bytes.push_back(item);for(auto& mode:missions_)for(auto& campaign:mode)for(auto item:campaign)bytes.push_back(item);for(auto& mode:cinematics_)for(auto& campaign:mode)for(auto item:campaign)bytes.push_back(item);bytes.insert(bytes.end(),{tutorial_,mode_,selected_,difficulty_});auto temp=file;temp+=L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(++temporarySerial)+L".tmp";HANDLE handle=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(handle==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot create temporary campaign profile: "+winError());DWORD written=0;bool good=WriteFile(handle,bytes.data(),DWORD(bytes.size()),&written,nullptr) && written==bytes.size() && FlushFileBuffers(handle);DWORD error=good?ERROR_SUCCESS:GetLastError();CloseHandle(handle);if(!good){DeleteFileW(temp.c_str());throw std::runtime_error("Cannot write campaign profile: "+winError(error));}if(!MoveFileExW(temp.c_str(),file.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)){error=GetLastError();DeleteFileW(temp.c_str());throw std::runtime_error("Cannot publish campaign profile: "+winError(error));}
}
bool CampaignProfile::campaign(bool expansion,unsigned index,bool fallback) const {check(expansion,index);return state(campaigns_[expansion][index],fallback);}
bool CampaignProfile::mission(bool expansion,unsigned campaign,unsigned index,bool fallback) const {check(expansion,campaign,index);return state(missions_[expansion][campaign][index],fallback);}
bool CampaignProfile::cinematic(bool expansion,unsigned campaign,bool ending,bool fallback) const {check(expansion,campaign);return state(cinematics_[expansion][campaign][ending],fallback);}
void CampaignProfile::setCampaign(bool expansion,unsigned index,bool enabled){check(expansion,index);std::lock_guard lock(ioMutex);ProcessLock process;load();campaigns_[expansion][index]=enabled?2:1;save();}
void CampaignProfile::setMission(bool expansion,unsigned campaign,unsigned index,bool enabled){check(expansion,campaign,index);std::lock_guard lock(ioMutex);ProcessLock process;load();missions_[expansion][campaign][index]=enabled?2:1;save();}
void CampaignProfile::setCinematic(bool expansion,unsigned campaign,bool ending,bool enabled){check(expansion,campaign);std::lock_guard lock(ioMutex);ProcessLock process;load();cinematics_[expansion][campaign][ending]=enabled?2:1;save();}
void CampaignProfile::setTutorial(bool cleared){std::lock_guard lock(ioMutex);ProcessLock process;load();tutorial_=cleared?2:1;save();}
void CampaignProfile::select(bool expansion,unsigned index){check(expansion,index);std::lock_guard lock(ioMutex);ProcessLock process;load();mode_=expansion;selected_=std::uint8_t(index);save();}
void CampaignProfile::difficulty(unsigned value){if(value>2)throw std::runtime_error("Invalid campaign difficulty");std::lock_guard lock(ioMutex);ProcessLock process;load();difficulty_=std::uint8_t(value);save();}
}
