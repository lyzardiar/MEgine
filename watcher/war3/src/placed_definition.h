// Author: MiYu. Shared source definitions for live destructables and decorative scene placements.
#pragma once
#include "slk.h"

namespace war3 {
using PlacedDefinitions=std::map<unsigned,SourceTable::Row>;
std::string placedString(const SourceTable::Row& row,const char* key,const std::string& fallback={});
float placedNumber(const SourceTable::Row& row,const char* key,float fallback=0);
PlacedDefinitions readPlacedDefinitions(Archives& archives,const char* table,const char* metadata,const char* overlay,bool levels,unsigned& unmapped);
std::string placedModel(const SourceTable::Row& row,int variation,Archives& archives);
}
