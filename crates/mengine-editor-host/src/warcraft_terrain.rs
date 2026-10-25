// Author: MiYu. Share immutable native map terrain across views and own each renderer's mesh and texture bindings explicitly.
use mengine_assets::{AssetError,WarcraftMapSession,WarcraftMapCancelToken,WarcraftMapError,WarcraftTerrain,WarcraftTerrainLimits,WarcraftTerrainMaterial,TextureRgba8};
use mengine_rhi::{Renderer,RenderMaterial,RenderObject,SharedRenderMaterial,MaterialWrap,MaterialBlendMode,SurfaceShaderParameterBinding,Vertex,validate_surface_shader_hook};
use glam::Mat4;
use std::sync::{Arc,atomic::{AtomicU64,Ordering}};
static NEXT_VIEW:AtomicU64=AtomicU64::new(1);
fn invalid(message:impl Into<String>)->AssetError {AssetError::Invalid(format!("native terrain: {}",message.into()))}

#[derive(Clone,Copy)]
pub struct WarcraftTerrainRenderLimits {pub max_draws:usize,pub max_upload_bytes:usize,pub max_base_texture_bytes:usize,pub max_plan_bytes:usize}
impl Default for WarcraftTerrainRenderLimits {fn default()->Self {Self {max_draws:4096,max_upload_bytes:256*1024*1024,max_base_texture_bytes:128*1024*1024,max_plan_bytes:64*1024*1024}}}
#[derive(Clone,Copy,Default,serde::Serialize)]
pub struct WarcraftTerrainUploadStats {pub meshes:usize,pub vertex_buffers_reused:usize,pub index_buffers_reused:usize}
pub struct MountedWarcraftTerrain {terrain:WarcraftTerrain,ground_shader:Arc<str>,water_shader:Arc<str>}
pub struct WarcraftTerrainView {cpu:Option<Arc<MountedWarcraftTerrain>>,owner:u64,objects:Vec<RenderObject>,mesh_keys:Vec<String>,texture_keys:Vec<String>,water_indices:Vec<usize>,frame:u32,stats:WarcraftTerrainUploadStats}

