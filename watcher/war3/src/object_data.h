// Author: MiYu. Native unit/item source tables and typed map object overrides.
#pragma once
#include "slk.h"
#include "map_ui.h"
#include <variant>

namespace war3 {
struct ObjectChange {
    std::uint32_t field=0,marker=0;
    unsigned type=0;
    unsigned level=0,data=0;
    std::variant<std::int32_t,float,std::string> value;
};
struct ObjectOverride {std::uint32_t base=0,id=0;bool custom=false,ability=false,upgrade=false;std::vector<ObjectChange> changes;};
class ObjectData {
    std::map<std::string,std::map<std::uint32_t,SourceTable::Row>> tables_;
    std::map<std::uint32_t,SourceTable::Row> metadata_;
    std::map<std::uint32_t,SourceTable::Row> abilityMetadata_;
    std::map<std::uint32_t,SourceTable::Row> upgradeMetadata_;
    std::map<std::uint32_t,std::uint32_t> parents_;
    std::map<std::uint32_t,std::map<std::string,std::string>> overrides_;
    SourceSettings profiles_{true};
    std::vector<ObjectOverride> objects_;
    size_t unknown_=0;
    void load(Archives& archives,const char* member,const char* table);
    void overlay(Archives& archives,const char* member,bool ability=false,bool upgrade=false);
public:
    explicit ObjectData(Archives& archives);
    static std::uint32_t code(std::string_view text);
    static std::string name(std::uint32_t code);
    bool contains(std::uint32_t id,bool item=false) const;
    bool ability(std::uint32_t id) const;
    bool upgrade(std::uint32_t id) const;
    std::uint32_t root(std::uint32_t id) const;
    std::string property(std::uint32_t id,const char* field,const std::string& fallback={}) const;
    std::string field(std::uint32_t id,const std::string& table,const std::string& key,const std::string& fallback={}) const;
    float number(std::uint32_t id,const std::string& table,const std::string& key,float fallback=0) const;
    const std::vector<ObjectOverride>& objects() const {return objects_;}
    size_t unmappedChanges() const {return unknown_;}
};
}
