// Author: MiYu. Native classic Warcraft model data; format references and licenses are retained in third_party/warcraft-model-reference.
use crate::{AssetError, MeshData};
use glam::{Mat4, Vec3, Vec4};
use std::sync::Arc;

mod reader;
mod pose;
#[cfg(test)] pub(crate) mod tests;

#[derive(Clone, Copy, Debug)]
pub struct MdxReadLimits { pub max_input_bytes: usize, pub max_decoded_bytes: usize, pub max_vertices: usize, pub max_indices: usize, pub max_keys: usize, pub max_nodes: usize }
impl Default for MdxReadLimits { fn default() -> Self { Self { max_input_bytes:128*1024*1024, max_decoded_bytes:256*1024*1024, max_vertices:2_000_000, max_indices:12_000_000, max_keys:1_000_000, max_nodes:8192 } } }

#[derive(Clone, Debug)]
pub struct MdxSequence { pub name: String, pub start_ms: i64, pub end_ms: i64, pub non_looping: bool, pub rarity:f32 }
#[derive(Clone, Debug)]
pub struct MdxTexture { pub path: String, pub replaceable_id: u32, pub flags: u32 }
impl MdxTexture {
    /// Tileset and authored replacements take precedence over these classic defaults in the session consumer.
    pub fn default_member(&self, team: u8) -> Option<String> {
        match self.replaceable_id {
            0 => (!self.path.is_empty()).then(|| self.path.clone()),
            1 | 2 if team < 28 => Some(format!("ReplaceableTextures/{}/{}{:02}.blp", if self.replaceable_id == 1 {"TeamColor"} else {"TeamGlow"}, if self.replaceable_id == 1 {"TeamColor"} else {"TeamGlow"}, team)),
            11 => Some("ReplaceableTextures/Cliff/Cliff1.blp".into()),
            31 => Some("ReplaceableTextures/LordaeronTree/LordaeronSummerTree.blp".into()),
            32 => Some("ReplaceableTextures/AshenvaleTree/AshenTree.blp".into()),
            33 => Some("ReplaceableTextures/BarrensTree/BarrensTree.blp".into()),
            34 => Some("ReplaceableTextures/NorthrendTree/NorthTree.blp".into()),
            35 => Some("ReplaceableTextures/Mushroom/MushroomTree.blp".into()),
            36 => Some("ReplaceableTextures/RuinsTree/RuinsTree.blp".into()),
            37 => Some("ReplaceableTextures/OutlandMushroomTree/MushroomTree.blp".into()),
            _ => (!self.path.is_empty()).then(|| self.path.clone()),
        }
    }
}

#[derive(Clone, Debug)]
struct Key { time: i64, value: Vec4, incoming: Vec4, outgoing: Vec4 }
#[derive(Clone, Debug)]
struct Track { interpolation: u32, global: i32, keys: Vec<Key>, collapse_outside: bool }
#[derive(Clone, Debug)]
struct Layer { filter: u32, flags: u32, texture: u32, texture_animation: i32, coord: usize, alpha: f32, alpha_track: Option<Track>, texture_track: Option<Track> }
#[derive(Clone, Debug)]
struct Material { priority: i32, flags: u32, layers: Vec<Layer> }
#[derive(Clone, Debug)]
struct Geoset { positions: Vec<[f32;3]>, normals: Vec<[f32;3]>, uvs: Vec<Vec<[f32;2]>>, indices: Vec<u32>, vertex_groups: Vec<u8>, groups: Vec<Vec<usize>>, material: usize, animation: Option<usize> }
#[derive(Clone, Debug)]
struct GeosetAnimation { geoset: usize, alpha: f32, color: Vec3, alpha_track: Option<Track>, color_track: Option<Track> }
#[derive(Clone, Debug)]
struct Node { name: String, kind: [u8;4], id: i32, parent_id: i32, flags: u32, pivot: Vec3, translation: Option<Track>, rotation: Option<Track>, scale: Option<Track>, attachment: Option<(u32,String,Option<Track>)> }
#[derive(Clone, Debug)]
struct TextureAnimation { translation: Option<Track>, rotation: Option<Track>, scale: Option<Track> }

pub struct MdxModel { name: String, version: u32, sequences: Vec<MdxSequence>, globals: Vec<u32>, textures: Vec<MdxTexture>, materials: Vec<Material>, geosets: Vec<Geoset>, geoset_animations: Vec<GeosetAnimation>, nodes: Vec<Node>, order: Vec<usize>, parents: Vec<Option<usize>>, texture_animations: Vec<TextureAnimation>, diagnostics: Vec<String>, pub(crate) max_pose_bytes: usize, decoded_bytes:usize }