fn images(terrain:&WarcraftTerrain)->Vec<&TextureRgba8> {let mut images=vec![&terrain.ground_atlas]; images.extend(terrain.cliff_textures.iter().map(|t|t.as_ref())); if let Some(w)=&terrain.water {images.push(&w.atlas); images.push(&w.depth);} images}
fn plan(terrain:&WarcraftTerrain,limits:WarcraftTerrainRenderLimits)->Result<(),AssetError> {
    if terrain.chunks.len()>limits.max_draws {return Err(invalid("draw count exceeds limit"));} let mut upload=0usize; let mut textures=0usize;
    for chunk in &terrain.chunks {let m=&chunk.mesh; if m.positions.len()!=m.normals.len() || m.positions.len()!=m.uvs.len() || m.positions.len()>u32::MAX as usize || m.indices.len()%3!=0 || m.indices.iter().any(|i|*i as usize>=m.positions.len()) || m.positions.iter().chain(&m.normals).flatten().chain(m.uvs.iter().flatten()).any(|n|!n.is_finite()) {return Err(invalid("invalid terrain vertex or index data"));}
        let bytes=m.positions.len().checked_mul(std::mem::size_of::<Vertex>()).and_then(|n|m.indices.len().checked_mul(4).and_then(|i|n.checked_add(i))).ok_or_else(||invalid("mesh byte count overflow"))?; upload=upload.checked_add(bytes).filter(|n|*n<=limits.max_upload_bytes).ok_or_else(||invalid("mesh upload bytes exceed limit"))?;
        if matches!(chunk.material,WarcraftTerrainMaterial::Cliff(i) if i as usize>=terrain.cliff_textures.len()) || matches!(chunk.material,WarcraftTerrainMaterial::Water) && terrain.water.is_none() {return Err(invalid("missing terrain material resource"));}
    }
    for image in images(terrain) {let bytes=(image.width as usize).checked_mul(image.height as usize).and_then(|n|n.checked_mul(4)).ok_or_else(||invalid("texture byte count overflow"))?; if image.width==0 || image.height==0 || image.width>8192 || image.height>8192 || image.pixels.len()!=bytes {return Err(invalid("invalid terrain texture dimensions or payload"));} textures=textures.checked_add(bytes).filter(|n|*n<=limits.max_base_texture_bytes).ok_or_else(||invalid("base-level texture bytes exceed limit"))?;}
    let metadata=terrain.chunks.len().checked_mul(std::mem::size_of::<RenderObject>()+256).and_then(|n|(terrain.cliff_textures.len()+2).checked_mul(std::mem::size_of::<RenderMaterial>()+2048).and_then(|m|n.checked_add(m))).ok_or_else(||invalid("render plan byte count overflow"))?; if metadata>limits.max_plan_bytes {return Err(invalid("render plan exceeds limit"));} Ok(())
}
fn rollback(renderer:&mut Renderer,meshes:&[String],textures:&[String]) {for key in meshes {renderer.remove_mesh(key);} for key in textures {renderer.remove_material_texture(key);}}
impl MountedWarcraftTerrain {
    /// CPU-only compilation can run on a worker; the returned immutable handle is shared by all native views.
    pub fn load(session:&WarcraftMapSession,limits:WarcraftTerrainLimits,cancel:&WarcraftMapCancelToken)->Result<Arc<Self>,WarcraftMapError> {
        let terrain=WarcraftTerrain::compile(session.terrain(),session.assets(),limits,cancel)?; let ground_shader:Arc<str>=terrain.ground_shader().into(); let water_shader:Arc<str>=terrain.water.as_ref().map_or_else(String::new,|w|w.shader()).into();
        for shader in [&ground_shader,&water_shader] {if !shader.is_empty() {validate_surface_shader_hook(shader).map_err(|e|WarcraftMapError::Resource(invalid(e)))?;}} if cancel.is_cancelled() {return Err(WarcraftMapError::Cancelled);} Ok(Arc::new(Self {terrain,ground_shader,water_shader}))
    }
    pub fn terrain(&self)->&WarcraftTerrain {&self.terrain}
    /// Call release on the returned view when its map is unloaded. Every binding has independent keys on its owning renderer.
    pub fn bind(self:&Arc<Self>,renderer:&mut Renderer,limits:WarcraftTerrainRenderLimits)->Result<WarcraftTerrainView,AssetError> {
        plan(&self.terrain,limits)?; let id=NEXT_VIEW.fetch_add(1,Ordering::Relaxed); let prefix=format!("warcraft-terrain:view{id}"); let mut mesh_keys=Vec::new(); let mut texture_keys=Vec::new(); let mut objects=Vec::new(); let mut water_indices=Vec::new(); let mut stats=WarcraftTerrainUploadStats::default();
        let count=self.terrain.chunks.len(); mesh_keys.try_reserve_exact(count).map_err(|_|invalid("cannot reserve mesh keys"))?; objects.try_reserve_exact(count).map_err(|_|invalid("cannot reserve render objects"))?; water_indices.try_reserve_exact(count).map_err(|_|invalid("cannot reserve water slots"))?;
        for (i,_) in images(&self.terrain).iter().enumerate() {texture_keys.push(format!("{prefix}:texture{i}"));}
        let mut ground=RenderMaterial {base_color:[1.;4],surface_shader:self.ground_shader.clone(),roughness:1.,wrap_u:MaterialWrap::Clamp,wrap_v:MaterialWrap::Clamp,..Default::default()}; ground.custom_textures[0]=texture_keys[0].clone(); ground.custom_texture_names=vec!["ground".into()].into(); ground.custom_texture_srgb[0]=true;
        let mut materials=vec![ground]; for i in 0..self.terrain.cliff_textures.len() {materials.push(RenderMaterial {base_color:[1.;4],base_color_texture:texture_keys[1+i].clone(),roughness:1.,wrap_u:MaterialWrap::Clamp,wrap_v:MaterialWrap::Clamp,..Default::default()});}
        if self.terrain.water.is_some() {let mut water=RenderMaterial {base_color:[1.;4],surface_shader:self.water_shader.clone(),roughness:0.4,transparent:true,blend_mode:MaterialBlendMode::Alpha,depth_write:false,render_queue:3000,wrap_u:MaterialWrap::Clamp,wrap_v:MaterialWrap::Clamp,..Default::default()}; let at=1+self.terrain.cliff_textures.len(); water.custom_textures[0]=texture_keys[at].clone(); water.custom_textures[1]=texture_keys[at+1].clone(); water.custom_texture_names=vec!["water".into(),"water_depth".into()].into(); water.custom_texture_srgb[0]=true; water.custom_texture_srgb[1]=false; water.custom_parameter_bindings=vec![SurfaceShaderParameterBinding {name:"water_time".into(),components:4,min:None,max:None}].into(); materials.push(water);}
        let report=renderer.prepare_material_pipelines(&materials); if report.rejected>0 {return Err(invalid("terrain material pipeline rejected"));} let materials=materials.into_iter().map(SharedRenderMaterial::from).collect::<Vec<_>>();
        let images=images(&self.terrain); for (i,image) in images.iter().enumerate() {let srgb=!(self.terrain.water.is_some() && i==images.len()-1); if let Err(error)=renderer.upload_material_texture_rgba8(&texture_keys[i],image.width,image.height,&image.pixels,srgb) {rollback(renderer,&mesh_keys,&texture_keys); return Err(invalid(error.to_string()));}}
        for (i,chunk) in self.terrain.chunks.iter().enumerate() {let mesh=&chunk.mesh; let mut vertices=Vec::new(); if vertices.try_reserve_exact(mesh.positions.len()).is_err() {rollback(renderer,&mesh_keys,&texture_keys); return Err(invalid("cannot reserve terrain upload vertices"));} for ((p,n),uv) in mesh.positions.iter().zip(&mesh.normals).zip(&mesh.uvs) {vertices.push(Vertex {position:*p,normal:*n,uv:*uv});}
            let key=format!("{prefix}:mesh{i}"); let profile=renderer.upload_gltf_static_profiled(&key,&vertices,&mesh.indices); stats.meshes+=1; stats.vertex_buffers_reused+=usize::from(profile.vertex_buffer_reused); stats.index_buffers_reused+=usize::from(profile.index_buffer_reused); mesh_keys.push(key.clone());
            let slot=match chunk.material {WarcraftTerrainMaterial::Ground=>0,WarcraftTerrainMaterial::Cliff(i)=>1+i as usize,WarcraftTerrainMaterial::Water=>{water_indices.push(objects.len()); materials.len()-1}}; objects.push(RenderObject {mesh_key:key,model:Mat4::IDENTITY,material:materials[slot].clone(),cast_shadows:false,receive_shadows:false});
        }
        Ok(WarcraftTerrainView {cpu:Some(self.clone()),owner:renderer.resource_identity(),objects,mesh_keys,texture_keys,water_indices,frame:0,stats})
    }
}
impl WarcraftTerrainView {
    pub fn objects(&self)->&[RenderObject] {&self.objects}
    pub fn upload_stats(&self)->WarcraftTerrainUploadStats {self.stats}
    /// Only the shared water material changes when a source animation frame advances; geometry and textures are never reuploaded.
    pub fn set_elapsed_ms(&mut self,elapsed_ms:u64)->bool {let Some(water)=self.cpu.as_ref().and_then(|c|c.terrain.water.as_ref()) else {return false;}; let frame=water.frame_at(elapsed_ms); if self.frame==frame || self.water_indices.is_empty() {return false;} self.frame=frame; let mut material=(*self.objects[self.water_indices[0]].material).clone(); material.custom_parameters[0][0]=frame as f32; let shared:SharedRenderMaterial=material.into(); for &at in &self.water_indices {self.objects[at].material=shared.clone();} true}
    pub fn release(&mut self,renderer:&mut Renderer)->Result<(),AssetError> {if renderer.resource_identity()!=self.owner {return Err(invalid("view release requires its owning renderer"));} rollback(renderer,&self.mesh_keys,&self.texture_keys); self.mesh_keys.clear(); self.texture_keys.clear(); self.objects.clear(); self.water_indices.clear(); self.cpu=None; Ok(())}
}

