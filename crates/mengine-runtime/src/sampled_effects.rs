// Author: MiYu. Replay sampled authored effects through the shared native frame compiler.
use crate::sorting::{WorldPrimitive, WorldPrimitiveKind};
use crate::textures::TextureLoadFailure;
use glam::{Mat4, Vec3, Vec4};
use mengine_assets::{effect_asset_path, EffectFrame, EffectMaterial, GltfBillboardCamera, GltfPoseSource, SampledEffectAsset};
use mengine_core::{generated::SampledEffect, Entity, TransformHierarchy, World};
use mengine_rhi::{DirectionalLightData, FrameCamera, FrameLighting, PointLightData, UiBlendMode, UiPrimitive, UiRenderMaterial, UiShaderChannelData};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use std::sync::Arc;

type Stamp = (Option<SystemTime>, u64);
struct CachedEffect { stamp: Stamp, asset: Result<SampledEffectAsset, String> }
struct Playback { key: (String, i32, u32), elapsed: f32 }
struct CachedModel { dependencies: Vec<(PathBuf, Stamp)>, source: Result<GltfPoseSource, String> }
fn file_stamp(path: &Path) -> Stamp { std::fs::metadata(path).map(|m| (m.modified().ok(), m.len())).unwrap_or((None, 0)) }

#[derive(Default)]
pub struct SampledEffectWorld {
    root: Option<PathBuf>,
    assets: HashMap<String, CachedEffect>,
    players: HashMap<Entity, Playback>,
    models: HashMap<String, CachedModel>,
    pub failures: Vec<TextureLoadFailure>,
}

impl SampledEffectWorld {
    pub fn set_project_root(&mut self, root: Option<&Path>) {
        if self.root.as_deref() != root { *self = Self { root: root.map(Path::to_path_buf), ..Self::default() }; }
    }
    pub fn reset_entity(&mut self, entity: Entity) { self.players.remove(&entity); }

    pub fn collect(&mut self, world: &World, hierarchy: &TransformHierarchy, camera: FrameCamera, delta: f32, lighting: &mut FrameLighting) -> Vec<WorldPrimitive> {
        self.failures.clear();
        let Some(root) = self.root.as_ref() else { return Vec::new(); };
        let mut live = HashSet::new(); let mut used = HashSet::new(); let mut used_models = HashSet::new(); let mut output = Vec::new();
        for entity in world.entities_with_components(&["SampledEffect"]) {
            if !hierarchy.is_active(entity) { continue; }
            let (Some(component), Some(transform)) = (world.get_component::<SampledEffect>(entity), hierarchy.get(entity)) else { continue; };
            let key = component.effect.trim().replace('\\', "/");
            if !effect_asset_path(&key) { continue; }
            let path = root.join(&key);
            let stamp = std::fs::metadata(&path).map(|m| (m.modified().ok(), m.len())).unwrap_or((None, 0));
            if self.assets.get(&key).is_none_or(|cached| cached.stamp != stamp) {
                let asset = SampledEffectAsset::load(&path);
                if let Err(error) = &asset { self.failures.push(TextureLoadFailure { key: key.clone(), path: path.clone(), error: format!("sampled effect: {error}") }); }
                self.assets.insert(key.clone(), CachedEffect { stamp, asset });
            }
            used.insert(key.clone()); live.insert(entity);
            let signature = (key.clone(), component.clip, component.time_seconds.to_bits());
            let player = self.players.entry(entity).or_insert_with(|| Playback { key: signature.clone(), elapsed: component.time_seconds.max(0.) });
            if player.key != signature { player.key = signature; player.elapsed = component.time_seconds.max(0.); }
            let Ok(asset) = &self.assets[&key].asset else { continue; };
            let Some(clip) = usize::try_from(component.clip).ok().and_then(|index| asset.clips.get(index)) else { continue; };
            let frame = clip.sample(player.elapsed, component.looping && clip.looping);
            collect_frame(frame, &asset.materials, transform, camera, lighting, &mut output);
            collect_model_particles(frame, &asset.materials, transform, camera, root, &mut self.models, &mut used_models, &mut self.failures, &mut output);
            if component.playing && delta.is_finite() && component.speed.is_finite() {
                let next = (player.elapsed + delta.max(0.) * component.speed).max(0.);
                player.elapsed = if component.looping && clip.looping { next.rem_euclid(clip.duration) } else { next.min(clip.duration) };
            }
        }
        self.players.retain(|entity, _| live.contains(entity)); self.assets.retain(|key, _| used.contains(key));
        self.models.retain(|key, _| used_models.contains(key));
        output
    }
}

