// Author: MiYu. Capture map button presses until release or cancellation.
#pragma once
#include <cstdint>
namespace war3 {
enum class MapButtonVisual {Normal,Hover,Pressed,Disabled};
inline MapButtonVisual mapButtonVisual(bool enabled,bool hovered,bool pressed){return !enabled?MapButtonVisual::Disabled:pressed && hovered?MapButtonVisual::Pressed:hovered?MapButtonVisual::Hover:MapButtonVisual::Normal;}
class MapFramePointer {
    std::uint32_t capture_=0;
    bool down_=false,blocked_=false;
public:
    std::uint32_t captured() const {return capture_;}
    template<class Pick,class Release> bool update(bool allowed,bool down,bool pressed,float startX,float startY,float x,float y,Pick pick,Release release){if(!allowed){blocked_=down || (down_ && pressed);capture_=0;down_=false;return false;}if(blocked_){if(!down || pressed)blocked_=false;return false;}if(!down && !pressed){capture_=0;down_=false;return false;}if(!down_ && !capture_)capture_=pick(startX,startY);down_=down;auto captured=capture_;if(pressed){capture_=0;if(captured)release(captured,x,y);}else if(!down)capture_=0;return captured!=0;}
};
}
