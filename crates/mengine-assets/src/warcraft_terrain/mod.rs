// Author: MiYu. Compile source Warcraft ground and cliff geometry and textures in memory; format provenance is in third_party/warcraft-map-format.
use crate::{AssetBytes,AssetLocation,AssetMounts,AssetError,MeshData,MdxModel,MdxReadLimits,TextureRgba8,WarcraftMapTerrain,WarcraftMapCancelToken,WarcraftMapError,decode_texture_rgba8,texture_dimensions_from_bytes};
use std::{collections::HashMap,sync::Arc};
mod slk;
mod layout;
mod surface;
mod water;
pub use water::{WarcraftWater,WarcraftWaterSettings};
#[cfg(test)] mod tests;
pub use layout::{WarcraftTerrainLayout,WarcraftGroundTile,WarcraftCliffPlacement};
pub use surface::{WarcraftGroundLayers,warcraft_ground_layers};

type Result<T> = std::result::Result<T,WarcraftMapError>;
fn invalid(message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Format {member:"terrain compiler",offset:0,message:message.into()}}
fn limit(message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Limit {member:"terrain compiler",message:message.into()}}
fn check(cancel:&WarcraftMapCancelToken)->Result<()> {if cancel.is_cancelled() {Err(WarcraftMapError::Cancelled)} else {Ok(())}}
struct Budget(usize);
impl Budget {fn charge(&mut self,n:usize)->Result<()> {self.0=self.0.checked_sub(n).ok_or_else(||limit("allocation budget exceeded"))?; Ok(())}}
fn array<T>(count:usize,budget:&mut Budget)->Result<Vec<T>> {budget.charge(count.checked_mul(std::mem::size_of::<T>()).ok_or_else(||limit("array size overflow"))?)?; let mut v=Vec::new(); v.try_reserve_exact(count).map_err(|_|limit("cannot reserve array"))?; Ok(v)}
fn filled<T:Clone>(count:usize,value:T,budget:&mut Budget)->Result<Vec<T>> {let mut v=array(count,budget)?; v.resize(count,value); Ok(v)}

#[derive(Clone,Copy,Debug)]
pub struct WarcraftTerrainLimits {pub max_member_bytes:usize,pub max_layout_bytes:usize,pub max_mesh_bytes:usize,pub max_texture_bytes:usize,pub max_template_bytes:usize,pub max_templates:usize,pub max_atlas_tiles:usize,pub max_chunks:usize,pub chunk_size:u32}
impl Default for WarcraftTerrainLimits {fn default()->Self {Self {max_member_bytes:16*1024*1024,max_layout_bytes:128*1024*1024,max_mesh_bytes:256*1024*1024,max_texture_bytes:128*1024*1024,max_template_bytes:32*1024*1024,max_templates:512,max_atlas_tiles:4096,max_chunks:4096,chunk_size:16}}}
#[derive(Clone,Copy,Debug,PartialEq,Eq,Hash,serde::Serialize)]
pub enum WarcraftTerrainMaterial {Ground,Cliff(u8),Water}
#[derive(serde::Serialize)]
pub struct WarcraftTerrainChunk {pub cell:[u32;2],pub material:WarcraftTerrainMaterial,pub mesh:MeshData}
pub struct WarcraftTerrainResource {pub location:AssetLocation,pub bytes:usize}
pub struct WarcraftTerrain {pub layout:WarcraftTerrainLayout,pub chunks:Vec<WarcraftTerrainChunk>,pub ground_atlas:TextureRgba8,pub cliff_textures:Vec<Arc<TextureRgba8>>,pub resources:Vec<WarcraftTerrainResource>,pub water:Option<WarcraftWater>}

