use anyhow::{Context, Result};
use glam::Vec3;
use mengine_core::generated::{EffekseerEffect, Transform};
use mengine_core::{TransformHierarchy, World};
use mengine_rhi::{
    look_at, orthographic, perspective, FrameCamera, OffscreenRenderTarget, RenderTarget, Renderer,
};
use mengine_runtime::effekseer::EffekseerWorld;
use mengine_runtime::fonts::RuntimeFontCache;
use mengine_runtime::frame_compiler::{FrameCompileRequest, FrameCompiler};
use mengine_runtime::materials::RuntimeMaterialCache;
use mengine_runtime::meshes::RuntimeMeshCache;
use mengine_runtime::particles::ParticleWorld;
use mengine_runtime::sorting::SortingLayers;
use mengine_runtime::textures::{RuntimeTextureCache, TextureLoadFailure};
use mengine_runtime::trails::TrailWorld;
use mengine_runtime::ui::UiInteractionState;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::mem::size_of_val;
use std::path::{Path, PathBuf};
use std::time::Instant;
use winit::dpi::PhysicalSize;

pub struct EditorViewportFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub has_authored_camera: bool,
    pub profile: EditorViewportProfile,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorViewportProfileNode {
    pub name: String,
    pub total_ms: f64,
    pub self_ms: f64,
    pub calls: u32,
    pub children: Vec<EditorViewportProfileNode>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorViewportMemoryCategory {
    pub name: String,
    pub domain: String,
    pub bytes: u64,
    pub certainty: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorViewportResource {
    pub kind: String,
    pub asset: String,
    pub resolved_path: Option<String>,
    pub loaded: bool,
    pub source_bytes: Option<u64>,
    pub gpu_bytes_estimate: Option<u64>,
    pub dimensions: Option<[u32; 2]>,
    pub referenced_by: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorViewportProfileCounts {
    pub entities: usize,
    pub render_objects: usize,
    pub ui_primitives: usize,
    pub ui_batches: usize,
    pub ui_draw_calls: u32,
    pub material_pipelines_built_in: usize,
    pub material_pipelines_custom: usize,
    pub material_pipelines_resident_custom: usize,
    pub material_pipelines_rejected: usize,
    pub material_pipeline_evictions: u64,
    pub material_textures_color: usize,
    pub material_textures_data: usize,
    pub material_texture_bind_groups: usize,
    pub material_samplers: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorViewportProfile {
    pub schema_version: u32,
    pub total_ms: f64,
    pub call_tree: EditorViewportProfileNode,
    pub memory: Vec<EditorViewportMemoryCategory>,
    pub resident_memory_estimate_bytes: u64,
    pub resources: Vec<EditorViewportResource>,
    pub resources_truncated: bool,
    pub counts: EditorViewportProfileCounts,
}

#[derive(Clone, Debug)]
struct ProfileStage {
    name: &'static str,
    duration_ms: f64,
}

fn finish_stage(stages: &mut Vec<ProfileStage>, name: &'static str, started: Instant) {
    stages.push(ProfileStage {
        name,
        duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
    });
}

#[derive(Clone, Copy, Debug)]
pub struct EditorSceneCamera {
    pub eye: [f32; 3],
    pub target: [f32; 3],
    pub orthographic: bool,
    pub orthographic_size: f32,
    pub fov_y_degrees: f32,
}

/// Headless RHI host used by Game View and as the base pass for Scene View.
pub struct EditorViewportRenderer {
    renderer: Renderer,
    target: OffscreenRenderTarget,
    project_root: PathBuf,
    materials: RuntimeMaterialCache,
    meshes: RuntimeMeshCache,
    textures: RuntimeTextureCache,
    fonts: RuntimeFontCache,
    particles: ParticleWorld,
    trails: TrailWorld,
    effekseer: Option<EffekseerWorld>,
    last_effect_frame: Instant,
    preview_restart: u64,
    sorting_layers: SortingLayers,
}

impl EditorViewportRenderer {
    pub async fn new(project_root: PathBuf, width: u32, height: u32) -> Result<Self> {
        let size = normalized_size(width, height);
        let renderer = Renderer::new_headless(size)
            .await
            .context("could not initialize the headless RHI")?;
        let target = renderer.create_offscreen_target(size);
        let sorting_layers = SortingLayers::load(Some(&project_root))
            .map_err(anyhow::Error::msg)
            .context("could not load sorting layers")?;
        Ok(Self {
            renderer,
            target,
            materials: RuntimeMaterialCache::new(Some(project_root.clone())),
            meshes: RuntimeMeshCache::new(Some(project_root.clone())),
            textures: RuntimeTextureCache::new(Some(project_root.clone())),
            fonts: RuntimeFontCache::new(Some(project_root.clone())),
            particles: ParticleWorld::default(),
            trails: TrailWorld::default(),
            effekseer: EffekseerWorld::new(Some(project_root.clone()))
                .map_err(|error| log::warn!("Effekseer viewport runtime is unavailable: {error}"))
                .ok(),
            last_effect_frame: Instant::now(),
            preview_restart: 0,
            sorting_layers,
            project_root,
        })
    }

    pub fn project_root(&self) -> &Path {
        &self.project_root
    }

    pub fn render_game(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
    ) -> Result<EditorViewportFrame> {
        self.render_world(world, width, height, None, true)
    }

    pub fn render_scene(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        camera: EditorSceneCamera,
    ) -> Result<EditorViewportFrame> {
        let aspect = width.max(1) as f32 / height.max(1) as f32;
        let eye = Vec3::from_array(camera.eye);
        let target = Vec3::from_array(camera.target);
        let view_camera = FrameCamera {
            view: look_at(eye, target, Vec3::Y),
            proj: if camera.orthographic {
                orthographic(camera.orthographic_size.max(0.001), aspect, 0.01, 10_000.0)
            } else {
                perspective(
                    camera.fov_y_degrees.clamp(1.0, 179.0),
                    aspect,
                    0.01,
                    10_000.0,
                )
            },
            position: eye,
        };
        self.render_world(world, width, height, Some(view_camera), false)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render_effekseer_preview(
        &mut self,
        effect: String,
        width: u32,
        height: u32,
        playing: bool,
        looping: bool,
        speed: f32,
        restart: u64,
        camera_yaw: f32,
        camera_pitch: f32,
        camera_distance: f32,
        render_mode: String,
        background: [f32; 4],
    ) -> Result<EditorViewportFrame> {
        if restart != self.preview_restart {
            self.preview_restart = restart;
            if let Some(effekseer) = self.effekseer.as_mut() {
                effekseer.restart();
            }
        }
        let mut world = World::new();
        world.time.clear_color = glam::Vec4::from_array(background);
        let screen_space = render_mode.eq_ignore_ascii_case("screen");
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(
            entity,
            EffekseerEffect {
                effect,
                playing,
                looping,
                speed: speed.clamp(0.0, 8.0),
                start_frame: 0,
                prewarm: true,
                auto_destroy: false,
                render_mode,
                screen_position: [0.5, 0.5],
                screen_scale: if screen_space {
                    0.08
                } else {
                    (1.0 / camera_distance.max(0.1)).clamp(0.01, 2.0)
                },
                sorting_order: 0,
            },
        );
        let yaw = camera_yaw.to_radians();
        let pitch = camera_pitch.clamp(-89.0, 89.0).to_radians();
        let distance = camera_distance.clamp(0.1, 10_000.0);
        let target = Vec3::ZERO;
        let eye = target
            + Vec3::new(
                yaw.sin() * pitch.cos(),
                pitch.sin(),
                yaw.cos() * pitch.cos(),
            ) * distance;
        self.render_scene(
            &world,
            width,
            height,
            EditorSceneCamera {
                eye: eye.to_array(),
                target: target.to_array(),
                orthographic: false,
                orthographic_size: 5.0,
                fov_y_degrees: 45.0,
            },
        )
    }

    fn render_world(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        view_camera: Option<FrameCamera>,
        include_ui: bool,
    ) -> Result<EditorViewportFrame> {
        let render_started = Instant::now();
        let mut stages = Vec::new();
        let size = normalized_size(width, height);
        let stage_started = Instant::now();
        if self.target.size() != size {
            self.target = self.renderer.create_offscreen_target(size);
        }
        finish_stage(&mut stages, "OffscreenTarget.ensure_size", stage_started);

        let stage_started = Instant::now();
        let hierarchy = TransformHierarchy::build(world);
        finish_stage(&mut stages, "TransformHierarchy.build", stage_started);
        let now = Instant::now();
        let effect_delta = now
            .duration_since(self.last_effect_frame)
            .as_secs_f32()
            .min(0.25);
        self.last_effect_frame = now;
        let stage_started = Instant::now();
        if let Some(effekseer) = self.effekseer.as_mut() {
            for failure in effekseer.update(world, &hierarchy, effect_delta) {
                log::warn!(
                    "viewport Effekseer effect '{}' could not be loaded from {}: {}",
                    failure.effect,
                    failure.path.display(),
                    failure.error
                );
            }
        }
        finish_stage(&mut stages, "EffekseerWorld.update", stage_started);
        let button_tints = HashMap::new();
        let stage_started = Instant::now();
        let mut frame = FrameCompiler {
            materials: &mut self.materials,
            particles: &mut self.particles,
            trails: &mut self.trails,
            textures: &mut self.textures,
            fonts: &mut self.fonts,
        }
        .compile(FrameCompileRequest {
            world,
            hierarchy: &hierarchy,
            viewport: [size.width, size.height],
            scene_clear: world.time.clear_color,
            camera_override: None,
            view_camera,
            include_ui,
            target_display: 0,
            interaction: UiInteractionState::default(),
            button_tints: &button_tints,
            focused_ui: None,
            sorting_layers: &self.sorting_layers,
            delta_seconds: effect_delta,
        });
        finish_stage(&mut stages, "FrameCompiler.compile", stage_started);

        let stage_started = Instant::now();
        if let Some(effekseer) = self.effekseer.as_mut() {
            for failure in effekseer.append_to_frame(&mut frame, [size.width, size.height]) {
                log::warn!(
                    "viewport Effekseer render asset '{}' could not be loaded from {}: {}",
                    failure.asset,
                    failure.path.display(),
                    failure.error
                );
            }
        }
        finish_stage(&mut stages, "EffekseerWorld.append_to_frame", stage_started);

        let stage_started = Instant::now();
        log_texture_failures(frame.texture_failures.drain(..));
        finish_stage(&mut stages, "Diagnostics.texture_failures", stage_started);
        let stage_started = Instant::now();
        for failure in self.meshes.sync(&mut self.renderer, &frame.objects) {
            log::warn!(
                "viewport mesh '{}' could not be loaded from {}: {}",
                failure.key,
                failure.path.display(),
                failure.error
            );
        }
        finish_stage(&mut stages, "RuntimeMeshCache.sync", stage_started);
        let stage_started = Instant::now();
        self.fonts.sync(&mut self.renderer);
        for failure in frame.font_failures.drain(..) {
            log::warn!(
                "viewport font '{}' could not be loaded from {}: {}",
                failure.key,
                failure.path.display(),
                failure.error
            );
        }
        finish_stage(&mut stages, "RuntimeFontCache.sync", stage_started);
        let stage_started = Instant::now();
        log_texture_failures(self.textures.sync(&mut self.renderer, &frame.ui));
        finish_stage(&mut stages, "RuntimeTextureCache.sync_ui", stage_started);
        let stage_started = Instant::now();
        log_texture_failures(
            self.textures
                .sync_ui_materials(&mut self.renderer, &frame.ui),
        );
        finish_stage(
            &mut stages,
            "RuntimeTextureCache.sync_ui_materials",
            stage_started,
        );
        let stage_started = Instant::now();
        log_texture_failures(
            self.textures
                .sync_materials(&mut self.renderer, &frame.objects),
        );
        finish_stage(
            &mut stages,
            "RuntimeTextureCache.sync_materials",
            stage_started,
        );
        let stage_started = Instant::now();
        log_texture_failures(
            self.textures
                .sync_environment(&mut self.renderer, &frame.lighting),
        );
        finish_stage(
            &mut stages,
            "RuntimeTextureCache.sync_environment",
            stage_started,
        );

        let stage_started = Instant::now();
        let submit = self
            .renderer
            .submit_frame_to(&frame.render_frame(), RenderTarget::Offscreen(&self.target));
        finish_stage(&mut stages, "Renderer.submit_frame_to", stage_started);
        submit.context("could not render the editor viewport")?;
        let stage_started = Instant::now();
        let rgba = self
            .renderer
            .read_offscreen_rgba8(&self.target)
            .context("could not read the editor viewport")?;
        finish_stage(&mut stages, "Renderer.read_offscreen_rgba8", stage_started);
        let stage_started = Instant::now();
        let profile = build_viewport_profile(
            &self.project_root,
            world,
            &frame,
            &self.renderer,
            size.width,
            size.height,
            rgba.len(),
            stages,
            render_started,
        );
        // Snapshot construction is intentionally reported as profiler overhead.
        let profile_overhead_ms = stage_started.elapsed().as_secs_f64() * 1_000.0;
        let mut profile = profile;
        profile.total_ms += profile_overhead_ms;
        profile.call_tree.total_ms += profile_overhead_ms;
        profile.call_tree.children.push(EditorViewportProfileNode {
            name: "Profiler".into(),
            total_ms: profile_overhead_ms,
            self_ms: 0.0,
            calls: 1,
            children: vec![EditorViewportProfileNode {
                name: "Profiler.snapshot".into(),
                total_ms: profile_overhead_ms,
                self_ms: profile_overhead_ms,
                calls: 1,
                children: Vec::new(),
            }],
        });
        Ok(EditorViewportFrame {
            width: size.width,
            height: size.height,
            rgba,
            has_authored_camera: frame.has_authored_camera,
            profile,
        })
    }
}

fn build_viewport_profile(
    project_root: &Path,
    world: &World,
    frame: &mengine_runtime::frame_compiler::CompiledFrame,
    renderer: &Renderer,
    width: u32,
    height: u32,
    readback_bytes: usize,
    stages: Vec<ProfileStage>,
    render_started: Instant,
) -> EditorViewportProfile {
    let (resources, resources_truncated) = collect_frame_resources(project_root, frame);
    let texture_gpu_bytes = resources
        .iter()
        .filter_map(|resource| resource.gpu_bytes_estimate)
        .sum::<u64>();
    let viewport_pixels = u64::from(width) * u64::from(height);
    let frame_object_bytes = size_of_val(frame.objects.as_slice()) as u64;
    let frame_ui_primitive_bytes = size_of_val(frame.ui.primitives.as_slice()) as u64;
    let frame_ui_batch_bytes = size_of_val(frame.ui.batches.as_slice()) as u64;
    let frame_control_bytes = size_of_val(frame.controls.as_slice()) as u64;
    let memory = vec![
        EditorViewportMemoryCategory {
            name: "CPU readback RGBA".into(),
            domain: "cpu".into(),
            bytes: readback_bytes as u64,
            certainty: "exact".into(),
            source: "Renderer.read_offscreen_rgba8 Vec length".into(),
        },
        EditorViewportMemoryCategory {
            name: "Frame packet / render objects".into(),
            domain: "cpu".into(),
            bytes: frame_object_bytes,
            certainty: "lower-bound".into(),
            source: "Rust shallow size for compiled render objects".into(),
        },
        EditorViewportMemoryCategory {
            name: "Frame packet / UI primitives".into(),
            domain: "cpu".into(),
            bytes: frame_ui_primitive_bytes,
            certainty: "lower-bound".into(),
            source: "Rust shallow size for compiled UI primitives".into(),
        },
        EditorViewportMemoryCategory {
            name: "Frame packet / UI batches".into(),
            domain: "cpu".into(),
            bytes: frame_ui_batch_bytes,
            certainty: "lower-bound".into(),
            source: "Rust shallow size for compiled UI batches".into(),
        },
        EditorViewportMemoryCategory {
            name: "Frame packet / controls".into(),
            domain: "cpu".into(),
            bytes: frame_control_bytes,
            certainty: "lower-bound".into(),
            source: "Rust shallow size for compiled UI controls".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU offscreen color".into(),
            domain: "gpu".into(),
            bytes: viewport_pixels * 4,
            certainty: "estimate".into(),
            source: "viewport width x height x 4 RGBA8 bytes".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU offscreen depth".into(),
            domain: "gpu".into(),
            bytes: viewport_pixels * 4,
            certainty: "estimate".into(),
            source: "viewport width x height x 4 depth bytes".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU texture residency".into(),
            domain: "gpu".into(),
            bytes: texture_gpu_bytes,
            certainty: "estimate".into(),
            source: "render-bound texture dimensions x 4 RGBA8 bytes; mipmaps excluded".into(),
        },
    ];
    let total_ms = render_started.elapsed().as_secs_f64() * 1_000.0;
    let child_total = stages.iter().map(|stage| stage.duration_ms).sum::<f64>();
    let mut grouped_stages = BTreeMap::<&str, Vec<ProfileStage>>::new();
    for stage in stages {
        let group =
            if stage.name.starts_with("Renderer.") || stage.name.starts_with("OffscreenTarget.") {
                "Render backend"
            } else if stage.name.starts_with("Runtime") {
                "Resource sync"
            } else if stage.name.starts_with("Effekseer") {
                "Effects"
            } else {
                "Frame compile"
            };
        grouped_stages.entry(group).or_default().push(stage);
    }
    let call_tree = EditorViewportProfileNode {
        name: "EditorViewportRenderer.render_world".into(),
        total_ms,
        self_ms: (total_ms - child_total).max(0.0),
        calls: 1,
        children: grouped_stages
            .into_iter()
            .map(|(group, stages)| {
                let group_total = stages.iter().map(|stage| stage.duration_ms).sum();
                EditorViewportProfileNode {
                    name: group.into(),
                    total_ms: group_total,
                    self_ms: 0.0,
                    calls: 1,
                    children: stages
                        .into_iter()
                        .map(|stage| EditorViewportProfileNode {
                            name: stage.name.into(),
                            total_ms: stage.duration_ms,
                            self_ms: stage.duration_ms,
                            calls: 1,
                            children: Vec::new(),
                        })
                        .collect(),
                }
            })
            .collect(),
    };
    let ui_stats = renderer.ui_stats();
    let pipeline_stats = renderer.material_pipeline_stats();
    let texture_stats = renderer.material_texture_stats();
    EditorViewportProfile {
        schema_version: 1,
        total_ms,
        call_tree,
        resident_memory_estimate_bytes: memory.iter().map(|category| category.bytes).sum(),
        memory,
        resources,
        resources_truncated,
        counts: EditorViewportProfileCounts {
            entities: world.iter_entities().count(),
            render_objects: frame.objects.len(),
            ui_primitives: frame.ui.primitives.len(),
            ui_batches: frame.ui.batches.len(),
            ui_draw_calls: ui_stats.draw_calls,
            material_pipelines_built_in: pipeline_stats.built_in,
            material_pipelines_custom: pipeline_stats.custom,
            material_pipelines_resident_custom: pipeline_stats.resident_custom,
            material_pipelines_rejected: pipeline_stats.rejected,
            material_pipeline_evictions: pipeline_stats.evictions,
            material_textures_color: texture_stats.color,
            material_textures_data: texture_stats.data,
            material_texture_bind_groups: texture_stats.bind_groups,
            material_samplers: texture_stats.samplers,
        },
    }
}

fn collect_frame_resources(
    project_root: &Path,
    frame: &mengine_runtime::frame_compiler::CompiledFrame,
) -> (Vec<EditorViewportResource>, bool) {
    let mut references = BTreeMap::<(String, String), BTreeSet<String>>::new();
    let mut add = |kind: &str, asset: &str, referenced_by: &str| {
        let normalized = asset.trim().replace('\\', "/");
        if normalized.is_empty() || normalized.eq_ignore_ascii_case("white") {
            return;
        }
        references
            .entry((kind.into(), normalized))
            .or_default()
            .insert(referenced_by.into());
    };
    for batch in &frame.ui.batches {
        let texture_kind = if batch.key.texture.starts_with("mengine-font://") {
            "font-atlas"
        } else {
            "texture"
        };
        add(texture_kind, &batch.key.texture, "UI batch");
        if batch.key.material.starts_with("Assets/") {
            add("material", &batch.key.material, "UI batch");
        }
    }
    for object in &frame.objects {
        add("mesh", &object.mesh_key, "RenderObject");
        for texture in [
            &object.material.base_color_texture,
            &object.material.normal_texture,
            &object.material.metallic_roughness_texture,
            &object.material.occlusion_texture,
            &object.material.emissive_texture,
        ] {
            add("texture", texture, "3D material");
        }
        for texture in &object.material.custom_textures {
            add("texture", texture, "Surface Shader");
        }
    }
    add(
        "texture",
        &frame.lighting.environment.texture,
        "EnvironmentLight",
    );

    const MAX_RESOURCES: usize = 256;
    let truncated = references.len() > MAX_RESOURCES;
    let resources = references
        .into_iter()
        .take(MAX_RESOURCES)
        .map(|((kind, asset), referenced_by)| {
            if kind == "font-atlas" {
                return EditorViewportResource {
                    kind,
                    asset,
                    resolved_path: None,
                    loaded: true,
                    source_bytes: None,
                    gpu_bytes_estimate: Some(1024 * 1024 * 4),
                    dimensions: Some([1024, 1024]),
                    referenced_by: referenced_by.into_iter().collect(),
                };
            }
            let resolved =
                mengine_runtime::textures::resolve_project_asset_path(project_root, &asset);
            let metadata = resolved
                .as_deref()
                .and_then(|path| std::fs::metadata(path).ok());
            let dimensions = (kind == "texture")
                .then(|| {
                    resolved
                        .as_deref()
                        .and_then(|path| mengine_assets::texture_dimensions(path).ok())
                })
                .flatten();
            EditorViewportResource {
                kind,
                asset,
                resolved_path: resolved.as_ref().map(|path| path.display().to_string()),
                loaded: metadata.as_ref().is_some_and(|value| value.is_file()),
                source_bytes: metadata.as_ref().map(std::fs::Metadata::len),
                gpu_bytes_estimate: dimensions
                    .map(|size| u64::from(size[0]) * u64::from(size[1]) * 4),
                dimensions,
                referenced_by: referenced_by.into_iter().collect(),
            }
        })
        .collect();
    (resources, truncated)
}

fn normalized_size(width: u32, height: u32) -> PhysicalSize<u32> {
    PhysicalSize::new(width.clamp(1, 4096), height.clamp(1, 4096))
}

fn log_texture_failures(failures: impl IntoIterator<Item = TextureLoadFailure>) {
    for failure in failures {
        log::warn!(
            "viewport texture '{}' could not be loaded from {}: {}",
            failure.key,
            failure.path.display(),
            failure.error
        );
    }
}
