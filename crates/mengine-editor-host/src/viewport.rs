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
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;
use winit::dpi::PhysicalSize;

pub struct EditorViewportFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub has_authored_camera: bool,
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
        let size = normalized_size(width, height);
        if self.target.size() != size {
            self.target = self.renderer.create_offscreen_target(size);
        }

        let hierarchy = TransformHierarchy::build(world);
        let now = Instant::now();
        let effect_delta = now
            .duration_since(self.last_effect_frame)
            .as_secs_f32()
            .min(0.25);
        self.last_effect_frame = now;
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
        let button_tints = HashMap::new();
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

        if let Some(effekseer) = self.effekseer.as_mut() {
            for failure in effekseer.append_to_frame(&mut frame) {
                log::warn!(
                    "viewport Effekseer render asset '{}' could not be loaded from {}: {}",
                    failure.asset,
                    failure.path.display(),
                    failure.error
                );
            }
        }

        log_texture_failures(frame.texture_failures.drain(..));
        for failure in self.meshes.sync(&mut self.renderer, &frame.objects) {
            log::warn!(
                "viewport mesh '{}' could not be loaded from {}: {}",
                failure.key,
                failure.path.display(),
                failure.error
            );
        }
        self.fonts.sync(&mut self.renderer);
        for failure in frame.font_failures.drain(..) {
            log::warn!(
                "viewport font '{}' could not be loaded from {}: {}",
                failure.key,
                failure.path.display(),
                failure.error
            );
        }
        log_texture_failures(self.textures.sync(&mut self.renderer, &frame.ui));
        log_texture_failures(
            self.textures
                .sync_ui_materials(&mut self.renderer, &frame.ui),
        );
        log_texture_failures(
            self.textures
                .sync_materials(&mut self.renderer, &frame.objects),
        );
        log_texture_failures(
            self.textures
                .sync_environment(&mut self.renderer, &frame.lighting),
        );

        self.renderer
            .submit_frame_to(&frame.render_frame(), RenderTarget::Offscreen(&self.target))
            .context("could not render the editor viewport")?;
        let rgba = self
            .renderer
            .read_offscreen_rgba8(&self.target)
            .context("could not read the editor viewport")?;
        Ok(EditorViewportFrame {
            width: size.width,
            height: size.height,
            rgba,
            has_authored_camera: frame.has_authored_camera,
        })
    }
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
