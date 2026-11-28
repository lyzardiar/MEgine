//! Headless DX12 GPU showcase renderer for inspecting 1:1 scene fidelity across PBR / Toon / Standard modes.
use anyhow::Result;
use glam::Vec4;
use mengine_core::generated::MeshRenderer;
use mengine_core::{TransformHierarchy, World};
use mengine_rhi::{RenderTarget, Renderer};
use mengine_runtime::fonts::RuntimeFontCache;
use mengine_runtime::frame_compiler::{FrameCompileRequest, FrameCompiler, FrameMeshInputs};
use mengine_runtime::materials::RuntimeMaterialCache;
use mengine_runtime::meshes::RuntimeMeshCache;
use mengine_runtime::particles::ParticleWorld;
use mengine_runtime::sorting::SortingLayers;
use mengine_runtime::textures::RuntimeTextureCache;
use mengine_runtime::trails::TrailWorld;
use mengine_runtime::ui::UiInteractionState;
use mengine_scene::load_scene;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use winit::dpi::PhysicalSize;

fn render_scene_variant(
    renderer: &mut Renderer,
    project_root: &Path,
    scene_rel: &str,
    variant_from: Option<&str>,
    variant_to: Option<&str>,
    out_png: &Path,
) -> Result<()> {
    let scene_path = project_root.join(scene_rel);
    let mut world = World::new();
    load_scene(&scene_path, &mut world)?;

    if let (Some(from_pat), Some(to_pat)) = (variant_from, variant_to) {
        let entities: Vec<_> = world.entities_with_components(&["MeshRenderer"]).collect();
        for e in entities {
            if let Some(mut mr) = world.get_component::<MeshRenderer>(e).cloned() {
                if mr.material.contains(from_pat) {
                    mr.material = mr.material.replace(from_pat, to_pat);
                    world.insert_component(e, mr);
                }
            }
        }
    }

    let hierarchy = TransformHierarchy::build(&world);
    let mut materials = RuntimeMaterialCache::new(Some(project_root.to_path_buf()));
    let mut meshes = RuntimeMeshCache::new(Some(project_root.to_path_buf()));
    let mut textures = RuntimeTextureCache::new(Some(project_root.to_path_buf()));
    let mut fonts = RuntimeFontCache::new(Some(project_root.to_path_buf()));
    let mut particles = ParticleWorld::default();
    let mut trails = TrailWorld::default();
    let mut mesh_inputs = FrameMeshInputs::default();
    let sorting_layers = SortingLayers::default();
    let button_tints = HashMap::new();

    let (w, h) = (1280u32, 720u32);
    let target = renderer.create_offscreen_target(PhysicalSize::new(w, h));

    let mut compiler = FrameCompiler {
        mesh_inputs: Some(&mut mesh_inputs),
        materials: &mut materials,
        particles: &mut particles,
        trails: &mut trails,
        textures: &mut textures,
        fonts: &mut fonts,
        ui_batch_order: None,
        ui_traversal: None,
    };

    let mut frame = compiler.compile(FrameCompileRequest {
        world: &world,
        hierarchy: &hierarchy,
        viewport: [w, h],
        scene_clear: Vec4::new(0.08, 0.10, 0.14, 1.0),
        camera_override: None,
        view_camera: None,
        include_ui: false,
        target_display: 0,
        interaction: UiInteractionState::default(),
        button_tints: &button_tints,
        focused_ui: None,
        sorting_layers: &sorting_layers,
        delta_seconds: 1.0 / 60.0,
    });

    let mesh_fails = meshes.sync_frame(renderer, &mut frame);
    if !mesh_fails.is_empty() {
        eprintln!("[WARN] mesh failures ({}): {:?}", out_png.display(), &mesh_fails[..mesh_fails.len().min(3)]);
    }
    let tex_fails = textures.sync_materials_iter(renderer, frame.resource_objects_iter());
    if !tex_fails.is_empty() {
        eprintln!("[WARN] tex failures ({}): {:?}", out_png.display(), &tex_fails[..tex_fails.len().min(3)]);
    }
    let env_fails = textures.sync_environment(renderer, &frame.lighting);
    if !env_fails.is_empty() {
        eprintln!("[WARN] env failures ({}): {:?}", out_png.display(), env_fails);
    }

    let t0 = std::time::Instant::now();
    renderer.submit_frame_to(&frame.render_frame(), RenderTarget::Offscreen(&target))?;
    let (pixels, _) = renderer.read_offscreen_rgba8_profiled(&target)?;
    let ms = t0.elapsed().as_secs_f64() * 1000.0;

    if let Some(parent) = out_png.parent() {
        std::fs::create_dir_all(parent)?;
    }
    image::save_buffer(out_png, &pixels, w, h, image::ColorType::Rgba8)?;
    println!(
        "[OK] {} | objects={} | lights=({} dir, {} pt, {} spot) | render={:.1}ms",
        out_png.display(),
        frame.objects.len(),
        frame.lighting.directional.is_some() as u32,
        frame.lighting.points.len(),
        frame.lighting.spots.len(),
        ms
    );
    Ok(())
}

fn main() -> Result<()> {
    env_logger::init();
    let out_dir = PathBuf::from("tmp/docs-artifacts/pipeline-review");
    std::fs::create_dir_all(&out_dir)?;

    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(1280, 720)))?;

    let shots: &[(&str, &str, Option<&str>, Option<&str>, &str)] = &[
        ("samples/verdant-forest", "Assets/Scenes/Main.mscene", None, None, "verdant-forest-pbr.png"),
        ("samples/verdant-forest", "Assets/Scenes/Main.mscene", Some("_pbr.mmat"), Some("_toon.mmat"), "verdant-forest-toon.png"),
        ("samples/verdant-forest", "Assets/Scenes/Main.mscene", Some("_pbr.mmat"), Some("_std.mmat"), "verdant-forest-standard.png"),
        ("samples/metro-city", "Assets/Scenes/Main.mscene", None, None, "metro-city-pbr.png"),
        ("samples/metro-city", "Assets/Scenes/Main.mscene", Some("_pbr.mmat"), Some("_toon.mmat"), "metro-city-toon.png"),
        ("samples/metro-city", "Assets/Scenes/Main.mscene", Some("_pbr.mmat"), Some("_std.mmat"), "metro-city-standard.png"),
        ("samples/pelican-island-ride", "Assets/Scenes/Main.mscene", None, None, "pelican-island-ride.png"),
    ];

    for (proj, scene, from_m, to_m, png) in shots {
        render_scene_variant(
            &mut renderer,
            Path::new(proj),
            scene,
            *from_m,
            *to_m,
            &out_dir.join(png),
        )?;
    }
    Ok(())
}
