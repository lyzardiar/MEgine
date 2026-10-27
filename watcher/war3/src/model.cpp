// Author: MiYu. MDX800 bounds, geometry, hierarchy and texture ownership.
#include "model_data.h"
#include "scene_assets.h"
#include <map>
#include <numeric>
#include <unordered_set>
#include <cctype>

namespace war3 {
using namespace mdx;
namespace {
XMFLOAT4 vector(Binary& b, unsigned n) { XMFLOAT4 v{}; for (unsigned i = 0; i < n; ++i) (&v.x)[i] = b.f32(); return v; }
Track track(Binary& b, unsigned width, bool integer = false) {
    Track t; auto count = b.u32(); t.mode = b.u32(); t.global = b.i32();
    if (count > 1000000 || t.mode > 3 || t.global < -1 || (integer && t.mode)) throw std::runtime_error("Invalid MDX track");
    if (count > b.left() / (4 + width * 4 * (t.mode > 1 ? 3 : 1))) throw std::runtime_error("Truncated MDX track");
    t.keys.reserve(count);
    for (unsigned i = 0; i < count; ++i) { Key k; k.time = b.i32(); k.value = integer ? XMFLOAT4(float(b.u32()),0,0,0) : vector(b,width); if (t.mode > 1) { k.incoming = vector(b,width); k.outgoing = vector(b,width); } if (i && k.time < t.keys.back().time) throw std::runtime_error("Unsorted MDX track"); t.keys.push_back(k); }
    return t;
}
void transformTracks(Binary& b, Transform& t, unsigned translation, unsigned rotation, unsigned scale) {
    while (b.left()) { auto kind = b.u32(); if (kind == translation) t.translation = track(b,3); else if (kind == rotation) t.rotation = track(b,4); else if (kind == scale) t.scale = track(b,3); else throw std::runtime_error("Unsupported MDX transform record"); }
}
std::vector<unsigned> words(Binary& b, unsigned limit) { auto count = b.count(4,limit); std::vector<unsigned> out; out.reserve(count); for (unsigned i = 0; i < count; ++i) out.push_back(b.u32()); return out; }
std::vector<XMFLOAT4> vectors(Binary& b, unsigned width, unsigned limit) { auto count = b.count(width*4,limit); std::vector<XMFLOAT4> out; out.reserve(count); for (unsigned i = 0; i < count; ++i) out.push_back(vector(b,width)); return out; }
}
void Model::Data::parse(std::span<const std::uint8_t> bytes, Log& log) {
    if (bytes.size() > 32*1024*1024) throw std::runtime_error("MDX input budget exceeded");
    Binary b(bytes); b.expect(tag("MDLX")); std::vector<XMFLOAT4> pivots;
    std::map<unsigned,std::tuple<float,XMFLOAT4,Track,Track>> animations; std::unordered_set<unsigned> chunks; unsigned version = 0;
    while (b.left()) {
        auto kind = b.u32(), length = b.u32(); Binary r(b.take(length));
        if (chunks.size() >= 64 || !chunks.insert(kind).second) throw std::runtime_error("Duplicate MDX chunk");
        if (kind == tag("VERS")) { version = r.u32(); r.finish(); }
        else if (kind == tag("SEQS")) {
            while (r.left()) { Sequence s; s.name = r.string(80); s.start = r.i32(); s.end = r.i32(); r.take(4); s.flags = r.u32(); r.take(36); if (s.end < s.start || sequences.size() >= 4096) throw std::runtime_error("Invalid sequence"); sequences.push_back(s); }
        } else if (kind == tag("GLBS")) { while (r.left()) globals.push_back(r.u32()); }
        else if (kind == tag("TEXS")) {
            while (r.left()) { auto replacement = r.u32(); Texture t; t.replacement=replacement;t.path = r.string(260); t.flags = r.u32(); if (t.path.empty() && replacement == 1) t.path = "ReplaceableTextures\\TeamColor\\TeamColor00.blp"; if (t.path.empty() && replacement == 2) t.path = "ReplaceableTextures\\TeamGlow\\TeamGlow00.blp"; if (textures.size() >= 4096) throw std::runtime_error("Texture count exceeded"); textures.push_back(std::move(t)); }
        } else if (kind == tag("MTLS")) {
            while (r.left()) {
                auto m = r.record(20); Material material; material.priority = m.i32(); m.u32(); m.expect(tag("LAYS")); auto count = m.count(28,4096);
                for (unsigned i = 0; i < count; ++i) { auto l = m.record(28); Layer layer; layer.filter = l.u32(); layer.flags = l.u32(); layer.texture = l.u32(); layer.animation = l.i32(); layer.coord = l.u32(); layer.alpha = l.f32(); if (layer.filter > 6 || layer.animation < -1) throw std::runtime_error("Invalid classic layer"); while (l.left()) { auto k = l.u32(); if (k == tag("KMTA")) layer.opacity = track(l,1); else if (k == tag("KMTF")) layer.textureTrack = track(l,1,true); else throw std::runtime_error("Unsupported layer track"); } material.layers.push_back(std::move(layer)); }
                m.finish(); if (materials.size() >= 4096) throw std::runtime_error("Material count exceeded"); materials.push_back(std::move(material));
            }
        } else if (kind == tag("GEOS")) {
            size_t totalVertices = 0;
            while (r.left()) {
                auto g = r.record(4); Geoset mesh; g.expect(tag("VRTX")); mesh.positions = vectors(g,3,65536); totalVertices += mesh.positions.size(); if (totalVertices > 1000000) throw std::runtime_error("Vertex budget exceeded");
                g.expect(tag("NRMS")); g.take(size_t(g.count(12,65536))*12);
                g.expect(tag("PTYP")); auto types = words(g,4096); for (auto type : types) if (type != 4) throw std::runtime_error("Non-triangle geoset");
                g.expect(tag("PCNT")); auto counts = words(g,4096); g.expect(tag("PVTX")); auto count = g.count(2,3000000); mesh.indices.reserve(count);
                for (unsigned i = 0; i < count; ++i) { auto index = g.u16(); if (index >= mesh.positions.size()) throw std::runtime_error("Index out of range"); mesh.indices.push_back(index); }
                if (count%3 || counts.size() != types.size() || std::accumulate(counts.begin(),counts.end(),std::uint64_t(0)) != count) throw std::runtime_error("Invalid primitive counts");
                g.expect(tag("GNDX")); auto groups = g.take(g.count(1,65536)); mesh.group.assign(groups.begin(),groups.end()); g.expect(tag("MTGC")); auto sizes = words(g,256); g.expect(tag("MATS")); auto matrices = words(g,4096*256); size_t at = 0;
                for (auto size : sizes) { if (!size || size > matrices.size()-at) throw std::runtime_error("Invalid matrix group"); std::vector<int> ids; ids.reserve(size); for (unsigned j = 0; j < size; ++j) ids.push_back(int(matrices[at++])); mesh.matrices.push_back(std::move(ids)); }
                if (at != matrices.size() || (!mesh.matrices.empty() && mesh.group.size() != mesh.positions.size())) throw std::runtime_error("Incomplete matrix groups");
                for (auto group : mesh.group) if (group >= mesh.matrices.size()) throw std::runtime_error("Missing matrix group");
                mesh.material = g.u32(); g.take(8+28); g.take(size_t(g.count(28,65536))*28); g.expect(tag("UVAS")); auto sets = g.u32(); if (sets > 8) throw std::runtime_error("UV set count exceeded");
                for (unsigned i = 0; i < sets; ++i) { g.expect(tag("UVBS")); auto uv = vectors(g,2,65536); if (uv.size() != mesh.positions.size()) throw std::runtime_error("UV count mismatch"); mesh.uv.push_back(std::move(uv)); }
                g.finish(); mesh.sampled.resize(mesh.positions.size()); if (geosets.size() >= 4096) throw std::runtime_error("Geoset count exceeded"); geosets.push_back(std::move(mesh));
            }
        } else if (kind == tag("GEOA")) {
            while (r.left()) { auto a = r.record(28); float alpha = a.f32(); auto flags = a.u32(); auto tint = vector(a,3); if (flags&2) std::swap(tint.x,tint.z); else tint = {1,1,1,1}; auto id = a.u32(); Track opacity, color; while (a.left()) { auto k = a.u32(); if (k == tag("KGAO")) opacity = track(a,1); else if (k == tag("KGAC")) color = track(a,3); else throw std::runtime_error("Invalid geoset track"); } if (!animations.emplace(id,std::make_tuple(alpha,tint,std::move(opacity),std::move(color))).second) throw std::runtime_error("Duplicate geoset animation"); }
        } else if (kind == tag("TXAN")) { while (r.left()) { auto a = r.record(4); Transform t; transformTracks(a,t,tag("KTAT"),tag("KTAR"),tag("KTAS")); textureAnimations.push_back(std::move(t)); } }
        else if (kind == tag("PIVT")) { while (r.left()) pivots.push_back(vector(r,3)); }
        else if (kind == tag("CAMS")) {
            bool first = true;
            while (r.left()) { auto c = r.record(120); c.take(80); auto p = vector(c,3); auto field = c.f32(), farValue = c.f32(), nearValue = c.f32(); auto look = vector(c,3); Track position, destination; while (c.left()) { auto k = c.u32(); if (k == tag("KCTR")) position = track(c,3); else if (k == tag("KTTR")) destination = track(c,3); else if (k == tag("KCRL")) track(c,1); else throw std::runtime_error("Unknown camera track"); } if (first) { eye = p; target = look; fov = field; nearPlane = nearValue; farPlane = farValue; cameraPosition = std::move(position); cameraTarget = std::move(destination); first = false; } }
        } else if (kind == tag("BONE") || kind == tag("HELP") || kind == tag("LITE") || kind == tag("PRE2") || kind == tag("PREM") || kind == tag("RIBB") || kind == tag("ATCH")) {
            bool outer = kind != tag("BONE") && kind != tag("HELP"); if (outer && kind!=tag("PRE2") && kind!=tag("ATCH") && kind!=tag("RIBB")) log.write("mdx_effect_payload_pending="+std::to_string(kind));
            while (r.left()) { auto payload = outer ? r.record(100) : Binary({}); auto& source = outer ? payload : r; auto n = source.record(96); Node node;node.name=n.string(80); node.id = n.i32(); node.parent = n.i32(); node.flags = n.u32(); transformTracks(n,node.tracks,tag("KGTR"),tag("KGRT"),tag("KGSC")); if (node.id < 0 || node.parent < -1 || nodes.size() >= 4096) throw std::runtime_error("Invalid node"); nodes.push_back(std::move(node)); if (kind == tag("BONE")) source.take(8);
                if(kind==tag("PRE2")){
                    ParticleEmitter2 p;p.node=unsigned(nodes.size()-1);p.speed=source.f32();p.variation=source.f32();p.latitude=source.f32();p.gravity=source.f32();p.life=source.f32();p.rate=source.f32();p.width=source.f32();p.length=source.f32();p.filter=source.u32();p.rows=source.u32();p.columns=source.u32();p.headOrTail=source.u32();p.tail=source.f32();p.middle=source.f32();for(auto& c:p.colors)c=vector(source,3);for(auto& c:p.colors)c.w=float(source.u8())/255;for(auto& scale:p.scales)scale=source.f32();for(auto& interval:p.intervals)for(auto& value:interval)value=source.u32();auto texture=source.i32();p.squirt=source.u32();p.priority=source.i32();p.replacement=source.u32();
                    if(p.filter>4 || p.headOrTail>2 || p.rows>1024 || p.columns>1024 || p.life<0 || p.life>3600 || p.rate<0 || p.rate>100000 || p.tail<0 || p.middle<0 || p.middle>1 || p.variation<0 || (texture<0 && !p.replacement))throw std::runtime_error("MDX particle definition exceeds bounds");
                    p.texture=unsigned(std::max(0,texture));while(source.left()){auto k=source.u32();Track* t=k==tag("KP2S")?&p.speedTrack:k==tag("KP2R")?&p.variationTrack:k==tag("KP2L")?&p.latitudeTrack:k==tag("KP2G")?&p.gravityTrack:k==tag("KP2E")?&p.rateTrack:k==tag("KP2N")?&p.widthTrack:k==tag("KP2W")?&p.lengthTrack:k==tag("KP2V")?&p.visibility:nullptr;if(!t)throw std::runtime_error("Unknown PRE2 animation");*t=track(source,1);}emitters.push_back(std::move(p));
                }else if(kind==tag("RIBB")){
                    RibbonEmitter e;e.node=unsigned(nodes.size()-1);e.above=source.f32();e.below=source.f32();e.alpha=source.f32();e.color=vector(source,3);e.life=source.f32();e.slot=source.u32();e.rate=source.u32();e.rows=source.u32();e.columns=source.u32();auto material=source.i32();e.gravity=source.f32();if(material<0 || e.life<0 || e.life>3600 || e.rate>100000 || e.rows>1024 || e.columns>1024)throw std::runtime_error("MDX ribbon definition exceeds bounds");e.material=unsigned(material);while(source.left()){auto k=source.u32();Track* t=k==tag("KRHA")?&e.aboveTrack:k==tag("KRHB")?&e.belowTrack:k==tag("KRAL")?&e.alphaTrack:k==tag("KRCO")?&e.colorTrack:k==tag("KRTX")?&e.slotTrack:k==tag("KRVS")?&e.visibility:nullptr;if(!t)throw std::runtime_error("Unknown ribbon animation");*t=track(source,k==tag("KRCO")?3:1,k==tag("KRTX"));}ribbons.push_back(std::move(e));
                }else if(kind==tag("ATCH")){Attachment a;a.node=unsigned(nodes.size()-1);a.path=source.string(260);a.id=source.u32();while(source.left()){source.expect(tag("KATV"));a.visibility=track(source,1);}if(!a.path.empty())log.write("mdx_attachment_child_pending="+a.path);attachments.push_back(std::move(a));}
                else if (outer) source.take(source.left()); }
        }
    }
    if (version != 800 || (geosets.empty() && emitters.empty() && ribbons.empty())) throw std::runtime_error("Expected classic MDX800 geometry or emitted effects");
    if (!(fov > 0 && fov < XM_PI && nearPlane > 0 && farPlane > nearPlane)) throw std::runtime_error("Invalid camera");
    std::map<int,unsigned> ids;
    for (unsigned i = 0; i < nodes.size(); ++i) { if (!ids.emplace(nodes[i].id,i).second) throw std::runtime_error("Duplicate node id"); if (unsigned(nodes[i].id) < pivots.size()) nodes[i].pivot = pivots[nodes[i].id]; }
    for (auto& n : nodes) if (n.parent >= 0) { auto p = ids.find(n.parent); if (p == ids.end()) throw std::runtime_error("Missing parent node"); n.parent = int(p->second); }
    std::vector<unsigned char> marks(nodes.size()); std::vector<unsigned> path;
    for (unsigned i = 0; i < nodes.size(); ++i) { int next = int(i); while (next >= 0 && marks[next] != 2) { if (marks[next] == 1) throw std::runtime_error("Cyclic hierarchy"); marks[next] = 1; path.push_back(unsigned(next)); next = nodes[next].parent; } while (!path.empty()) { auto index = path.back(); path.pop_back(); marks[index] = 2; order.push_back(index); } }
    world.resize(nodes.size());globalPose=std::any_of(nodes.begin(),nodes.end(),[](auto& n){return n.tracks.translation.global>=0 || n.tracks.rotation.global>=0 || n.tracks.scale.global>=0;});billboard=std::any_of(nodes.begin(),nodes.end(),[](auto& node){return (node.flags&8)!=0;});float squared=0;for(auto& geoset:geosets)for(auto& p:geoset.positions)squared=std::max(squared,p.x*p.x+p.y*p.y+p.z*p.z);radius=std::sqrt(squared);
    for (auto& g : geosets) {
        if (g.material >= materials.size()) throw std::runtime_error("Missing material");
        for (auto& group : g.matrices) for (auto& id : group) { auto node = ids.find(id); if (node == ids.end()) throw std::runtime_error("Missing matrix node"); id = int(node->second); }
        for (auto& l : materials[g.material].layers) if (l.texture >= textures.size() || l.coord >= g.uv.size() || (l.animation >= 0 && unsigned(l.animation) >= textureAnimations.size())) throw std::runtime_error("Invalid layer reference");
    }
    for(auto& e:ribbons){if(e.material>=materials.size() || materials[e.material].layers.empty())throw std::runtime_error("Missing ribbon material");for(auto& layer:materials[e.material].layers)if(layer.texture>=textures.size() || (layer.animation>=0 && unsigned(layer.animation)>=textureAnimations.size()))throw std::runtime_error("Invalid ribbon layer");auto& n=nodes[e.node];radius=std::max(radius,std::hypot(n.pivot.x,n.pivot.y)+std::abs(n.pivot.z)+std::abs(e.above)+std::abs(e.below)+std::abs(e.gravity)*e.life*e.life);}
    for(auto& p:emitters){if(p.replacement){if(p.replacement!=1 && p.replacement!=2)throw std::runtime_error("Particle replaceable texture is not implemented: "+std::to_string(p.replacement));auto found=std::find_if(textures.begin(),textures.end(),[&](auto& t){return t.replacement==p.replacement;});if(found==textures.end()){Texture t;t.replacement=p.replacement;t.flags=0;t.path=p.replacement==1?"ReplaceableTextures\\TeamColor\\TeamColor00.blp":"ReplaceableTextures\\TeamGlow\\TeamGlow00.blp";p.texture=unsigned(textures.size());textures.push_back(std::move(t));}else p.texture=unsigned(found-textures.begin());}if(p.texture>=textures.size())throw std::runtime_error("Missing particle texture");auto& node=nodes[p.node];float extent=std::hypot(node.pivot.x,node.pivot.y)+std::abs(node.pivot.z)+std::abs(p.width)+std::abs(p.length)+std::abs(p.speed)*(1+p.variation)*p.life+.5f*std::abs(p.gravity)*p.life*p.life;for(auto scale:p.scales)extent=std::max(extent,std::abs(scale));radius=std::max(radius,extent);}
    for (auto& [index,a] : animations) { if (index >= geosets.size()) throw std::runtime_error("Missing animation target"); auto& g = geosets[index]; g.alpha = std::get<0>(a); g.color = std::get<1>(a); g.opacity = std::move(std::get<2>(a)); g.colorTrack = std::move(std::get<3>(a)); }
    for (unsigned g = 0; g < geosets.size(); ++g) for (unsigned l = 0; l < materials[geosets[g].material].layers.size(); ++l) draws.emplace_back(g,l);
    std::stable_sort(draws.begin(),draws.end(),[&](auto a, auto b) { auto& am = materials[geosets[a.first].material]; auto& bm = materials[geosets[b.first].material]; auto af = am.layers[a.second].filter, bf = bm.layers[b.second].filter; if ((af>=2)!=(bf>=2)) return af<2; if (af<2) return false; return std::tie(am.priority,af,a)<std::tie(bm.priority,bf,b); });
    for (unsigned i = 0; i < sequences.size(); ++i) if (sequences[i].name.starts_with("Stand")) { sequence = i; break; }
    log.write("mdx_geosets="+std::to_string(geosets.size())+" nodes="+std::to_string(nodes.size())+" ribbons="+std::to_string(ribbons.size())+" particles="+std::to_string(emitters.size())+" attachments="+std::to_string(attachments.size())+" textures="+std::to_string(textures.size())+" layers="+std::to_string(draws.size()));
}
Model::Model(Archives& archives, Images& images, Renderer* renderer, const char* name, Log& log,SceneAssets* shared) : data_(std::make_unique<Data>(renderer)) {
    auto member = archives.read(name); if (!member) throw std::runtime_error(std::string("Missing MDX: ")+name); data_->parse(member->bytes,log);
    size_t decoded = 0; std::map<std::string,Com<IDirect3DTexture9>> local;
    for (auto& texture : data_->textures) {
        if(shared){if(!texture.path.empty())shared->prepareTexture(texture.path);else shared->image("@white",{1,1,{0xffffffff}});continue;}
        if (auto found = local.find(texture.path); found != local.end()) { texture.gpu = found->second; continue; }
        Image image; if (!texture.path.empty()) { auto bytes = archives.readTexture(texture.path); if (!bytes) throw std::runtime_error("Missing model texture: "+texture.path); image = images.decode(bytes->bytes); } else image = {1,1,{0xffffffff}};
        decoded += image.pixels.size()*4; if (decoded > 256*1024*1024) throw std::runtime_error("Model texture budget exceeded"); if (renderer) texture.gpu = renderer->texture(image.width,image.height,image.pixels); local.emplace(texture.path,texture.gpu);
    }
    log.write("mdx_texture_bytes="+std::to_string(decoded));
}
Model::~Model() = default;
std::uint64_t Model::sequenceDuration() const {return data_->sequences.empty()?0:std::uint64_t(data_->sequences[data_->sequence].end-data_->sequences[data_->sequence].start);}
float Model::radius() const {return data_->radius;}
bool Model::sequenceLoops() const {return !data_->sequences.empty() && !(data_->sequences[data_->sequence].flags&1);}
void Model::upload(Renderer& renderer,SceneAssets& assets) {data_->renderer=&renderer;for(auto& texture:data_->textures)texture.gpu=assets.texture(texture.path.empty()?"@white":texture.path);}
void Model::replace(unsigned id,IDirect3DTexture9* value) {for(auto& texture:data_->textures)if(texture.replacement==id)texture.gpu=value;}
bool Model::sequence(const std::string& prefix) {auto lower=[](std::string s){for(auto& c:s)c=char(std::tolower(static_cast<unsigned char>(c)));return s;};auto key=lower(prefix);auto found=data_->sequenceNames.find(key);if(found==data_->sequenceNames.end()){int index=-1;for(unsigned i=0;i<data_->sequences.size();++i)if(lower(data_->sequences[i].name).starts_with(key)){index=int(i);break;}found=data_->sequenceNames.emplace(std::move(key),index).first;}if(found->second<0)return false;data_->sequence=unsigned(found->second);return true;}
bool Model::sequenceIndex(unsigned index) {if(index>=data_->sequences.size())return false;data_->sequence=index;return true;}
ModelGeometry Model::geometry() const {
    auto& d=*data_;if(d.geosets.size()!=1 || d.materials.size()!=1 || d.materials[0].layers.size()!=1 || d.materials[0].layers[0].filter!=0)throw std::runtime_error("Terrain template requires a single opaque geoset");auto& g=d.geosets[0];if(g.uv.empty() || g.uv[0].size()!=g.positions.size())throw std::runtime_error("Terrain template has no UV0");std::vector<XMFLOAT4X4> pose(d.nodes.size());
    for(auto i:d.order){auto& n=d.nodes[i];if(n.flags&8)throw std::runtime_error("Terrain cliff cannot use billboard nodes");auto p=XMLoadFloat4(&n.pivot),t=d.sample(n.tracks.translation,0,XMVectorZero()),q=d.sample(n.tracks.rotation,0,XMQuaternionIdentity(),true),s=d.sample(n.tracks.scale,0,XMVectorSet(1,1,1,0));auto parent=n.parent>=0?XMLoadFloat4x4(&pose[n.parent]):XMMatrixIdentity();XMStoreFloat4x4(&pose[i],XMMatrixTranslationFromVector(-p)*XMMatrixScalingFromVector(s)*XMMatrixRotationQuaternion(q)*XMMatrixTranslationFromVector(p+t)*parent);}
    ModelGeometry result;result.indices=g.indices;for(size_t i=0;i<g.positions.size();++i){auto p=XMLoadFloat4(&g.positions[i]);if(!g.matrices.empty()){auto sum=XMVectorZero();auto& group=g.matrices[g.group[i]];for(auto node:group)sum+=XMVector3TransformCoord(p,XMLoadFloat4x4(&pose[node]));p=sum/float(group.size());}XMFLOAT3 vertex;XMStoreFloat3(&vertex,p);auto& uv=g.uv[0][i];result.vertices.push_back({vertex.x,vertex.y,vertex.z,uv.x,uv.y});}return result;
}
}
