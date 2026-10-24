// Author: MiYu. Synchronize borrowed resources from every viewport render target.
use anyhow::{Context, Result};
use glam::Vec3;
use mengine_assets::MaterialAsset;
use mengine_core::generated::{
    DirectionalLight, EffekseerEffect, EnvironmentLight, MeshRenderer, Transform,
};
use mengine_core::{transform_hierarchy::TransformHierarchyCache, World};
use mengine_rhi::{
    look_at, orthographic, perspective, FrameCamera, OffscreenRenderTarget, RenderMaterial,
    OffscreenReadbackTicket, RenderTarget, Renderer,
};
use mengine_runtime::effekseer::EffekseerWorld;
use mengine_runtime::fonts::RuntimeFontCache;
use mengine_runtime::frame_compiler::{
    parse_camera_clear_flags, ActiveFrameCamera, CameraClearFlags, FrameCompileRequest,
    FrameCompiler, FrameMeshInputs,
};
use mengine_runtime::materials::RuntimeMaterialCache;
use mengine_runtime::meshes::RuntimeMeshCache;
use mengine_runtime::particles::ParticleWorld;
use mengine_runtime::sorting::SortingLayers;
use mengine_runtime::textures::{RuntimeTextureCache, TextureLoadFailure};
use mengine_runtime::trails::TrailWorld;
use mengine_runtime::ui::UiInteractionState;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::mem::size_of_val;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Instant, SystemTime};
use winit::dpi::PhysicalSize;

#[path = "viewport_resources.rs"]
mod resource_sampling;
use resource_sampling::ResourceSampler;

#[path = "viewport_effect_clock.rs"]
mod effect_clock;
use effect_clock::ViewportEffectClock;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSamplingProfile { pub ready: bool, pub pending: bool, pub delayed: bool, pub unavailable: bool, pub metadata_ms: Option<f64> }

/// Invalidate sampled metadata when project ownership changes, including same-root reopen.
pub fn invalidate_resource_samples() { resource_sampling::invalidate(); }

/// Capture under the project lock together with the render request world.
pub fn resource_sample_generation() -> u64 { resource_sampling::generation() }

pub struct EditorViewportFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub has_authored_camera: bool,
    pub profile: EditorViewportProfile,
}

/// A frame whose submitted GPU copy owns its pixels independently of the renderer and world.
pub struct EditorViewportSubmission { pub frame: EditorViewportFrame, readback: Option<OffscreenReadbackTicket>, started: Instant, submitted: Instant }
impl std::ops::Deref for EditorViewportSubmission { type Target = EditorViewportFrame; fn deref(&self) -> &Self::Target { &self.frame } }
impl std::ops::DerefMut for EditorViewportSubmission { fn deref_mut(&mut self) -> &mut Self::Target { &mut self.frame } }
impl AsMut<EditorViewportFrame> for EditorViewportSubmission { fn as_mut(&mut self) -> &mut EditorViewportFrame { &mut self.frame } }
impl AsMut<EditorViewportFrame> for EditorViewportFrame { fn as_mut(&mut self) -> &mut EditorViewportFrame { self } }
impl EditorViewportSubmission {
    /// Call after releasing renderer/world locks; this ticket always returns its own submitted frame.
    pub fn finish(mut self) -> Result<EditorViewportFrame> {
        let pending_ms = self.submitted.elapsed().as_secs_f64() * 1000.0;
        self.frame.profile.call_tree.children.push(EditorViewportProfileNode { name: "Pending frame scheduling".into(), total_ms: pending_ms, self_ms: pending_ms, calls: 1, children: Vec::new() });
        if let Some(ticket) = self.readback.take() {
            let (rgba, readback) = ticket.finish().context("could not read the editor viewport")?;
            self.frame.rgba = rgba;
            let children: Vec<_> = [
                ("Readback buffer prepare", readback.buffer_prepare_ms), ("Readback copy submit", readback.copy_submit_ms), ("Readback GPU map wait", readback.gpu_wait_ms), ("Readback GPU query decode", readback.gpu_query_read_ms), ("Readback RGBA row pack", readback.rgba_pack_ms), ("Readback unmap", readback.unmap_ms),
            ].into_iter().map(|(name, ms)| EditorViewportProfileNode { name: name.into(), total_ms: ms, self_ms: ms, calls: 1, children: Vec::new() }).collect();
            let total_ms = children.iter().map(|node| node.total_ms).sum();
            let stage = EditorViewportProfileNode { name: "Renderer.read_offscreen_rgba8".into(), total_ms, self_ms: 0.0, calls: 1, children };
            let backend = self.frame.profile.call_tree.children.iter_mut().find(|node| node.name == "Render backend").expect("render backend stage exists");
            backend.total_ms += total_ms; backend.children.push(stage);
            if let Some(gpu) = readback.gpu { self.frame.profile.gpu = Some(EditorViewportGpuProfile { timestamp_period_ns: gpu.timestamp_period_ns, total_pass_ms: gpu.stages.iter().map(|stage| stage.milliseconds).sum(), stages: gpu.stages.into_iter().map(|stage| EditorViewportProfileNode { name: stage.name.into(), total_ms: stage.milliseconds, self_ms: stage.milliseconds, calls: 1, children: Vec::new() }).collect() }); }
        }
        self.frame.profile.total_ms = self.started.elapsed().as_secs_f64() * 1000.0;
        self.frame.profile.call_tree.total_ms = self.frame.profile.total_ms;
        self.frame.profile.call_tree.self_ms = (self.frame.profile.total_ms - self.frame.profile.call_tree.children.iter().map(|node| node.total_ms).sum::<f64>()).max(0.0);
        Ok(self.frame)
    }
}

/// A submitted surface frame; no CPU pixels or physical scanout timestamp are implied.
pub struct EditorViewportPresentation {
    pub width: u32,
    pub height: u32,
    pub has_authored_camera: bool,
    pub profile: EditorViewportProfile,
}

#[derive(Clone, Copy, PartialEq)]
enum ViewportDestination { Readback, Window, WindowCapture }

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
    pub msaa_samples: u32,
    pub entities: usize,
    pub render_objects: usize,
    pub camera_visible_objects: usize,
    pub shadow_visible_objects: usize,
    pub submitted_objects: usize,
    pub scene_views: usize,
    pub billboard_meshes: usize,
    pub cached_pose_meshes: usize,
    pub cached_pose_bytes: usize,
    pub mesh_uploads: usize,
    pub mesh_index_buffer_reuses: usize,
    pub mesh_vertex_buffer_reuses: usize,
    pub mesh_vertex_pool_buffers: usize,
    pub mesh_vertex_pool_bytes: usize,
    pub mesh_evictions: usize,
    pub ui_primitives: usize,
    pub ui_batches: usize,
    pub ui_draw_calls: u32,
    pub ui_custom_pipeline_attempts: u32,
    pub ui_custom_pipeline_builds: u32,
    pub ui_error_pipeline_builds: u32,
    pub ui_pipeline_evictions: u32,
    pub ui_texture_set_builds: u32,
    pub ui_buffer_allocations: u32,
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
pub struct EditorViewportGpuProfile { pub timestamp_period_ns: f64, pub total_pass_ms: f64, pub stages: Vec<EditorViewportProfileNode> }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorViewportProfile {
    pub schema_version: u32,
    pub total_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub simulation_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub world_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub world_sync_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub world_lock_wait_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worker_queue_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub renderer_lock_wait_ms: Option<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub simulation_stages: Vec<EditorViewportProfileNode>,
    pub call_tree: EditorViewportProfileNode,
    pub memory: Vec<EditorViewportMemoryCategory>,
    pub resident_memory_estimate_bytes: u64,
    pub resources: Vec<EditorViewportResource>,
    pub resources_truncated: bool,
    pub resource_sample_age_ms: f64,
    pub resource_sampling: ResourceSamplingProfile,
    pub counts: EditorViewportProfileCounts,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<EditorViewportGpuProfile>,
    pub gpu_timing_supported: bool,
    pub gpu_timing_enabled: bool,
}

