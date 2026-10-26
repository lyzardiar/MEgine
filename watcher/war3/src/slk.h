// Author: MiYu. Bounded source SYLK records shared by original sound and object definitions.
#pragma once
#include "archive.h"
#include <map>

namespace war3 {
class SourceTable {
public:
    using Row=std::map<std::string,std::string>;
private:
    std::vector<Row> rows_;
    std::string idColumn_;
public:
    static SourceTable parse(std::span<const std::uint8_t> bytes);
    static SourceTable read(Archives& archives,const std::string& member);
    const std::vector<Row>& rows() const {return rows_;}
    const std::string& idColumn() const {return idColumn_;}
};
}
