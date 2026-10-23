// Author: MiYu. Shared material sources preserve editing isolation and authored reload semantics.
use super::*;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("mengine-material-source-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Assets")).unwrap(); Self(root)
    }
    fn write(&self, name: &str, text: &str) { std::fs::write(self.0.join("Assets").join(name), text).unwrap(); }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
fn expire(cache: &mut RuntimeMaterialCache) {
    for entry in cache.materials.values_mut() { entry.checked_at -= ASSET_CHECK_INTERVAL; }
    for entry in cache.instances.values_mut() { entry.checked_at -= ASSET_CHECK_INTERVAL; }
}

#[test]
fn shared_sources_isolate_editable_assets_instances_and_render_overrides() {
    let fixture = Fixture::new();
    fixture.write("Base.mmat", r#"{"version":10,"shader":"custom","custom_shader":"Assets/Test.mshader","base_color":[1,0,0,1],"base_color_texture":"Assets/Base.png","custom_parameters":{"strength":[2,0,0,0]},"custom_textures":{"detail":"Assets/Detail.png"}}"#);
    fixture.write("Test.mshader", r#"/* MENGINE_PARAMETERS
{"parameters":[{"name":"strength","type":"float","default":1}],"textures":[{"name":"detail","type":"color","default":""}]}
*/
fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return color; }"#);
    fixture.write("A.minst", r#"{"version":2,"parent":"Assets/Base.mmat","overrides":{"base_color":[0,1,0,1],"custom_parameters":{"strength":[3,0,0,0]}}}"#);
    fixture.write("B.minst", r#"{"version":2,"parent":"Assets/A.minst","overrides":{"roughness":0.2}}"#);
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone()));
    let shared = cache.resolve_shared_asset("Assets/Base.mmat").unwrap();
    assert!(Arc::ptr_eq(&shared, &cache.resolve_shared_asset(" Assets\\Base.mmat ").unwrap()));
    let mut editable = cache.resolve_asset("Assets/Base.mmat").unwrap();
    editable.base_color = [0.0; 4]; editable.base_color_texture.clear(); editable.custom_parameters.get_mut("strength").unwrap()[0] = 9.0; editable.custom_textures.clear();
    assert_eq!(shared.base_color, [1.0, 0.0, 0.0, 1.0]); assert_eq!(shared.custom_parameters["strength"][0], 2.0); assert_eq!(shared.custom_textures["detail"], "Assets/Detail.png");
    let mut rendered = cache.resolve("Assets/Base.mmat").unwrap(); rendered.base_color_texture.clear();
    assert_eq!(cache.resolve("Assets/Base.mmat").unwrap().base_color_texture, "Assets/Base.png");
    let nested = cache.resolve_shared_asset("Assets/B.minst").unwrap();
    assert_eq!(nested.base_color, [0.0, 1.0, 0.0, 1.0]); assert_eq!(nested.roughness, 0.2); assert_eq!(nested.custom_parameters["strength"][0], 3.0);
    assert!(!Arc::ptr_eq(&nested, &shared)); assert_eq!(shared.custom_parameters["strength"][0], 2.0);
    assert_eq!(cache.resolve_asset("Assets/A.minst").unwrap().roughness, shared.roughness);
    let other = Fixture::new(); other.write("Base.mmat", r#"{"version":10,"base_color":[0,0,1,1]}"#);
    assert_eq!(RuntimeMaterialCache::new(Some(other.0.clone())).resolve("Assets/Base.mmat").unwrap().base_color, [0.0, 0.0, 1.0, 1.0]);
    assert_eq!(cache.resolve("Assets/Base.mmat").unwrap().base_color, shared.base_color);
    assert!(cache.resolve_shared_asset("../Base.mmat").is_err());
    assert!(cache.resolve_shared_asset("Assets/Base.txt").is_err());
    assert!(RuntimeMaterialCache::new(None).resolve_shared_asset("Assets/Base.mmat").is_err());
}

#[test]
fn shared_sources_preserve_polling_invalidation_failure_and_recovery() {
    let fixture = Fixture::new(); fixture.write("Base.mmat", r#"{"version":10,"base_color":[1,0,0,1]}"#);
    fixture.write("A.minst", r#"{"version":2,"parent":"Assets/Base.mmat"}"#);
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone()));
    let old = cache.resolve_shared_asset("Assets/Base.mmat").unwrap();
    fixture.write("Base.mmat", r#"{"version":10,"base_color":[0,1,0,1],"roughness":0.2}"#);
    std::fs::File::options().write(true).open(fixture.0.join("Assets/Base.mmat")).unwrap().set_modified(SystemTime::now() + Duration::from_secs(2)).unwrap();
    for entry in cache.materials.values_mut() { entry.checked_at = Instant::now(); }
    assert!(Arc::ptr_eq(&old, &cache.resolve_shared_asset("Assets/Base.mmat").unwrap()));
    expire(&mut cache);
    assert_eq!(cache.resolve("Assets/A.minst").unwrap().base_color, [0.0, 1.0, 0.0, 1.0]);
    let fresh = cache.resolve_shared_asset("Assets/Base.mmat").unwrap();
    assert!(!Arc::ptr_eq(&old, &fresh)); assert_eq!(old.base_color, [1.0, 0.0, 0.0, 1.0]);
    cache.invalidate("Assets/Base.mmat");
    assert!(!Arc::ptr_eq(&fresh, &cache.resolve_shared_asset("Assets/Base.mmat").unwrap()));
    std::fs::remove_file(fixture.0.join("Assets/Base.mmat")).unwrap(); expire(&mut cache);
    assert!(cache.resolve("Assets/A.minst").unwrap().is_error); assert_eq!(cache.diagnostics().len(), 1);
    assert!(cache.resolve("Assets/A.minst").unwrap().is_error); assert_eq!(cache.diagnostics().len(), 1);
    fixture.write("Base.mmat", r#"{"version":10,"base_color":[0,0,1,1]}"#); expire(&mut cache);
    assert_eq!(cache.resolve("Assets/A.minst").unwrap().base_color, [0.0, 0.0, 1.0, 1.0]); assert!(cache.diagnostics().is_empty());
    assert_eq!(fresh.base_color, [0.0, 1.0, 0.0, 1.0]);
}

#[test]
fn shared_source_inheritance_keeps_depth_boundary_and_cycle_errors() {
    let fixture = Fixture::new(); fixture.write("Base.mmat", r#"{"version":10}"#);
    for index in 0..32 { let parent = if index == 0 { "Base.mmat".to_owned() } else { format!("{}.minst", index - 1) }; fixture.write(&format!("{index}.minst"), &format!(r#"{{"version":2,"parent":"Assets/{parent}"}}"#)); }
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone()));
    assert!(cache.resolve_shared_asset("Assets/30.minst").is_ok());
    assert!(cache.resolve_shared_asset("Assets/31.minst").unwrap_err().contains("32 levels"));
    fixture.write("Cycle.minst", r#"{"version":2,"parent":"Assets/Cycle.minst"}"#);
    assert!(cache.resolve_shared_asset("Assets/Cycle.minst").unwrap_err().contains("inheritance cycle"));
}

#[test]
#[ignore = "manual Frostbound material resolution and mesh extraction benchmark"]
fn benchmark_shared_material_sources() {
    use crate::frame_compiler::collect_objects;
    use mengine_core::{World, TransformHierarchy};
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &snapshot);
    let label = std::env::var("MENGINE_PERFORMANCE_LABEL").unwrap_or_else(|_| "manual".into());
    assert!(label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    let out = root.join("../../tmp/docs-artifacts/editor-performance-risk"); std::fs::create_dir_all(&out).unwrap();
    let mut reports = Vec::new();
    for activate in [false, true] {
        if activate { for entity in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(entity, 0, true); } }
        let hierarchy = TransformHierarchy::build(&world);
        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let expected = collect_objects(&world, &hierarchy, &mut cache);
        let mut samples = Vec::new();
        for run in 0..11 {
            let now = Instant::now();
            for c in cache.materials.values_mut() { c.checked_at = now; }
            for c in cache.instances.values_mut() { c.checked_at = now; }
            for c in cache.surface_shaders.values_mut() { c.checked_at = now; }
            let started = Instant::now();
            for _ in 0..80 { std::hint::black_box(collect_objects(&world, &hierarchy, &mut cache)); }
            if run > 1 { samples.push(started.elapsed().as_secs_f64() * 1000.0 / 80.0); }
        }
        samples.sort_by(f64::total_cmp);
        let actual = collect_objects(&world, &hierarchy, &mut cache);
        assert_eq!(format!("{expected:?}"), format!("{actual:?}"));
        std::fs::write(out.join(format!("{label}-materials-{}.txt", expected.len())), format!("{actual:?}")).unwrap();
        reports.push(serde_json::json!({"all_pool_entities_active":activate,"objects":expected.len(),"source_materials":cache.materials.len(),"median_ms":samples[4],"samples":9,"iterations":80}));
    }
    println!("MATERIAL_SOURCE_BENCHMARK={}", serde_json::json!(reports));
}

#[test]
#[ignore = "manual material extraction CPU cost breakdown"]
fn benchmark_material_extraction_breakdown() {
    use crate::frame_compiler::collect_objects;
    use mengine_core::generated::{MeshRenderer, PbrMaterial};
    use mengine_core::{TransformHierarchy, World};
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let authored: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let mut inputs = vec![("authored", authored["world"].clone(), false), ("all-pools", authored["world"].clone(), true)];
    if let Ok(path) = std::env::var("MENGINE_PERFORMANCE_WORLD") { inputs.push(("paused-game", serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap(), false)); }
    let mut reports = Vec::new();
    for (name, value, activate) in inputs {
        let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &serde_json::from_value(value).unwrap());
        if activate { for e in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(e, 0, true); } }
        let hierarchy = TransformHierarchy::build(&world);
        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let expected = collect_objects(&world, &hierarchy, &mut cache);
        let mut keys: Vec<_> = world.entities_with_components(&["MeshRenderer"]).filter(|&e| hierarchy.get(e).is_some() && world.get_component::<PbrMaterial>(e).is_none()).filter_map(|e| world.get_component::<MeshRenderer>(e).map(|m| m.material.clone())).filter(|key| is_material_path(key)).collect();
        keys.sort(); keys.dedup();
        for polling in [false, true] {
            let mut stages = Vec::new();
            for stage in 0..4 {
                let mut samples = Vec::new();
                for group in 0..11 {
                    let mut elapsed = 0.0;
                    for _ in 0..20 {
                        let checked = Instant::now() - if polling { ASSET_CHECK_INTERVAL } else { Duration::ZERO };
                        for entry in cache.materials.values_mut() { entry.checked_at = checked; }
                        for entry in cache.instances.values_mut() { entry.checked_at = checked; }
                        for entry in cache.surface_shaders.values_mut() { entry.checked_at = checked; }
                        let start = Instant::now();
                        match stage {
                            0 => { std::hint::black_box(collect_objects(&world, &hierarchy, &mut cache)); }
                            1 => { for key in &keys { std::hint::black_box(cache.resolve(key)); } }
                            2 => { for key in &keys { std::hint::black_box(cache.resolve_shared_asset(key).unwrap()); } }
                            _ => { for key in &keys { std::hint::black_box(resolve_project_asset_path(&root, key).unwrap()); } }
                        }
                        elapsed += start.elapsed().as_secs_f64() * 1000.0;
                    }
                    if group >= 2 { samples.push(elapsed / 20.0); }
                }
                samples.sort_by(f64::total_cmp); stages.push(samples[4]);
            }
            reports.push(serde_json::json!({"name":name,"polling":polling,"objects":expected.len(),"unique_materials":keys.len(),"source_materials":cache.materials.len(),"instances":cache.instances.len(),"shaders":cache.surface_shaders.len(),"extraction_ms":stages[0],"resolve_ms":stages[1],"source_ms":stages[2],"paths_ms":stages[3]}));
        }
        assert_eq!(format!("{expected:?}"), format!("{:?}", collect_objects(&world, &hierarchy, &mut cache)));
    }
    println!("MATERIAL_EXTRACTION_BREAKDOWN={}", serde_json::json!(reports));
}

// Previous production resolver from 9d3e983, used only as the independent benchmark reference.
impl RuntimeMaterialCache {
    pub(crate) fn resolve_without_render_cache(&mut self, key: &str) -> Option<RenderMaterial> {
        let normalized = key.trim();
        if !is_material_path(normalized) {
            return None;
        }
        match self.resolve_shared_asset(normalized) {
            Ok(material) => {
                let mut render = render_material_from_asset(&material);
                if material.shader == MaterialShader::Custom {
                    match self.load_custom_shader(&material.custom_shader) {
                        Ok(shader) => {
                            match shader.surface_validation.get_or_init(|| validate_surface_shader_hook(&shader.source)).clone().and_then(|_| {
                                resolve_surface_shader_material_with_schema(
                                    &material,
                                    &shader.schema,
                                    Arc::clone(&shader.parameter_bindings),
                                    Arc::clone(&shader.texture_names),
                                )
                            }) {
                                Ok(bindings) => {
                                    self.clear_failure(normalized);
                                    self.clear_failure(&material.custom_shader);
                                    render.surface_shader = Arc::clone(&shader.source);
                                    render.surface_keywords = bindings.keywords;
                                    render.custom_parameters = bindings.parameters;
                                    render.custom_parameter_bindings = bindings.parameter_bindings;
                                    render.custom_textures = bindings.textures;
                                    render.custom_texture_names = bindings.texture_names;
                                    render.custom_texture_srgb = bindings.texture_srgb;
                                }
                                Err(error) => {
                                    self.clear_failure(&material.custom_shader);
                                    if self.record_failure(normalized, &error) {
                                        log::warn!(
                                        "material '{}' has invalid bindings for custom shader '{}': {}",
                                        normalized,
                                        material.custom_shader,
                                        error
                                    );
                                    }
                                    render = RenderMaterial::error();
                                }
                            }
                        }
                        Err(error) => {
                            self.clear_failure(normalized);
                            if self.record_failure(&material.custom_shader, &error) {
                                log::warn!(
                                    "custom shader '{}' could not be loaded: {}",
                                    material.custom_shader,
                                    error
                                );
                            }
                            render = RenderMaterial::error();
                        }
                    }
                } else {
                    self.clear_failure(normalized);
                }
                Some(render)
            }
            Err(error) => {
                if self.record_failure(normalized, &error) {
                    log::warn!("material '{}' could not be loaded: {}", normalized, error);
                }
                Some(RenderMaterial::error())
            }
        }
    }

}


#[test]
fn prepared_materials_share_payloads_and_detach_edits_across_frames() {
    let fixture = Fixture::new(); fixture.write("Base.mmat", r#"{"version":10,"base_color":[1,0,0,1],"base_color_texture":"Assets/Color.png"}"#);
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone()));
    let first = cache.resolve_shared("Assets/Base.mmat").unwrap();
    let next = cache.resolve_shared(" Assets/Base.mmat ").unwrap(); assert!(std::ptr::eq(&*first, &*next));
    expire(&mut cache); assert!(std::ptr::eq(&*first, &*cache.resolve_shared("Assets/Base.mmat").unwrap()));
    let mut edited = first.clone(); edited.base_color = [0.0, 1.0, 0.0, 1.0]; edited.base_color_texture.clear();
    let mut owned = cache.resolve("Assets/Base.mmat").unwrap(); owned.base_color_texture.clear();
    assert_eq!(next.base_color, [1.0, 0.0, 0.0, 1.0]); assert_eq!(cache.resolve_shared("Assets/Base.mmat").unwrap().base_color_texture, "Assets/Color.png");
    assert_eq!(cache.render_materials.len(), 1);
    assert_eq!(format!("{:?}", *next), format!("{:?}", cache.resolve_without_render_cache("Assets/Base.mmat").unwrap()));
    let other = Fixture::new(); other.write("Base.mmat", r#"{"version":10,"base_color":[0,0,1,1]}"#);
    assert_eq!(RuntimeMaterialCache::new(Some(other.0.clone())).resolve_shared("Assets/Base.mmat").unwrap().base_color, [0.0, 0.0, 1.0, 1.0]);
}

#[test]
fn prepared_materials_keep_polling_alias_invalidation_and_failure_recovery() {
    let fixture = Fixture::new(); fixture.write("Base.mmat", r#"{"version":10,"base_color":[1,0,0,1]}"#);
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone())); let first = cache.resolve_shared("Assets/Base.mmat").unwrap();
    fixture.write("Base.mmat", r#"{"version":10,"base_color":[0,1,0,1],"roughness":0.2}"#);
    std::fs::File::options().write(true).open(fixture.0.join("Assets/Base.mmat")).unwrap().set_modified(SystemTime::now() + Duration::from_secs(2)).unwrap();
    for entry in cache.materials.values_mut() { entry.checked_at = Instant::now(); }
    assert!(std::ptr::eq(&*first, &*cache.resolve_shared("Assets/Base.mmat").unwrap()));
    expire(&mut cache); let changed = cache.resolve_shared("Assets/Base.mmat").unwrap(); assert_eq!(changed.base_color, [0.0, 1.0, 0.0, 1.0]); assert_eq!(first.base_color, [1.0, 0.0, 0.0, 1.0]);
    cache.invalidate(" Assets\\Base.mmat "); let reloaded = cache.resolve_shared("Assets/Base.mmat").unwrap(); assert!(!std::ptr::eq(&*changed, &*reloaded));
    fixture.write("Base.mmat", "invalid material"); cache.invalidate("Assets/Base.mmat"); assert!(cache.resolve_shared("Assets/Base.mmat").unwrap().is_error); assert!(cache.render_materials.is_empty()); assert_eq!(cache.diagnostics().len(), 1);
    std::fs::remove_file(fixture.0.join("Assets/Base.mmat")).unwrap(); expire(&mut cache); assert!(cache.resolve_shared("Assets/Base.mmat").unwrap().is_error);
    fixture.write("Base.mmat", r#"{"version":10,"base_color":[0,0,1,1]}"#); expire(&mut cache);
    assert_eq!(cache.resolve_shared("Assets/Base.mmat").unwrap().base_color, [0.0, 0.0, 1.0, 1.0]); assert!(cache.diagnostics().is_empty());
    assert!(cache.resolve_shared("../Base.mmat").unwrap().is_error); assert!(cache.resolve_shared("default").is_none());
}

#[test]
fn prepared_materials_keep_instance_parent_updates_and_shader_transitions() {
    let fixture = Fixture::new(); fixture.write("Base.mmat", r#"{"version":10,"base_color":[1,0,0,1]}"#);
    fixture.write("A.minst", r#"{"version":2,"parent":"Assets/Base.mmat","overrides":{"roughness":0.2}}"#);
    fixture.write("B.minst", r#"{"version":2,"parent":"Assets/A.minst","overrides":{"metallic":0.5}}"#);
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone())); let previous = cache.resolve_shared("Assets/B.minst").unwrap();
    cache.resolve_shared("Assets/Base.mmat").unwrap(); assert_eq!(cache.render_materials.len(), 1);
    fixture.write("Base.mmat", r#"{"version":10,"base_color":[0,1,0,1]}"#); cache.invalidate("Assets/Base.mmat");
    let changed = cache.resolve_shared("Assets/B.minst").unwrap(); assert_eq!(changed.base_color, [0.0, 1.0, 0.0, 1.0]); assert_eq!(changed.roughness, 0.2); assert_eq!(changed.metallic, 0.5); assert_eq!(previous.base_color, [1.0, 0.0, 0.0, 1.0]);
    cache.resolve_shared("Assets/Base.mmat").unwrap();
    let shader = "fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return color; }";
    fixture.write("Test.mshader", shader); fixture.write("Base.mmat", r#"{"version":10,"shader":"custom","custom_shader":"Assets/Test.mshader"}"#);
    std::fs::File::options().write(true).open(fixture.0.join("Assets/Base.mmat")).unwrap().set_modified(SystemTime::now() + Duration::from_secs(3)).unwrap(); expire(&mut cache);
    let custom = cache.resolve_shared("Assets/Base.mmat").unwrap(); assert_eq!(custom.surface_shader.trim_end(), shader); assert!(cache.render_materials.is_empty());
    fixture.write("Test.mshader", "invalid shader"); cache.invalidate("Assets/Test.mshader"); assert!(cache.resolve_shared("Assets/Base.mmat").unwrap().is_error); assert!(!cache.diagnostics().is_empty());
    let recovered = format!("{shader}\n// updated source"); fixture.write("Test.mshader", &recovered); cache.invalidate("Assets/Test.mshader");
    assert_eq!(cache.resolve_shared("Assets/Base.mmat").unwrap().surface_shader.trim_end(), recovered); assert!(cache.diagnostics().is_empty()); assert_eq!(custom.surface_shader.trim_end(), shader);
    fixture.write("Base.mmat", r#"{"version":10,"base_color":[0,0,1,1]}"#); cache.invalidate("Assets/Base.mmat"); assert_eq!(cache.resolve_shared("Assets/Base.mmat").unwrap().base_color, [0.0, 0.0, 1.0, 1.0]); assert_eq!(cache.render_materials.len(), 1);
}
