// Author: MiYu. Optional local request/response capture of the client's rendered frame.
#pragma once
#include "platform.h"
#include <algorithm>

namespace war3 {
class AgentCapture {
    fs::path directory_;
    std::string last_;
    std::uint64_t next_=0;
    Log& log_;
    std::string request() const {std::error_code error;auto path=directory_/"capture.request";if(!fs::is_regular_file(path,error) || fs::file_size(path,error)>48 || error)return {};std::ifstream input(path,std::ios::binary);std::string value((std::istreambuf_iterator<char>(input)),{});if(value.empty() || value.size()>48 || !std::all_of(value.begin(),value.end(),[](unsigned char c){return (c>='a' && c<='z') || (c>='A' && c<='Z') || (c>='0' && c<='9') || c=='_' || c=='-';}))return {};return value;}
public:
    struct Request {std::string id;fs::path image,ready,temp;};
    AgentCapture(fs::path directory,Log& log):directory_(std::move(directory)),log_(log){if(!directory_.empty()){last_=request();log_.write("agent_capture_ready="+utf8(directory_.wstring()));}}
    std::optional<Request> poll() {if(directory_.empty())return {};auto now=GetTickCount64();if(now<next_)return {};next_=now+100;auto id=request();if(id.empty() || id==last_)return {};last_=id;Request result{id,directory_/("frame-"+id+".png"),directory_/("frame-"+id+".ready"),directory_/("frame-"+id+".tmp")};if(fs::exists(result.image) || fs::exists(result.ready) || fs::exists(result.temp)){log_.write("agent_capture_duplicate="+id);return {};}return result;}
    void complete(const Request& request,unsigned width,unsigned height,unsigned frame,bool game,bool presented,const std::string& error) {std::ofstream out(request.temp,std::ios::binary|std::ios::trunc);if(!out){log_.write("agent_capture_response_error="+request.id);return;}out<<"{\"id\":\""<<request.id<<"\",\"width\":"<<width<<",\"height\":"<<height<<",\"frame\":"<<frame<<",\"scope\":\""<<(game?"game":"shell")<<"\",\"presented\":"<<(presented?"true":"false")<<",\"ok\":"<<(error.empty()?"true":"false")<<"}";out.close();if(!out){log_.write("agent_capture_response_error="+request.id);return;}std::error_code ec;fs::rename(request.temp,request.ready,ec);if(ec){log_.write("agent_capture_response_error="+request.id+" "+ec.message());return;}log_.write(error.empty()?"agent_capture="+request.id+" frame="+std::to_string(frame):"agent_capture_error="+request.id+" "+error);}

};
}
