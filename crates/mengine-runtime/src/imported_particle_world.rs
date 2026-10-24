// Author: MiYu. Asset-backed particles use the same frame packet in the editor and player.
use std::{collections::{HashMap, HashSet}, path::{Path, PathBuf}, sync::Arc, time::SystemTime};
use glam::{Mat4, Vec3};
use mengine_assets::{ParticleDefinition, ParticleMaterial, load_particle_definition};
use mengine_core::{Entity, TransformHierarchy, World, generated::ParticleEmitter3D};
use mengine_rhi::{FrameCamera, ParticleGeometry, ParticleRenderData, ParticleVertex, RenderMaterial, RenderObject, PARTICLE_PARAMETER_COUNT};
use crate::{imported_particles::{ImportedParticleSimulation, ParticleCameraBasis}, textures::resolve_project_asset_path};

#[derive(Default)]
struct Emitter { simulation: ImportedParticleSimulation, seconds: f32, definition: String, revision: Option<SystemTime>, seek: Option<f32>, playback_generation: i32 }
struct DefinitionAsset { modified: Option<SystemTime>, length: u64, definition: Arc<ParticleDefinition>, geometry: Arc<ParticleGeometry>, mesh_stamp: Option<(PathBuf,Option<SystemTime>,u64)>, material: RenderMaterial, parameters: Arc<[[f32;4]; PARTICLE_PARAMETER_COUNT]> }
#[derive(Default)]
pub struct ImportedParticleWorld {
    frame_delta: Option<f32>,
    shader_seconds: f32, root: Option<PathBuf>, definitions: HashMap<String, DefinitionAsset>, emitters: HashMap<Entity, Emitter>, errors: HashMap<String, String>,
}

const FLOATS: &[(&str,f32)] = &[
    ("_MainChannel",0.),("_MainAlphaChannel",0.),("_AlphaRemap",0.),("_AlphaExp",1.),("_MainRota",0.),("_Rotation",0.),("_RotaSpeed",0.),("_MainPolar",0.),("_MainTex_PannerSpeedU",0.),("_MainTex_PannerSpeedV",0.),("_MainCustomOffsetX",0.),("_MainCustomOffsetY",0.),("_MainClamp",0.),
    ("_MaskRota",0.),("_MaskRotation",0.),("_MaskRotaSpeed",0.),("_MaskPolar",0.),("_MaskTex_PannerSpeedU",0.),("_MaskTex_PannerSpeedV",0.),("_MaskCustomOffsetX",0.),("_MaskCustomOffsetY",0.),("_MaskTexAlpha",0.),("_MaskTexNoise",4.),("_MaskTexSub",4.),
    ("_Randomoffset",0.),("_NoisePolar",0.),("_NoiseCustomOffsetX",0.),("_NoiseCustomOffsetY",0.),("_IsNormalizeNoise",0.),("_IsOffsetNoise",0.),("_NoiseIntensity",0.),("_NoiseTexChannel",1.),("_DissolveNoise",0.),
    ("_DissRotation",0.),("_DissolvePolar",0.),("_DissolveTex_PannerSpeedU",0.),("_DissolveTex_PannerSpeedV",0.),("_DissolveCustomOffsetX",0.),("_DissolveCustomOffsetY",0.),("_Dissolve_Amount",0.),("_CloseColor",0.),("_OutlineIntensity",0.),("_BlendIntensity",0.1),("_DissolveTexAlpha",0.),
    ("_SubRota",0.),("_SubRotation",0.),("_SubRotaSpeed",0.),("_SubPolar",0.),("_SubTex_PannerSpeedU",0.),("_SubTex_PannerSpeedV",0.),("_SubCustomOffsetX",0.),("_SubCustomOffsetY",0.),("_SubNoiseIntensity",0.),("_SubLerp",0.),("_SubChannel",0.),("_SubBlend",0.),("_SubMulAlpha",0.),("_GlobalAlpha",1.),
];
const TEXTURES: [&str;5] = ["_MainTex","_MaskTex","_NoiseTex","_DissolveTex","_SubTex"];
fn value(material: &ParticleMaterial, name: &str, fallback: f32) -> f32 { material.floats.get(name).copied().filter(|value| value.is_finite()).unwrap_or(fallback) }

