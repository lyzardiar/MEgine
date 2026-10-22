// Author: MiYu. Measure material texture sync between polls and verify live resource ownership.
use super::*;
use crate::{frame_compiler::{FrameCompileRequest, FrameCompiler}, fonts::RuntimeFontCache, materials::RuntimeMaterialCache, particles::ParticleWorld, sorting::SortingLayers, trails::TrailWorld, ui::UiInteractionState};
use mengine_core::{TransformHierarchy, World};

#[test]
#[ignore = "manual Frostbound texture sync cadence benchmark"]
fn benchmark_material_texture_sync_cadence() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut world = World::new(); mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world).unwrap();
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(32, 32))).unwrap();
    let mut reports = Vec::new();
    for activate in [false, true] {
        if activate { for entity in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(entity, 0, true); } }
        let mut materials = RuntimeMaterialCache::new(Some(root.clone())); let mut textures = RuntimeTextureCache::new(Some(root.clone())); let mut fonts = RuntimeFontCache::new(Some(root.clone()));
        let mut particles = ParticleWorld::default(); let mut trails = TrailWorld::default();
        let frame = FrameCompiler { materials: &mut materials, particles: &mut particles, trails: &mut trails, textures: &mut textures, fonts: &mut fonts, ui_batch_order: None }.compile(FrameCompileRequest {
            world: &world, hierarchy: &TransformHierarchy::build(&world), viewport: [960, 540], scene_clear: glam::Vec4::ZERO, camera_override: None, view_camera: None,
            include_ui: false, target_display: 0, interaction: UiInteractionState::default(), button_tints: &HashMap::new(), focused_ui: None, sorting_layers: &SortingLayers::default(), delta_seconds: 0.0,
        });
        let failures = textures.sync_materials_iter(&mut renderer, frame.resource_objects_iter()); assert!(failures.is_empty(), "{failures:?}");
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..7 {
            for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..100 {
                    textures.material_last_poll = if index == 0 { Some(Instant::now()) } else { None };
                    assert!(textures.sync_materials_iter(&mut renderer, frame.resource_objects_iter()).is_empty());
                }
                if run > 1 { samples[index].push(started.elapsed().as_secs_f64() * 1000.0 / 100.0); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        reports.push(serde_json::json!({"all_pool_entities_active": activate, "objects": frame.resource_objects_iter().count(), "texture_variants": material_texture_references(frame.resource_objects_iter()).len(), "ordinary_ms": samples[0][2], "poll_ms": samples[1][2], "samples": 5}));
    }
    println!("TEXTURE_SYNC_CADENCE={}", serde_json::json!(reports));
}

struct TextureFixture(PathBuf);
impl TextureFixture {
    fn new() -> Self { let root = std::env::temp_dir().join(format!("mengine-texture-sync-{}", uuid::Uuid::new_v4())); std::fs::create_dir_all(root.join("Assets")).unwrap(); Self(root) }
    fn write(&self, width: u32) { image::RgbaImage::from_pixel(width, 2, image::Rgba([64, 128, 192, 255])).save(self.0.join("Assets/Shared.png")).unwrap(); }
}
impl Drop for TextureFixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
fn texture_object() -> RenderObject { RenderObject { mesh_key: "cube".into(), model: glam::Mat4::IDENTITY, material: mengine_rhi::RenderMaterial { base_color_texture: " Assets/Shared.png ".into(), normal_texture: "Assets/Shared.png".into(), ..Default::default() }, cast_shadows: true, receive_shadows: true } }

#[test]
fn material_sync_preserves_variants_hot_reload_removal_and_project_ownership() {
    let fixture = TextureFixture::new(); fixture.write(2);
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16, 16))).unwrap();
    let mut cache = RuntimeTextureCache::new(Some(fixture.0.clone())); let mut objects = vec![texture_object()];
    let stats = |renderer: &Renderer| { let stats = renderer.material_texture_stats(); (stats.color, stats.data) };
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty()); assert_eq!(stats(&renderer), (1, 1));
    let first = cache.attempted_material[0]["Assets/Shared.png"];
    fixture.write(5); cache.material_last_poll = None;
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty());
    assert_ne!(first, cache.attempted_material[0]["Assets/Shared.png"]); assert_eq!(cache.attempted_material[0], cache.attempted_material[1]);
    objects[0].material.normal_texture.clear();
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty()); assert_eq!(stats(&renderer), (1, 0));
    objects[0].material.normal_texture = "Assets/Shared.png".into();
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty()); assert_eq!(stats(&renderer), (1, 1));
    std::fs::remove_file(fixture.0.join("Assets/Shared.png")).unwrap(); cache.material_last_poll = None;
    let missing = cache.sync_materials(&mut renderer, &objects); assert_eq!(missing.len(), 2); assert_eq!(stats(&renderer), (0, 0));
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty());
    fixture.write(3); cache.invalidate("Assets/Shared.png");
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty()); assert_eq!(stats(&renderer), (1, 1));
    let other = TextureFixture::new(); other.write(9); cache.set_project_root(Some(other.0.clone()));
    assert!(cache.sync_materials(&mut renderer, &objects).is_empty()); assert_eq!(cache.attempted_material[1]["Assets/Shared.png"], file_stamp(&other.0.join("Assets/Shared.png")));
    assert!(cache.sync_materials(&mut renderer, &[]).is_empty()); assert_eq!(stats(&renderer), (0, 0));
}
