//! Real Release-mode CPU + GPU hardware-timestamp stress benchmark suite for MEngine.
//! Measures multi-object (instanced & multi-material), multi-light (directional/point/spot + shadows),
//! multi-particle (up to 100k particles), and combined heavy scenes at 1280x720.

use mengine_core::generated::{
    Camera3D, DirectionalLight, MeshRenderer, ParticleEmitter3D, PointLight, SpotLight, Transform,
};
use mengine_core::{TransformHierarchy, World};
use mengine_rhi::{
    MaterialBlendMode, RenderFrame, RenderMaterial, RenderTarget, Renderer,
    SharedRenderMaterial,
};
use mengine_runtime::{
    fonts::RuntimeFontCache,
    frame_compiler::{FrameCompileRequest, FrameCompiler, FrameMeshInputs},
    materials::RuntimeMaterialCache,
    particles::ParticleWorld,
    sorting::SortingLayers,
    textures::RuntimeTextureCache,
    trails::TrailWorld,
    ui::UiInteractionState,
};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;
use winit::dpi::PhysicalSize;

const WIDTH: u32 = 1280;
const HEIGHT: u32 = 720;
const WARMUP_FRAMES: usize = 3;
const MEASURE_FRAMES: usize = 15;

fn median(mut values: Vec<f64>) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(f64::total_cmp);
    values[values.len() / 2]
}

fn spawn_camera(world: &mut World, pos: [f32; 3], pitch_rad: f32) {
    let cam = world.spawn_empty();
    let half = pitch_rad * 0.5;
    world.insert_component(
        cam,
        Transform {
            position: pos,
            rotation: [half.sin(), 0.0, 0.0, half.cos()],
            scale: [1.0, 1.0, 1.0],
        },
    );
    world.insert_component(
        cam,
        Camera3D {
            fov_y_degrees: 60.0,
            near: 0.1,
            far: 500.0,
            primary: true,
            ..Camera3D::default()
        },
    );
}

fn spawn_object_grid(
    world: &mut World,
    count: usize,
    cast_shadows: bool,
    material_buckets: usize,
) -> Vec<SharedRenderMaterial> {
    let side = (count as f64).sqrt().ceil() as usize;
    let spacing = 1.65_f32;
    let offset = (side as f32 - 1.0) * spacing * 0.5;
    for i in 0..count {
        let gx = i % side;
        let gz = i / side;
        let e = world.spawn_empty();
        world.insert_component(
            e,
            Transform {
                position: [
                    gx as f32 * spacing - offset,
                    ((i % 5) as f32) * 0.35,
                    -(gz as f32 * spacing + 4.0),
                ],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [0.75, 0.75, 0.75],
            },
        );
        world.insert_component(
            e,
            MeshRenderer {
                mesh: "cube".into(),
                material: "default".into(),
                cast_shadows,
                receive_shadows: true,
            },
        );
    }

    (0..material_buckets.max(1))
        .map(|idx| {
            let hue = (idx as f32 / material_buckets.max(1) as f32) * 0.85 + 0.1;
            SharedRenderMaterial::from(RenderMaterial {
                base_color: [
                    hue,
                    1.0 - hue * 0.5,
                    0.3 + (idx % 3) as f32 * 0.25,
                    1.0,
                ],
                metallic: (idx % 4) as f32 * 0.25,
                roughness: 0.2 + ((idx / 4) % 4) as f32 * 0.2,
                blend_mode: MaterialBlendMode::Alpha,
                ..RenderMaterial::default()
            })
        })
        .collect()
}