fn prepare_material(material: &ParticleMaterial) -> (RenderMaterial, Arc<[[f32;4]; PARTICLE_PARAMETER_COUNT]>) {
    let mut parameters = [[0.;4]; PARTICLE_PARAMETER_COUNT];
    for (index, (name, fallback)) in FLOATS.iter().enumerate() { parameters[index][0] = value(material, name, *fallback); }
    for index in 1..=20 { parameters[75+index][0] = value(material, &format!("_ContrastValue{index}"), 0.); }
    let mut render = RenderMaterial { transparent: true, double_sided: value(material,"_CullMode",0.) == 0., depth_write: value(material,"_ZWrite",0.) > 0.5, unlit: true, render_queue: 3000, ..Default::default() };
    for (slot, name) in TEXTURES.iter().enumerate() {
        parameters[116+slot] = [1.,1.,0.,0.];parameters[100+slot]=[0.,0.,1.,0.];
        if let Some(texture) = material.textures.get(*name) {
            let wrap=|mode:&str|match mode {"clamp"=>1.,"mirror"=>2.,"mirror_once"=>3.,_=>0.};
            parameters[100+slot]=[wrap(&texture.wrap_u),wrap(&texture.wrap_v),match texture.filter.as_str() {"point"=>0.,"trilinear"=>2.,_=>1.},0.];
            render.custom_textures[slot] = texture.path.clone(); render.custom_texture_srgb[slot] = texture.srgb;
            parameters[116+slot] = [texture.scale[0],texture.scale[1],texture.offset[0],texture.offset[1]];
        }
    }
    for (slot, name, default) in [(121,"_MainColor",[1.;4]),(122,"_SubColor",[1.;4]),(123,"_Dissolve_color",[1.;4]),(124,"_GlobalColor",[1.;4]),(125,"_Refine",[1.,1.,1.,0.]),(126,"_NoiseSpeedPower",[0.,0.,1.,1.])] { parameters[slot] = material.colors.get(name).copied().unwrap_or(default); }
    (render, Arc::new(parameters))
}

impl ImportedParticleWorld {
    /// Override the next render interval when a host advances simulation without drawing every step.
    pub fn set_frame_delta(&mut self, delta: Option<f32>) { self.frame_delta = delta; }
    pub fn restart(&mut self) { self.emitters.clear(); }
    pub fn reset_entity(&mut self, entity: Entity) { self.emitters.remove(&entity); }
    pub fn seek_entity(&mut self, entity: Entity, seconds: f32) { let emitter = self.emitters.entry(entity).or_default(); emitter.simulation.reset(); emitter.seek = Some(seconds); }
    pub fn diagnostics(&self) -> &HashMap<String,String> { &self.errors }