struct CliffDef {family:String,ramp:String,ground:[u8;4],texture:String}
struct Pattern {variants:Vec<usize>,complete:bool}
struct Template {member:String,span:[u32;2],mesh:MeshData}
struct Compiler<'a> {mounts:&'a AssetMounts,cancel:&'a WarcraftMapCancelToken,limits:WarcraftTerrainLimits,layout:Budget,textures:Budget,templates_budget:Budget,templates:Vec<Template>,patterns:HashMap<String,Pattern>,resources:Vec<WarcraftTerrainResource>,decoded:HashMap<AssetLocation,Arc<TextureRgba8>>}
impl Compiler<'_> {
    fn record(&mut self,value:&AssetBytes)->Result<()> {if self.resources.iter().any(|r|r.location==value.location) {return Ok(());} self.layout.charge(value.location.member.len()+std::mem::size_of::<WarcraftTerrainResource>()*2)?; self.resources.push(WarcraftTerrainResource {location:value.location.clone(),bytes:value.bytes.len()}); Ok(())}
    fn read(&mut self,member:&str,texture:bool)->Result<AssetBytes> {check(self.cancel)?; let bytes=if texture {self.mounts.read_texture_bytes_limited(member,self.limits.max_member_bytes)?} else {self.mounts.read_limited(member,self.limits.max_member_bytes)?}; check(self.cancel)?; self.record(&bytes)?; Ok(bytes)}
    fn texture(&mut self,member:&str)->Result<Arc<TextureRgba8>> {let bytes=self.read(member,true)?; if let Some(texture)=self.decoded.get(&bytes.location) {return Ok(texture.clone());} let size=texture_dimensions_from_bytes(&bytes.bytes,&bytes.location.member)?; let count=(size[0] as usize).checked_mul(size[1] as usize).and_then(|n|n.checked_mul(4)).ok_or_else(||limit("texture size overflow"))?; self.textures.charge(count)?; let image=decode_texture_rgba8(&bytes.bytes,&bytes.location.member)?; check(self.cancel)?; self.layout.charge(192+bytes.location.member.len())?; let image=Arc::new(image); self.decoded.insert(bytes.location,image.clone()); Ok(image)}
    fn resolve(&mut self,family:&str,pattern:[u8;4],variation:u8)->Result<Option<usize>> {
        if family.is_empty() || family.len()>64 || !family.bytes().all(|c|c.is_ascii_alphanumeric() || c==b'_') {return Err(invalid("invalid source cliff family"));}
        let pattern=std::str::from_utf8(&pattern).map_err(|_|invalid("invalid cliff pattern"))?; let key=format!("{family}/{pattern}");
        if !self.patterns.contains_key(&key) {self.layout.charge(key.len()+160)?; self.patterns.insert(key.clone(),Pattern {variants:vec![],complete:false});}
        let mut pattern_record=self.patterns.remove(&key).unwrap();
        while !pattern_record.complete && pattern_record.variants.len()<=variation as usize {
            let variation=pattern_record.variants.len();
            check(self.cancel)?; let member=format!("Doodads/Terrain/{family}/{family}{pattern}{variation}.mdx");
            let bytes=match self.read(&member,false) {Ok(b)=>b,Err(WarcraftMapError::Resource(AssetError::NotFound(_)))=>{pattern_record.complete=true; break;},Err(e)=>return Err(e)};
            if self.templates.len()>=self.limits.max_templates {return Err(limit("too many cliff templates"));}
            let limits=MdxReadLimits {max_input_bytes:self.limits.max_member_bytes,max_decoded_bytes:self.limits.max_template_bytes,max_vertices:100000,max_indices:300000,..Default::default()}; let model=MdxModel::parse_with_limits(&bytes.bytes,limits)?; if model.requires_dynamic_pose() {return Err(invalid("animated or billboard cliff templates require a runtime pose consumer"));} let mut pose=model.sample(None,0,None)?;
            if pose.geosets.len()!=1 || !model.diagnostics().is_empty() {return Err(invalid(format!("cliff template requires one supported static geoset: {member}")));}
            cliff_material(&pose.geosets[0],model.textures())?; let mesh=pose.geosets.remove(0).mesh; if mesh.positions.is_empty() {return Err(invalid("empty cliff template"));}
            self.templates_budget.charge(mesh_bytes(&mesh)?)?;
            let mut bounds=[[f32::INFINITY;3],[f32::NEG_INFINITY;3]]; for p in &mesh.positions {for c in 0..3 {bounds[0][c]=bounds[0][c].min(p[c]); bounds[1][c]=bounds[1][c].max(p[c]);}}
            let span=[(bounds[1][0]-bounds[0][0]).round() as u32,(bounds[1][2]-bounds[0][2]).round() as u32];
            if !matches!(span,[1,1]|[1,2]|[2,1]) || bounds[1][0].abs()>0.02 || bounds[1][2].abs()>0.02 || (bounds[0][0]+span[0] as f32).abs()>0.02 || (bounds[0][2]+span[1] as f32).abs()>0.02 {return Err(invalid(format!("cliff footprint is not source anchored: {member}")));}
            self.layout.charge(std::mem::size_of::<Template>()*2+member.len()+std::mem::size_of::<usize>()*2)?; pattern_record.variants.push(self.templates.len()); self.templates.push(Template {member,span,mesh});
        }
        let variants=&pattern_record.variants; let selected=if variants.is_empty() {None} else {Some(variants[(variation as usize).min(variants.len()-1)])}; self.patterns.insert(key,pattern_record); Ok(selected)
    }
}
fn mesh_bytes(mesh:&MeshData)->Result<usize> {mesh.positions.len().checked_mul(32).and_then(|n|mesh.indices.len().checked_mul(4).and_then(|i|n.checked_add(i))).ok_or_else(||limit("mesh size overflow"))}
fn family(value:&str,budget:&mut Budget)->Result<String> {if value.is_empty() || value.len()>64 || !value.bytes().all(|c|c.is_ascii_alphanumeric() || c==b'_') {return Err(invalid("invalid source cliff family"));} budget.charge(value.len())?; Ok(value.into())}
fn source_path(dir:&str,file:&str,budget:&mut Budget)->Result<String> {let count=dir.len().checked_add(file.len()).and_then(|n|n.checked_add(5)).filter(|n|*n<=4096).ok_or_else(||limit("source texture path exceeds limit"))?; budget.charge(count*2)?; let path=format!("{dir}/{file}.blp"); Ok(crate::asset_bytes::normalize_member(&path)?)}
fn cliff_material(g:&crate::MdxGeosetPose,textures:&[crate::MdxTexture])->Result<()> {
    if g.alpha!=1. || g.color!=[1.;3] || g.layers.len()!=1 {return Err(invalid("cliff template requires one opaque white material layer"));}
    let l=&g.layers[0]; if l.filter!=0 || l.flags!=0 || l.alpha!=1. || l.uv_set!=0 || l.uv!=[1.,0.,0.,1.,0.,0.] || textures.get(l.texture).map(|t|t.replaceable_id)!=Some(11) {return Err(invalid("cliff template requires opaque UV0 with the source cliff replacement texture"));} Ok(())
}

