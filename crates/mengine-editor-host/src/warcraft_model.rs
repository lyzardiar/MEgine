// Author: MiYu. Consume mounted native MDX/BLP resources on the existing Rust renderer without project files or meta.
use mengine_assets::{decode_texture_rgba8, texture_dimensions_from_bytes, AssetError, AssetLocation, AssetMounts, MdxBillboardCamera, MdxModel, MdxPose, TextureRgba8};
use mengine_rhi::{MaterialBlendMode, MaterialWrap, RenderMaterial, RenderObject, Renderer, Vertex};
use glam::Mat4;
use std::{collections::HashMap,sync::Arc};

struct Texture { key: String, rgba: TextureRgba8 }

/// Load once on a worker, share its Arc between views, and upload its textures to each renderer when attached.
pub struct MountedWarcraftModel { model: MdxModel, key: String, texture_keys: Vec<String>, textures: Vec<Texture>, location: AssetLocation }

/// Per-call expansion limits; renderer caches, archive bytes and retained decoded handles are separate budgets.
#[derive(Clone,Copy,Debug)]
pub struct WarcraftModelRenderLimits {pub max_draws:usize,pub max_upload_bytes:usize,pub max_object_bytes:usize}
impl Default for WarcraftModelRenderLimits {fn default()->Self {Self {max_draws:1024,max_upload_bytes:128*1024*1024,max_object_bytes:64*1024*1024}}}

fn plan_upload(pose: &MdxPose, prefix_len: usize, texture_keys: &[String], limits: WarcraftModelRenderLimits) -> Result<usize,AssetError> {
    let fail=||AssetError::Invalid("native MDX expanded draws, uploads or objects exceed render budget".into()); let (mut draws,mut upload,mut objects)=(0usize,0usize,0usize);
    for g in &pose.geosets {if g.alpha<=0. || g.mesh.indices.is_empty() {continue;} for layer in g.layers.iter() {if layer.alpha<=0. {continue;}
        draws=draws.checked_add(1).filter(|n|*n<=limits.max_draws).ok_or_else(fail)?;
        let bytes=g.mesh.positions.len().checked_mul(std::mem::size_of::<Vertex>()).and_then(|n|g.mesh.indices.len().checked_mul(4).and_then(|i|n.checked_add(i))).ok_or_else(fail)?;
        upload=upload.checked_add(bytes).filter(|n|*n<=limits.max_upload_bytes).ok_or_else(fail)?;
        let texture=texture_keys.get(layer.texture).ok_or_else(||AssetError::Invalid("native MDX texture key is missing".into()))?;
        let bytes=prefix_len.checked_add(96).and_then(|n|n.checked_mul(2)).and_then(|n|n.checked_add(texture.len())).and_then(|n|n.checked_add(std::mem::size_of::<RenderObject>()+std::mem::size_of::<RenderMaterial>())).ok_or_else(fail)?;
        objects=objects.checked_add(bytes).filter(|n|*n<=limits.max_object_bytes).ok_or_else(fail)?;
    }} Ok(draws)
}

fn resource_key(location: &AssetLocation) -> String {format!("warcraft:{:?}:{}",location.source,location.member)}
fn transformed_uv([u,v]:[f32;2],m:[f32;6])->Result<[f32;2],AssetError> {let uv=[u*m[0]+v*m[2]+m[4],u*m[1]+v*m[3]+m[5]]; if uv.iter().any(|n|!n.is_finite()) {return Err(AssetError::Invalid("native MDX transformed UV is not finite".into()));} Ok(uv)}

