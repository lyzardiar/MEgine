// Author: MiYu. Play animation event sounds through the session-owned audio scene.
#include "game_view.h"

namespace war3 {
void GameView::modelSounds(Model& model,ModelInstance& instance,std::uint64_t elapsed,std::uint64_t clock,const std::array<float,3>& position) {
    for(auto& code:model.soundEvents(instance,elapsed,clock)){if(failedModelSounds_.contains(code))continue;try{data_->session->animationSound(code,position);}catch(const std::exception& e){failedModelSounds_.insert(code);log_.write("model_sound_error="+code+" "+e.what());}}
}
}
