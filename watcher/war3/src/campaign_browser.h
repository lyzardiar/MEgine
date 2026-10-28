// Author: MiYu. Original campaign selection and direct, asynchronous chapter preparation.
#pragma once
#include "campaign_profile.h"
#include "glue.h"
#include "map_preparation.h"
#include "map_ui.h"
#include "setup.h"

namespace war3 {
class CampaignBrowser {
    struct Entry {std::string header,name,path,extra;unsigned mission=0;bool missionEntry=false,cinematic=false,ending=false,intro=false;};
    struct Campaign {std::string section,header,name,background,model;bool expansion=false,defaultOpen=false;unsigned offset=0,sourceIndex=0;std::vector<Entry> entries;};
    Archives& archives_;
    GlueScreen screen_;
    CampaignProfile profile_;
    MapPreparation preparation_;
    Renderer& renderer_;
    Log& log_;
    fs::path dataRoot_,mapsRoot_,currentPath_,currentExternalRoot_;
    std::vector<Campaign> campaigns_;
    std::array<std::vector<std::optional<size_t>>,2> sourceSlots_;
    std::unique_ptr<PlayerSetup> setup_;
    std::unique_ptr<ScriptSession> session_;
    size_t selectedCampaign_=0,selectedEntry_=0,scroll_=0;
    unsigned rows_=1,currentDifficulty_=1;
    std::uint64_t request_=0;
    bool missions_=false,loading_=false,autoStart_=false,currentExpansion_=false,currentCampaignSession_=true;
    std::string error_,backdrop_,cinematicRequest_;
    void loadCatalog();
    void updateBackdrop();
    void refreshDifficulty();
    void clearPreparation();
    void beginPath(const fs::path& path,bool expansion,unsigned difficulty,bool autoStart,bool campaign=true,const fs::path& externalRoot={});
    void prepareSelected(bool autoStart=false);
    void prepared();
    void selectCampaign(size_t index);
    void enterCampaign();
    void selectEntry(size_t index);
    bool entryAvailable(const Campaign& campaign,const Entry& entry) const;
    fs::path resolvePath(const std::string& path,const fs::path& externalRoot={}) const;
    fs::path validatePath(const fs::path& path,const fs::path& externalRoot={}) const;
public:
    CampaignBrowser(Archives& archives,Images& images,Renderer& renderer,Text& text,Log& log,const fs::path& dataRoot,bool muted=false);
    std::string draw(const UiInput& input);
    std::unique_ptr<ScriptSession> takeSession();
    std::string takeCinematic();
    void reload(bool campaignList=false);
    void nextLevel(const std::string& path,const fs::path& externalRoot={});
    bool campaignSession() const {return currentCampaignSession_;}
    void restart();
    bool loading() const {return loading_;}
    const std::string& error() const {return error_;}
    std::string backdrop() const {return backdrop_;}
};
}