fn spawn_lights(
    world: &mut World,
    dir_shadows: Option<bool>,
    point_count: usize,
    spot_count: usize,
) {
    if let Some(cast_shadows) = dir_shadows {
        let sun = world.spawn_empty();
        // Aim downward at ~45 degrees
        let q = glam::Quat::from_euler(glam::EulerRot::YXZ, 0.6, -0.85, 0.0);
        world.insert_component(
            sun,
            Transform {
                position: [0.0, 30.0, 0.0],
                rotation: [q.x, q.y, q.z, q.w],
                scale: [1.0, 1.0, 1.0],
            },
        );
        world.insert_component(
            sun,
            DirectionalLight {
                color: [1.0, 0.96, 0.9, 1.0],
                intensity: 2.2,
                cast_shadows,
                shadow_distance: 80.0,
                ..DirectionalLight::default()
            },
        );
    }

    for i in 0..point_count {
        let angle = (i as f32 / point_count.max(1) as f32) * std::f32::consts::TAU;
        let radius = 8.0 + (i % 6) as f32 * 5.0;
        let e = world.spawn_empty();
        world.insert_component(
            e,
            Transform {
                position: [angle.cos() * radius, 4.5, -24.0 + angle.sin() * radius],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            },
        );
        world.insert_component(
            e,
            PointLight {
                color: [
                    0.4 + (i % 3) as f32 * 0.3,
                    0.5 + ((i + 1) % 3) as f32 * 0.25,
                    0.8,
                    1.0,
                ],
                intensity: 14.0,
                range: 18.0,
            },
        );
    }

    for i in 0..spot_count {
        let angle = (i as f32 / spot_count.max(1) as f32) * std::f32::consts::TAU;
        let radius = 10.0 + (i % 5) as f32 * 4.0;
        let q = glam::Quat::from_euler(glam::EulerRot::YXZ, angle, -1.0, 0.0);
        let e = world.spawn_empty();
        world.insert_component(
            e,
            Transform {
                position: [angle.cos() * radius, 8.0, -24.0 + angle.sin() * radius],
                rotation: [q.x, q.y, q.z, q.w],
                scale: [1.0, 1.0, 1.0],
            },
        );
        world.insert_component(
            e,
            SpotLight {
                color: [1.0, 0.75, 0.45, 1.0],
                intensity: 18.0,
                range: 25.0,
                inner_angle_degrees: 22.0,
                outer_angle_degrees: 42.0,
            },
        );
    }
}

fn spawn_particles(world: &mut World, emitters: usize, per_emitter: i32) {
    let side = (emitters as f64).sqrt().ceil() as usize;
    let spacing = 3.0_f32;
    let offset = (side as f32 - 1.0) * spacing * 0.5;
    for i in 0..emitters {
        let gx = i % side;
        let gz = i / side;
        let e = world.spawn_empty();
        world.insert_component(
            e,
            Transform {
                position: [
                    gx as f32 * spacing - offset,
                    1.0,
                    -(gz as f32 * spacing + 10.0),
                ],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            },
        );
        world.insert_component(
            e,
            ParticleEmitter3D {
                playing: true,
                looping: true,
                duration: 10.0,
                rate_over_time: per_emitter as f32 * 0.9,
                max_particles: per_emitter,
                lifetime_min: 1.8,
                lifetime_max: 2.2,
                speed_min: 1.0,
                speed_max: 3.5,
                size_start: 0.25,
                size_end: 0.05,
                seed: (i + 1) as i32,
                ..ParticleEmitter3D::default()
            },
        );
    }
}

struct ScenarioSpec {
    id: &'static str,
    label: &'static str,
    objects: usize,
    material_buckets: usize,
    dir_shadows: Option<bool>,
    point_lights: usize,
    spot_lights: usize,
    emitters: usize,
    particles_per_emitter: i32,
    animate_objects: bool,
}