    pub fn collect(&mut self, world: &World, hierarchy: &TransformHierarchy, camera: FrameCamera, delta: f32, root: Option<&Path>) -> Vec<RenderObject> {
        let delta = self.frame_delta.take().unwrap_or(delta);
        if self.root.as_deref() != root { if self.root.is_some() {self.emitters.clear();} self.shader_seconds=0.; self.root = root.map(Path::to_path_buf); self.definitions.clear(); self.errors.clear(); }
        let Some(root) = self.root.clone() else { return Vec::new(); };
        if delta.is_finite() && delta>0. {self.shader_seconds+=delta;}
        let inverse = camera.view.inverse();
        let basis = ParticleCameraBasis { right: inverse.x_axis.truncate().normalize_or_zero(), up: inverse.y_axis.truncate().normalize_or_zero(), forward: inverse.z_axis.truncate().normalize_or_zero() };
        let mut live = HashSet::new(); let mut output = Vec::new();
        for entity in world.entities_with_components(&["ParticleEmitter3D"]) {
            let Some(component) = world.get_component::<ParticleEmitter3D>(entity) else { continue; };
            if component.definition.is_empty() { continue; }
            let Some(transform) = hierarchy.get(entity) else { continue; };
            if !component.playing { self.emitters.remove(&entity); continue; }
            let key = component.definition.as_str();
            let Some(path) = resolve_project_asset_path(&root, key) else { continue; };
            let metadata = std::fs::metadata(&path).ok(); let modified = metadata.as_ref().and_then(|m| m.modified().ok()); let length = metadata.map_or(0, |m| m.len());
            if self.definitions.get(key).is_none_or(|asset| asset.modified != modified || asset.length != length || asset.mesh_stamp.as_ref().is_some_and(|(p,m,n)| {let current=std::fs::metadata(p).ok();current.as_ref().and_then(|v|v.modified().ok())!=*m || current.map_or(0,|v|v.len())!=*n})) {
                match load_asset(&root, &path, modified, length) {
                    Ok(asset) => { self.definitions.insert(key.into(),asset); self.errors.remove(key); if let Some(emitter)=self.emitters.get_mut(&entity) {emitter.simulation.reset();emitter.seconds=0.;} }
                    Err(error) => { if self.errors.get(key) != Some(&error) { log::error!("particle {key}: {error}"); self.errors.insert(key.into(),error); } self.definitions.remove(key); continue; }
                }
            }
            let asset = &self.definitions[key]; let definition = &asset.definition;
            let emitter = self.emitters.entry(entity).or_default();
            if emitter.definition != key || emitter.revision != modified || emitter.playback_generation != component.playback_generation { emitter.simulation.reset(); emitter.seconds=0.; emitter.definition=key.into(); emitter.revision=modified; emitter.playback_generation=component.playback_generation; }
            if let Some(seconds) = emitter.seek.take() { emitter.seconds=seconds; }
            else if component.playback_time.is_finite() && component.playback_time >= 0. { emitter.seconds=component.playback_time; }
            else if delta.is_finite() && delta > 0. { emitter.seconds += delta; }
            live.insert(entity);
            let particles = emitter.simulation.sample(definition,emitter.seconds,true,if definition.coordinate_space=="unity" {transform.matrix*Mat4::from_scale(Vec3::new(1.,1.,-1.))} else {transform.matrix},basis);
            let mut features = ["_CustomData_ON","_MASK_ON","_NOISE_ON","_DISSOLVE_SOFT","_Sub_ON"].iter().enumerate().fold(0,|bits,(index,key)|bits | if definition.material.keywords.iter().any(|k|k==key) {1<<index} else {0});
            if definition.material.shader!="VFX/EffectURP_V2_3D" && !definition.material.shader.is_empty() {features=1<<5;}
            for particle in particles {
                let data = ParticleRenderData { geometry: asset.geometry.clone(), color: particle.color, custom1: particle.custom_data1, custom2: particle.custom_data2, uv_transform: particle.uv_transform, parameters: asset.parameters.clone(), seconds: self.shader_seconds, features, sorting_position:transform.position.to_array(), sorting_fudge:definition.renderer.sorting_fudge,
                    source_blend: value(&definition.material,"_BlendModeSrc",5.) as u32, destination_blend: value(&definition.material,"_BlendModeDst",10.) as u32, depth_compare: value(&definition.material,"_ZTest",2.) as u32, cull: value(&definition.material,"_CullMode",0.) as u32, depth_write: asset.material.depth_write };
                let mut material = asset.material.clone(); material.particle=Some(Arc::new(data));
                output.push(RenderObject { mesh_key: format!("$particle:{key}"), model: particle.transform, material: material.into(), cast_shadows:false, receive_shadows:false });
            }
        }
        self.emitters.retain(|entity,_|live.contains(entity));
        output
    }
}

fn load_asset(root: &Path, path: &Path, modified: Option<SystemTime>, length: u64) -> Result<DefinitionAsset,String> {
    let definition=load_particle_definition(path).map_err(|e|e.to_string())?;
    let mut mesh_stamp=None;
    let geometry=if definition.renderer.mode=="mesh" {
        let path=resolve_project_asset_path(root,&definition.renderer.mesh).ok_or("invalid particle mesh path")?;
        let metadata=std::fs::metadata(&path).map_err(|e|e.to_string())?;mesh_stamp=Some((path.clone(),metadata.modified().ok(),metadata.len()));
        load_particle_geometry_with_basis(&path, &definition.renderer.mesh_basis)?
    } else { ParticleGeometry { vertices: vec![ParticleVertex {position:[-0.5,-0.5,0.],uv:[0.,0.],color:[1.;4]},ParticleVertex {position:[0.5,-0.5,0.],uv:[1.,0.],color:[1.;4]},ParticleVertex {position:[0.5,0.5,0.],uv:[1.,1.],color:[1.;4]},ParticleVertex {position:[-0.5,0.5,0.],uv:[0.,1.],color:[1.;4]}],indices:vec![0,1,2,0,2,3] } };
    let (material,parameters)=prepare_material(&definition.material);
    Ok(DefinitionAsset {modified,length,definition:Arc::new(definition),geometry:Arc::new(geometry),mesh_stamp,material,parameters})
}

pub fn load_particle_geometry(path: &Path) -> Result<ParticleGeometry,String> {
    load_particle_geometry_with_basis(path,"gltf")
}