impl MountedWarcraftModel {
    /// The texture byte limit bounds retained decoded RGBA for this handle; archive and decoder work buffers are separate.
    pub fn load(mounts: &AssetMounts, member: &str, team: u8, max_texture_bytes: usize) -> Result<Arc<Self>,AssetError> {
        let bytes=mounts.read(member)?; let model=MdxModel::parse(&bytes.bytes)?; let key=resource_key(&bytes.location); let mut unique=HashMap::new(); let mut textures=Vec::new(); let mut texture_keys=Vec::new(); let mut total=0usize;
        for texture in model.textures() {
            let member=texture.default_member(team).ok_or_else(||AssetError::Invalid(format!("MDX replaceable texture {} requires a session replacement",texture.replaceable_id)))?; let bytes=mounts.read_texture_bytes(&member)?;
            let index=if let Some(index)=unique.get(&bytes.location) {*index} else {
                let size=texture_dimensions_from_bytes(&bytes.bytes,&bytes.location.member)?; total=total.checked_add(size[0] as usize*size[1] as usize*4).filter(|n|*n<=max_texture_bytes).ok_or_else(||AssetError::Invalid("mounted model RGBA textures exceed byte budget".into()))?;
                let rgba=decode_texture_rgba8(&bytes.bytes,&bytes.location.member)?; let index=textures.len(); textures.push(Texture {key:resource_key(&bytes.location),rgba}); unique.insert(bytes.location,index); index
            };
            texture_keys.push(textures[index].key.clone());
        }
        Ok(Arc::new(Self {model,key,texture_keys,textures,location:bytes.location}))
    }
    pub fn model(&self) -> &MdxModel {&self.model}
    pub fn location(&self) -> &AssetLocation {&self.location}
    pub fn decoded_texture_bytes(&self) -> usize {self.textures.iter().map(|t|t.rgba.pixels.len()).sum()}
    pub fn upload_textures(&self, renderer: &mut Renderer) -> Result<(),AssetError> {
        for texture in &self.textures {renderer.upload_material_texture_rgba8(&texture.key,texture.rgba.width,texture.rgba.height,&texture.rgba.pixels,true).map_err(|e|AssetError::Invalid(format!("native MDX texture upload: {e}")))?;} Ok(())
    }
    fn mesh_key(&self, slot: u64, geoset: usize, layer: usize) -> String {format!("{}:slot{slot}:g{geoset}:l{layer}",self.key)}
    /// A slot is owned by one live model instance per renderer. Reusing it updates bounded mesh keys in place.
    pub fn upload_pose(&self, renderer: &mut Renderer, slot: u64, sequence: Option<usize>, elapsed_ms: u64, camera: Option<MdxBillboardCamera>) -> Result<Vec<RenderObject>,AssetError> {
        self.upload_pose_with_limits(renderer,slot,sequence,elapsed_ms,camera,WarcraftModelRenderLimits::default())
    }
    pub fn upload_pose_with_limits(&self, renderer: &mut Renderer, slot: u64, sequence: Option<usize>, elapsed_ms: u64, camera: Option<MdxBillboardCamera>, limits: WarcraftModelRenderLimits) -> Result<Vec<RenderObject>,AssetError> {
        let pose=self.model.sample(sequence,elapsed_ms,camera)?;
        let draws=plan_upload(&pose,self.key.len(),&self.texture_keys,limits)?;
        if pose.geosets.iter().flat_map(|g|g.layers.iter()).any(|l|matches!(l.filter,3|6) || l.flags&(2|0x40)!=0) {return Err(AssetError::Invalid("native MDX renderer requires exact additive/modulate2x, sphere mapping or no-depth-test support for these material flags".into()));}
        let mut objects=Vec::new(); objects.try_reserve_exact(draws).map_err(|_|AssetError::Invalid("cannot reserve native MDX render objects".into()))?;
        for g in &pose.geosets {if g.alpha<=0. {continue;} for (layer_index,layer) in g.layers.iter().enumerate() {if layer.alpha<=0. || g.mesh.indices.is_empty() {continue;}
            let uv=self.model.geoset_uvs(g.geoset,layer.uv_set).unwrap_or(&g.mesh.uvs); let m=layer.uv;
            let mut vertices=Vec::new(); vertices.try_reserve_exact(g.mesh.positions.len()).map_err(|_|AssetError::Invalid("cannot reserve native MDX render vertices".into()))?;
            for ((position,normal),uv) in g.mesh.positions.iter().zip(&g.mesh.normals).zip(uv) {vertices.push(Vertex {position:*position,normal:*normal,uv:transformed_uv(*uv,m)?});}
            let mesh_key=self.mesh_key(slot,g.geoset,layer_index); renderer.upload_gltf_static_profiled(&mesh_key,&vertices,&g.mesh.indices);
            let material=RenderMaterial {base_color:[g.color[0],g.color[1],g.color[2],g.alpha*layer.alpha],base_color_texture:self.texture_keys[layer.texture].clone(),roughness:0.95,unlit:layer.flags&(1|0x100)!=0,double_sided:layer.flags&0x10!=0,transparent:layer.filter>=2,blend_mode:match layer.filter {4=>MaterialBlendMode::Additive,5=>MaterialBlendMode::Multiply,_=>MaterialBlendMode::Alpha},depth_write:layer.flags&0x80==0 && layer.filter<=1,depth_equal:layer_index>0,alpha_cutoff:if layer.filter==1 {0.75} else {0.},render_queue:if layer.filter<=1 {2000} else {3000},wrap_u:if layer.texture_flags&1!=0 {MaterialWrap::Repeat} else {MaterialWrap::Clamp},wrap_v:if layer.texture_flags&2!=0 {MaterialWrap::Repeat} else {MaterialWrap::Clamp},..Default::default()};
            objects.push(RenderObject {mesh_key,model:Mat4::IDENTITY,material:material.into(),cast_shadows:false,receive_shadows:false});
        }} Ok(objects)
    }
    /// Release only this instance's mesh slots. Shared texture ownership belongs to the surrounding session.
    pub fn release_pose(&self, renderer: &mut Renderer, slot: u64) {for geoset in 0..self.model.geoset_count() {for layer in 0..self.model.geoset_layer_count(geoset).unwrap_or(0) {renderer.remove_mesh(&self.mesh_key(slot,geoset,layer));}}}
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_assets::{MdxGeosetPose,MdxLayerPose,MeshData};
    fn expanded_pose(geosets:usize,layers:usize)->MdxPose {
        let layers:Arc<[MdxLayerPose]>=vec![MdxLayerPose {texture:0,filter:0,flags:0,texture_flags:0,material_flags:0,priority:0,alpha:1.,uv_set:0,uv:[1.,0.,0.,1.,0.,0.]};layers].into();
        let g=MdxGeosetPose {mesh:MeshData {positions:vec![[0.;3];3],normals:vec![[0.,1.,0.];3],uvs:vec![[0.;2];3],indices:vec![0,1,2]},geoset:0,material:0,alpha:1.,color:[1.;3],layers};
        MdxPose {geosets:vec![g;geosets],node_matrices:vec![],attachments:vec![]}
    }
    #[test]
    fn native_warcraft_model_planning_bounds_shared_material_expansion() {
        let pose=expanded_pose(64,64); assert!(plan_upload(&pose,16,&["t".into()],WarcraftModelRenderLimits::default()).is_err());
        assert_eq!(plan_upload(&pose,16,&["t".into()],WarcraftModelRenderLimits {max_draws:4096,..Default::default()}).unwrap(),4096);
    }
    #[test]
    fn native_warcraft_model_planning_bounds_bytes_before_gpu_mutation() {
        let pose=expanded_pose(1,1); for limits in [WarcraftModelRenderLimits {max_upload_bytes:1,..Default::default()},WarcraftModelRenderLimits {max_object_bytes:1,..Default::default()}] {assert!(plan_upload(&pose,16,&["t".into()],limits).is_err());}
        assert!(plan_upload(&pose,usize::MAX,&["t".into()],WarcraftModelRenderLimits::default()).is_err()); assert!(plan_upload(&pose,16,&[],WarcraftModelRenderLimits::default()).is_err());
    }
    #[test]
    fn native_warcraft_model_rejects_nonfinite_expanded_uvs() {assert!(transformed_uv([f32::MAX,0.],[2.,0.,0.,1.,0.,0.]).is_err()); assert_eq!(transformed_uv([0.5,0.25],[1.,0.,0.,1.,0.25,0.5]).unwrap(),[0.75,0.75]);}
}
