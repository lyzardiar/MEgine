// Author: MiYu. Native unit/item source tables and typed map object overrides.
#pragma once
#include "slk.h"
#include "map_ui.h"
#include <tuple>
#include <variant>

namespace war3 {
struct ObjectChange {
    std::uint32_t field=0,marker=0;
    unsigned type=0;
    unsigned level=0,data=0;
    std::variant<std::int32_t,float,std::string> value;
};
struct ObjectOverride {std::uint32_t base=0,id=0;bool custom=false,ability=false,upgrade=false,buff=false;std::vector<ObjectChange> changes;};
class ObjectData {
    std::map<std::string,std::map<std::uint32_t,SourceTable::Row>> tables_;
    std::map<std::uint32_t,SourceTable::Row> metadata_;
    std::map<std::uint32_t,SourceTable::Row> abilityMetadata_;
    std::map<std::uint32_t,SourceTable::Row> upgradeMetadata_;
    std::map<std::uint32_t,SourceTable::Row> buffMetadata_;
    std::map<std::uint32_t,std::uint32_t> parents_;
    std::map<std::uint32_t,std::map<std::string,std::string>> overrides_;
    std::map<std::string,std::string> sourceNames_;
    std::map<std::uint32_t,std::string> nameOverrides_;
    SourceSettings profiles_{true};
    std::vector<ObjectOverride> objects_;
    mutable std::optional<std::map<std::string,std::uint32_t>> unitNames_;
    mutable std::map<std::pair<int,int>,std::vector<std::uint32_t>> randomItems_;
    mutable std::map<std::tuple<int,int,char>,std::vector<std::uint32_t>> randomUnits_;
    size_t unknown_=0;
    void load(Archives& archives,const char* member,const char* table);
    void overlay(Archives& archives,const char* member,bool ability=false,bool upgrade=false,bool buff=false);
public:
    explicit ObjectData(Archives& archives);
    static std::uint32_t code(std::string_view text);
    static std::string name(std::uint32_t code);
    std::optional<std::string> displayName(std::uint32_t id) const;
    std::uint32_t unitId(const std::string& name) const;
    std::vector<std::uint32_t> unitTypes() const;
    std::vector<std::uint32_t> itemTypes() const;
    std::vector<std::uint32_t> upgradeTypes() const;
    const std::vector<std::uint32_t>& randomItems(int itemClass,int level) const;
    const std::vector<std::uint32_t>& randomUnits(bool building,int level,char tileset) const;
    bool contains(std::uint32_t id,bool item=false) const;
    bool ability(std::uint32_t id) const;
    bool upgrade(std::uint32_t id) const;
    bool buff(std::uint32_t id) const;
    std::uint32_t root(std::uint32_t id) const;
    std::string unitClasses(std::uint32_t id) const;
    std::string property(std::uint32_t id,const char* field,const std::string& fallback={}) const;
    std::string field(std::uint32_t id,const std::string& table,const std::string& key,const std::string& fallback={}) const;
    float number(std::uint32_t id,const std::string& table,const std::string& key,float fallback=0) const;
    const std::vector<ObjectOverride>& objects() const {return objects_;}
    size_t unmappedChanges() const {return unknown_;}
};
}
