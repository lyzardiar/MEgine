// Author: MiYu. Own native map data and archive overrides without materializing an editor project.
use crate::{AssetBytes,AssetError,AssetMounts,AssetSourceId,WarcraftArchives};
use crate::warcraft_archives::ScopedWarcraftMap;
use std::{path::Path,sync::{Arc,atomic::{AtomicBool,Ordering}}};
mod reader;
mod info;
mod strings;
mod placements;
mod objects;
mod world;
#[cfg(test)] mod world_tests;
#[cfg(test)] pub(crate) mod tests;
pub use placements::*;
pub use objects::*;
pub use world::WarcraftMapWorldData;
pub use info::*;
pub use strings::WarcraftStringTable;

#[derive(Clone,Copy,Debug)]
pub struct WarcraftMapLimits {pub max_member_bytes:usize,pub max_data_bytes:usize,pub max_decoded_bytes:usize,pub max_terrain_vertices:usize,pub max_pathing_cells:usize,pub max_records:usize,pub max_string_bytes:usize,pub max_text_bytes:usize}
impl Default for WarcraftMapLimits {fn default()->Self {Self {max_member_bytes:32*1024*1024,max_data_bytes:64*1024*1024,max_decoded_bytes:64*1024*1024,max_terrain_vertices:1025*1025,max_pathing_cells:4096*4096,max_records:65536,max_string_bytes:1024*1024,max_text_bytes:8*1024*1024}}}

#[derive(Debug,thiserror::Error)]
pub enum WarcraftMapError {
    #[error("map loading cancelled")] Cancelled,
    #[error("{member} at byte {offset}: {message}")] Format {member:&'static str,offset:usize,message:String},
    #[error("{member}: {message}")] Limit {member:&'static str,message:String},
    #[error(transparent)] Resource(#[from] AssetError),
}
type Result<T> = std::result::Result<T,WarcraftMapError>;

/// Cooperative cancellation at data stages and parser reads; it does not interrupt a source lock or an active StormLib call.
#[derive(Clone,Default)]
pub struct WarcraftMapCancelToken(Arc<AtomicBool>);
impl WarcraftMapCancelToken {pub fn cancel(&self) {self.0.store(true,Ordering::Release);} pub fn is_cancelled(&self)->bool {self.0.load(Ordering::Acquire)} fn check(&self)->Result<()> {if self.is_cancelled() {Err(WarcraftMapError::Cancelled)} else {Ok(())}}}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum WarcraftMapLoadPhase {Mount,Info,Terrain,Pathing,Strings,Validate,DataReady}
#[derive(Clone,Copy,Debug)]
pub struct WarcraftMapLoadProgress {pub phase:WarcraftMapLoadPhase,pub completed:usize,pub total:usize}

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct WarcraftTerrainCorner {pub ground:i16,pub water:u16,pub flags:u8,pub variation:u8,pub cliff:u8}
impl WarcraftTerrainCorner {
    pub fn ground_height(self)->f32 {(self.ground as f32-8192.)/512.}
    pub fn water_height(self)->f32 {((self.water&0x3fff) as f32-8192.)/512.}
    pub fn layer(self)->u8 {self.cliff&15}
    pub fn ground_texture(self)->u8 {self.flags&15}
    pub fn cliff_texture(self)->u8 {self.cliff>>4}
    pub fn is_ramp(self)->bool {self.flags&0x10!=0}
    pub fn is_blight(self)->bool {self.flags&0x20!=0}
    pub fn has_water(self)->bool {self.flags&0x40!=0}
    pub fn is_boundary(self)->bool {self.flags&0x80!=0}
    pub fn is_map_edge(self)->bool {self.water&0x4000!=0}
}

