// Author: MiYu. Classic scalar and sparse array storage retains values across callback invocations.
#include "jass_binary_storage.h"
#include <stdexcept>

namespace war3 {
namespace {
JassBinaryNativeValue coerce(JassBinaryNativeValue value,std::uint8_t type){if(value.type==2 && !value.bits && !value.text && (type==3 || type==6 || type==7))value.type=type;if(value.type!=type || (type==8 && value.bits>1) || (type!=6 && value.text) || (type==6 && value.bits && value.text) || (type==3 && value.bits && (value.code.bits!=value.bits || !value.code.codeOwner)))throw std::runtime_error("Invalid 2SAJ stored value");return value;}
}
JassBinaryStorage::JassBinaryStorage(const std::map<std::string,JassBinaryGlobal>& globals){if(globals.size()>65536)throw std::runtime_error("2SAJ global storage budget exceeded");for(auto& [name,global]:globals){auto type=global.value.type;if(name.empty() || type<3 || type>13 || (type>=9 && global.value.bits) || (type==3 && global.value.bits) || (type==8 && global.value.bits>1))throw std::runtime_error("Invalid 2SAJ global storage");entries_.emplace(name,Entry{{type,global.value.bits,{}},global.constant,{}});}}
bool JassBinaryStorage::contains(const std::string& name) const{return entries_.contains(name);}
JassBinaryNativeValue JassBinaryStorage::read(const std::string& name) const{auto it=entries_.find(name);if(it==entries_.end() || it->second.value.type>=9)throw std::runtime_error("Unknown or array 2SAJ global: "+name);return it->second.value;}
void JassBinaryStorage::write(const std::string& name,JassBinaryNativeValue value){auto it=entries_.find(name);if(it==entries_.end() || it->second.constant || it->second.value.type>=9)throw std::runtime_error("Invalid 2SAJ global write: "+name);it->second.value=coerce(std::move(value),it->second.value.type);}
JassBinaryNativeValue JassBinaryStorage::readArray(const std::string& name,std::uint32_t index,std::uint8_t type) const{auto it=entries_.find(name);if(it==entries_.end() || type<4 || type>8 || it->second.value.type!=type+5)throw std::runtime_error("Invalid 2SAJ global array read: "+name);if(index<8192)if(auto found=it->second.elements.find(index);found!=it->second.elements.end())return found->second;return {type,0,{}};}
void JassBinaryStorage::writeArray(const std::string& name,std::uint32_t index,JassBinaryNativeValue value){auto it=entries_.find(name);if(it==entries_.end() || it->second.constant || it->second.value.type<9 || it->second.value.type>13)throw std::runtime_error("Invalid 2SAJ global array write: "+name);value=coerce(std::move(value),std::uint8_t(it->second.value.type-5));if(index>=8192)return;auto& array=it->second.elements;auto found=array.find(index);if(found==array.end()){if(elementCount_>=262144)throw std::runtime_error("2SAJ array storage budget exceeded");array.emplace(index,std::move(value));++elementCount_;}else found->second=std::move(value);}
}