pub fn load_particle_geometry_with_basis(path: &Path, basis: &str) -> Result<ParticleGeometry,String> {
    if basis!="gltf" && basis!="unity_shared_mesh_fbx2gltf" {return Err(format!("unsupported particle mesh basis: {basis}"));}
    let unity=basis=="unity_shared_mesh_fbx2gltf";
    let (document,buffers,_)=gltf::import(path).map_err(|e|e.to_string())?;
    let mut geometry=ParticleGeometry {vertices:Vec::new(),indices:Vec::new()};
    fn visit(node:gltf::Node<'_>, parent:Mat4, buffers:&[gltf::buffer::Data], geometry:&mut ParticleGeometry, unity:bool)->Result<(),String> {
        let matrix=if unity {Mat4::from_scale(Vec3::new(-1.,1.,1.))} else {parent*Mat4::from_cols_array_2d(&node.transform().matrix())};
        if let Some(mesh)=node.mesh() { for primitive in mesh.primitives() {
            if primitive.mode()!=gltf::mesh::Mode::Triangles {return Err("particle mesh requires triangle primitives".into());}
            let reader=primitive.reader(|b|Some(&buffers[b.index()]));
            let positions:Vec<_>=reader.read_positions().ok_or("particle mesh has no positions")?.collect();
            let uvs:Vec<_>=reader.read_tex_coords(0).map(|v|v.into_f32().collect()).unwrap_or_else(||vec![[0.;2];positions.len()]);
            let colors:Vec<_>=reader.read_colors(0).map(|v|v.into_rgba_f32().collect()).unwrap_or_else(||vec![[1.;4];positions.len()]);
            if uvs.len()!=positions.len() || colors.len()!=positions.len() {return Err("particle mesh attribute count mismatch".into());}
            let base=geometry.vertices.len() as u32;
            for (i,position) in positions.iter().enumerate() {let position=matrix.transform_point3(Vec3::from(*position));if !position.is_finite() {return Err("non-finite particle vertex".into());}geometry.vertices.push(ParticleVertex {position:position.to_array(),uv:if unity {[uvs[i][0],1.-uvs[i][1]]} else {uvs[i]},color:if unity {colors[i].map(|c|(c.clamp(0.,1.)*255.).round()/255.)} else {colors[i]}});}
            let mut indices:Vec<u32>=reader.read_indices().map(|v|v.into_u32().collect()).unwrap_or_else(||(0..positions.len() as u32).collect());
            if indices.len()%3!=0 || indices.iter().any(|i|*i as usize>=positions.len()) {return Err("invalid particle mesh indices".into());}
            if matrix.determinant()<0. {for triangle in indices.chunks_exact_mut(3) {triangle.swap(1,2);}}
            geometry.indices.extend(indices.into_iter().map(|i|i+base));
        }}
        for child in node.children() {visit(child,matrix,buffers,geometry,unity)?;} Ok(())
    }
    let scene=document.default_scene().or_else(||document.scenes().next()).ok_or("particle model has no scene")?;
    for n in scene.nodes() {visit(n,Mat4::IDENTITY,&buffers,&mut geometry,unity)?;}
    if geometry.indices.is_empty() {return Err("particle model has no triangles".into());} Ok(geometry)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn material_custom_channels_and_uv_transform_are_preserved() {
        let mut source=ParticleMaterial::default();source.floats.insert("_ContrastValue20".into(),8.);source.colors.insert("_MainColor".into(),[2.,3.,4.,0.5]);
        let (material,parameters)=prepare_material(&source);assert_eq!(parameters[95][0],8.);assert_eq!(parameters[121],[2.,3.,4.,0.5]);assert!(material.transparent);assert!(!material.depth_write);
    }
    #[test] fn first_seek_stop_replay_and_inactive_parent() {
        use mengine_core::generated::Transform;
        let root=std::env::temp_dir().join(format!("mengine-particles-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(root.join("Assets")).unwrap();
        let definition=ParticleDefinition {simulation_space:"world".into(),start_speed:mengine_assets::ParticleCurve::constant(0.),..Default::default()};
        std::fs::write(root.join("Assets/test.mparticle"),serde_json::to_vec(&definition).unwrap()).unwrap();
        let mut world=World::new();let parent=world.spawn_empty();world.insert_component(parent,Transform::default());let entity=world.spawn_empty();world.insert_component(entity,Transform::default());world.set_parent(entity,Some(parent));world.insert_component(entity,ParticleEmitter3D {definition:"Assets/test.mparticle".into(),playing:true,..Default::default()});
        let mut particles=ImportedParticleWorld::default();particles.seek_entity(entity,0.5);
        let camera=FrameCamera {view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::ZERO};
        let hierarchy=TransformHierarchy::build(&world);
        let first=particles.collect(&world,&hierarchy,camera,0.,Some(&root));assert_eq!(first.len(),5,"first-frame seek must survive root initialization");
        particles.restart();particles.set_frame_delta(Some(0.8));assert_eq!(particles.collect(&world,&hierarchy,camera,0.,Some(&root)).len(),8,"late first render consumes simulation time");
        assert_eq!(particles.collect(&world,&hierarchy,camera,0.,Some(&root)).len(),8,"frame override is consumed once");
        world.get_component_mut::<ParticleEmitter3D>(entity).unwrap().playback_time=0.2;
        assert_eq!(particles.collect(&world,&hierarchy,camera,0.5,Some(&root)).len(),2,"explicit replay time survives skipped display frames");
        assert_eq!(particles.collect(&world,&hierarchy,camera,0.5,Some(&root)).len(),2,"paused preview time does not advance with rendering");
        let before=particles.collect(&world,&hierarchy,camera,0.,Some(&root))[0].model.w_axis.x;
        world.get_component_mut::<Transform>(parent).unwrap().position[0]=5.;let hierarchy=TransformHierarchy::build(&world);
        let continued=particles.collect(&world,&hierarchy,camera,0.,Some(&root))[0].model.w_axis.x;
        assert_eq!(continued,before,"world particles retain their original birth transform");
        world.get_component_mut::<ParticleEmitter3D>(entity).unwrap().playback_generation+=1;
        let replayed=particles.collect(&world,&hierarchy,camera,0.,Some(&root))[0].model.w_axis.x;
        assert!((replayed-before-5.).abs()<1e-5,"replay generation resets births even when no zero-time frame was rendered");
        world.get_component_mut::<ParticleEmitter3D>(entity).unwrap().playback_time=-1.;
        world.get_component_mut::<ParticleEmitter3D>(entity).unwrap().playing=false;assert!(particles.collect(&world,&hierarchy,camera,0.,Some(&root)).is_empty());
        world.get_component_mut::<ParticleEmitter3D>(entity).unwrap().playing=true;particles.seek_entity(entity,0.5);assert_eq!(particles.collect(&world,&hierarchy,camera,0.,Some(&root)).len(),5);
        world.set_editor_state(parent,0,false);let hierarchy=TransformHierarchy::build(&world);assert!(particles.collect(&world,&hierarchy,camera,0.,Some(&root)).is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test] fn unity_shared_mesh_ignores_nodes_preserves_all_primitives_color_and_uv() {
        let root=std::env::temp_dir().join(format!("mengine-mesh-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&root).unwrap();
        let values:[f32;27]=[1.,2.,3.,2.,2.,3.,1.,3.,3., 0.2,0.3,0.4,0.5,0.6,0.7, 0.25,0.5,1.,1.,0.25,0.5,1.,1.,0.25,0.5,1.,1.];
        let bytes:Vec<_>=values.iter().flat_map(|v|v.to_le_bytes()).collect();std::fs::write(root.join("mesh.bin"),bytes).unwrap();
        let primitive=serde_json::json!({"attributes":{"POSITION":0,"TEXCOORD_0":1,"COLOR_0":2}});
        let document=serde_json::json!({"asset":{"version":"2.0"},"buffers":[{"uri":"mesh.bin","byteLength":108}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},{"buffer":0,"byteOffset":36,"byteLength":24},{"buffer":0,"byteOffset":60,"byteLength":48}],"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[1,2,3],"max":[2,3,3]},{"bufferView":1,"componentType":5126,"count":3,"type":"VEC2"},{"bufferView":2,"componentType":5126,"count":3,"type":"VEC4"}],"meshes":[{"primitives":[primitive.clone(),primitive]}],"nodes":[{"mesh":0,"translation":[1,0,0],"scale":[2,2,2]}],"scenes":[{"nodes":[0]}],"scene":0});
        let path=root.join("mesh.gltf");std::fs::write(&path,document.to_string()).unwrap();
        let unity=load_particle_geometry_with_basis(&path,"unity_shared_mesh_fbx2gltf").unwrap();assert_eq!(unity.vertices.len(),6);assert_eq!(unity.indices,vec![0,2,1,3,5,4]);assert_eq!(unity.vertices[0].position,[-1.,2.,3.]);assert_eq!(unity.vertices[0].uv,[0.2,0.7]);assert_eq!(unity.vertices[0].color,[64./255.,128./255.,1.,1.]);
        let gltf=load_particle_geometry(&path).unwrap();assert_eq!(gltf.vertices[0].position,[3.,4.,6.]);assert_eq!(gltf.vertices[0].uv,[0.2,0.3]);std::fs::remove_dir_all(root).unwrap();
    }

}
