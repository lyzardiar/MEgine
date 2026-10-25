// Author: MiYu. Bind caller-selected visible placement nodes to shared native poses with independent view resource ownership.
use crate::{MountedWarcraftModel,WarcraftModelRenderLimits};
use mengine_assets::{AssetError,AssetLocation,WarcraftDecodedTexture,WarcraftPlacedWorld,WarcraftMapSession,WarcraftResourceCache,WarcraftMapCancelToken,MdxBillboardCamera,MdxPose};
use mengine_rhi::{RenderObject,Renderer,Vertex};
use glam::{Mat4,Quat,Vec3};
use std::{collections::{HashMap,BTreeMap,BTreeSet},sync::{Arc,atomic::{AtomicU64,Ordering}}};
static NEXT_VIEW:AtomicU64=AtomicU64::new(1);
fn invalid(message:impl Into<String>)->AssetError {AssetError::Invalid(message.into())}
fn check(cancel:&WarcraftMapCancelToken)->Result<(),AssetError> {if cancel.is_cancelled() {Err(invalid("placement binding cancelled"))} else {Ok(())}}
pub struct MountedWarcraftPlacedWorld {world:Arc<WarcraftPlacedWorld>,bindings:Vec<Arc<MountedWarcraftModel>>}
#[derive(Clone,Copy,Debug)]
pub struct WarcraftWorldRenderLimits {pub max_nodes:usize,pub max_draws:usize,pub max_pose_bytes:usize,pub max_upload_bytes:usize,pub max_object_bytes:usize}
impl Default for WarcraftWorldRenderLimits {fn default()->Self {Self {max_nodes:16384,max_draws:65536,max_pose_bytes:256*1024*1024,max_upload_bytes:256*1024*1024,max_object_bytes:64*1024*1024}}}
pub struct WarcraftPlacedWorldView {cpu:Option<Arc<MountedWarcraftPlacedWorld>>,owner:u64,bindings:Vec<Arc<MountedWarcraftModel>>,selected:Vec<usize>,groups:Vec<(usize,u64)>,scoped:Vec<usize>,objects:Vec<RenderObject>,parents:Vec<usize>,limits:WarcraftWorldRenderLimits}
struct Group {appearance:usize,pose:MdxPose}
struct Instance {node:usize,group:usize,model:Mat4}
fn prepare(world:&WarcraftPlacedWorld,bindings:&[Arc<MountedWarcraftModel>],selected:&[usize],elapsed:u64,look:Vec3,up:Vec3,limits:WarcraftWorldRenderLimits)->Result<(Vec<Group>,Vec<Instance>),AssetError> {
    if selected.len()>limits.max_nodes || !look.is_finite() || !up.is_finite() || look.length_squared()<1e-12 || up.length_squared()<1e-12 {return Err(invalid("visible placement selection or camera exceeds bounds"));}
    let mut seen=BTreeSet::new(); let mut keys=BTreeMap::new(); let mut groups=Vec::<Group>::new(); let mut instances=Vec::new(); let (mut pose_bytes,mut upload,mut draws)=(0usize,0usize,0usize); let mut metadata=selected.len().checked_mul(256).and_then(|n|bindings.len().checked_mul(128).and_then(|b|n.checked_add(b))).filter(|n|*n<=limits.max_object_bytes).ok_or_else(||invalid("visible plan metadata exceeds budget"))?; let mut used_bindings=BTreeSet::new();
    for &index in selected {if !seen.insert(index) {return Err(invalid("duplicate selected placement node"));} let node=world.nodes.get(index).ok_or_else(||invalid("placement node index is missing"))?; if !node.active {continue;} let Some(appearance)=node.appearance else {continue;}; let model=bindings.get(appearance).ok_or_else(||invalid("placement appearance is missing"))?; if used_bindings.insert(appearance) {metadata=metadata.checked_add(model.binding_plan_bytes()).filter(|n|*n<=limits.max_object_bytes).ok_or_else(||invalid("view bindings exceed metadata budget"))?;} let transform=node.transform.ok_or_else(||invalid("visible placement has no resolved transform"))?; let matrix=Mat4::from_scale_rotation_translation(Vec3::from_array(transform.scale),Quat::from_array(transform.rotation),Vec3::from_array(transform.position));
        let billboard=model.model().has_billboard_nodes(); let key=(appearance,node.sequence,node.held,billboard.then_some(index)); let group=if let Some(g)=keys.get(&key) {*g} else {
            pose_bytes=pose_bytes.checked_add(model.model().pose_allocation_bytes()?).filter(|n|*n<=limits.max_pose_bytes).ok_or_else(||invalid("visible native poses exceed budget"))?; let time=if node.held {node.sequence.map(|i|model.model().sequences().get(i).map(|s|(s.end_ms-s.start_ms) as u64).ok_or_else(||invalid("held sequence index is missing"))).transpose()?.unwrap_or(0)} else {elapsed};
            let camera=billboard.then_some(MdxBillboardCamera {model:matrix,look,up}); let pose=(if node.held {model.model().sample_clamped(node.sequence,time,camera)} else {model.model().sample(node.sequence,time,camera)}).map_err(|e|invalid(format!("{}: {e}",model.location().member)))?;
            model.validate_pose(&pose,WarcraftModelRenderLimits::default())?; for g in &pose.geosets {for l in g.layers.iter() {if !crate::warcraft_model::layer_visible(g,l) {continue;} upload=upload.checked_add(g.mesh.positions.len().checked_mul(std::mem::size_of::<Vertex>()).and_then(|n|g.mesh.indices.len().checked_mul(4).and_then(|i|n.checked_add(i))).ok_or_else(||invalid("pose upload overflow"))?).filter(|n|*n<=limits.max_upload_bytes).ok_or_else(||invalid("visible pose uploads exceed budget"))?;}}
            let at=groups.len(); groups.push(Group {appearance,pose}); keys.insert(key,at); at
        };
        let count=model.validate_pose(&groups[group].pose,WarcraftModelRenderLimits::default())?; draws=draws.checked_add(count).filter(|n|*n<=limits.max_draws).ok_or_else(||invalid("visible instance draws exceed budget"))?;
        metadata=metadata.checked_add(model.instance_plan_bytes(&groups[group].pose)?).filter(|n|*n<=limits.max_object_bytes).ok_or_else(||invalid("visible object plan exceeds budget"))?; instances.push(Instance {node:index,group,model:matrix});
    } Ok((groups,instances))
}
impl MountedWarcraftPlacedWorld {
    /// Decode textures once per actual source across all appearances; active archive/decoder calls are cooperatively cancellable at their boundaries.
    pub fn load(session:&WarcraftMapSession,world:Arc<WarcraftPlacedWorld>,cache:&WarcraftResourceCache,max_texture_bytes:usize,cancel:&WarcraftMapCancelToken)->Result<Arc<Self>,AssetError> {
        check(cancel)?; if session.source()!=world.definitions.source() {return Err(invalid("placement world belongs to another source"));} let mut remaining=max_texture_bytes; let mut metadata=64usize*1024*1024; let mut decoded=HashMap::<AssetLocation,Arc<WarcraftDecodedTexture>>::new(); let mut bindings=Vec::new();
        for appearance in &world.appearances {check(cancel)?; metadata=metadata.checked_sub(256).ok_or_else(||invalid("world binding metadata exceeds budget"))?; let source=world.models.get(appearance.model).ok_or_else(||invalid("placement model index is missing"))?; let mut images=Vec::new(); for texture in source.model.textures() {
            let member=appearance.replacement.as_ref().filter(|r|r.id==texture.replaceable_id).map(|r|r.member.clone()).or_else(||texture.default_member(appearance.team)).ok_or_else(||invalid("source texture requires a placement replacement"))?; let bytes=session.assets().read_texture_bytes_limited(&member,16*1024*1024)?; check(cancel)?;
            let shared=if let Some(t)=decoded.get(&bytes.location) {t.clone()} else {let t=cache.texture(bytes,session.source(),remaining,cancel)?; remaining=remaining.checked_sub(t.rgba.pixels.len()).ok_or_else(||invalid("world RGBA budget exceeded"))?; decoded.insert(t.source.location.clone(),t.clone()); t}; metadata=metadata.checked_sub(shared.source.location.member.len().saturating_mul(3).saturating_add(256)).ok_or_else(||invalid("world binding metadata exceeds budget"))?; images.push((shared.source.location.clone(),shared.rgba.clone()));
        } bindings.push(MountedWarcraftModel::from_shared(source,images));} check(cancel)?; Ok(Arc::new(Self {world,bindings}))
    }
    pub fn world(&self)->&Arc<WarcraftPlacedWorld> {&self.world}
    /// Bind a visibility set, preserving each render part's placement parent. Call release with this renderer when unloading the view.
    pub fn bind_nodes(self:&Arc<Self>,renderer:&mut Renderer,selected:&[usize],look:Vec3,up:Vec3,elapsed:u64,limits:WarcraftWorldRenderLimits)->Result<WarcraftPlacedWorldView,AssetError> {
        let prefix=format!("warcraft-world:view{}",NEXT_VIEW.fetch_add(1,Ordering::Relaxed)); if self.bindings.len().checked_mul(128).filter(|n|*n<=limits.max_object_bytes).is_none() {return Err(invalid("view binding references exceed budget"));} let (groups,instances)=prepare(&self.world,&self.bindings,selected,elapsed,look,up,limits)?; let scoped=groups.iter().map(|g|g.appearance).collect::<BTreeSet<_>>().into_iter().collect::<Vec<_>>(); let mut bindings=self.bindings.clone(); for &i in &scoped {bindings[i]=bindings[i].namespaced(&prefix);}
        let mut view=WarcraftPlacedWorldView {cpu:Some(self.clone()),owner:renderer.resource_identity(),bindings,selected:selected.to_vec(),groups:vec![],scoped,objects:vec![],parents:vec![],limits};
        for &i in &view.scoped {if let Err(e)=view.bindings[i].upload_textures(renderer) {view.release(renderer)?; return Err(e);}}
        if let Err(e)=view.upload(renderer,groups,instances) {view.release(renderer)?; return Err(e);} Ok(view)
    }
}
impl WarcraftPlacedWorldView {
    fn upload(&mut self,renderer:&mut Renderer,groups:Vec<Group>,instances:Vec<Instance>)->Result<(),AssetError> {
        let mut templates=Vec::new(); for (slot,g) in groups.iter().enumerate() {self.groups.push((g.appearance,slot as u64)); templates.push(self.bindings[g.appearance].upload_sampled_pose(renderer,slot as u64,&g.pose,WarcraftModelRenderLimits::default())?);}
        let world=&self.cpu.as_ref().ok_or_else(||invalid("placement view is released"))?.world; let mut objects=Vec::new(); let mut parents=Vec::new();
        for instance in instances {let appearance=&world.appearances[groups[instance.group].appearance]; for object in &templates[instance.group] {let mut object=object.clone(); object.model=instance.model; if appearance.tint!=[1.;3] {let mut material=(*object.material).clone(); for (c,tint) in material.base_color[..3].iter_mut().zip(appearance.tint) {*c*=tint;} object.material=material.into();} objects.push(object); parents.push(instance.node);}}
        self.groups=groups.iter().enumerate().map(|(slot,g)|(g.appearance,slot as u64)).collect(); self.objects=objects; self.parents=parents; Ok(())
    }
    pub fn objects(&self)->&[RenderObject] {&self.objects}
    pub fn parent_nodes(&self)->&[usize] {&self.parents}
    pub fn pose_groups(&self)->usize {self.groups.len()}
    pub fn update(&mut self,renderer:&mut Renderer,elapsed:u64,look:Vec3,up:Vec3)->Result<(),AssetError> {if renderer.resource_identity()!=self.owner {return Err(invalid("placement update requires owning renderer"));} let cpu=self.cpu.as_ref().ok_or_else(||invalid("placement view is released"))?; let (groups,instances)=prepare(&cpu.world,&cpu.bindings,&self.selected,elapsed,look,up,self.limits)?; if let Err(e)=self.upload(renderer,groups,instances) {self.release(renderer)?; return Err(e);} Ok(())}
    pub fn release(&mut self,renderer:&mut Renderer)->Result<(),AssetError> {if renderer.resource_identity()!=self.owner {return Err(invalid("placement release requires owning renderer"));} for &(model,slot) in &self.groups {self.bindings[model].release_pose(renderer,slot);} for &i in &self.scoped {self.bindings[i].release_textures(renderer);} self.groups.clear(); self.objects.clear(); self.parents.clear(); self.bindings.clear(); self.scoped.clear(); self.selected.clear(); self.cpu=None; Ok(())}
}