/// Packed seven-byte corners stay in the original immutable member payload; no per-corner heap expansion.
pub struct WarcraftMapTerrain {bytes:Arc<[u8]>,offset:usize,size:[u32;2],origin:[f32;2],tileset:u8,custom:i32,ground:Vec<[u8;4]>,cliffs:Vec<[u8;4]>}
impl WarcraftMapTerrain {
    pub fn parse(bytes:Arc<[u8]>,limits:WarcraftMapLimits)->Result<Self> {let cancel=WarcraftMapCancelToken::default(); let mut budget=reader::Budget::new(limits.max_decoded_bytes); reader::terrain(bytes,&limits,&cancel,&mut budget)}
    pub fn size(&self)->[u32;2] {self.size}
    pub fn tile_size(&self)->[u32;2] {[self.size[0]-1,self.size[1]-1]}
    pub fn origin(&self)->[f32;2] {self.origin}
    pub fn tileset(&self)->u8 {self.tileset}
    pub fn custom_tileset(&self)->i32 {self.custom}
    pub fn ground_tilesets(&self)->&[[u8;4]] {&self.ground}
    pub fn cliff_tilesets(&self)->&[[u8;4]] {&self.cliffs}
    pub fn packed_corners(&self)->&[u8] {&self.bytes[self.offset..]}
    pub fn corner(&self,x:u32,y:u32)->Option<WarcraftTerrainCorner> {if x>=self.size[0] || y>=self.size[1] {return None;} let at=self.offset+(y as usize*self.size[0] as usize+x as usize)*7; let b=&self.bytes[at..at+7]; Some(WarcraftTerrainCorner {ground:i16::from_le_bytes([b[0],b[1]]),water:u16::from_le_bytes([b[2],b[3]]),flags:b[4],variation:b[5],cliff:b[6]})}
    /// Raw W3E vertex coordinates; ramp surface composition and cliff geometry belong to the terrain compiler.
    pub fn source_vertex(&self,x:u32,y:u32)->Option<[f32;3]> {let corner=self.corner(x,y)?; Some([self.origin[0]+x as f32*128.,self.origin[1]+y as f32*128.,(corner.ground_height()+corner.layer() as f32-2.)*128.])}
}

pub struct WarcraftMapPathing {bytes:Arc<[u8]>,size:[u32;2]}
impl WarcraftMapPathing {
    pub fn parse(bytes:Arc<[u8]>,limits:WarcraftMapLimits)->Result<Self> {reader::pathing(bytes,&limits,&WarcraftMapCancelToken::default())}
    pub fn size(&self)->[u32;2] {self.size}
    pub fn cells(&self)->&[u8] {&self.bytes[16..]}
    pub fn cell(&self,x:u32,y:u32)->Option<u8> {if x>=self.size[0] || y>=self.size[1] {return None;} Some(self.bytes[16+y as usize*self.size[0] as usize+x as usize])}
    /// Full source byte in a half-open source-space grid; no lossy pathing mask or clamping.
    pub fn at_source(&self,origin:[f32;2],point:[f32;2])->Result<Option<u8>> {
        if origin.iter().chain(&point).any(|n|!n.is_finite()) {return Err(WarcraftMapError::Format {member:"war3map.wpm",offset:0,message:"non-finite pathing coordinate".into()});}
        let x=((point[0] as f64-origin[0] as f64)/32.).floor(); let y=((point[1] as f64-origin[1] as f64)/32.).floor(); if x<0. || y<0. || x>=self.size[0] as f64 || y>=self.size[1] as f64 {return Ok(None);} Ok(self.cell(x as u32,y as u32))
    }
}