/// Camera vectors are in engine coordinates. The model transform maps model space into that world.
#[derive(Clone, Copy, Debug)]
pub struct MdxBillboardCamera { pub model: Mat4, pub look: Vec3, pub up: Vec3 }
#[derive(Clone, Debug)]
pub struct MdxLayerPose { pub texture: usize, pub filter: u32, pub flags: u32, pub texture_flags: u32, pub material_flags: u32, pub priority: i32, pub alpha: f32, pub uv_set: usize, pub uv: [f32;6] }
#[derive(Clone, Debug)]
pub struct MdxGeosetPose { pub mesh: MeshData, pub geoset: usize, pub material: usize, pub alpha: f32, pub color: [f32;3], pub layers: Arc<[MdxLayerPose]> }
#[derive(Clone, Debug)]
pub struct MdxAttachmentPose { pub node: usize, pub id: u32, pub path: String, pub visibility: f32 }
#[derive(Clone, Debug)]
pub struct MdxPose { pub geosets: Vec<MdxGeosetPose>, pub node_matrices: Vec<Mat4>, pub attachments: Vec<MdxAttachmentPose> }

fn invalid(message: impl Into<String>) -> AssetError { AssetError::Invalid(format!("MDX: {}",message.into())) }

impl MdxModel {
    pub fn parse(bytes: &[u8]) -> Result<Self,AssetError> { Self::parse_with_limits(bytes,MdxReadLimits::default()) }
    pub fn parse_with_limits(bytes: &[u8], limits: MdxReadLimits) -> Result<Self,AssetError> { reader::parse(bytes,limits) }
    pub fn name(&self) -> &str { &self.name }
    pub fn version(&self) -> u32 { self.version }
    pub fn sequences(&self) -> &[MdxSequence] { &self.sequences }
    pub fn textures(&self) -> &[MdxTexture] { &self.textures }
    pub fn pose_allocation_bytes(&self)->Result<usize,AssetError> {pose::allocation_bytes(self)}
    pub fn decoded_bytes(&self)->usize {self.decoded_bytes}
    pub fn has_billboard_nodes(&self)->bool {self.nodes.iter().any(|n|n.flags&0x78!=0)}
    pub fn node_count(&self) -> usize { self.nodes.len() }
    pub fn node_name(&self, index: usize) -> Option<&str> { self.nodes.get(index).map(|n|n.name.as_str()) }
    pub fn geoset_count(&self) -> usize { self.geosets.len() }
    pub fn geoset_layer_count(&self, geoset: usize) -> Option<usize> { Some(self.materials.get(self.geosets.get(geoset)?.material)?.layers.len()) }
    pub fn geoset_uvs(&self, geoset: usize, uv_set: usize) -> Option<&[[f32;2]]> { self.geosets.get(geoset)?.uvs.get(uv_set).map(Vec::as_slice) }
    pub fn diagnostics(&self) -> &[String] { &self.diagnostics }
    pub(crate) fn requires_dynamic_pose(&self)->bool {
        let active=|t:&Option<Track>|t.as_ref().is_some_and(|t|!t.keys.is_empty());
        self.nodes.iter().any(|n|n.flags&0x78!=0 || n.attachment.as_ref().is_some_and(|(_,_,t)|active(t)) || active(&n.translation) || active(&n.rotation) || active(&n.scale)) || self.geoset_animations.iter().any(|g|active(&g.alpha_track) || active(&g.color_track)) || self.materials.iter().flat_map(|m|&m.layers).any(|l|active(&l.alpha_track) || active(&l.texture_track)) || self.texture_animations.iter().any(|t|active(&t.translation) || active(&t.rotation) || active(&t.scale))
    }
    /// Sample source keys in milliseconds; globals use unwrapped elapsed time, sequence time loops or clamps.
    /// Freeze a source sequence at its terminal pose independently of its loop flag.
    pub fn sample_clamped(&self,sequence:Option<usize>,elapsed_ms:u64,camera:Option<MdxBillboardCamera>)->Result<MdxPose,AssetError> {pose::sample(self,sequence,elapsed_ms,camera,true)}
    pub fn sample(&self, sequence: Option<usize>, elapsed_ms: u64, camera: Option<MdxBillboardCamera>) -> Result<MdxPose,AssetError> { pose::sample(self,sequence,elapsed_ms,camera,false) }
}
