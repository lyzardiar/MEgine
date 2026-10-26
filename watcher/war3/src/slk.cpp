// Author: MiYu. Read inherited SYLK coordinates and quoted fields without evaluating formulas.
#include "slk.h"
#include "fdf.h"
#include <charconv>
#include <set>

namespace war3 {
namespace {
std::string trim(std::string s) {auto first=s.find_first_not_of(" \t\r");return first==std::string::npos?std::string{}:s.substr(first,s.find_last_not_of(" \t\r")-first+1);}
unsigned coordinate(std::string_view value,unsigned limit) {unsigned n=0;auto [end,error]=std::from_chars(value.data(),value.data()+value.size(),n);if(error!=std::errc{} || end!=value.data()+value.size() || !n || n>limit)throw std::runtime_error("Invalid SYLK coordinate");return n;}
std::vector<std::string> fields(std::string_view line) {
    std::vector<std::string> result;std::string value;bool quoted=false;
    for(size_t i=0;i<line.size();++i){auto c=line[i];if(c=='"'){if(quoted && i+1<line.size() && line[i+1]=='"'){value+='"';++i;}else quoted=!quoted;}else if(c==';' && !quoted){result.push_back(std::move(value));value.clear();}else value+=c;}
    if(quoted)throw std::runtime_error("Unclosed SYLK string");result.push_back(std::move(value));return result;
}
}
SourceTable SourceTable::parse(std::span<const std::uint8_t> bytes) {
    if(bytes.size()>16*1024*1024)throw std::runtime_error("SYLK source exceeds budget");auto source=sourceText(bytes);std::map<std::pair<unsigned,unsigned>,std::string> cells;unsigned x=0,y=0;bool header=false,ended=false;size_t at=0;
    while(at<source.size()){auto end=source.find_first_of("\r\n",at);auto line=std::string_view(source).substr(at,end==std::string::npos?end:end-at);at=end==std::string::npos?source.size():end+1;if(line.empty())continue;auto row=fields(line);if(row.empty())continue;if(!header){if(row[0]!="ID")throw std::runtime_error("Missing SYLK header");header=true;continue;}if(row[0]=="E"){ended=true;break;}if(row[0]!="C")continue;std::optional<std::string> value;
        for(size_t i=1;i<row.size();++i)if(!row[i].empty()){auto& field=row[i];if(field[0]=='X')x=coordinate(std::string_view(field).substr(1),512);else if(field[0]=='Y')y=coordinate(std::string_view(field).substr(1),262144);else if(field[0]=='K')value=field.substr(1);else if(field[0]=='E')throw std::runtime_error("SYLK formulas are not source constants");}
        if(value){if(!x || !y || value->size()>65536 || cells.size()>=1048576)throw std::runtime_error("Invalid or excessive SYLK cells");cells[{y,x}]=std::move(*value);}
    }
    if(!header || !ended)throw std::runtime_error("Truncated SYLK table");std::map<unsigned,std::string> columns;std::set<std::string> names;for(auto& [position,value]:cells)if(position.first==1){auto name=trim(value);if(name.empty() || !names.insert(name).second)throw std::runtime_error("Invalid SYLK column header");columns[position.second]=std::move(name);}
    if(columns.empty())throw std::runtime_error("SYLK table has no columns");SourceTable result;result.idColumn_=columns.begin()->second;unsigned current=0;for(auto& [position,value]:cells)if(position.first>1){auto field=columns.find(position.second);if(field==columns.end())throw std::runtime_error("SYLK cell has no column header");if(current!=position.first){result.rows_.emplace_back();current=position.first;}result.rows_.back()[field->second]=std::move(value);}return result;
}
SourceTable SourceTable::read(Archives& archives,const std::string& member) {auto bytes=archives.read(member);if(!bytes)throw std::runtime_error("Missing source table: "+member);return parse(bytes->bytes);}
}
