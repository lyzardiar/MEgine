// Author: MiYu. Shared serialization for captured passive definitions.
#pragma once
#include "snapshot_codec.h"
#include "passives.h"
namespace war3 {
void writePassiveSnapshot(SnapshotWriter& out,const PassiveInfo& passive);
}
