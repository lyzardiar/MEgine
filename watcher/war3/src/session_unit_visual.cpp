// Author: MiYu. Preserve script-controlled unit motion parameters and appearance across recovery.
#include "session.h"
#include "snapshot_codec.h"
#include <bit>
#include <cmath>
#include <set>

namespace war3 {
namespace {
constexpr size_t budget=16u*1024u*1024u;
struct VisualState {
    std::uint32_t stable=0,type=0,owner=0;
    float turnSpeed=0,defaultTurnSpeed=0,propWindow=0,defaultPropWindow=0,flyHeight=0,targetFlyHeight=0,flyRate=0;
    std::array<float,3> scale{};
    std::array<std::uint8_t,4> tint{};
    std::optional<unsigned> color;
    bool turnApplied=false;
};
void writeFloat(SnapshotWriter& out,float value){if(!std::isfinite(value))throw std::runtime_error("Invalid unit visual real");out.u32(std::bit_cast<std::uint32_t>(value));}
float readFloat(Binary& in){auto value=std::bit_cast<float>(in.u32());if(!std::isfinite(value))throw std::runtime_error("Invalid unit visual real");return value;}
}
Bytes ScriptSession::encodeUnitVisuals(const jass::StableHandleMap& encodeHandle) const {
    if(!runtime_.snapshotSafe() || failed_ || !world_ || !setupApplied_ || !contexts_.empty() || experimentalSelectionSync_ || !networkPlayers_.empty() || (!units_.empty() && !encodeHandle))throw std::runtime_error("Unit visual snapshot requires a quiescent local session and handle mapping");if(units_.size()>65536)throw std::runtime_error("Unit visual count exceeds budget");SnapshotWriter out(budget-64);out.u32(tag("SUVS"));out.u32(1);out.text(world_->resources().mapDigest(),64);out.u64(std::bit_cast<std::uint64_t>(simulationTime_));out.size(units_.size());std::set<std::uint32_t> mapped;
    for(auto& [id,u]:units_){if(!u || !alive(id,NativeKind::Unit) || u->removing || u->handle!=id || u->owner>=16 || (u->color && *u->color>=16))throw std::runtime_error("Invalid unit visual source");auto stable=encodeHandle("unit",id);if(!stable || !mapped.insert(stable).second)throw std::runtime_error("Invalid unit visual mapping");out.u32(stable);out.u32(u->type);out.u32(u->owner);for(auto v:{u->turnSpeed,u->defaultTurnSpeed,u->propWindow,u->defaultPropWindow,u->flyHeight,u->targetFlyHeight,u->flyRate})writeFloat(out,v);for(auto v:u->visualScale)writeFloat(out,v);for(auto v:u->tint)out.u32(v);out.u32(u->color?1:0);out.u32(u->color.value_or(0));out.u32(u->turnApplied?1:0);}return sealSnapshot(out.finish(),budget);
}
void ScriptSession::restoreUnitVisuals(std::span<const std::uint8_t> bytes,const jass::StableHandleMap& decodeHandle) {
    if(!runtime_.ready() || failed_ || !world_ || !setupApplied_ || mainAttempted_ || !unitRecoveryIncomplete_ || !unitCoreFinished_ || runtime_.threadCount() || !runtime_.inspectExecutions().empty() || !contexts_.empty() || experimentalSelectionSync_ || !networkPlayers_.empty() || liveObjects(NativeKind::Event))throw std::runtime_error("Unit visual restore requires completed core before events");Binary in(openSnapshot(bytes,budget));in.expect(tag("SUVS"));if(in.u32()!=1 || snapshotText(in,64)!=world_->resources().mapDigest())throw std::runtime_error("Unit visual snapshot map mismatch");auto time=std::bit_cast<double>(snapshotU64(in));if(!std::isfinite(time) || time!=simulationTime_)throw std::runtime_error("Unit visual snapshot clock mismatch");auto count=in.count(80,65536);if(count!=units_.size() || (count && !decodeHandle))throw std::runtime_error("Unit visual mapping count differs");std::vector<std::pair<std::uint32_t,VisualState>> saved;saved.reserve(count);std::set<std::uint32_t> stableIds,targets;
    for(unsigned i=0;i<count;++i){VisualState v;v.stable=in.u32();v.type=in.u32();v.owner=in.u32();for(auto p:{&v.turnSpeed,&v.defaultTurnSpeed,&v.propWindow,&v.defaultPropWindow,&v.flyHeight,&v.targetFlyHeight,&v.flyRate})*p=readFloat(in);for(auto& p:v.scale)p=readFloat(in);for(auto& p:v.tint){auto value=in.u32();if(value>255)throw std::runtime_error("Invalid unit tint");p=std::uint8_t(value);}auto hasColor=in.u32(),color=in.u32(),turn=in.u32();if(hasColor>1 || turn>1 || (!hasColor && color) || (hasColor && color>=16))throw std::runtime_error("Invalid unit visual flags");if(hasColor)v.color=color;v.turnApplied=turn!=0;auto id=decodeHandle("unit",v.stable);if(!v.stable || !stableIds.insert(v.stable).second || !unitIdentityHandles_.contains(v.stable) || unitIdentityHandles_.at(v.stable)!=id || !targets.insert(id).second || !alive(id,NativeKind::Unit) || !units_.contains(id) || units_.at(id)->type!=v.type || units_.at(id)->owner!=v.owner)throw std::runtime_error("Invalid unit visual mapping");saved.emplace_back(id,std::move(v));}in.finish();
    for(auto& [id,v]:saved){auto& u=*units_.at(id);u.turnSpeed=v.turnSpeed;u.defaultTurnSpeed=v.defaultTurnSpeed;u.propWindow=v.propWindow;u.defaultPropWindow=v.defaultPropWindow;u.flyHeight=v.flyHeight;u.targetFlyHeight=v.targetFlyHeight;u.flyRate=v.flyRate;u.visualScale=v.scale;u.tint=v.tint;u.color=v.color;u.turnApplied=v.turnApplied;}++fogRevision_;
}
}