fn collect_frame(frame: &EffectFrame, materials: &[EffectMaterial], transform: mengine_core::WorldTransform, camera: FrameCamera, lighting: &mut FrameLighting, output: &mut Vec<WorldPrimitive>) {
    let inverse = camera.view.inverse();
    let right = inverse.x_axis.truncate().normalize_or_zero(); let up = inverse.y_axis.truncate().normalize_or_zero();
    let forward = inverse.z_axis.truncate().normalize_or_zero();
    let scale = transform.scale.abs().max_element();
    for p in &frame.particles {
        if materials[p.material].model.is_some() { continue; }
        let position = transform.matrix.transform_point3(Vec3::from_array(p.position));
        let r = right * p.size * scale * 0.5; let u = up * p.size * scale * 0.5;
        push_quad([position-r+u, position+r+u, position+r-u, position-r-u], p.color, p.uv, &materials[p.material], camera, output);
    }
    for q in &frame.quads {
        let corners = if let Some(corners) = q.corners { corners.map(|p| transform.matrix.transform_point3(Vec3::from_array(p))) } else if let Some([a,b]) = q.tail {
            let a = transform.matrix.transform_point3(Vec3::from_array(a)); let b = transform.matrix.transform_point3(Vec3::from_array(b));
            let tangent = (b-a).cross(forward).normalize_or_zero() * q.width * scale * 0.5;
            [a+tangent,b+tangent,b-tangent,a-tangent]
        } else { continue; };
        push_quad(corners, q.color, q.uv, &materials[q.material], camera, output);
    }
    for light in &frame.lights {
        let position = transform.matrix.transform_point3(Vec3::from_array(light.position));
        let color = [light.color[0],light.color[1],light.color[2]];
        if light.kind == "omni" { lighting.points.push(PointLightData { position, color, intensity: light.intensity.max(0.), range: light.range.max(0.) * scale }); }
        else if light.kind == "directional" && lighting.directional.is_none() {
            let direction = (transform.rotation * -Vec3::from_array(light.position)).try_normalize().unwrap_or(-Vec3::Y);
            lighting.directional = Some(DirectionalLightData { direction, color, intensity: light.intensity.max(0.), cast_shadows: false, shadow_strength: 0., shadow_bias: 0., shadow_normal_bias: 0., shadow_distance: 0. });
        }
        if light.ambient_color[3] > 0. {
            let ambient = light.ambient_color;
            lighting.environment.sky_color = [ambient[0],ambient[1],ambient[2]];
            lighting.environment.equator_color = lighting.environment.sky_color;
            lighting.environment.ground_color = lighting.environment.sky_color;
            lighting.environment.diffuse_intensity = ambient[3];
        }
    }
}

fn collect_model_particles(frame: &EffectFrame, materials: &[EffectMaterial], transform: mengine_core::WorldTransform, camera: FrameCamera, root: &Path, cache: &mut HashMap<String, CachedModel>, used: &mut HashSet<String>, failures: &mut Vec<TextureLoadFailure>, output: &mut Vec<WorldPrimitive>) {
    let inverse = camera.view.inverse(); let look = -inverse.z_axis.truncate().normalize_or_zero(); let up = inverse.y_axis.truncate().normalize_or_zero();
    for particle in &frame.particles {
        let Some(model) = &materials[particle.material].model else { continue; };
        if particle.size <= 0. || particle.color[3] <= 0. { continue; }
        let seconds = if model.looping { particle.age.rem_euclid(model.duration) } else { particle.age.min(model.duration) };
        let sample = (seconds * model.fps as f32).floor() as u32;
        let matrix = transform.matrix * Mat4::from_translation(Vec3::from_array(particle.position)) * Mat4::from_scale(Vec3::splat(particle.size));
        if matrix.determinant().abs() < 1e-12 { continue; }
        for part in &model.parts {
            let first_use = used.insert(part.mesh.clone());
            let path = root.join(&part.mesh);
            if cache.get(&part.mesh).is_none_or(|entry| first_use && entry.dependencies.iter().any(|(p, stamp)| file_stamp(p) != *stamp)) {
                let loaded = GltfPoseSource::load_in_project(&path, root);
                let (source, dependencies) = match loaded {
                    Ok((source, dependencies)) => (Ok(source), dependencies),
                    Err(error) => { failures.push(TextureLoadFailure { key: part.mesh.clone(), path: path.clone(), error: format!("sampled model particle: {error}") }); (Err(error.to_string()), vec![path.clone()]) }
                };
                cache.insert(part.mesh.clone(), CachedModel { source, dependencies: dependencies.into_iter().map(|p| { let stamp = file_stamp(&p); (p, stamp) }).collect() });
            }
            let Ok(source) = &cache[&part.mesh].source else { continue; };
            let state = &part.states[part.states.partition_point(|s| s.frame <= sample).saturating_sub(1)];
            let color = std::array::from_fn(|i| particle.color[i] * state.color[i]);
            if color[3] <= 0. { continue; }
            let mesh = match source.sample_with_camera(model.clip, sample, model.fps, Some(GltfBillboardCamera { model: matrix, look, up })) {
                Ok(mesh) => mesh,
                Err(error) => { failures.push(TextureLoadFailure { key: part.mesh.clone(), path: path.clone(), error: format!("sampled model pose: {error}") }); continue; }
            };
            let material = EffectMaterial { texture: state.texture.clone(), blend: part.blend.clone(), alpha_cutoff: part.alpha_cutoff, model: None };
            for triangle in mesh.indices.chunks_exact(3) {
                let slots = [triangle[0] as usize, triangle[1] as usize, triangle[2] as usize, triangle[2] as usize];
                if slots.iter().any(|i| *i >= mesh.positions.len() || *i >= mesh.uvs.len()) { continue; }
                let corners = slots.map(|i| matrix.transform_point3(Vec3::from_array(mesh.positions[i])));
                let uv = slots.map(|i| [mesh.uvs[i][0], mesh.uvs[i][1], 0., 0.]);
                push_polygon(corners, color, [0.,0.,1.,1.], Some(uv), &material, camera, output);
            }
        }
    }
}

