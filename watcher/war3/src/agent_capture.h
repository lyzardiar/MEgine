// Author: MiYu. Optional local request/response capture of the client's rendered frame.
#pragma once
#include "platform.h"
#include <algorithm>

namespace war3 {
class AgentCapture {
    fs::path directory_;
    std::string last_,lastSelection_;
    std::uint64_t next_=0,nextSelection_=0;
    Log& log_;
    std::string readRequest(const char* name,size_t limit) const {std::error_code error;auto path=directory_/name;if(!fs::is_regular_file(path,error) || fs::file_size(path,error)>limit || error)return {};std::ifstream input(path,std::ios::binary);return {(std::istreambuf_iterator<char>(input)),{}};}
    static bool validId(std::string_view value) {return !value.empty() && value.size()<=48 && std::all_of(value.begin(),value.end(),[](unsigned char c){return (c>='a' && c<='z') || (c>='A' && c<='Z') || (c>='0' && c<='9') || c=='_' || c=='-';});}
    std::string request() const {auto value=readRequest("capture.request",48);return validId(value)?value:std::string{};}
    static int hex(char c){return c>='0' && c<='9'?c-'0':c>='a' && c<='f'?c-'a'+10:c>='A' && c<='F'?c-'A'+10:-1;}
    void respond(const fs::path& temp,const fs::path& ready,const std::string& body,const std::string& id) {std::ofstream out(temp,std::ios::binary|std::ios::trunc);if(!out){log_.write("agent_response_error="+id);return;}out<<body;out.close();if(!out){log_.write("agent_response_error="+id);return;}std::error_code ec;fs::rename(temp,ready,ec);if(ec)log_.write("agent_response_error="+id+" "+ec.message());}

public:
    struct Request {std::string id;fs::path image,ready,temp;};
    struct SelectionRequest {std::string id,type;fs::path ready,temp;};
    AgentCapture(fs::path directory,Log& log):directory_(std::move(directory)),log_(log){if(!directory_.empty()){last_=request();lastSelection_=readRequest("select.request",57);log_.write("agent_capture_ready="+utf8(directory_.wstring()));}}
    std::optional<Request> poll() {if(directory_.empty())return {};auto now=GetTickCount64();if(now<next_)return {};next_=now+100;auto id=request();if(id.empty() || id==last_)return {};last_=id;Request result{id,directory_/("frame-"+id+".png"),directory_/("frame-"+id+".ready"),directory_/("frame-"+id+".tmp")};if(fs::exists(result.image) || fs::exists(result.ready) || fs::exists(result.temp)){log_.write("agent_capture_duplicate="+id);return {};}return result;}
    std::optional<SelectionRequest> pollSelection() {if(directory_.empty())return {};auto now=GetTickCount64();if(now<nextSelection_)return {};nextSelection_=now+100;auto value=readRequest("select.request",57);if(value.empty() || value==lastSelection_)return {};lastSelection_=value;auto colon=value.find(':');if(colon==std::string::npos || !validId(std::string_view(value).substr(0,colon)) || value.size()!=colon+9)return {};std::string type(4,'\0');for(unsigned i=0;i<4;++i){auto high=hex(value[colon+1+i*2]),low=hex(value[colon+2+i*2]);if(high<0 || low<0)return {};type[i]=char(high*16+low);}auto id=value.substr(0,colon);SelectionRequest result{id,type,directory_/("selection-"+id+".ready"),directory_/("selection-"+id+".tmp")};if(fs::exists(result.ready) || fs::exists(result.temp)){log_.write("agent_selection_duplicate="+id);return {};}return result;}
    void completeSelection(const SelectionRequest& request,bool ok,bool ready,unsigned frame,std::uint32_t handle) {auto body="{\"id\":\""+request.id+"\",\"ok\":"+(ok?"true":"false")+",\"ready\":"+(ready?"true":"false")+",\"frame\":"+std::to_string(frame)+",\"handle\":"+std::to_string(handle)+"}";respond(request.temp,request.ready,body,request.id);log_.write("agent_selection="+request.id+" ok="+(ok?"true":"false"));}
    void complete(const Request& request,unsigned width,unsigned height,unsigned frame,bool game,bool presented,const std::string& error,std::string_view state) {auto body="{\"id\":\""+request.id+"\",\"width\":"+std::to_string(width)+",\"height\":"+std::to_string(height)+",\"frame\":"+std::to_string(frame)+",\"scope\":\""+(game?"game":"shell")+"\",\"presented\":"+(presented?"true":"false")+",\"ok\":"+(error.empty()?"true":"false")+",\"state\":"+std::string(state)+"}";respond(request.temp,request.ready,body,request.id);log_.write(error.empty()?"agent_capture="+request.id+" frame="+std::to_string(frame):"agent_capture_error="+request.id+" "+error);}

};
}