#[cfg(test)] mod tests {
    use super::*;
    fn fixture()->WarcraftTerrain {WarcraftTerrain {layout:mengine_assets::WarcraftTerrainLayout {ground:vec![],cliffs:vec![],ground_heights:vec![],surface_heights:vec![],normals:vec![],raised_corners:vec![],ramp_entrances:vec![]},chunks:vec![],ground_atlas:TextureRgba8 {width:1,height:1,pixels:vec![255;4]},cliff_textures:vec![],resources:vec![],water:None}}
    #[test] fn native_warcraft_terrain_plan_rejects_before_gpu_mutation() {let terrain=fixture(); assert!(plan(&terrain,WarcraftTerrainRenderLimits::default()).is_ok()); for limits in [WarcraftTerrainRenderLimits {max_base_texture_bytes:1,..Default::default()},WarcraftTerrainRenderLimits {max_plan_bytes:1,..Default::default()}] {assert!(plan(&terrain,limits).is_err());} let mut terrain=fixture(); terrain.ground_atlas.pixels.clear(); assert!(plan(&terrain,WarcraftTerrainRenderLimits::default()).is_err());}
    #[test] fn native_warcraft_terrain_plan_rejects_bad_meshes_and_limits() {let mut terrain=fixture(); terrain.chunks.push(mengine_assets::WarcraftTerrainChunk {cell:[0,0],material:WarcraftTerrainMaterial::Ground,mesh:mengine_assets::MeshData {positions:vec![[0.;3];3],normals:vec![[0.,1.,0.];3],uvs:vec![[0.;2];3],indices:vec![0,1,2]}}); for limits in [WarcraftTerrainRenderLimits {max_draws:0,..Default::default()},WarcraftTerrainRenderLimits {max_upload_bytes:1,..Default::default()}] {assert!(plan(&terrain,limits).is_err());} terrain.chunks[0].mesh.positions[0][0]=f32::NAN; assert!(plan(&terrain,WarcraftTerrainRenderLimits::default()).is_err());}
}