fn push_quad(corners: [Vec3;4], color: [f32;4], uv: [f32;4], material: &EffectMaterial, camera: FrameCamera, output: &mut Vec<WorldPrimitive>) {
    push_polygon(corners, color, uv, None, material, camera, output);
}

fn push_polygon(corners: [Vec3;4], color: [f32;4], uv: [f32;4], vertex_uv: Option<[[f32;4];4]>, material: &EffectMaterial, camera: FrameCamera, output: &mut Vec<WorldPrimitive>) {
    if color[3] <= 0. { return; }
    let matrix = camera.proj * camera.view;
    let clips = corners.map(|p| matrix * p.extend(1.));
    if clips.iter().any(|p| !p.is_finite()) || clips.iter().all(|p| p.w <= 0. || p.z < 0.) { return; }
    let center = clips.iter().copied().sum::<Vec4>() * 0.25;
    let mut primitive = UiPrimitive::solid([0.,0.,1.,1.], color);
    primitive.clip_corners = Some(clips.map(|v| v.to_array())); primitive.uv = uv;
    if let Some(uv0) = vertex_uv { primitive.shader_channel_data = Some(Arc::new(UiShaderChannelData { uv0, ..UiShaderChannelData::default() })); }
    primitive.key.texture = material.texture.clone(); primitive.key.material = "sampled-effect".into();
    primitive.key.blend = match material.blend.as_str() { "additive" => UiBlendMode::Additive, "multiply" => UiBlendMode::Multiply, _ => UiBlendMode::Alpha };
    if material.alpha_cutoff > 0. || primitive.key.blend == UiBlendMode::Multiply {
        let result = if primitive.key.blend == UiBlendMode::Multiply { "vec4<f32>(color.rgb * color.a, color.a)" } else { "color" };
        let shader = format!("fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {{ let color = mengine_ui_main_texture(input.uv0) * input.vertex_color; if color.a < {} {{ discard; }} return {}; }}", material.alpha_cutoff, result);
        primitive.render_material = Some(Arc::new(UiRenderMaterial { shader: shader.into(), blend: primitive.key.blend, ..UiRenderMaterial::default() }));
    }
    primitive.key.depth_test = true;
    output.push(WorldPrimitive { kind: WorldPrimitiveKind::ThreeD, sorting_layer: "default".into(), sorting_order: 0, depth: center.z / center.w.max(1e-6), world_position: None, primitive });
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::generated::Transform;
    #[test]
    fn original_cloud_particles_apply_opacity_before_multiply_blending() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
        let asset = SampledEffectAsset::load(&root.join("Assets/DeathKnightEffects/Effects/DeathCoilSpecialArt.mfx")).unwrap();
        let material = asset.materials.iter().position(|m| m.blend == "multiply").unwrap();
        let frame = asset.clips[0].frames.iter().find(|f| f.particles.iter().any(|p| p.material == material)).unwrap();
        let mut single = frame.clone(); single.particles.retain(|p| p.material == material); single.particles.truncate(1); single.quads.clear();
        let mut world = World::new(); let entity = world.spawn_empty(); world.insert_component(entity, Transform::default());
        let camera = FrameCamera { view: mengine_rhi::look_at(Vec3::new(0.,0.,10.), Vec3::ZERO, Vec3::Y), proj: mengine_rhi::orthographic(10.,1.,0.1,100.), position: Vec3::new(0.,0.,10.) };
        let mut output = Vec::new(); collect_frame(&single, &asset.materials, TransformHierarchy::build(&world).get(entity).unwrap(), camera, &mut FrameLighting::default(), &mut output);
        assert_eq!(output.len(), 1); let primitive = &output[0].primitive;
        assert_eq!(primitive.key.blend, UiBlendMode::Multiply);
        let render_material = primitive.render_material.as_ref().expect("multiply requires premultiplied texture opacity");
        assert_eq!(render_material.blend, UiBlendMode::Multiply); assert!(render_material.shader.contains("color.rgb * color.a"));
        for blend in ["alpha", "additive"] {
            let mut materials = asset.materials.clone(); materials[material].blend = blend.into(); output.clear();
            collect_frame(&single, &materials, TransformHierarchy::build(&world).get(entity).unwrap(), camera, &mut FrameLighting::default(), &mut output);
            assert!(output[0].primitive.render_material.is_none());
        }
    }
    #[test]
    fn original_model_particle_replays_mesh_layers_age_uvs_and_unit_scale() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
        let asset = SampledEffectAsset::load(&root.join("Assets/FarseerEffects/Effects/LightningBoltMissile.mfx")).unwrap();
        let material = asset.materials.iter().position(|m| m.model.is_some()).unwrap();
        assert!(asset.clips.iter().filter(|c| c.name != "Death").all(|c| c.frames.iter().all(|f| f.particles.iter().all(|p| p.material != material))));
        let frame = asset.clips.iter().find(|c| c.name == "Death").unwrap().frames.iter().find(|f| f.particles.iter().any(|p| p.material == material)).unwrap();
        let particle = frame.particles.iter().find(|p| p.material == material).unwrap();
        assert_eq!(particle.size, 1.); assert!(particle.age > 0.);
        let mut single = frame.clone(); single.particles.retain(|p| p.material == material); single.particles.truncate(1);
        let mut world = World::new(); let entity = world.spawn_empty(); world.insert_component(entity, Transform { position: [2.,0.,0.], ..Transform::default() });
        let transform = TransformHierarchy::build(&world).get(entity).unwrap();
        let camera = FrameCamera { view: mengine_rhi::look_at(Vec3::new(0.,0.,10.), Vec3::ZERO, Vec3::Y), proj: mengine_rhi::orthographic(10.,1.,0.1,100.), position: Vec3::new(0.,0.,10.) };
        let mut cache = HashMap::new(); let mut used = HashSet::new(); let mut failures = Vec::new(); let mut output = Vec::new();
        collect_model_particles(&single, &asset.materials, transform, camera, &root, &mut cache, &mut used, &mut failures, &mut output);
        assert!(failures.is_empty()); assert_eq!(cache.len(), 3); assert!(!output.is_empty());
        let model = asset.materials[material].model.as_ref().unwrap();
        let part = &model.parts[0]; let source = GltfPoseSource::load(&root.join(&part.mesh)).unwrap();
        let matrix = transform.matrix * Mat4::from_translation(Vec3::from_array(particle.position));
        let pose = source.sample_with_camera(model.clip, (particle.age * model.fps as f32).floor() as u32, model.fps, Some(GltfBillboardCamera { model: matrix, look: -camera.view.inverse().z_axis.truncate(), up: Vec3::Y })).unwrap();
        let primitive = &output[0].primitive; let slots = [pose.indices[0] as usize, pose.indices[1] as usize, pose.indices[2] as usize, pose.indices[2] as usize];
        assert_eq!(primitive.key.blend, UiBlendMode::Additive); assert!(primitive.key.depth_test);
        assert_eq!(primitive.shader_channel_data.as_ref().unwrap().uv0, slots.map(|i| [pose.uvs[i][0],pose.uvs[i][1],0.,0.]));
        assert_eq!(primitive.clip_corners.unwrap(), slots.map(|i| (camera.proj * camera.view * matrix.transform_point3(Vec3::from_array(pose.positions[i])).extend(1.)).to_array()));
        assert_eq!(primitive.clip_corners.unwrap()[2], primitive.clip_corners.unwrap()[3]);
        single.particles[0].age = 1.4; output.clear(); used.clear();
        collect_model_particles(&single, &asset.materials, transform, camera, &root, &mut cache, &mut used, &mut failures, &mut output);
        assert!(failures.is_empty()); assert!(!output.is_empty());
    }
    #[test]
    fn sampled_quads_use_transformed_depth_and_camera_axes() {
        let asset=SampledEffectAsset::parse(r#"{"schemaVersion":1,"fps":12,"materials":[{"texture":"Assets/s.png","blend":"additive"}],"clips":[{"name":"Stand","duration":1,"loop":true,"frames":[{"seconds":0,"particles":[{"material":0,"position":[0,0,0],"size":2,"color":[1,0,0,1],"uv":[0.25,0,0.25,1]}],"quads":[],"lights":[]},{"seconds":1,"particles":[],"quads":[],"lights":[]}]}]}"#).unwrap();
        let mut world=World::new();let entity=world.spawn_empty();world.insert_component(entity,Transform { position:[2.,0.,0.],..Transform::default() });
        let hierarchy=TransformHierarchy::build(&world); let camera=FrameCamera { view:mengine_rhi::look_at(Vec3::new(0.,0.,10.),Vec3::ZERO,Vec3::Y),proj:mengine_rhi::orthographic(10.,1.,0.1,100.),position:Vec3::new(0.,0.,10.) };
        let mut output=Vec::new();collect_frame(&asset.clips[0].frames[0],&asset.materials,hierarchy.get(entity).unwrap(),camera,&mut FrameLighting::default(),&mut output);
        assert_eq!(output.len(),1);let p=&output[0].primitive;assert!(p.key.depth_test);assert_eq!(p.uv,[0.25,0.,0.25,1.]);let c=p.clip_corners.unwrap();assert!(c[0][0]<c[1][0]);assert!(c[0][1]>c[2][1]);assert!(output[0].depth>0.);
    }
    #[test]
    fn playback_handles_pause_seek_source_reload_and_inactive_entities() {
        let root=std::env::temp_dir().join(format!("mengine-effect-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(root.join("Assets")).unwrap();
        let path=root.join("Assets/a.mfx");
        let mut data=serde_json::json!({"schemaVersion":1,"fps":12,"materials":[{"texture":"Assets/s.png","blend":"alpha"}],"clips":[{"name":"Birth","duration":1.,"loop":false,"frames":[{"seconds":0.,"particles":[],"quads":[],"lights":[]},{"seconds":1.,"particles":[{"material":0,"position":[0,0,0],"size":1,"color":[1,1,1,1],"uv":[0,0,1,1]}],"quads":[],"lights":[]}]}]});
        std::fs::write(&path,data.to_string()).unwrap();let mut effects=SampledEffectWorld::default();effects.set_project_root(Some(&root));
        let mut world=World::new();let entity=world.spawn_empty();world.insert_component(entity,Transform::default());world.insert_component(entity,SampledEffect { effect:"Assets/a.mfx".into(),looping:false,..SampledEffect::default() });
        let camera=FrameCamera { view:mengine_rhi::look_at(Vec3::new(0.,0.,10.),Vec3::ZERO,Vec3::Y),proj:mengine_rhi::orthographic(10.,1.,0.1,100.),position:Vec3::new(0.,0.,10.) };
        let collect=|effects:&mut SampledEffectWorld,world:&World,delta|effects.collect(world,&TransformHierarchy::build(world),camera,delta,&mut FrameLighting::default());
        assert!(collect(&mut effects,&world,1.).is_empty());assert_eq!(collect(&mut effects,&world,0.).len(),1);
        world.get_component_mut::<SampledEffect>(entity).unwrap().playing=false;assert_eq!(collect(&mut effects,&world,4.).len(),1);
        world.get_component_mut::<SampledEffect>(entity).unwrap().time_seconds=0.5;assert!(collect(&mut effects,&world,4.).is_empty());
        data["clips"][0]["frames"][1]["particles"]=serde_json::json!([]);std::fs::write(&path,data.to_string()).unwrap();world.get_component_mut::<SampledEffect>(entity).unwrap().time_seconds=1.;assert!(collect(&mut effects,&world,0.).is_empty());
        assert!(effects.failures.is_empty());world.set_editor_state(entity,0,false);collect(&mut effects,&world,0.);assert!(effects.players.is_empty());assert!(effects.assets.is_empty());
        world.set_editor_state(entity,0,true);std::fs::write(&path,"invalid").unwrap();collect(&mut effects,&world,0.);assert_eq!(effects.failures.len(),1);collect(&mut effects,&world,0.);assert!(effects.failures.is_empty());
        effects.set_project_root(None);assert!(effects.players.is_empty());std::fs::remove_file(path).unwrap();std::fs::remove_dir(root.join("Assets")).unwrap();std::fs::remove_dir(root).unwrap();
    }
}
