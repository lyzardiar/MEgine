// Author: MiYu. Source order names retain their original numeric registration values.
#include "order_ids.h"
#include <algorithm>
namespace war3 {
namespace {
struct Entry {std::string_view name;std::uint32_t id;};
constexpr Entry entries[]={
#include "order_ids.inc"
};
}
std::uint32_t orderId(std::string_view name) {auto i=std::lower_bound(std::begin(entries),std::end(entries),name,[](auto& entry,auto key){return entry.name<key;});return i!=std::end(entries) && i->name==name?i->id:0;}
std::string_view orderName(std::uint32_t id) {for(auto& entry:entries)if(entry.id==id)return entry.name;return {};}
}