fn run_scenario(
    renderer: &mut Renderer,
    target: &mengine_rhi::OffscreenRenderTarget,
    spec: &ScenarioSpec,
) -> anyhow::Result<serde_json::Value> {
    let mut world = World::new();
    let cam_dist = match spec.objects {
        0..=1500 => 16.0,
        1501..=6000 => 28.0,
        _ => 38.0,
    };
    spawn_camera(&mut world, [0.0, cam_dist * 0.65, cam_dist * 0.45], -0.45);
    let shared_materials = spawn_object_grid(
        &mut world,
        spec.objects,
        spec.dir_shadows == Some(true),
        spec.material_buckets,
    );
    spawn_lights(&mut world, spec.dir_shadows, spec.point_lights, spec.spot_lights);
    spawn_particles(&mut world, spec.emitters, spec.particles_per_emitter);

    let mut materials = RuntimeMaterialCache::new(None);
    let mut textures = RuntimeTextureCache::new(None);
    let mut fonts = RuntimeFontCache::new(None);
    let mut particles = ParticleWorld::default();
    let mut trails = TrailWorld::default();
    let sorting = SortingLayers::default();
    let tints = HashMap::new();
    let mut mesh_inputs = FrameMeshInputs::default();
    let mut ui_batch_order = mengine_rhi::UiBatchOrderCache::default();
    let mut ui_traversal = mengine_runtime::ui::UiTraversalCache::default();

    // Pre-warm particle simulation pools for 1.8s so particle counts reach steady state.
    if spec.emitters > 0 {
        let hierarchy = TransformHierarchy::build(&world);
        for _ in 0..36 {
            let _ = FrameCompiler {
                mesh_inputs: Some(&mut mesh_inputs),
                materials: &mut materials,
                particles: &mut particles,
                trails: &mut trails,
                textures: &mut textures,
                fonts: &mut fonts,
                ui_batch_order: Some(&mut ui_batch_order),
                ui_traversal: Some(&mut ui_traversal),
            }
            .compile(FrameCompileRequest {
                world: &world,
                hierarchy: &hierarchy,
                viewport: [WIDTH, HEIGHT],
                scene_clear: world.time.clear_color,
                camera_override: None,
                view_camera: None,
                include_ui: true,
                target_display: 0,
                interaction: UiInteractionState::default(),
                button_tints: &tints,
                focused_ui: None,
                sorting_layers: &sorting,
                delta_seconds: 0.05,
            });
        }
    }

    let animated_entities: Vec<_> = if spec.animate_objects {
        world
            .entities_with_components(&["Transform", "MeshRenderer"])
            .take(500)
            .collect()
    } else {
        Vec::new()
    };

    let mut hierarchy_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut compile_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut submit_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut gpu_total_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut gpu_shadow_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut gpu_forward_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut gpu_post_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut gpu_ui_samples = Vec::with_capacity(MEASURE_FRAMES);
    let mut particle_stage_samples = Vec::with_capacity(MEASURE_FRAMES);

    let mut last_draw_calls = 0usize;
    let mut last_instanced = 0usize;
    let mut last_ui_primitives = 0usize;
    let mut last_ui_batches = 0usize;
    let mut last_camera_visible = 0usize;
    let mut last_shadow_visible = 0usize;
    let mut last_points_active = 0usize;
    let mut last_spots_active = 0usize;
    let mut last_objects = 0usize;

    for frame_idx in 0..(WARMUP_FRAMES + MEASURE_FRAMES) {
        if spec.animate_objects {
            let phase = (frame_idx as f32) * 0.05;
            for (idx, &entity) in animated_entities.iter().enumerate() {
                if let Some(tr) = world.get_component_mut::<Transform>(entity) {
                    tr.position[1] = (phase + idx as f32 * 0.1).sin() * 0.8;
                }
            }
        }

        let t0 = Instant::now();
        let hierarchy = TransformHierarchy::build(&world);
        let hierarchy_ms = t0.elapsed().as_secs_f64() * 1000.0;

        let t1 = Instant::now();
        let mut frame = FrameCompiler {
            mesh_inputs: Some(&mut mesh_inputs),
            materials: &mut materials,
            particles: &mut particles,
            trails: &mut trails,
            textures: &mut textures,
            fonts: &mut fonts,
            ui_batch_order: Some(&mut ui_batch_order),
            ui_traversal: Some(&mut ui_traversal),
        }
        .compile(FrameCompileRequest {
            world: &world,
            hierarchy: &hierarchy,
            viewport: [WIDTH, HEIGHT],
            scene_clear: world.time.clear_color,
            camera_override: None,
            view_camera: None,
            include_ui: true,
            target_display: 0,
            interaction: UiInteractionState::default(),
            button_tints: &tints,
            focused_ui: None,
            sorting_layers: &sorting,
            delta_seconds: if spec.emitters > 0 { 1.0 / 60.0 } else { 0.0 },
        });
        let compile_ms = t1.elapsed().as_secs_f64() * 1000.0;

        // Assign distinct SharedRenderMaterials when benchmarking multi-material batching.
        if spec.material_buckets > 1 {
            let bucket_count = shared_materials.len();
            for (idx, obj) in frame.objects.iter_mut().enumerate() {
                obj.material = shared_materials[idx % bucket_count].clone();
            }
        } else if !shared_materials.is_empty() {
            let mat = &shared_materials[0];
            for obj in frame.objects.iter_mut() {
                obj.material = mat.clone();
            }
        }

        let render_frame = RenderFrame {
            clear: frame.clear,
            camera: frame.camera,
            objects: &frame.objects,
            lighting: &frame.lighting,
            ui: Some(&frame.ui),
            scene_views: &frame.scene_views,
        };

        let t2 = Instant::now();
        renderer.submit_frame_to(&render_frame, RenderTarget::Offscreen(target))?;
        let submit_ms = t2.elapsed().as_secs_f64() * 1000.0;

        let (_rgba, readback) = renderer.read_offscreen_rgba8_profiled(target)?;
        let sub_prof = renderer.submission_profile();

        if frame_idx >= WARMUP_FRAMES {
            hierarchy_samples.push(hierarchy_ms);
            compile_samples.push(compile_ms);
            submit_samples.push(submit_ms);
            if let Some((_, p_ms)) = frame.profile_stages.iter().find(|(n, _)| *n == "Particles") {
                particle_stage_samples.push(*p_ms);
            }
            if let Some(gpu) = &readback.gpu {
                let mut total_render = 0.0;
                let mut shadow_ms = 0.0;
                let mut forward_ms = 0.0;
                let mut post_ms = 0.0;
                let mut ui_ms = 0.0;
                for stage in &gpu.stages {
                    match stage.name {
                        "Shadow depth" => {
                            shadow_ms += stage.milliseconds;
                            total_render += stage.milliseconds;
                        }
                        "Environment background" | "Forward HDR" => {
                            forward_ms += stage.milliseconds;
                            total_render += stage.milliseconds;
                        }
                        "Tone mapping" => {
                            post_ms += stage.milliseconds;
                            total_render += stage.milliseconds;
                        }
                        "UI overlay" => {
                            ui_ms += stage.milliseconds;
                            total_render += stage.milliseconds;
                        }
                        _ => {}
                    }
                }
                gpu_total_samples.push(total_render);
                gpu_shadow_samples.push(shadow_ms);
                gpu_forward_samples.push(forward_ms);
                gpu_post_samples.push(post_ms);
                gpu_ui_samples.push(ui_ms);
            }

            last_draw_calls = sub_prof.world_mesh_draw_calls;
            last_instanced = sub_prof.world_instanced_objects;
            last_ui_primitives = frame.ui.primitives.len();
            last_ui_batches = frame.ui.batches.len();
            last_camera_visible = frame.objects.len();
            last_shadow_visible = if spec.dir_shadows == Some(true) { frame.objects.len() } else { 0 };
            last_points_active = frame.lighting.points.len();
            last_spots_active = frame.lighting.spots.len();
            last_objects = frame.objects.len();
        }
    }

    let med_hierarchy = median(hierarchy_samples);
    let med_compile = median(compile_samples);
    let med_submit = median(submit_samples);
    let med_cpu_total = med_hierarchy + med_compile + med_submit;
    let med_gpu_total = median(gpu_total_samples);
    let med_gpu_shadow = median(gpu_shadow_samples);
    let med_gpu_forward = median(gpu_forward_samples);
    let med_gpu_post = median(gpu_post_samples);
    let med_gpu_ui = median(gpu_ui_samples);
    let med_particles_cpu = median(particle_stage_samples);
    let frame_bound_ms = med_cpu_total.max(med_gpu_total).max(0.01);
    let est_fps = 1000.0 / frame_bound_ms;

    println!(
        "{:<34} | obj={:<5} draw={:<4} inst={:<5} ui/p={:<6} | CPU={:6.2}ms (hier {:4.2} + comp {:5.2} + sub {:5.2}) | GPU={:5.2}ms (sh {:4.2} fwd {:4.2} ui {:4.2}) | ~{:6.1} FPS",
        spec.id,
        last_objects,
        last_draw_calls,
        last_instanced,
        last_ui_primitives,
        med_cpu_total,
        med_hierarchy,
        med_compile,
        med_submit,
        med_gpu_total,
        med_gpu_shadow,
        med_gpu_forward,
        med_gpu_ui,
        est_fps,
    );

    Ok(json!({
        "id": spec.id,
        "label": spec.label,
        "config": {
            "objects": spec.objects,
            "materialBuckets": spec.material_buckets,
            "directionalShadow": spec.dir_shadows,
            "authoredPointLights": spec.point_lights,
            "authoredSpotLights": spec.spot_lights,
            "emitters": spec.emitters,
            "particlesPerEmitter": spec.particles_per_emitter,
            "animateObjects": spec.animate_objects,
        },
        "counts": {
            "objectsCompiled": last_objects,
            "worldMeshDrawCalls": last_draw_calls,
            "worldInstancedObjects": last_instanced,
            "uiAndParticlePrimitives": last_ui_primitives,
            "uiAndParticleBatches": last_ui_batches,
            "cameraVisibleHint": last_camera_visible,
            "shadowVisibleHint": last_shadow_visible,
            "pointsPassedToRhi": last_points_active,
            "spotsPassedToRhi": last_spots_active,
        },
        "medianMs": {
            "cpuHierarchy": med_hierarchy,
            "cpuCompile": med_compile,
            "cpuParticlesStage": med_particles_cpu,
            "cpuSubmit": med_submit,
            "cpuTotal": med_cpu_total,
            "gpuRenderTotal": med_gpu_total,
            "gpuShadow": med_gpu_shadow,
            "gpuForward": med_gpu_forward,
            "gpuPost": med_gpu_post,
            "gpuUiAndParticles": med_gpu_ui,
            "estimatedFps": est_fps,
        }
    }))
}