impl WarcraftTerrain {
    pub fn ground_shader(&self)->String {surface::ground_shader([self.ground_atlas.width,self.ground_atlas.height])}
    /// Compile source ground, cliffs and water in memory; world instantiation is a separate consumer.
    pub fn compile(terrain:&WarcraftMapTerrain,mounts:&AssetMounts,limits:WarcraftTerrainLimits,cancel:&WarcraftMapCancelToken)->Result<Self> {
        check(cancel)?; if !matches!(limits.chunk_size,8|16|32) {return Err(invalid("chunk size must be8,16 or32"));} if terrain.ground_tilesets().is_empty() || terrain.ground_tilesets().len()>16 || terrain.cliff_tilesets().len()>16 {return Err(invalid("invalid classic tileset slot count"));}
        let mut c=Compiler {mounts,cancel,limits,layout:Budget(limits.max_layout_bytes),textures:Budget(limits.max_texture_bytes),templates_budget:Budget(limits.max_template_bytes),templates:vec![],patterns:HashMap::new(),resources:vec![],decoded:HashMap::new()};
        let ground_bytes=c.read("TerrainArt/Terrain.slk",false)?; let table=slk::Table::parse(&ground_bytes.bytes,&mut c.layout,cancel)?; let mut grounds=array(terrain.ground_tilesets().len(),&mut c.layout)?; for id in terrain.ground_tilesets() {let row=std::str::from_utf8(id).map_err(|_|invalid("non-ASCII ground ID"))?; grounds.push(source_path(table.get(row,"dir")?,table.get(row,"file")?,&mut c.layout)?);}
        let cliff_bytes=c.read("TerrainArt/CliffTypes.slk",false)?; let table=slk::Table::parse(&cliff_bytes.bytes,&mut c.layout,cancel)?; let mut cliffs=array(terrain.cliff_tilesets().len(),&mut c.layout)?;
        for id in terrain.cliff_tilesets() {let row=std::str::from_utf8(id).map_err(|_|invalid("non-ASCII cliff ID"))?; cliffs.push(CliffDef {family:family(table.get(row,"cliffModelDir")?,&mut c.layout)?,ramp:family(table.get(row,"rampModelDir")?,&mut c.layout)?,ground:table.get(row,"groundTile")?.as_bytes().try_into().map_err(|_|invalid("cliff ground ID is not four bytes"))?,texture:source_path(table.get(row,"texDir")?,table.get(row,"texFile")?,&mut c.layout)?});}
        let layout=layout::compile(terrain,&cliffs,&mut c)?;
        let mut textures=Vec::new(); for member in grounds {textures.push(c.texture(&member)?);} let blight=match terrain.tileset() {b'A'=>"Ashen",b'B'=>"Barrens",b'C'=>"Felwood",b'D'=>"Cave",b'F'=>"Lordf",b'G'=>"Dungeon",b'I'=>"Ice",b'J'=>"DRuins",b'K'=>"Citadel",b'L'=>"Lords",b'N'=>"North",b'O'=>"Outland",b'Q'=>"VillageFall",b'V'|b'X'|b'Y'=>"Village",b'W'=>"Lordw",b'Z'=>"Ruins",_=>return Err(invalid("unsupported source blight tileset"))}; textures.push(c.texture(&format!("TerrainArt/Blight/{blight}_Blight.blp"))?);
        let (ground_atlas,tiles)=surface::atlas(&layout.ground,&textures,&mut c)?; drop(textures); let mut cliff_textures=Vec::new(); for cliff in cliffs {cliff_textures.push(c.texture(&cliff.texture)?);}
        let water=water::compile(terrain,&layout,&mut c)?; let chunks=surface::meshes(terrain,&layout,&c.templates,&tiles,&ground_atlas,water.as_ref(),limits,cancel)?; Ok(Self {layout,chunks,ground_atlas,cliff_textures,resources:c.resources,water})
    }
}
