// Author: MiYu. Bound shared public MDX/texture decoding by actual archive identity while map resources follow live handles.
use crate::{AssetBytes,AssetLocation,AssetSourceId,AssetError,MdxModel,MdxReadLimits,TextureRgba8,WarcraftMapCancelToken,decode_texture_rgba8,texture_dimensions_from_bytes};
use parking_lot::Mutex;
use std::{collections::HashMap,sync::Arc};
pub struct WarcraftDecodedModel {pub source:AssetBytes,pub model:Arc<MdxModel>}
pub struct WarcraftDecodedTexture {pub source:AssetBytes,pub rgba:Arc<TextureRgba8>}
#[derive(Clone)] enum Resource {Model(Arc<WarcraftDecodedModel>),Texture(Arc<WarcraftDecodedTexture>)}
impl Resource {fn cost(&self)->usize {let (source,decoded,metadata)=match self {Self::Model(m)=>(&m.source,m.model.decoded_bytes(),std::mem::size_of::<MdxModel>()+std::mem::size_of::<WarcraftDecodedModel>()),Self::Texture(t)=>(&t.source,t.rgba.pixels.len(),std::mem::size_of::<TextureRgba8>()+std::mem::size_of::<WarcraftDecodedTexture>())}; source.bytes.len().saturating_add(decoded).saturating_add(source.location.member.len().saturating_mul(2)).saturating_add(metadata+std::mem::size_of::<Entry>()+std::mem::size_of::<(AssetLocation,bool)>()+64)}}
struct Entry {value:Resource,used:u64}
#[derive(Default)] struct State {entries:HashMap<(AssetLocation,bool),Entry>,clock:u64,bytes:usize,hits:u64,misses:u64}
#[derive(Clone,Copy,Debug,serde::Serialize)] pub struct WarcraftResourceCacheStats {pub entries:usize,pub resident_bytes:usize,pub hits:u64,pub misses:u64}
/// Cache budgets cover owned public references; live handles and decoder work buffers have separate budgets.
pub struct WarcraftResourceCache {max_bytes:usize,state:Mutex<State>}
impl Default for WarcraftResourceCache {fn default()->Self {Self::new(256*1024*1024)}}
fn invalid(message:&str)->AssetError {AssetError::Invalid(message.into())}
fn check(cancel:&WarcraftMapCancelToken)->Result<(),AssetError> {if cancel.is_cancelled() {Err(invalid("native resource decoding cancelled"))} else {Ok(())}}
impl WarcraftResourceCache {
    pub fn new(max_bytes:usize)->Self {Self {max_bytes,state:Mutex::new(State::default())}}
    pub fn stats(&self)->WarcraftResourceCacheStats {let s=self.state.lock(); WarcraftResourceCacheStats {entries:s.entries.len(),resident_bytes:s.bytes,hits:s.hits,misses:s.misses}}
    fn get(&self,key:&(AssetLocation,bool))->Option<Resource> {let mut s=self.state.lock(); s.clock=s.clock.saturating_add(1); let used=s.clock; if let Some(e)=s.entries.get_mut(key) {e.used=used; let v=e.value.clone(); s.hits+=1; Some(v)} else {s.misses+=1; None}}
    fn intern(&self,key:(AssetLocation,bool),value:Resource)->Resource {
        let cost=value.cost(); let mut s=self.state.lock(); if let Some(e)=s.entries.get(&key) {return e.value.clone();} if cost>self.max_bytes {return value;}
        while s.entries.len()>=4096 || s.bytes>self.max_bytes-cost {let key=s.entries.iter().min_by_key(|(_,e)|e.used).map(|(k,_)|k.clone()); if let Some(key)=key {let e=s.entries.remove(&key).unwrap(); s.bytes-=e.value.cost();} else {break;}}
        s.clock=s.clock.saturating_add(1); let used=s.clock; s.bytes+=cost; s.entries.insert(key,Entry {value:value.clone(),used}); value
    }
    /// Cooperative cancellation surrounds bounded parsing; it does not interrupt an active MDX parser or image decoder.
    pub fn model(&self,bytes:AssetBytes,map:AssetSourceId,max_decoded_bytes:usize,cancel:&WarcraftMapCancelToken)->Result<Arc<WarcraftDecodedModel>,AssetError> {
        check(cancel)?; let key=(bytes.location.clone(),false); if bytes.location.source!=map {if let Some(Resource::Model(m))=self.get(&key) {if m.model.decoded_bytes()>max_decoded_bytes {return Err(invalid("cached MDX exceeds requested decoded budget"));} check(cancel)?; return Ok(m);}}
        let mut model=MdxModel::parse_with_limits(&bytes.bytes,MdxReadLimits {max_input_bytes:bytes.bytes.len(),max_decoded_bytes,..Default::default()})?; check(cancel)?; model.max_pose_bytes=MdxReadLimits::default().max_decoded_bytes; let map_owned=bytes.location.source==map; let value=Resource::Model(Arc::new(WarcraftDecodedModel {source:bytes,model:Arc::new(model)}));
        let Resource::Model(value)=(if map_owned {value} else {self.intern(key,value)}) else {unreachable!()}; check(cancel)?; Ok(value)
    }
    pub fn texture(&self,bytes:AssetBytes,map:AssetSourceId,max_rgba_bytes:usize,cancel:&WarcraftMapCancelToken)->Result<Arc<WarcraftDecodedTexture>,AssetError> {
        check(cancel)?; let key=(bytes.location.clone(),true); if bytes.location.source!=map {if let Some(Resource::Texture(t))=self.get(&key) {if t.rgba.pixels.len()>max_rgba_bytes {return Err(invalid("cached texture exceeds requested RGBA budget"));} check(cancel)?; return Ok(t);}}
        let [width,height]=texture_dimensions_from_bytes(&bytes.bytes,&bytes.location.member)?; let count=(width as usize).checked_mul(height as usize).and_then(|n|n.checked_mul(4)).filter(|n|*n<=max_rgba_bytes).ok_or_else(||invalid("native texture exceeds requested RGBA budget"))?;
        let rgba=decode_texture_rgba8(&bytes.bytes,&bytes.location.member)?; if rgba.pixels.len()!=count {return Err(invalid("native texture decoded byte count changed"));} check(cancel)?; let map_owned=bytes.location.source==map; let value=Resource::Texture(Arc::new(WarcraftDecodedTexture {source:bytes,rgba:Arc::new(rgba)}));
        let Resource::Texture(value)=(if map_owned {value} else {self.intern(key,value)}) else {unreachable!()}; check(cancel)?; Ok(value)
    }
}
