// Author: MiYu. Reuse classic source tables and original-before-custom object inheritance.
#include "object_data.h"
#include "binary.h"
#include <charconv>
#include <set>

namespace war3 {
namespace {
std::string cell(const SourceTable::Row& row,const std::string& name,const std::string& fallback={}) {auto found=row.find(name);return found==row.end()?fallback:found->second;}
std::string indexed(std::string value,int index,const std::string& replacement) {if(index<0)return replacement;std::vector<std::string> parts;size_t at=0;do{auto end=value.find(',',at);parts.push_back(value.substr(at,end==std::string::npos?end:end-at));if(end==std::string::npos)break;at=end+1;}while(at<=value.size());if(index>1023)throw std::runtime_error("Object list index exceeds budget");parts.resize(std::max(parts.size(),size_t(index)+1));parts[index]=replacement;std::string result;for(auto& part:parts){if(&part!=&parts.front())result+=',';result+=part;}return result;}
std::string value(const ObjectChange& change) {return std::visit([](auto& input)->std::string{using T=std::decay_t<decltype(input)>;if constexpr(std::is_same_v<T,std::string>)return input;else if constexpr(std::is_same_v<T,float>){char buffer[64];auto [end,error]=std::to_chars(buffer,buffer+64,input);if(error!=std::errc{})throw std::runtime_error("Object numeric conversion failed");return {buffer,end};}else return std::to_string(input);},change.value);}
}
std::uint32_t ObjectData::code(std::string_view text) {if(text.size()!=4)throw std::runtime_error("Object ID must contain four bytes");std::uint32_t result=0;for(auto c:text)result=(result<<8)|static_cast<unsigned char>(c);return result;}
std::string ObjectData::name(std::uint32_t id) {std::string result(4,'\0');for(int i=3;i>=0;--i){result[i]=char(id&255);id>>=8;}return result;}
void ObjectData::load(Archives& archives,const char* member,const char* table) {
    auto source=SourceTable::read(archives,member);auto& target=tables_[table];
    for(auto& row:source.rows()){
        const std::string* id=nullptr;if(auto it=row.find(std::string(table)=="AbilityData"?"alias":source.idColumn());it!=row.end())id=&it->second;
        if(!id)continue;if(id->size()!=4)throw std::runtime_error("Invalid object table ID: "+std::string(member)+" column="+source.idColumn()+" value="+id->substr(0,64));if(!target.emplace(code(*id),row).second)throw std::runtime_error("Duplicate object table ID");
    }
}
void ObjectData::overlay(Archives& archives,const char* member) {
    auto source=archives.readCandidates({member},ArchiveScope::Map);if(!source)return;if(source->bytes.size()>16*1024*1024)throw std::runtime_error("Object override member exceeds budget");Binary b(source->bytes);auto version=b.u32();if(version!=1 && version!=2)throw std::runtime_error("Unsupported classic object override version");
    auto raw=[&]{auto bytes=b.take(4);return code({reinterpret_cast<const char*>(bytes.data()),4});};
    for(bool custom:{false,true}){auto count=b.count(12,65536);for(unsigned i=0;i<count;++i){ObjectOverride object;object.base=raw();auto newId=raw();object.custom=custom;object.id=custom?newId:object.base;if(!object.id)throw std::runtime_error("Empty custom object ID");auto modifications=b.count(13,262144);if(objects_.size()>=65536)throw std::runtime_error("Object override count exceeds budget");for(unsigned n=0;n<modifications;++n){ObjectChange change;change.field=raw();change.type=b.u32();switch(change.type){case 0:change.value=b.i32();break;case 1:case 2:change.value=b.f32();break;case 3:change.value=b.cstring();break;default:throw std::runtime_error("Unknown object modification type");}change.marker=raw();if(change.marker && change.marker!=object.base && change.marker!=object.id)throw std::runtime_error("Invalid object modification terminator");object.changes.push_back(std::move(change));}objects_.push_back(std::move(object));}}
    b.finish();
}
ObjectData::ObjectData(Archives& archives) {
    for(auto [member,table]:std::initializer_list<std::pair<const char*,const char*>>{{"Units\\UnitUI.slk","UnitUI"},{"Units\\UnitData.slk","UnitData"},{"Units\\UnitBalance.slk","UnitBalance"},{"Units\\UnitWeapons.slk","UnitWeapons"},{"Units\\UnitAbilities.slk","UnitAbilities"},{"Units\\ItemData.slk","ItemData"},{"Units\\AbilityData.slk","AbilityData"}})load(archives,member,table);
    auto metadata=SourceTable::read(archives,"Units\\UnitMetaData.slk");for(auto& row:metadata.rows()){auto id=cell(row,"ID");if(id.size()==4)metadata_.emplace(code(id),row);}
    for(auto race:{"Human","Orc","Undead","NightElf","Neutral","Campaign"})for(auto suffix:{"UnitFunc.txt","UnitStrings.txt"})if(auto member=archives.read(std::string("Units\\")+race+suffix))profiles_.parse(member->bytes);
    for(auto name:{"Units\\ItemFunc.txt","Units\\ItemStrings.txt"})if(auto member=archives.read(name))profiles_.parse(member->bytes);
    for(auto race:{"Human","Orc","Undead","NightElf","Neutral","Common","Campaign","Item"})for(auto suffix:{"AbilityFunc.txt","AbilityStrings.txt"})if(auto member=archives.read(std::string("Units\\")+race+suffix))profiles_.parse(member->bytes);
    overlay(archives,"war3map.w3u");overlay(archives,"war3map.w3t");
    for(bool custom:{false,true})for(auto& object:objects_)if(object.custom==custom){
        if(custom){if(contains(object.id) || contains(object.id,true))throw std::runtime_error("Duplicate custom object: "+name(object.id));if(!contains(object.base) && !contains(object.base,true))throw std::runtime_error("Missing custom object base: "+name(object.base));parents_[object.id]=object.base;}
        for(auto& change:object.changes){auto meta=metadata_.find(change.field);if(meta==metadata_.end()){++unknown_;continue;}auto table=cell(meta->second,"slk"),key=cell(meta->second,"field");if(key.empty() || (table!="Profile" && !tables_.contains(table))){++unknown_;continue;}int index=-1;auto indexText=cell(meta->second,"index","-1");auto [end,error]=std::from_chars(indexText.data(),indexText.data()+indexText.size(),index);if(error!=std::errc{} || end!=indexText.data()+indexText.size())throw std::runtime_error("Invalid object metadata index");auto replacement=value(change);if(index>=0)replacement=indexed(field(object.id,table,key),index,replacement);overrides_[object.id][table+"/"+key]=std::move(replacement);}
    }
}
std::string ObjectData::field(std::uint32_t id,const std::string& table,const std::string& key,const std::string& fallback) const {
    std::set<std::uint32_t> seen;for(;;){if(!seen.insert(id).second || seen.size()>64)throw std::runtime_error("Cyclic or excessive object inheritance");if(auto object=overrides_.find(id);object!=overrides_.end())if(auto found=object->second.find(table+"/"+key);found!=object->second.end())return found->second;auto parent=parents_.find(id);if(parent==parents_.end())break;id=parent->second;}
    if(table=="Profile")return profiles_.value(name(id),key,fallback);auto source=tables_.find(table);if(source==tables_.end())return fallback;auto row=source->second.find(id);if(row==source->second.end())return fallback;auto result=cell(row->second,key,fallback);return result=="_"?fallback:result;
}
bool ObjectData::contains(std::uint32_t id,bool item) const {for(unsigned depth=0;depth<64;++depth){auto parent=parents_.find(id);if(parent==parents_.end()){auto table=tables_.find(item?"ItemData":"UnitData");return table!=tables_.end() && table->second.contains(id);}id=parent->second;}throw std::runtime_error("Excessive object inheritance");}
bool ObjectData::ability(std::uint32_t id) const {auto table=tables_.find("AbilityData");return table!=tables_.end() && table->second.contains(id);}
std::uint32_t ObjectData::root(std::uint32_t id) const {for(unsigned i=0;i<64;++i){auto found=parents_.find(id);if(found==parents_.end())return id;id=found->second;}throw std::runtime_error("Excessive object inheritance");}
std::string ObjectData::property(std::uint32_t id,const char* key,const std::string& fallback) const {auto meta=metadata_.find(code(key));return meta==metadata_.end()?fallback:field(id,cell(meta->second,"slk"),cell(meta->second,"field"),fallback);}
float ObjectData::number(std::uint32_t id,const std::string& table,const std::string& key,float fallback) const {auto text=field(id,table,key);auto first=text.find_first_not_of(" \t\r\n");if(first==std::string::npos)return fallback;text=text.substr(first,text.find_last_not_of(" \t\r\n")-first+1);if(text=="-")return fallback;if(text.front()=='+')text.erase(0,1);float result=0;auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),result);if(error!=std::errc{} || end!=text.data()+text.size() || !std::isfinite(result))throw std::runtime_error("Invalid object numeric field: "+name(id)+" "+table+"/"+key+"="+text.substr(0,64));return result;}
}
