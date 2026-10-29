// Author: MiYu. Device-independent classic MDX animated triangle surface queries.
#include "walkable_geometry.h"
#include "binary.h"
#include "model_sequence.h"
#include <DirectXMath.h>
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <mutex>
#include <numeric>
#include <unordered_set>

namespace war3 {
namespace {
using namespace DirectX;
struct Key {int time=0;XMFLOAT4 value{},incoming{},outgoing{};};
struct Track {unsigned mode=0;int global=-1;std::vector<Key> keys;};
struct Node {int id=-1,parent=-1;unsigned flags=0;XMFLOAT4 pivot{};Track translation,rotation,scale;};
struct Mesh {std::vector<XMFLOAT4> positions;std::vector<std::uint16_t> indices;std::vector<std::uint8_t> groups;std::vector<std::vector<int>> matrices;std::vector<XMFLOAT3> sampled;};
XMFLOAT4 vector(Binary& b,unsigned width){XMFLOAT4 value{};for(unsigned i=0;i<width;++i)(&value.x)[i]=b.f32();return value;}
std::vector<unsigned> words(Binary& b,unsigned limit){auto count=b.count(4,limit);std::vector<unsigned> result;result.reserve(count);for(unsigned i=0;i<count;++i)result.push_back(b.u32());return result;}
Track readTrack(Binary& b,unsigned width){Track result;auto count=b.u32();result.mode=b.u32();result.global=b.i32();if(count>1000000 || result.mode>3 || result.global < -1 || count>b.left()/(4+width*4*(result.mode>1?3:1)))throw std::runtime_error("Invalid walkable model track");result.keys.reserve(count);for(unsigned i=0;i<count;++i){Key k;k.time=b.i32();k.value=vector(b,width);if(result.mode>1){k.incoming=vector(b,width);k.outgoing=vector(b,width);}if(i && k.time<result.keys.back().time)throw std::runtime_error("Unsorted walkable model track");result.keys.push_back(k);}return result;}
void readNode(Binary& source,std::vector<Node>& nodes){auto record=source.record(96);Node node;record.string(80);node.id=record.i32();node.parent=record.i32();node.flags=record.u32();if(node.id<0 || node.parent < -1 || nodes.size()>=4096)throw std::runtime_error("Invalid walkable model node");while(record.left()){auto kind=record.u32();if(kind==tag("KGTR"))node.translation=readTrack(record,3);else if(kind==tag("KGRT"))node.rotation=readTrack(record,4);else if(kind==tag("KGSC"))node.scale=readTrack(record,3);else throw std::runtime_error("Unknown walkable model node track");}nodes.push_back(std::move(node));}
}

struct WalkableGeometry::Data {
    std::vector<mdx::Sequence> sequences;
    std::vector<unsigned> globals,order;
    std::vector<Node> nodes;
    mutable std::vector<Mesh> meshes;
    bool globalPose=false,billboard=false;
    mutable std::mutex mutex;
    mutable std::map<std::string,int> sequenceLookup;
    mutable int cachedSequence=-2;
    mutable std::uint64_t cachedElapsed=0,cachedClock=0;
    mutable bool cached=false;
    int sequenceIndex(const std::string& name) const;
    XMVECTOR sample(const Track& track,int sequence,std::uint64_t elapsed,std::uint64_t clock,FXMVECTOR rest,bool rotation=false) const;
    void pose(int sequence,std::uint64_t elapsed,std::uint64_t clock,const XMMATRIX& instance) const;
};

int WalkableGeometry::Data::sequenceIndex(const std::string& name) const {auto found=sequenceLookup.find(name);if(found!=sequenceLookup.end())return found->second;int index=mdx::findSequence(sequences,name);if(index<0)index=mdx::findSequence(sequences,"Stand");if(index<0 && !sequences.empty())index=0;if(name.size()<=512 && sequenceLookup.size()<4096)sequenceLookup.emplace(name,index);return index;}

XMVECTOR WalkableGeometry::Data::sample(const Track& track,int sequence,std::uint64_t elapsed,std::uint64_t clock,FXMVECTOR rest,bool rotation) const {
    if(track.keys.empty())return rest;auto begin=track.keys.begin(),end=track.keys.end();std::int64_t time=0;
    if(track.global>=0){if(unsigned(track.global)>=globals.size())throw std::runtime_error("Walkable model global sequence missing");auto period=globals[track.global];time=period?(clock==UINT64_MAX?elapsed:clock)%period:0;}
    else if(sequence>=0){auto& s=sequences.at(size_t(sequence));auto duration=std::uint64_t(std::int64_t(s.end)-s.start);time=s.start+std::int64_t(s.flags&1?std::min(elapsed,duration):duration?elapsed%duration:0);begin=std::lower_bound(begin,end,s.start,[](const Key& key,int at){return key.time<at;});end=std::upper_bound(begin,end,s.end,[](int at,const Key& key){return at<key.time;});}
    else return rest;if(begin==end)return rest;if(time<=begin->time)return XMLoadFloat4(&begin->value);if(time>=(end-1)->time)return XMLoadFloat4(&(end-1)->value);auto upper=std::upper_bound(begin,end,time,[](std::int64_t at,const Key& key){return at<key.time;});auto lower=upper-1;float fraction=float(time-lower->time)/float(std::int64_t(upper->time)-lower->time);auto a=XMLoadFloat4(&lower->value),b=XMLoadFloat4(&upper->value);if(!track.mode)return a;if(track.mode==1)return rotation?XMQuaternionSlerp(a,b,fraction):XMVectorLerp(a,b,fraction);auto out=XMLoadFloat4(&lower->outgoing),in=XMLoadFloat4(&upper->incoming);if(rotation)return XMQuaternionSlerp(XMQuaternionSlerp(a,b,fraction),XMQuaternionSlerp(out,in,fraction),2*fraction*(1-fraction));if(track.mode==2)return XMVectorHermite(a,out,b,in,fraction);return a*((1-fraction)*(1-fraction)*(1-fraction))+out*(3*(1-fraction)*(1-fraction)*fraction)+in*(3*(1-fraction)*fraction*fraction)+b*(fraction*fraction*fraction);
}

void WalkableGeometry::Data::pose(int sequence,std::uint64_t elapsed,std::uint64_t clock,const XMMATRIX& instance) const {
    if(!billboard && cached && cachedSequence==sequence && cachedElapsed==elapsed && (!globalPose || cachedClock==clock))return;std::vector<XMFLOAT4X4> world(nodes.size());
    for(auto index:order){auto& node=nodes[index];auto pivot=XMLoadFloat4(&node.pivot),translation=sample(node.translation,sequence,elapsed,clock,XMVectorZero()),rotation=sample(node.rotation,sequence,elapsed,clock,XMQuaternionIdentity(),true),scale=sample(node.scale,sequence,elapsed,clock,XMVectorSet(1,1,1,0));auto parent=node.parent>=0?XMLoadFloat4x4(&world[size_t(node.parent)]):XMMatrixIdentity();if(node.flags&4){XMVECTOR ps,pq,pt;if(XMMatrixDecompose(&ps,&pq,&pt,parent))rotation=XMQuaternionMultiply(rotation,XMQuaternionInverse(pq));}auto posed=XMMatrixTranslationFromVector(-pivot)*XMMatrixScalingFromVector(scale)*XMMatrixRotationQuaternion(rotation)*XMMatrixTranslationFromVector(pivot+translation)*parent;if(node.flags&8){XMVECTOR ws,wq,wt;if(XMMatrixDecompose(&ws,&wq,&wt,posed)){auto position=XMVector3TransformCoord(pivot,posed);auto facing=XMMatrixInverse(nullptr,instance);facing.r[3]=XMVectorSet(0,0,0,1);posed=XMMatrixTranslationFromVector(-pivot)*XMMatrixScalingFromVector(ws)*facing*XMMatrixTranslationFromVector(position);}}XMStoreFloat4x4(&world[index],posed);}
    for(auto& mesh:meshes){mesh.sampled.resize(mesh.positions.size());for(size_t i=0;i<mesh.positions.size();++i){auto point=XMLoadFloat4(&mesh.positions[i]);if(!mesh.matrices.empty()){auto sum=XMVectorZero();auto& group=mesh.matrices[mesh.groups[i]];for(auto node:group)sum+=XMVector3TransformCoord(point,XMLoadFloat4x4(&world[size_t(node)]));point=sum/float(group.size());}XMStoreFloat3(&mesh.sampled[i],point);}}
    cached=true;cachedSequence=sequence;cachedElapsed=elapsed;cachedClock=clock;
}

WalkableGeometry::WalkableGeometry(std::unique_ptr<Data> data):data_(std::move(data)){}
WalkableGeometry::~WalkableGeometry()=default;
std::unique_ptr<WalkableGeometry> WalkableGeometry::read(std::span<const std::uint8_t> bytes) {
    if(bytes.size()>32*1024*1024)throw std::runtime_error("Walkable model input budget exceeded");auto data=std::make_unique<Data>();data->sequences=mdx::readSequences(bytes);Binary file(bytes);file.expect(tag("MDLX"));std::vector<XMFLOAT4> pivots;std::unordered_set<unsigned> chunks;unsigned version=0;size_t totalVertices=0,totalIndices=0;
    while(file.left()){auto kind=file.u32(),length=file.u32();Binary chunk(file.take(length));if(chunks.size()>=64 || !chunks.insert(kind).second)throw std::runtime_error("Duplicate walkable model chunk");
        if(kind==tag("VERS")){version=chunk.u32();chunk.finish();}
        else if(kind==tag("GLBS")){while(chunk.left()){if(data->globals.size()>=4096)throw std::runtime_error("Walkable model global budget exceeded");data->globals.push_back(chunk.u32());}}
        else if(kind==tag("PIVT")){while(chunk.left()){if(pivots.size()>=4096)throw std::runtime_error("Walkable model pivot budget exceeded");pivots.push_back(vector(chunk,3));}}
        else if(kind==tag("GEOS")){while(chunk.left()){if(data->meshes.size()>=4096)throw std::runtime_error("Walkable model mesh budget exceeded");auto g=chunk.record(4);Mesh mesh;g.expect(tag("VRTX"));auto count=g.count(12,65536);totalVertices+=count;if(totalVertices>1000000)throw std::runtime_error("Walkable model vertex budget exceeded");mesh.positions.reserve(count);for(unsigned i=0;i<count;++i)mesh.positions.push_back(vector(g,3));g.expect(tag("NRMS"));auto normals=g.count(12,65536);if(normals && normals!=count)throw std::runtime_error("Walkable model normal count mismatch");g.take(size_t(normals)*12);g.expect(tag("PTYP"));auto types=words(g,4096);for(auto type:types)if(type!=4)throw std::runtime_error("Non-triangle walkable model mesh");g.expect(tag("PCNT"));auto counts=words(g,4096);g.expect(tag("PVTX"));auto indices=g.count(2,3000000);totalIndices+=indices;if(totalIndices>3000000 || indices%3 || counts.size()!=types.size() || std::accumulate(counts.begin(),counts.end(),std::uint64_t(0))!=indices)throw std::runtime_error("Invalid walkable model primitive count");mesh.indices.reserve(indices);for(unsigned i=0;i<indices;++i){auto index=g.u16();if(index>=mesh.positions.size())throw std::runtime_error("Walkable model vertex index out of range");mesh.indices.push_back(index);}g.expect(tag("GNDX"));auto group=g.take(g.count(1,65536));mesh.groups.assign(group.begin(),group.end());g.expect(tag("MTGC"));auto sizes=words(g,256);g.expect(tag("MATS"));auto matrices=words(g,4096*256);size_t at=0;for(auto size:sizes){if(!size || size>matrices.size()-at)throw std::runtime_error("Invalid walkable model matrix group");std::vector<int> members;members.reserve(size);for(unsigned i=0;i<size;++i)members.push_back(int(matrices[at++]));mesh.matrices.push_back(std::move(members));}if(at!=matrices.size() || (!mesh.matrices.empty() && mesh.groups.size()!=mesh.positions.size()))throw std::runtime_error("Incomplete walkable model matrix groups");for(auto index:mesh.groups)if(index>=mesh.matrices.size())throw std::runtime_error("Missing walkable model matrix group");g.take(g.left());data->meshes.push_back(std::move(mesh));}}
        else if(kind==tag("BONE") || kind==tag("HELP")){while(chunk.left()){readNode(chunk,data->nodes);if(kind==tag("BONE"))chunk.take(8);}}
        else if(kind==tag("LITE") || kind==tag("PRE2") || kind==tag("PREM") || kind==tag("RIBB") || kind==tag("ATCH")){while(chunk.left()){auto payload=chunk.record(100);readNode(payload,data->nodes);payload.take(payload.left());}}
        else if(kind==tag("EVTS")){while(chunk.left()){readNode(chunk,data->nodes);chunk.expect(tag("KEVT"));auto count=chunk.count(4,1000000);auto global=chunk.i32();if(global < -1 || count>chunk.left()/4)throw std::runtime_error("Invalid walkable model event");chunk.take(size_t(count)*4);}}
    }
    if(version!=800)throw std::runtime_error("Walkable surface requires classic MDX800");std::map<int,unsigned> ids;for(unsigned i=0;i<data->nodes.size();++i){auto& node=data->nodes[i];if(!ids.emplace(node.id,i).second)throw std::runtime_error("Duplicate walkable model node");if(unsigned(node.id)<pivots.size())node.pivot=pivots[node.id];}for(auto& node:data->nodes)if(node.parent>=0){auto parent=ids.find(node.parent);if(parent==ids.end())throw std::runtime_error("Missing walkable model parent");node.parent=int(parent->second);}std::vector<unsigned char> marks(data->nodes.size());std::vector<unsigned> chain;for(unsigned i=0;i<data->nodes.size();++i){int next=int(i);while(next>=0 && marks[size_t(next)]!=2){if(marks[size_t(next)]==1)throw std::runtime_error("Cyclic walkable model hierarchy");marks[size_t(next)]=1;chain.push_back(unsigned(next));next=data->nodes[size_t(next)].parent;}while(!chain.empty()){auto index=chain.back();chain.pop_back();marks[index]=2;data->order.push_back(index);}}for(auto& mesh:data->meshes)for(auto& group:mesh.matrices)for(auto& id:group){auto node=ids.find(id);if(node==ids.end())throw std::runtime_error("Missing walkable model matrix node");id=int(node->second);}for(auto& node:data->nodes){data->billboard|=(node.flags&8)!=0;data->globalPose|=node.translation.global>=0 || node.rotation.global>=0 || node.scale.global>=0;}return std::unique_ptr<WalkableGeometry>(new WalkableGeometry(std::move(data)));
}

std::uint64_t WalkableGeometry::sequenceDuration(const std::string& sequence) const {std::lock_guard lock(data_->mutex);int index=data_->sequenceIndex(sequence);if(index<0)return 0;auto& item=data_->sequences[size_t(index)];return std::uint64_t(std::int64_t(item.end)-item.start);}
std::optional<float> WalkableGeometry::verticalSurface(float x,float y,const std::array<float,3>& position,const std::array<float,3>& scale,float angle,const std::string& sequence,std::uint64_t elapsed,std::uint64_t clock) const {
    if(!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(angle))return {};for(unsigned i=0;i<3;++i)if(!std::isfinite(position[i]) || !std::isfinite(scale[i]) || std::abs(scale[i])<1e-12f)return {};double cosine=std::cos(double(angle)),sine=std::sin(double(angle)),dx=double(x)-position[0],dy=double(y)-position[1],lx=(dx*cosine+dy*sine)/scale[0],ly=(-dx*sine+dy*cosine)/scale[1];if(!std::isfinite(lx) || !std::isfinite(ly))return {};std::lock_guard lock(data_->mutex);int index=data_->sequenceIndex(sequence);auto instance=XMMatrixScaling(scale[0],scale[1],scale[2])*XMMatrixRotationZ(angle)*XMMatrixTranslation(position[0],position[1],position[2]);data_->pose(index,elapsed,clock,instance);std::optional<float> result;
    for(auto& mesh:data_->meshes)for(size_t i=0;i+2<mesh.indices.size();i+=3){auto& a=mesh.sampled[mesh.indices[i]];auto& b=mesh.sampled[mesh.indices[i+1]];auto& c=mesh.sampled[mesh.indices[i+2]];if(!std::isfinite(a.x) || !std::isfinite(a.y) || !std::isfinite(a.z) || !std::isfinite(b.x) || !std::isfinite(b.y) || !std::isfinite(b.z) || !std::isfinite(c.x) || !std::isfinite(c.y) || !std::isfinite(c.z))continue;if(lx<double(std::min({a.x,b.x,c.x}))-.001 || lx>double(std::max({a.x,b.x,c.x}))+.001 || ly<double(std::min({a.y,b.y,c.y}))-.001 || ly>double(std::max({a.y,b.y,c.y}))+.001)continue;double ax=double(b.x)-a.x,ay=double(b.y)-a.y,bx=double(c.x)-a.x,by=double(c.y)-a.y,det=ax*by-ay*bx;if(!std::isfinite(det) || std::abs(det)<1e-10)continue;double px=lx-a.x,py=ly-a.y,u=(px*by-py*bx)/det,v=(ax*py-ay*px)/det;if(u < -1e-6 || v < -1e-6 || u+v > 1.000001)continue;double height=(double(a.z)+u*(double(b.z)-a.z)+v*(double(c.z)-a.z))*scale[2]+position[2];if(std::isfinite(height) && height>=-2560 && height<=2560 && (!result || height>*result))result=float(height);}return result;
}
}
