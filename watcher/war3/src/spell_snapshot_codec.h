// Author: MiYu. Shared serialization for captured spell definitions.
#pragma once
#include "snapshot_codec.h"
#include "spells.h"
namespace war3 {
void writeSpellSnapshot(SnapshotWriter& out,const SpellInfo& spell);
SpellInfo readSpellSnapshot(Binary& in);
}
