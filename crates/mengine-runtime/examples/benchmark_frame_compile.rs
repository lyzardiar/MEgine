// Author: MiYu. Measure complete-scene CPU frame extraction and verify its deterministic output.
use mengine_core::{TransformHierarchy, World};
use mengine_runtime::{fonts::RuntimeFontCache, frame_compiler::{FrameCompileRequest, FrameCompiler}, materials::RuntimeMaterialCache, particles::ParticleWorld, sorting::SortingLayers, textures::RuntimeTextureCache, trails::TrailWorld, ui::UiInteractionState};
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, HashMap}, path::PathBuf, time::Instant};

fn main() -> anyhow::Result<()> {
    let root = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| "samples/frostbound-realms".into()));
    let iterations: usize = std::env::args().nth(2).unwrap_or_else(|| "20".into()).parse()?;
    anyhow::ensure!(iterations > 0, "iterations must be positive");
    let mut world = World::new();
    mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world)?;
    let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
    let mut textures = RuntimeTextureCache::new(Some(root.clone()));
    let mut fonts = RuntimeFontCache::new(Some(root));
    let mut particles = ParticleWorld::default(); let mut trails = TrailWorld::default();
    let sorting = SortingLayers::default(); let tints = HashMap::new();
    let mut hierarchy_ms = Vec::new(); let mut compile_ms = Vec::new();
    let mut stages: BTreeMap<&str, Vec<f64>> = BTreeMap::new();
    let mut signature = String::new(); let mut counts = serde_json::Value::Null;
    let mut complete_signature = String::new();
    for iteration in 0..iterations + 2 {
        let start = Instant::now();
        let hierarchy = TransformHierarchy::build(&world);
        let hierarchy_elapsed = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        let frame = FrameCompiler { materials: &mut materials, particles: &mut particles, trails: &mut trails, textures: &mut textures, fonts: &mut fonts }.compile(FrameCompileRequest {
            world: &world, hierarchy: &hierarchy, viewport: [1280, 720], scene_clear: world.time.clear_color,
            camera_override: None, view_camera: None, include_ui: true, target_display: 0, interaction: UiInteractionState::default(),
            button_tints: &tints, focused_ui: None, sorting_layers: &sorting, delta_seconds: 0.0,
        });
        let compile_elapsed = start.elapsed().as_secs_f64() * 1000.0;
        if iteration >= 2 {
            hierarchy_ms.push(hierarchy_elapsed); compile_ms.push(compile_elapsed);
            for &(name, ms) in &frame.profile_stages { stages.entry(name).or_default().push(ms); }
        }
        if iteration == iterations + 1 {
            signature = format!("{:x}", Sha256::digest(format!("{:?}", (&frame.clear, &frame.camera, &frame.objects, &frame.lighting, &frame.ui, &frame.controls)).as_bytes()));
            let scene_views: Vec<_> = frame.scene_views.iter().map(|view| (&view.key, &view.size, &view.clear, &view.camera, &view.objects, &view.lighting)).collect();
            complete_signature = format!("{:x}", Sha256::digest(format!("{:?}", (&frame.clear, &frame.camera, &frame.objects, &frame.lighting, &frame.ui, &frame.controls, scene_views, &frame.view_resources, &frame.texture_failures, &frame.font_failures, frame.has_authored_camera)).as_bytes()));
            let mesh_candidates = world.entities_with_components(&["MeshRenderer"]).count();
            let active_meshes = world.entities_with_components(&["MeshRenderer"]).filter(|&entity| hierarchy.is_active(entity)).count();
            counts = serde_json::json!({"entities":world.iter_entities().count(), "meshCandidates":mesh_candidates, "activeMeshCandidates":active_meshes, "objects":frame.objects.len(), "uiPrimitives":frame.ui.primitives.len(), "uiBatches":frame.ui.batches.len(), "controls":frame.controls.len(), "sceneViews":frame.scene_views.len()});
        }
    }
    hierarchy_ms.sort_by(f64::total_cmp); compile_ms.sort_by(f64::total_cmp);
    let stages: BTreeMap<_, _> = stages.into_iter().map(|(name, mut samples)| { samples.sort_by(f64::total_cmp); (name, samples[iterations / 2]) }).collect();
    println!("{}", serde_json::json!({"scope":"Release CPU extraction from authored Main.mscene; no scripts, GPU, IPC or gameplay FPS", "iterations":iterations, "counts":counts, "outputSha256":signature, "completeOutputSha256":complete_signature, "medianStagesMs":stages, "medianHierarchyMs":hierarchy_ms[iterations / 2], "medianCompileMs":compile_ms[iterations / 2], "hierarchyMs":hierarchy_ms, "compileMs":compile_ms}));
    Ok(())
}
