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
    struct UnnamedCell {unsigned row,column;std::string value;};
    std::vector<UnnamedCell> unnamed_;
    struct FormulaCell {unsigned row,column;std::string expression;bool cached=false;};
    std::vector<FormulaCell> formulas_;
public:
    static SourceTable parse(std::span<const std::uint8_t> bytes);
    static SourceTable read(Archives& archives,const std::string& member);
    const std::vector<Row>& rows() const {return rows_;}
    const std::string& idColumn() const {return idColumn_;}
    size_t unnamedCells() const {return unnamed_.size();}
    size_t formulaCells() const {return formulas_.size();}
};
}