/// Retain one handle for the map lifetime. Geometry, gameplay and views borrow the same data and mounted namespaces.
pub struct WarcraftMapSession {mount:ScopedWarcraftMap,info:WarcraftMapInfo,terrain:WarcraftMapTerrain,pathing:WarcraftMapPathing,strings:Option<Arc<WarcraftStringTable>>,members:Vec<AssetBytes>,diagnostics:Vec<String>}
impl WarcraftMapSession {
    pub fn open(archives:&WarcraftArchives,path:&Path,limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken)->Result<Self> {Self::open_with_progress(archives,path,limits,cancel,|_|{})}
    /// Synchronous core-data load for a worker. Progress precedes terrain/model compilation, GPU uploads and scripts.
    /// Cancellation waits for an in-flight archive call; callers must also guard publication against an obsolete load generation.
    pub fn open_with_progress(archives:&WarcraftArchives,path:&Path,limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken,mut progress:impl FnMut(WarcraftMapLoadProgress))->Result<Self> {
        report(cancel,&mut progress,WarcraftMapLoadPhase::Mount,0)?; let mount=archives.scoped_map(path)?; Self::load(mount,limits,cancel,progress)
    }
    fn load(mount:ScopedWarcraftMap,limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken,mut progress:impl FnMut(WarcraftMapLoadProgress))->Result<Self> {
        let mut budget=reader::Budget::new(limits.max_decoded_bytes); budget.charge("map session",std::mem::size_of::<AssetBytes>()*4)?; let mut members=Vec::with_capacity(4); let mut retained=0;
        report(cancel,&mut progress,WarcraftMapLoadPhase::Info,1)?; let bytes=read_member(&mount,"war3map.w3i",limits,&mut retained)?; let info=info::parse(&bytes.bytes,&limits,cancel,&mut budget)?; members.push(bytes);
        report(cancel,&mut progress,WarcraftMapLoadPhase::Terrain,2)?; let bytes=read_member(&mount,"war3map.w3e",limits,&mut retained)?; let terrain=reader::terrain(bytes.bytes.clone(),&limits,cancel,&mut budget)?; members.push(bytes);
        report(cancel,&mut progress,WarcraftMapLoadPhase::Pathing,3)?; let bytes=read_member(&mount,"war3map.wpm",limits,&mut retained)?; let pathing=reader::pathing(bytes.bytes.clone(),&limits,cancel)?; members.push(bytes);
        report(cancel,&mut progress,WarcraftMapLoadPhase::Strings,4)?; let mut diagnostics=Vec::new(); let strings=match read_member(&mount,"war3map.wts",limits,&mut retained) {
            Ok(bytes)=>{let parsed=strings::parse(bytes.bytes.clone(),&limits,cancel,&mut budget); members.push(bytes); match parsed {Ok(table)=>Some(Arc::new(table)),Err(e@WarcraftMapError::Format {..})=>{let text=format!("{e}; unresolved TRIGSTR values and original WTS bytes are retained"); budget.charge("war3map.wts",text.len()+std::mem::size_of::<String>()*2)?; diagnostics.push(text); None},Err(e)=>return Err(e)}},
            Err(WarcraftMapError::Resource(AssetError::NotFound(_)))=>None,Err(e)=>return Err(e),
        };
        report(cancel,&mut progress,WarcraftMapLoadPhase::Validate,5)?; let size=terrain.tile_size(); if Some(pathing.size())!=size[0].checked_mul(4).zip(size[1].checked_mul(4)).map(|(x,y)|[x,y]) {return Err(WarcraftMapError::Format {member:"war3map.wpm",offset:8,message:"WPM must have four cells per W3E tile on both axes".into()});}
        if info.omitted_editor_tables {let text="war3map.w3i omits editor-only tables; source tail is retained"; budget.charge("war3map.w3i",text.len()+std::mem::size_of::<String>()*2)?; diagnostics.push(text.into());}
        report(cancel,&mut progress,WarcraftMapLoadPhase::DataReady,6)?; Ok(Self {mount,info,terrain,pathing,strings,members,diagnostics})
    }
    pub fn path(&self)->&Path {&self.mount.path}
    pub fn source(&self)->AssetSourceId {self.mount.source}
    pub fn assets(&self)->&AssetMounts {&self.mount.assets}
    pub fn info(&self)->&WarcraftMapInfo {&self.info}
    pub fn terrain(&self)->&WarcraftMapTerrain {&self.terrain}
    pub fn pathing(&self)->&WarcraftMapPathing {&self.pathing}
    pub fn strings(&self)->Option<&WarcraftStringTable> {self.strings.as_deref()}
    pub(crate) fn string_table_handle(&self)->Option<Arc<WarcraftStringTable>> {self.strings.clone()}
    pub fn members(&self)->&[AssetBytes] {&self.members}
    pub fn diagnostics(&self)->&[String] {&self.diagnostics}
    pub fn display_name(&self)->&str {self.strings.as_ref().map_or(&self.info.name,|table|table.resolve(&self.info.name))}
    pub fn pathing_at_source(&self,point:[f32;2])->Result<Option<u8>> {self.pathing.at_source(self.terrain.origin(),point)}
}

fn report(cancel:&WarcraftMapCancelToken,progress:&mut impl FnMut(WarcraftMapLoadProgress),phase:WarcraftMapLoadPhase,completed:usize)->Result<()> {cancel.check()?; progress(WarcraftMapLoadProgress {phase,completed,total:6}); cancel.check()}
fn read_member(mount:&ScopedWarcraftMap,member:&'static str,limits:WarcraftMapLimits,retained:&mut usize)->Result<AssetBytes> {
    let remaining=limits.max_data_bytes.checked_sub(*retained).ok_or_else(||WarcraftMapError::Limit {member,message:"map data exceeds retained byte budget".into()})?; let value=mount.members.read_limited(member,remaining.min(limits.max_member_bytes))?;
    *retained=retained.checked_add(value.bytes.len()).filter(|n|*n<=limits.max_data_bytes).ok_or_else(||WarcraftMapError::Limit {member,message:"map data exceeds retained byte budget".into()})?; Ok(value)
}
