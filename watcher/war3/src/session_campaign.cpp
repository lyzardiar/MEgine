// Author: MiYu. Campaign availability, menu selection and ChangeLevel use the live local profile.
#include "session.h"
#include "campaign_profile.h"
#include <bit>
namespace war3 {
void ScriptSession::bindCampaignNatives(){
    auto integer=[](jass::Value value){return std::bit_cast<std::int32_t>(value.bits);};auto protect=[this]{if(world_)validateWar3UserDirectory(world_->resources().root());};
    bind("SetCampaignAvailable","nothing",{"integer","boolean"},[this,integer,protect](auto& vm,auto a){protect();auto index=integer(a[0]);if(index<0)throw std::runtime_error("Negative campaign index");CampaignProfile profile;profile.setCampaign(campaignExpansion_,unsigned(index),a[1].bits!=0);return vm.nothing();});
    bind("SetMissionAvailable","nothing",{"integer","integer","boolean"},[this,integer,protect](auto& vm,auto a){protect();auto campaign=integer(a[0]),mission=integer(a[1]);if(campaign<0 || mission<0)throw std::runtime_error("Negative campaign mission index");CampaignProfile profile;profile.setMission(campaignExpansion_,unsigned(campaign),unsigned(mission),a[2].bits!=0);return vm.nothing();});
    for(auto [name,ending]:std::initializer_list<std::pair<const char*,bool>>{{"SetOpCinematicAvailable",false},{"SetEdCinematicAvailable",true}})bind(name,"nothing",{"integer","boolean"},[this,integer,ending,protect](auto& vm,auto a){protect();auto index=integer(a[0]);if(index<0)throw std::runtime_error("Negative cinematic campaign index");CampaignProfile profile;profile.setCinematic(campaignExpansion_,unsigned(index),ending,a[1].bits!=0);return vm.nothing();});
    bind("SetTutorialCleared","nothing",{"boolean"},[protect](auto& vm,auto a){protect();CampaignProfile profile;profile.setTutorial(a[0].bits!=0);return vm.nothing();});
    bind("SetCampaignMenuRace","nothing",{"race"},[protect](auto& vm,auto a){protect();unsigned index=a[0].bits==7?0:a[0].bits==1?1:a[0].bits==3?2:a[0].bits==2?3:a[0].bits==4?4:UINT_MAX;if(index!=UINT_MAX){CampaignProfile profile;profile.select(false,index);}return vm.nothing();});
    bind("SetCampaignMenuRaceEx","nothing",{"integer"},[integer,protect](auto& vm,auto a){protect();auto index=integer(a[0]);if(index>=0 && index<4){CampaignProfile profile;profile.select(true,unsigned(index));}return vm.nothing();});
    bind("ForceCampaignSelectScreen","nothing",{},[this](auto& vm,auto){forceCampaignSelect_=true;return vm.nothing();});
    for(auto [name,model]:std::initializer_list<std::pair<const char*,bool>>{{"PlayCinematic",false},{"PlayModelCinematic",true}})bind(name,"nothing",{"string"},[this,model](auto& vm,auto a){auto value=a[0].text?*a[0].text:std::string{};if(value.size()>1024 || value.find('\0')!=std::string::npos)throw std::runtime_error("Invalid cinematic request");(model?modelCinematic_:movieCinematic_)=std::move(value);return vm.nothing();});
    bind("ChangeLevel","nothing",{"string","boolean"},[this](auto& vm,auto a){if(!a[0].text || a[0].text->empty() || a[0].text->size()>1024)throw std::runtime_error("Invalid next-level path");if(experimentalSelectionSync_)throw std::runtime_error("ChangeLevel is not yet supported in experimental LAN or replay sessions");nextLevel_=*a[0].text;finishGame(a[1].bits!=0,SessionExit::ChangeLevel);return vm.nothing();});
}
}