#[derive(Clone, Debug)]
struct ProfileStage {
    name: &'static str,
    duration_ms: f64,
    children: Vec<EditorViewportProfileNode>,
}

#[derive(Clone, Copy)]
struct ResourceTextureDimensions {
    modified: SystemTime,
    source_bytes: u64,
    dimensions: [u32; 2],
}

type ResourceTextureDimensionCache = HashMap<PathBuf, ResourceTextureDimensions>;

fn sampled_texture_dimensions(path: &Path, metadata: &std::fs::Metadata, previous: &ResourceTextureDimensionCache, current: &mut ResourceTextureDimensionCache) -> Option<[u32; 2]> {
    if !metadata.is_file() { return None; }
    let modified = metadata.modified().ok();
    if let Some(cached) = previous.get(path).filter(|cached| Some(cached.modified) == modified && cached.source_bytes == metadata.len()) {
        current.insert(path.to_owned(), *cached);
        return Some(cached.dimensions);
    }
    let dimensions = mengine_assets::texture_dimensions(path).ok()?;
    if let Some(modified) = modified { current.insert(path.to_owned(), ResourceTextureDimensions { modified, source_bytes: metadata.len(), dimensions }); }
    Some(dimensions)
}

fn finish_stage(stages: &mut Vec<ProfileStage>, name: &'static str, started: Instant) {
    stages.push(ProfileStage {
        name,
        duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
        children: Vec::new(),
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

#[derive(Clone, Debug)]
pub struct EditorCameraPreview {
    pub eye: [f32; 3],
    pub target: [f32; 3],
    pub up: [f32; 3],
    pub orthographic: bool,
    pub orthographic_size: f32,
    pub fov_y_degrees: f32,
    pub near: f32,
    pub far: f32,
    pub clear_flags: String,
    pub background_color: [f32; 4],
    pub target_display: i32,
}

fn camera_preview_frame(
    camera: &EditorCameraPreview,
    width: u32,
    height: u32,
) -> ActiveFrameCamera {
    let eye = Vec3::from_array(camera.eye);
    let target = Vec3::from_array(camera.target);
    let authored_up = Vec3::from_array(camera.up);
    let up = if authored_up.is_finite() && authored_up.length_squared() > 0.000001 {
        authored_up.normalize()
    } else {
        Vec3::Y
    };
    let aspect = width.max(1) as f32 / height.max(1) as f32;
    let near = camera.near.max(0.001);
    let far = camera.far.max(near + 0.001);
    ActiveFrameCamera {
        frame: FrameCamera {
            view: look_at(eye, target, up),
            proj: if camera.orthographic {
                orthographic(camera.orthographic_size.max(0.001), aspect, near, far)
            } else {
                perspective(camera.fov_y_degrees.clamp(1.0, 179.0), aspect, near, far)
            },
            position: eye,
        },
        clear_flags: parse_camera_clear_flags(&camera.clear_flags),
        background_color: camera.background_color,
        entity: None,
    }
}

/// RHI host for captured editor views and native window presentation.
pub struct EditorViewportRenderer {
    mesh_inputs: FrameMeshInputs,
    hierarchy_cache: TransformHierarchyCache,
    renderer: Renderer,
    target: Option<OffscreenRenderTarget>,
    project_root: PathBuf,
    materials: RuntimeMaterialCache,
    meshes: RuntimeMeshCache,
    textures: RuntimeTextureCache,
    fonts: RuntimeFontCache,
    ui_batch_order: mengine_rhi::UiBatchOrderCache,
    particles: ParticleWorld,
    trails: TrailWorld,
    effekseer: Option<EffekseerWorld>,
    effect_clock: ViewportEffectClock,
    play_session: Option<u64>,
    preview_restart: u64,
    sorting_layers: SortingLayers,
    resource_sampler: ResourceSampler,
    resource_generation: u64,
}

impl EditorViewportRenderer {
    pub async fn new(project_root: PathBuf, width: u32, height: u32) -> Result<Self> {
        let size = normalized_size(width, height);
        let renderer = Renderer::new_headless(size)
            .await
            .context("could not initialize the headless RHI")?;
        Self::with_renderer(project_root, renderer)
    }

    /// The RHI surface retains the window for its entire GPU lifetime.
    pub async fn new_for_window(project_root: PathBuf, window: Arc<winit::window::Window>) -> Result<Self> {
        let size = window.inner_size();
        Self::new_for_surface(project_root, window, size.width, size.height).await
    }

    /// MiYu: owned child-window targets must retain their parent and route destruction through their UI thread.
    pub async fn new_for_surface(project_root: PathBuf, target: impl Into<mengine_rhi::SurfaceTarget<'static>>, width: u32, height: u32) -> Result<Self> {
        let renderer = Renderer::new_for_surface(target, normalized_size(width, height)).await.context("could not initialize the viewport surface")?;
        Self::with_renderer(project_root, renderer)
    }

    fn with_renderer(project_root: PathBuf, renderer: Renderer) -> Result<Self> {
        let sorting_layers = SortingLayers::load(Some(&project_root))
            .map_err(anyhow::Error::msg)
            .context("could not load sorting layers")?;
        Ok(Self {
            hierarchy_cache: TransformHierarchyCache::default(),
            renderer,
            target: None,
            materials: RuntimeMaterialCache::new(Some(project_root.clone())),
            mesh_inputs: FrameMeshInputs::default(),
            meshes: RuntimeMeshCache::new(Some(project_root.clone())),
            textures: RuntimeTextureCache::new(Some(project_root.clone())),
            fonts: RuntimeFontCache::new(Some(project_root.clone())),
            ui_batch_order: mengine_rhi::UiBatchOrderCache::default(),
            particles: ParticleWorld::default(),
            trails: TrailWorld::default(),
            effekseer: EffekseerWorld::new(Some(project_root.clone()))
                .map_err(|error| log::warn!("Effekseer viewport runtime is unavailable: {error}"))
                .ok(),
            effect_clock: ViewportEffectClock::default(),
            play_session: None,
            preview_restart: 0,
            sorting_layers,
            resource_sampler: ResourceSampler::new(project_root.clone()),
            resource_generation: resource_sample_generation(),
            project_root,
        })
    }

    pub fn project_root(&self) -> &Path {
        &self.project_root
    }

    /// Bind profiling to the project session that supplied this render request.
    pub fn with_resource_generation(&mut self, generation: u64) -> &mut Self { self.resource_generation = generation; self }

    pub fn with_gpu_timings(&mut self, enabled: bool) -> &mut Self { self.renderer.set_gpu_timings(enabled); self }

    pub fn with_play_session(&mut self, session: Option<u64>) -> &mut Self { self.play_session = session; self }

    pub fn render_game(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
    ) -> Result<EditorViewportFrame> {
        self.submit_game(world, width, height).and_then(EditorViewportSubmission::finish)
    }

    pub fn submit_game(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
    ) -> Result<EditorViewportSubmission> {
        self.submit_world_to(world, width, height, None, true, None, 0, ViewportDestination::Readback)
    }

    /// Submit Game pixels directly to the owned window without mapping a readback buffer.
    pub fn present_game(&mut self, world: &World, width: u32, height: u32) -> Result<EditorViewportPresentation> {
        let frame = self.render_world_to(world, width, height, None, true, None, 0, ViewportDestination::Window)?;
        Ok(EditorViewportPresentation { width: frame.width, height: frame.height, has_authored_camera: frame.has_authored_camera, profile: frame.profile })
    }

    /// Submit a new Game frame and capture that submission's exact swapchain image.
    pub fn present_game_with_capture(&mut self, world: &World, width: u32, height: u32) -> Result<EditorViewportFrame> {
        self.render_world_to(world, width, height, None, true, None, 0, ViewportDestination::WindowCapture)
    }

    pub fn render_camera(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        camera: EditorCameraPreview,
    ) -> Result<EditorViewportFrame> {
        self.submit_camera(world, width, height, camera).and_then(EditorViewportSubmission::finish)
    }

    pub fn submit_camera(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        camera: EditorCameraPreview,
    ) -> Result<EditorViewportSubmission> {
        self.submit_world_to(
            world,
            width,
            height,
            Some(camera_preview_frame(&camera, width, height)),
            true,
            None,
            camera.target_display,
            ViewportDestination::Readback,
        )
    }

    pub fn render_scene(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        camera: EditorSceneCamera,
    ) -> Result<EditorViewportFrame> {
        self.submit_scene(world, width, height, camera).and_then(EditorViewportSubmission::finish)
    }

    pub fn submit_scene(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        camera: EditorSceneCamera,
    ) -> Result<EditorViewportSubmission> {
        let aspect = width.max(1) as f32 / height.max(1) as f32;
        let eye = Vec3::from_array(camera.eye);
        let target = Vec3::from_array(camera.target);
        let view_camera = ActiveFrameCamera {
            frame: FrameCamera {
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
            },
            clear_flags: CameraClearFlags::Scene,
            background_color: world.time.clear_color.to_array(),
            entity: None,
        };
        self.submit_world_to(world, width, height, Some(view_camera), false, None, 0, ViewportDestination::Readback)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render_material_preview(
        &mut self,
        material: MaterialAsset,
        width: u32,
        height: u32,
        camera_yaw: f32,
        camera_pitch: f32,
        camera_distance: f32,
        background: [f32; 4],
    ) -> Result<EditorViewportFrame> {
        let mut world = World::new();
        world.time.clear_color = glam::Vec4::from_array(background);

        let object = world.spawn_empty();
        world.insert_component(object, Transform::default());
        world.insert_component(object, MeshRenderer::default());

        let light = world.spawn_empty();
        world.insert_component(
            light,
            Transform {
                rotation: glam::Quat::from_euler(
                    glam::EulerRot::YXZ,
                    -35.0_f32.to_radians(),
                    -40.0_f32.to_radians(),
                    0.0,
                )
                .to_array(),
                ..Transform::default()
            },
        );
        world.insert_component(
            light,
            DirectionalLight {
                intensity: 1.8,
                cast_shadows: false,
                ..DirectionalLight::default()
            },
        );
        world.insert_component(
            light,
            EnvironmentLight {
                background_enabled: false,
                diffuse_intensity: 0.65,
                specular_intensity: 1.0,
                ..EnvironmentLight::default()
            },
        );

        let yaw = camera_yaw.to_radians();
        let pitch = camera_pitch.clamp(-89.0, 89.0).to_radians();
        let distance = camera_distance.clamp(1.5, 20.0);
        let target = Vec3::ZERO;
        let eye = target
            + Vec3::new(
                yaw.sin() * pitch.cos(),
                pitch.sin(),
                yaw.cos() * pitch.cos(),
            ) * distance;
        let aspect = width.max(1) as f32 / height.max(1) as f32;
        let camera = ActiveFrameCamera {
            frame: FrameCamera {
                view: look_at(eye, target, Vec3::Y),
                proj: perspective(38.0, aspect, 0.01, 100.0),
                position: eye,
            },
            clear_flags: CameraClearFlags::Scene,
            background_color: background,
            entity: None,
        };
        let render_material = self
            .materials
            .resolve_preview(&material)
            .map_err(anyhow::Error::msg)
            .context("could not resolve material preview")?;
        self.render_world(
            &world,
            width,
            height,
            Some(camera),
            false,
            Some(render_material),
            0,
        )
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

    #[allow(clippy::too_many_arguments)]
    fn render_world(
        &mut self,
        world: &World,
        width: u32,
        height: u32,
        view_camera: Option<ActiveFrameCamera>,
        include_ui: bool,
        material_override: Option<RenderMaterial>,
        target_display: i32,
    ) -> Result<EditorViewportFrame> {
        self.render_world_to(world, width, height, view_camera, include_ui, material_override, target_display, ViewportDestination::Readback)
    }

    #[allow(clippy::too_many_arguments)]
    fn render_world_to(&mut self, world: &World, width: u32, height: u32, view_camera: Option<ActiveFrameCamera>, include_ui: bool, material_override: Option<RenderMaterial>, target_display: i32, destination: ViewportDestination) -> Result<EditorViewportFrame> {
        self.submit_world_to(world, width, height, view_camera, include_ui, material_override, target_display, destination)?.finish()
    }

    fn submit_world_to(&mut self, world: &World, width: u32, height: u32, view_camera: Option<ActiveFrameCamera>, include_ui: bool, material_override: Option<RenderMaterial>, target_display: i32, destination: ViewportDestination) -> Result<EditorViewportSubmission> {
        let render_started = Instant::now();
        let mut stages = Vec::new();
        let size = normalized_size(width, height);
        let stage_started = Instant::now();
        if destination != ViewportDestination::Readback {
            let current = self.renderer.window_size().context("viewport has no native window surface")?;
            anyhow::ensure!(width > 0 && height > 0, "cannot present a zero-sized viewport");
            if current != size { self.renderer.resize(size); }
        }
        if destination != ViewportDestination::Window && self.target.as_ref().is_none_or(|target| target.size() != size) {
            self.target = Some(self.renderer.create_offscreen_target(size));
        }
        finish_stage(&mut stages, "ViewportTarget.ensure_size", stage_started);

        let stage_started = Instant::now();
        let hierarchy = self.hierarchy_cache.build(world);
        finish_stage(&mut stages, "TransformHierarchy.build", stage_started);
        let particle_delta = self.effect_clock.simulation_delta(self.play_session, world.time.elapsed);
        let (effect_delta, restart_effects) = self.effect_clock.sample(self.play_session, world.time.elapsed, Instant::now());
        if restart_effects {
            self.particles.restart();
            self.trails.restart();
            if let Some(effekseer) = self.effekseer.as_mut() { effekseer.restart(); }
        }
        self.particles.imported.set_frame_delta(particle_delta);
        let stage_started = Instant::now();
        if let Some(effekseer) = self.effekseer.as_mut() {
            for failure in
                effekseer.update(world, &hierarchy, [size.width, size.height], effect_delta)
            {
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
            mesh_inputs: Some(&mut self.mesh_inputs),
            materials: &mut self.materials,
            particles: &mut self.particles,
            trails: &mut self.trails,
            textures: &mut self.textures,
            fonts: &mut self.fonts,
            ui_batch_order: Some(&mut self.ui_batch_order),
        }
        .compile(FrameCompileRequest {
            world,
            hierarchy: &hierarchy,
            viewport: [size.width, size.height],
            scene_clear: world.time.clear_color,
            camera_override: None,
            view_camera,
            include_ui,
            target_display,
            interaction: UiInteractionState::default(),
            button_tints: &button_tints,
            focused_ui: None,
            sorting_layers: &self.sorting_layers,
            delta_seconds: effect_delta,
        });
        if let (Some(material), Some(object)) = (material_override, frame.objects.first_mut()) {
            object.material = material.into();
        }
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
        for failure in self.meshes.sync_frame(&mut self.renderer, &mut frame) {
            log::warn!(
                "viewport mesh '{}' could not be loaded from {}: {}",
                failure.key,
                failure.path.display(),
                failure.error
            );
        }
        finish_stage(&mut stages, "RuntimeMeshCache.sync", stage_started);
        let mesh_work = self.meshes.sync_profile();
        stages.last_mut().expect("mesh sync stage recorded").children = [
            ("Mesh file metadata", mesh_work.file_check_ms, mesh_work.file_checks),
            ("Mesh source validation", mesh_work.source_check_ms, mesh_work.source_checks),
            ("Mesh source load and decode", mesh_work.source_load_ms, mesh_work.source_loads),
            ("Mesh source reuse", mesh_work.source_reuse_ms, mesh_work.source_reuses),
            ("Pose and procedural geometry", mesh_work.geometry_ms, mesh_work.geometry_builds),
            ("Mesh vertex conversion and GPU upload", mesh_work.upload_ms, mesh_work.uploads),
        ].into_iter().filter(|(_, _, calls)| *calls > 0).map(|(name, ms, calls)| EditorViewportProfileNode { name: name.into(), total_ms: ms, self_ms: ms, calls, children: Vec::new() }).collect();
        if let Some(upload) = stages.last_mut().expect("mesh sync stage recorded").children.iter_mut().find(|node| node.name == "Mesh vertex conversion and GPU upload") {
            upload.children = [
                ("Mesh vertex conversion CPU", mesh_work.vertex_conversion_ms),
                ("Mesh vertex buffer allocation and upload CPU", mesh_work.vertex_buffer_ms),
                ("Mesh index buffer lookup and upload CPU", mesh_work.index_buffer_ms),
                ("Mesh local bounds CPU", mesh_work.bounds_ms),
            ].into_iter().map(|(name, ms)| EditorViewportProfileNode { name: name.into(), total_ms: ms, self_ms: ms, calls: mesh_work.uploads, children: Vec::new() }).collect();
            upload.self_ms = (upload.total_ms - upload.children.iter().map(|child| child.total_ms).sum::<f64>()).max(0.0);
        }
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
                .sync_materials_iter(&mut self.renderer, frame.resource_objects_iter()),
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
        let target = match destination {
            ViewportDestination::Readback => RenderTarget::Offscreen(self.target.as_ref().expect("capture target initialized")),
            ViewportDestination::Window => RenderTarget::Window,
            ViewportDestination::WindowCapture => RenderTarget::WindowCapture(self.target.as_ref().expect("capture target initialized")),
        };
        let submit = self.renderer.submit_frame_to(&frame.render_frame(), target);
        finish_stage(&mut stages, "Renderer.submit_frame_to", stage_started);
        submit.context("could not render the editor viewport")?;
        let submission = self.renderer.submission_profile();
        stages.last_mut().expect("submission stage recorded").children = [
            ("Render target preparation CPU", submission.target_prepare_ms, submission.queue_submissions),
            ("Camera uniforms CPU", submission.camera_uniform_ms, submission.queue_submissions),
            ("Visibility culling and sorting CPU", submission.culling_ms, submission.queue_submissions),
            ("Object uniforms CPU", submission.object_uniform_ms, submission.queue_submissions),
            ("UI batch preparation CPU", submission.ui_prepare_ms, submission.queue_submissions),
            ("Material preparation CPU", submission.material_prepare_ms, submission.queue_submissions),
            ("Encoder setup and shadow pass CPU", submission.shadow_encode_ms, submission.queue_submissions),
            ("World pass encoding CPU", submission.world_encode_ms, submission.queue_submissions),
            ("Postprocess encoding CPU", submission.postprocess_encode_ms, submission.queue_submissions),
            ("UI pass encoding CPU", submission.ui_encode_ms, submission.queue_submissions),
            ("Surface acquire CPU wait", submission.surface_acquire_ms, submission.surface_frames),
            ("Encoder finish and queue submit CPU", submission.queue_submit_ms, submission.queue_submissions),
            ("Surface present CPU", submission.surface_present_ms, submission.surface_frames),
        ].into_iter().filter(|(_, _, calls)| *calls > 0).map(|(name, ms, calls)| EditorViewportProfileNode { name: name.into(), total_ms: ms, self_ms: ms, calls, children: Vec::new() }).collect();
        if let Some(ui) = stages.last_mut().expect("submission stage recorded").children.iter_mut().find(|node| node.name == "UI batch preparation CPU") {
            let work = submission.ui_preparation;
            ui.children = [
                ("UI buffer capacity and bindings CPU", work.buffer_prepare_ms),
                ("UI instance packing CPU", work.packing_ms),
                ("UI buffer writes CPU", work.buffer_write_ms),
                ("UI material lookup and texture sets CPU", work.material_prepare_ms),
                ("UI pipeline preparation CPU", work.pipeline_prepare_ms),
                ("UI cache pruning CPU", work.prune_ms),
            ].into_iter().map(|(name, ms)| EditorViewportProfileNode { name: name.into(), total_ms: ms, self_ms: ms, calls: submission.queue_submissions, children: Vec::new() }).collect();
            let pipelines = ui.children.iter_mut().find(|node| node.name == "UI pipeline preparation CPU").expect("UI pipeline stage recorded");
            pipelines.children = [
                ("UI custom shader compilation CPU", work.custom_pipeline_build_ms, work.custom_pipeline_attempts),
                ("UI error pipeline creation CPU", work.error_pipeline_build_ms, work.error_pipeline_builds),
            ].into_iter().filter(|(_, ms, calls)| *calls > 0 || *ms > 0.).map(|(name, ms, calls)| EditorViewportProfileNode { name: name.into(), total_ms: ms, self_ms: ms, calls, children: Vec::new() }).collect();
            if let Some(custom) = pipelines.children.iter_mut().find(|node| node.name == "UI custom shader compilation CPU") {
                if work.slowest_custom_pipeline_ms > 0. {
                    custom.children.push(EditorViewportProfileNode { name: format!("Slowest UI shader {:016x}", work.slowest_custom_fingerprint), total_ms: work.slowest_custom_pipeline_ms, self_ms: work.slowest_custom_pipeline_ms, calls: 1, children: Vec::new() });
                    custom.self_ms = (custom.total_ms - work.slowest_custom_pipeline_ms).max(0.);
                }
            }
            pipelines.self_ms = (pipelines.total_ms - pipelines.children.iter().map(|child| child.total_ms).sum::<f64>()).max(0.);
            ui.self_ms = (ui.total_ms - ui.children.iter().map(|child| child.total_ms).sum::<f64>()).max(0.);
        }
        let readback = if destination == ViewportDestination::Window { None } else {
            Some(self.renderer.begin_offscreen_rgba8_profiled(self.target.as_ref().expect("capture target initialized")).context("could not submit editor viewport readback")?)
        };
        let readback_bytes = if readback.is_some() { size.width as usize * size.height as usize * 4 } else { 0 };
        let stage_started = Instant::now();
        let mut resource_stages = Vec::new();
        let (resources, resources_truncated, resource_sample_age_ms, resource_sampling) = self.resource_sampler.sample(&frame, &mut resource_stages, self.resource_generation);
        let mut profile = build_viewport_profile(
            resources,
            resources_truncated,
            resource_sample_age_ms,
            world,
            &frame,
            &self.renderer,
            size.width,
            size.height,
            self.target.as_ref().map(OffscreenRenderTarget::size),
            readback_bytes,
            stages,
            render_started,
        );
        profile.resource_sampling = resource_sampling;
        let mesh_cache = self.meshes.stats();
        profile.counts.cached_pose_meshes = mesh_cache.entries;
        profile.counts.cached_pose_bytes = mesh_cache.bytes;
        profile.counts.mesh_uploads = mesh_cache.uploads;
        profile.counts.mesh_index_buffer_reuses = mesh_work.index_buffer_reuses;
        profile.counts.mesh_vertex_buffer_reuses = mesh_work.vertex_buffer_reuses;
        let (vertex_pool_buffers, vertex_pool_bytes) = self.renderer.mesh_vertex_pool_stats();
        profile.counts.mesh_vertex_pool_buffers = vertex_pool_buffers;
        profile.counts.mesh_vertex_pool_bytes = vertex_pool_bytes;
        profile.counts.ui_custom_pipeline_attempts = submission.ui_preparation.custom_pipeline_attempts;
        profile.counts.ui_custom_pipeline_builds = submission.ui_preparation.custom_pipeline_builds;
        profile.counts.ui_error_pipeline_builds = submission.ui_preparation.error_pipeline_builds;
        profile.counts.ui_pipeline_evictions = submission.ui_preparation.pipeline_evictions;
        profile.counts.ui_texture_set_builds = submission.ui_preparation.texture_set_builds;
        profile.counts.ui_buffer_allocations = submission.ui_preparation.buffer_allocations;
        profile.counts.mesh_evictions = mesh_cache.evictions;
        profile.memory.push(EditorViewportMemoryCategory { name:"GPU sampled mesh cache".into(), domain:"gpu".into(), bytes:mesh_cache.bytes as u64, certainty:"estimate".into(), source:"Logical per-mesh vertex/index bytes; shared indices may be counted repeatedly; retained index-cache handles, driver overhead and static meshes are excluded".into() });
        profile.resident_memory_estimate_bytes += mesh_cache.bytes as u64;
        profile.memory.push(EditorViewportMemoryCategory { name:"GPU idle mesh vertex buffers".into(), domain:"gpu".into(), bytes:vertex_pool_bytes as u64, certainty:"estimate".into(), source:"Retained idle vertex-buffer payload capacities; active meshes and driver overhead are excluded".into() });
        profile.resident_memory_estimate_bytes += vertex_pool_bytes as u64;
        // Snapshot construction is intentionally reported as profiler overhead.
        let profile_overhead_ms = stage_started.elapsed().as_secs_f64() * 1_000.0;
        let mut profile = profile;
        if let Some(compile) = profile.call_tree.children.iter_mut().flat_map(|group| &mut group.children).find(|node| node.name == "FrameCompiler.compile") {
            compile.children = frame.profile_stages.iter().map(|(name, total_ms)| EditorViewportProfileNode { name: (*name).into(), total_ms: *total_ms, self_ms: *total_ms, calls: 1, children: Vec::new() }).collect();
            compile.self_ms = (compile.total_ms - compile.children.iter().map(|child| child.total_ms).sum::<f64>()).max(0.0);
        }
        profile.total_ms = render_started.elapsed().as_secs_f64() * 1000.0;
        profile.call_tree.total_ms = profile.total_ms;
        profile.call_tree.self_ms = (profile.total_ms - profile.call_tree.children.iter().map(|child| child.total_ms).sum::<f64>() - profile_overhead_ms).max(0.0);
        profile.call_tree.children.push(EditorViewportProfileNode {
            name: "Profiler".into(),
            total_ms: profile_overhead_ms,
            self_ms: 0.0,
            calls: 1,
            children: vec![EditorViewportProfileNode {
                name: "Profiler.snapshot".into(),
                total_ms: profile_overhead_ms,
                self_ms: (profile_overhead_ms - resource_stages.iter().map(|stage| stage.total_ms).sum::<f64>()).max(0.0),
                calls: 1,
                children: resource_stages,
            }],
        });
        Ok(EditorViewportSubmission { frame: EditorViewportFrame { width: size.width, height: size.height, rgba: Vec::new(), has_authored_camera: frame.has_authored_camera, profile }, readback, started: render_started, submitted: Instant::now() })
    }
}

fn build_viewport_profile(
    resources: Vec<EditorViewportResource>,
    resources_truncated: bool,
    resource_sample_age_ms: f64,
    world: &World,
    frame: &mengine_runtime::frame_compiler::CompiledFrame,
    renderer: &Renderer,
    width: u32,
    height: u32,
    offscreen_size: Option<PhysicalSize<u32>>,
    readback_bytes: usize,
    stages: Vec<ProfileStage>,
    render_started: Instant,
) -> EditorViewportProfile {
    let texture_gpu_bytes = resources
        .iter()
        .filter_map(|resource| resource.gpu_bytes_estimate)
        .sum::<u64>();
    let viewport_pixels = u64::from(width) * u64::from(height);
    let frame_object_bytes = size_of_val(frame.objects.as_slice()) as u64 + frame.scene_views.iter().map(|view| size_of_val(view.objects.as_slice()) as u64).sum::<u64>();
    let frame_ui_primitive_bytes = size_of_val(frame.ui.primitives.as_slice()) as u64;
    let frame_ui_batch_bytes = size_of_val(frame.ui.batches.as_slice()) as u64;
    let frame_control_bytes = size_of_val(frame.controls.as_slice()) as u64;
    let (readback_buffer_bytes, readback_buffer_allocations) = renderer.offscreen_readback_stats();
    let memory = vec![
        EditorViewportMemoryCategory {
            name: "CPU readback RGBA".into(),
            domain: "cpu".into(),
            bytes: readback_bytes as u64,
            certainty: "exact".into(),
            source: "Renderer.read_offscreen_rgba8 Vec length".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU readback staging".into(), domain: "gpu".into(), bytes: readback_buffer_bytes,
            certainty: "lower-bound".into(), source: format!("wgpu buffer logical capacity; {readback_buffer_allocations} allocations; driver padding excluded"),
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
            bytes: offscreen_size.map_or(0, |size| u64::from(size.width) * u64::from(size.height) * 4),
            certainty: "estimate".into(),
            source: "cached offscreen target dimensions x 4 RGBA8 bytes; zero until capture allocates a target".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU surface color".into(),
            domain: "gpu".into(),
            bytes: renderer.window_size().map_or(0, |size| u64::from(size.width) * u64::from(size.height) * 4),
            certainty: "lower-bound".into(),
            source: "one configured surface image x 4 color bytes; excludes additional swapchain buffers and driver padding".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU scene depth".into(),
            domain: "gpu".into(),
            bytes: viewport_pixels * 4 * u64::from(renderer.sample_count()),
            certainty: "estimate".into(),
            source: "viewport width x height x 4 depth/stencil bytes x MSAA samples; physical format is backend-dependent".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU HDR and multisampled color".into(),
            domain: "gpu".into(),
            bytes: viewport_pixels * (8 + if renderer.sample_count() > 1 { 12 * u64::from(renderer.sample_count()) } else { 0 }),
            certainty: "estimate".into(),
            source: "resolved RGBA16F plus MSAA RGBA16F and MSAA RGBA8 attachments; resolved output color listed separately; excludes driver allocation padding".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU texture residency".into(),
            domain: "gpu".into(),
            bytes: texture_gpu_bytes,
            certainty: "estimate".into(),
            source: "render-bound texture dimensions x 4 RGBA8 bytes; mipmaps excluded".into(),
        },
        EditorViewportMemoryCategory {
            name: "GPU live scene views".into(), domain: "gpu".into(),
            bytes: frame.scene_views.iter().map(|view| u64::from(view.size[0]) * u64::from(view.size[1])).sum::<u64>() * (12 + 4 * u64::from(renderer.sample_count()) + if renderer.sample_count() > 1 { 12 * u64::from(renderer.sample_count()) } else { 0 }),
            certainty: "estimate".into(), source: "resolved RGBA8 and RGBA16F, depth/stencil and MSAA color attachments; excludes driver padding".into(),
        },
    ];
    let total_ms = render_started.elapsed().as_secs_f64() * 1_000.0;
    let child_total = stages.iter().map(|stage| stage.duration_ms).sum::<f64>();
    let mut grouped_stages = BTreeMap::<&str, Vec<ProfileStage>>::new();
    for stage in stages {
        let group =
            if stage.name.starts_with("Renderer.") || stage.name.starts_with("ViewportTarget.") {
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
                            self_ms: (stage.duration_ms - stage.children.iter().map(|node| node.total_ms).sum::<f64>()).max(0.0),
                            calls: 1,
                            children: stage.children,
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
        simulation_ms: None,
        world_revision: None,
        world_sync_ms: None,
        world_lock_wait_ms: None,
        worker_queue_ms: None,
        renderer_lock_wait_ms: None,
        simulation_stages: Vec::new(),
        schema_version: 1,
        gpu: None,
        gpu_timing_supported: renderer.gpu_timing_supported(),
        gpu_timing_enabled: renderer.gpu_timing_enabled(),
        total_ms,
        call_tree,
        resident_memory_estimate_bytes: memory.iter().map(|category| category.bytes).sum(),
        memory,
        resources,
        resources_truncated,
        resource_sample_age_ms,
        resource_sampling: ResourceSamplingProfile::default(),
        counts: EditorViewportProfileCounts {
            msaa_samples: renderer.sample_count(),
            entities: world.iter_entities().count(),
            render_objects: frame.objects.len(),
            camera_visible_objects: renderer.spatial_culling_stats().camera_visible,
            shadow_visible_objects: renderer.spatial_culling_stats().shadow_visible,
            submitted_objects: renderer.spatial_culling_stats().submitted,
            scene_views: frame.scene_views.len(),
            billboard_meshes: frame.objects.iter().chain(frame.scene_views.iter().flat_map(|v| &v.objects)).filter(|o| o.mesh_key.starts_with("billboard:")).map(|o| &o.mesh_key).collect::<BTreeSet<_>>().len(),
            cached_pose_meshes: 0,
            cached_pose_bytes: 0,
            mesh_uploads: 0,
            mesh_index_buffer_reuses: 0,
            mesh_vertex_buffer_reuses: 0,
            mesh_vertex_pool_buffers: 0,
            mesh_vertex_pool_bytes: 0,
            mesh_evictions: 0,
            ui_primitives: frame.ui.primitives.len(),
            ui_batches: frame.ui.batches.len(),
            ui_draw_calls: ui_stats.draw_calls,
            ui_custom_pipeline_attempts: 0,
            ui_custom_pipeline_builds: 0,
            ui_error_pipeline_builds: 0,
            ui_pipeline_evictions: 0,
            ui_texture_set_builds: 0,
            ui_buffer_allocations: 0,
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

fn collect_resource_references<'a>(frame: &'a mengine_runtime::frame_compiler::CompiledFrame, stages: &mut Vec<EditorViewportProfileNode>) -> (Vec<EditorViewportResource>, bool) {
    let references_started = Instant::now();
    let mut references = BTreeMap::<(String, String), BTreeSet<String>>::new();
    const MAX_RESOURCES: usize = 256;
    const MAX_REFERENCE_ENTRIES: usize = 4096;
    let mut truncated = frame.ui.batches.len() + frame.objects.len() + frame.view_resources.len() > MAX_REFERENCE_ENTRIES;
    let mut raw_references = HashSet::new();
    let mut add = |kind: &'static str, asset: &'a str, referenced_by: &'static str| {
        let asset = asset.trim();
        if asset.is_empty() || asset.eq_ignore_ascii_case("white") || raw_references.contains(&(kind,asset,referenced_by)) { return; }
        if raw_references.len() < MAX_REFERENCE_ENTRIES { raw_references.insert((kind,asset,referenced_by)); }
        references
            .entry((kind.into(), asset.replace('\\', "/")))
            .or_default()
            .insert(referenced_by.into());
        if references.len() > MAX_RESOURCES { references.pop_last(); truncated = true; }
    };
    for batch in frame.ui.batches.iter().take(MAX_REFERENCE_ENTRIES) {
        let texture_kind = if batch.key.texture.starts_with("mengine-font://") {
            "font-atlas"
        } else if batch.key.texture.starts_with("$scene-view:") {
            "scene-view"
        } else {
            "texture"
        };
        add(texture_kind, &batch.key.texture, "UI batch");
        if batch.key.material.starts_with("Assets/") {
            add("material", &batch.key.material, "UI batch");
        }
    }
    for object in frame.objects.iter().chain(&frame.view_resources).take(MAX_REFERENCE_ENTRIES.saturating_sub(frame.ui.batches.len())) {
        add("mesh", mengine_runtime::meshes::source_mesh_reference(&object.mesh_key), "RenderObject");
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

    let references_ms = references_started.elapsed().as_secs_f64() * 1000.0;
    stages.push(EditorViewportProfileNode { name: "Resources.references".into(), total_ms: references_ms, self_ms: references_ms, calls: 1, children: Vec::new() });
    let resources = references
        .into_iter()
        .take(MAX_RESOURCES)
        .map(|((kind, asset), referenced_by)| {
            if kind == "scene-view" {
                let dimensions = frame.scene_views.iter().find(|view| view.key == asset).map(|view| view.size);
                return EditorViewportResource { kind, asset, resolved_path: None, loaded: dimensions.is_some(), source_bytes: None, gpu_bytes_estimate: None, dimensions, referenced_by: referenced_by.into_iter().collect() };
            }
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
            EditorViewportResource { kind, asset, resolved_path: None, loaded: false, source_bytes: None, gpu_bytes_estimate: None, dimensions: None, referenced_by: referenced_by.into_iter().collect() }
        }).collect();
    (resources, truncated)
}

fn sample_resource_metadata(project_root: &Path, resources: &mut [EditorViewportResource], dimension_cache: &mut ResourceTextureDimensionCache) {
    let mut current_dimensions = ResourceTextureDimensionCache::new();
    for resource in resources {
        if resource.kind == "font-atlas" || resource.kind == "scene-view" { continue; }
        let source = if resource.kind == "mesh" { mengine_assets::parse_gltf_pose_sample(&resource.asset).map_or(resource.asset.as_str(), |p| p.0) } else { &resource.asset };
        let resolved = mengine_runtime::textures::resolve_project_asset_path(project_root, source);
        let metadata = resolved.as_deref().and_then(|path| std::fs::metadata(path).ok());
        let dimensions = if resource.kind == "texture" { resolved.as_deref().zip(metadata.as_ref()).and_then(|(path, metadata)| sampled_texture_dimensions(path, metadata, dimension_cache, &mut current_dimensions)) } else { None };
        resource.resolved_path = resolved.as_ref().map(|path| path.display().to_string());
        resource.loaded = metadata.as_ref().is_some_and(|value| value.is_file());
        resource.source_bytes = metadata.as_ref().map(std::fs::Metadata::len);
        resource.gpu_bytes_estimate = dimensions.map(|size| u64::from(size[0]) * u64::from(size[1]) * 4);
        resource.dimensions = dimensions;
    }
    *dimension_cache = current_dimensions;
}

#[cfg(test)]
fn collect_frame_resources(project_root: &Path, frame: &mengine_runtime::frame_compiler::CompiledFrame, dimension_cache: &mut ResourceTextureDimensionCache, stages: &mut Vec<EditorViewportProfileNode>) -> (Vec<EditorViewportResource>, bool) {
    let (mut resources, truncated) = collect_resource_references(frame, stages);
    let started = Instant::now();
    sample_resource_metadata(project_root, &mut resources, dimension_cache);
    let metadata_ms = started.elapsed().as_secs_f64() * 1000.0;
    stages.push(EditorViewportProfileNode { name: "Resources.metadata".into(), total_ms: metadata_ms, self_ms: metadata_ms, calls: 1, children: Vec::new() });
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

#[cfg(test)]
#[path = "viewport_submission_tests.rs"]
mod submission_tests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires MENGINE_RESOURCE_PROFILE_REPORT from a real viewport run"]
    fn measure_resource_file_metadata_and_texture_headers() {
        let report_path = std::env::var("MENGINE_RESOURCE_PROFILE_REPORT").expect("set MENGINE_RESOURCE_PROFILE_REPORT");
        let report: serde_json::Value = serde_json::from_slice(&std::fs::read(report_path).unwrap()).unwrap();
        let resources = report["game"]["nativeLatest"]["resources"].as_array().unwrap();
        let mut metadata_ms = Vec::new(); let mut texture_ms = Vec::new();
        for _ in 0..100 {
            let started = Instant::now();
            for resource in resources { if let Some(path) = resource["resolvedPath"].as_str() { std::hint::black_box(std::fs::metadata(path).ok()); } }
            metadata_ms.push(started.elapsed().as_secs_f64() * 1000.0);
            let started = Instant::now();
            for resource in resources { if resource["kind"] == "texture" { if let Some(path) = resource["resolvedPath"].as_str() { std::hint::black_box(mengine_assets::texture_dimensions(Path::new(path)).ok()); } } }
            texture_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        }
        for (name, mut values) in [("File metadata",metadata_ms),("Texture headers",texture_ms)] {
            values.sort_by(f64::total_cmp);
            eprintln!("{name}: mean={:.4} ms median={:.4} ms p95={:.4} ms",values.iter().sum::<f64>()/values.len() as f64,values[50],values[94]);
        }
    }

    pub(super) fn resource_frame(objects: Vec<mengine_rhi::RenderObject>, view_resources: Vec<mengine_rhi::RenderObject>) -> mengine_runtime::frame_compiler::CompiledFrame {
        let camera = FrameCamera { view:glam::Mat4::IDENTITY,proj:glam::Mat4::IDENTITY,position:Vec3::Z };
        mengine_runtime::frame_compiler::CompiledFrame {
            profile_stages:vec![],clear:mengine_rhi::ClearColor { r:0.0,g:0.0,b:0.0,a:1.0 },camera,objects,view_resources,lighting:Default::default(),
            ui:mengine_rhi::UiBatchPlan::build(vec![]),controls:vec![],texture_failures:vec![],font_failures:vec![],has_authored_camera:true,scene_views:vec![],
        }
    }

    fn resource_object(mesh: &str) -> mengine_rhi::RenderObject {
        mengine_rhi::RenderObject { mesh_key:mesh.into(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false }
    }

    #[test]
    fn resource_snapshot_refreshes_changed_missing_and_recovered_texture_dimensions() {
        struct TestProject(PathBuf);
        impl Drop for TestProject { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
        let project = TestProject(std::env::temp_dir().join(format!("mengine-resource-snapshot-{}-{}",std::process::id(),SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos())));
        std::fs::create_dir_all(project.0.join("Assets")).unwrap();
        let path = project.0.join("Assets/sampled.bmp");
        let first_time = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        let changed_time = first_time + std::time::Duration::from_secs(2);
        let write = |width, height, modified| {
            image::RgbaImage::new(width,height).save(&path).unwrap();
            std::fs::File::options().write(true).open(&path).unwrap().set_times(std::fs::FileTimes::new().set_modified(modified)).unwrap();
        };
        let mut object = resource_object(""); object.material.base_color_texture = "Assets/sampled.bmp".into();
        let mut frame = resource_frame(vec![object],vec![]);
        let mut cache = ResourceTextureDimensionCache::new();
        let read = |frame: &mengine_runtime::frame_compiler::CompiledFrame, cache: &mut ResourceTextureDimensionCache| {
            let mut stages = Vec::new();
            let (resources,truncated) = collect_frame_resources(&project.0,frame,cache,&mut stages);
            assert!(!truncated); assert_eq!(stages.iter().map(|s|s.name.as_str()).collect::<Vec<_>>(),["Resources.references","Resources.metadata"]);
            resources.into_iter().find(|r|r.kind=="texture").unwrap()
        };
        write(2,6,first_time);
        let first = read(&frame,&mut cache); assert_eq!(first.dimensions,Some([2,6])); assert!(first.loaded); assert_eq!(cache.len(),1);
        assert_eq!(read(&frame,&mut cache).dimensions,first.dimensions);
        write(4,3,changed_time);
        let changed = read(&frame,&mut cache); assert_eq!(changed.source_bytes,first.source_bytes); assert_eq!(changed.dimensions,Some([4,3]));
        write(5,3,changed_time);
        let resized = read(&frame,&mut cache); assert_ne!(resized.source_bytes,changed.source_bytes); assert_eq!(resized.dimensions,Some([5,3]));
        std::fs::remove_file(&path).unwrap();
        let missing = read(&frame,&mut cache); assert!(!missing.loaded); assert_eq!(missing.source_bytes,None); assert_eq!(missing.dimensions,None); assert!(cache.is_empty());
        write(2,6,first_time); assert_eq!(read(&frame,&mut cache).dimensions,Some([2,6]));
        std::fs::write(&path,b"invalid image header").unwrap();
        let failed = read(&frame,&mut cache); assert!(failed.loaded); assert_eq!(failed.dimensions,None); assert!(cache.is_empty());
        write(4,3,changed_time); assert_eq!(read(&frame,&mut cache).dimensions,Some([4,3])); assert_eq!(cache.len(),1);
        frame.objects.clear();
        let (resources,_) = collect_frame_resources(&project.0,&frame,&mut cache,&mut Vec::new()); assert!(resources.is_empty()); assert!(cache.is_empty());
    }

    #[test]
    fn resource_snapshot_preserves_normalized_aliases_all_provenance_and_preview_metadata() {
        let mut object = resource_object(r"  Assets\hero.glb#pose=0:1@30  ");
        object.material.base_color_texture = r"  Assets\shared.png  ".into(); object.material.custom_textures[0] = "Assets/shared.png".into();
        let mut preview = object.clone(); preview.mesh_key = "billboard:0000000000000001:Assets/hero.glb#pose=0:1@30".into();
        let mut frame = resource_frame(vec![object;300],vec![preview;300]); frame.lighting.environment.texture = "Assets/shared.png".into();
        let mut image = mengine_rhi::UiPrimitive::solid([0.0,0.0,16.0,16.0],[1.0;4]); image.key.texture = "Assets/shared.png".into(); image.key.material = "Assets/panel.mmat".into();
        let mut font = image.clone(); font.key.texture = "mengine-font://test".into();
        let mut view = image.clone(); view.key.texture = "$scene-view:test".into();
        let mut white = image.clone(); white.key.texture = " WHITE ".into();
        frame.ui = mengine_rhi::UiBatchPlan::build(vec![image,font,view,white]);
        frame.scene_views.push(mengine_rhi::SceneTextureFrame { key:"$scene-view:test".into(),size:[20,30],clear:frame.clear,camera:frame.camera,objects:vec![],lighting:Default::default() });
        let (resources,truncated) = collect_frame_resources(&std::env::temp_dir(),&frame,&mut ResourceTextureDimensionCache::new(),&mut Vec::new());
        assert!(!truncated); assert_eq!(resources.len(),5);
        let mesh = resources.iter().find(|r|r.kind=="mesh").unwrap(); assert_eq!(mesh.asset,"Assets/hero.glb#pose=0:1@30"); assert_eq!(mesh.referenced_by,["RenderObject"]);
        assert!(Path::new(mesh.resolved_path.as_ref().unwrap()).ends_with("Assets/hero.glb"));
        let texture = resources.iter().find(|r|r.kind=="texture").unwrap(); assert_eq!(texture.asset,"Assets/shared.png");
        assert_eq!(texture.referenced_by,["3D material","EnvironmentLight","Surface Shader","UI batch"]);
        let font = resources.iter().find(|r|r.kind=="font-atlas").unwrap(); assert!(font.loaded); assert_eq!(font.dimensions,Some([1024,1024])); assert_eq!(font.gpu_bytes_estimate,Some(1024*1024*4));
        let view = resources.iter().find(|r|r.kind=="scene-view").unwrap(); assert!(view.loaded); assert_eq!(view.dimensions,Some([20,30])); assert_eq!(view.resolved_path,None);
    }

    #[test]
    fn resource_snapshot_counts_unique_normalized_resources_at_the_limit() {
        let mut frame = resource_frame(vec![],(0..256).map(|id|resource_object(&format!("Assets/meshes/{id:03}.glb#pose=0:1@30"))).collect());
        frame.view_resources.push(resource_object(r"Assets\meshes\000.glb#pose=0:1@30"));
        let (resources,truncated) = collect_frame_resources(&std::env::temp_dir(),&frame,&mut ResourceTextureDimensionCache::new(),&mut Vec::new()); assert!(!truncated); assert_eq!(resources.len(),256);
        assert_eq!(resources.first().unwrap().asset,"Assets/meshes/000.glb#pose=0:1@30"); assert_eq!(resources.last().unwrap().asset,"Assets/meshes/255.glb#pose=0:1@30");
        frame.view_resources.push(resource_object("Assets/meshes/256.glb#pose=0:1@30"));
        let (limited,truncated) = collect_frame_resources(&std::env::temp_dir(),&frame,&mut ResourceTextureDimensionCache::new(),&mut Vec::new()); assert!(truncated); assert_eq!(limited.len(),256);
        assert_eq!(resources.iter().map(|r|&r.asset).collect::<Vec<_>>(),limited.iter().map(|r|&r.asset).collect::<Vec<_>>());
    }

    #[test]
    fn resource_reference_scan_marks_partial_large_frames_and_bounds_retention() {
        let mut frame = resource_frame(vec![resource_object("Assets/repeated.glb");4096], vec![resource_object("Assets/after-budget.glb")]);
        let (resources, truncated) = collect_resource_references(&frame, &mut Vec::new());
        assert!(truncated); assert_eq!(resources.len(), 1); assert_eq!(resources[0].asset, "Assets/repeated.glb");
        frame.objects = (0..4096).rev().map(|id| resource_object(&format!("Assets/{id:04}.glb"))).collect();
        let (resources, truncated) = collect_resource_references(&frame, &mut Vec::new());
        assert!(truncated); assert_eq!(resources.len(), 256); assert_eq!(resources[0].asset, "Assets/0000.glb"); assert_eq!(resources[255].asset, "Assets/0255.glb");
    }

    #[test]
    fn camera_preview_preserves_authored_render_settings() {
        let camera = EditorCameraPreview {
            eye: [3.0, 4.0, 5.0],
            target: [3.0, 4.0, 4.0],
            up: [0.0, 1.0, 0.0],
            orthographic: false,
            orthographic_size: 5.0,
            fov_y_degrees: 35.0,
            near: 0.2,
            far: 500.0,
            clear_flags: "solid_color".into(),
            background_color: [0.8, 0.1, 0.6, 1.0],
            target_display: 2,
        };

        let frame = camera_preview_frame(&camera, 1600, 900);

        assert_eq!(frame.clear_flags, CameraClearFlags::SolidColor);
        assert_eq!(frame.background_color, camera.background_color);
        assert_eq!(frame.frame.position, Vec3::from_array(camera.eye));
        assert_eq!(
            frame.frame.proj,
            perspective(camera.fov_y_degrees, 1600.0 / 900.0, 0.2, 500.0),
        );
    }
}
