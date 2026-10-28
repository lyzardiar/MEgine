// Author: MiYu. Script indicators apply temporarily to live widget models.
#include "session.h"

namespace war3 {
void ScriptSession::bindIndicatorNatives() {
    auto add=[this](auto& vm,auto a,bool unitOnly){auto id=a[0].bits;if(alive(id,NativeKind::Unit) || (!unitOnly && (alive(id,NativeKind::Item) || alive(id,NativeKind::Destructable)))){auto color=((a[4].bits&255u)<<24)|((a[1].bits&255u)<<16)|((a[2].bits&255u)<<8)|(a[3].bits&255u);indicators_.add(id,color,simulationTime_);}return vm.nothing();};
    bind("UnitAddIndicator","nothing",{"unit","integer","integer","integer","integer"},[add](auto& vm,auto a){return add(vm,a,true);});
    bind("AddIndicator","nothing",{"widget","integer","integer","integer","integer"},[add](auto& vm,auto a){return add(vm,a,false);});
}
}