fn main() -> anyhow::Result<()> {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(WIDTH, HEIGHT)))?;
    let gpu_timing_supported = renderer.gpu_timing_supported();
    renderer.set_gpu_timings(true);
    let target = renderer.create_offscreen_target(PhysicalSize::new(WIDTH, HEIGHT));

    println!("=== MEngine Release CPU + GPU Stress Suite (1280x720, GPU timestamps: {gpu_timing_supported}) ===");
    let scenarios = [
        // 1. Multi-object (Instancing vs Multi-Material)
        ScenarioSpec {
            id: "obj_1k_instanced",
            label: "1,000 3D Objects (1 shared PBR material)",
            objects: 1_000,
            material_buckets: 1,
            dir_shadows: Some(false),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "obj_5k_instanced",
            label: "5,000 3D Objects (1 shared PBR material)",
            objects: 5_000,
            material_buckets: 1,
            dir_shadows: Some(false),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "obj_10k_instanced",
            label: "10,000 3D Objects (1 shared PBR material)",
            objects: 10_000,
            material_buckets: 1,
            dir_shadows: Some(false),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "obj_5k_32mat",
            label: "5,000 3D Objects (32 distinct PBR materials)",
            objects: 5_000,
            material_buckets: 32,
            dir_shadows: Some(false),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "obj_5k_animated_500",
            label: "5,000 3D Objects (500 moving/frame, 8 materials)",
            objects: 5_000,
            material_buckets: 8,
            dir_shadows: Some(false),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: true,
        },
        // 2. Multi-light & Shadows (2,000 objects baseline)
        ScenarioSpec {
            id: "light_2k_dir_noshadow",
            label: "2,000 Objects + 1 Directional (no shadow)",
            objects: 2_000,
            material_buckets: 4,
            dir_shadows: Some(false),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "light_2k_dir_shadow2k",
            label: "2,000 Objects + 1 Directional (2048px shadow)",
            objects: 2_000,
            material_buckets: 4,
            dir_shadows: Some(true),
            point_lights: 0,
            spot_lights: 0,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "light_2k_max_4p_4s_shadow",
            label: "2,000 Objects + Dir Shadow + 4 Point + 4 Spot",
            objects: 2_000,
            material_buckets: 4,
            dir_shadows: Some(true),
            point_lights: 4,
            spot_lights: 4,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "light_2k_64lights_overflow",
            label: "2,000 Objects + Dir Shadow + 32 Point + 32 Spot (64 lights)",
            objects: 2_000,
            material_buckets: 4,
            dir_shadows: Some(true),
            point_lights: 32,
            spot_lights: 32,
            emitters: 0,
            particles_per_emitter: 0,
            animate_objects: false,
        },
        // 3. Multi-Particle Stress
        ScenarioSpec {
            id: "particles_10emit_5k",
            label: "10 ParticleEmitter3D (~5,000 live particles)",
            objects: 0,
            material_buckets: 1,
            dir_shadows: None,
            point_lights: 0,
            spot_lights: 0,
            emitters: 10,
            particles_per_emitter: 500,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "particles_50emit_25k",
            label: "50 ParticleEmitter3D (~25,000 live particles)",
            objects: 0,
            material_buckets: 1,
            dir_shadows: None,
            point_lights: 0,
            spot_lights: 0,
            emitters: 50,
            particles_per_emitter: 500,
            animate_objects: false,
        },
        ScenarioSpec {
            id: "particles_100emit_100k",
            label: "100 ParticleEmitter3D (~100,000 live particles ceiling)",
            objects: 0,
            material_buckets: 1,
            dir_shadows: None,
            point_lights: 0,
            spot_lights: 0,
            emitters: 100,
            particles_per_emitter: 1000,
            animate_objects: false,
        },
        // 4. Combined Realistic Heavy Scene
        ScenarioSpec {
            id: "combined_heavy_scene",
            label: "2,000 Objects (8 mats) + Dir Shadow + 4P/4S Lights + 20 Emitters (10k particles)",
            objects: 2_000,
            material_buckets: 8,
            dir_shadows: Some(true),
            point_lights: 4,
            spot_lights: 4,
            emitters: 20,
            particles_per_emitter: 500,
            animate_objects: true,
        },
    ];

    let mut results = Vec::new();
    for spec in &scenarios {
        results.push(run_scenario(&mut renderer, &target, spec)?);
    }

    let out_dir = PathBuf::from("tmp/docs-artifacts/perf-bench");
    std::fs::create_dir_all(&out_dir)?;
    let report = json!({
        "resolution": [WIDTH, HEIGHT],
        "gpuTimestampsSupported": gpu_timing_supported,
        "warmupFrames": WARMUP_FRAMES,
        "measureFrames": MEASURE_FRAMES,
        "scenarios": results,
    });
    let out_path = out_dir.join("stress-suite-report.json");
    std::fs::write(&out_path, serde_json::to_string_pretty(&report)?)?;
    println!("Saved JSON report to {}", out_path.display());
    Ok(())
}
