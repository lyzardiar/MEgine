//! MEngine PC runtime / sample player.

use anyhow::{bail, Context, Result};
use clap::Parser;
use glam::{Quat, Vec3, Vec4};
use mengine_core::command::WorldCommand;
use mengine_core::generated::{
    AnimatedSprite2D, AnimationPlayer, Animator, AudioSource, Camera2D, Camera3D, DirectionalLight,
    Dropdown, EnvironmentLight, InputField, ListView, MeshRenderer, ParticleEmitter2D,
    ParticleEmitter3D, PbrMaterial, PointLight, ScrollView, Scrollbar, Slider, SpotLight,
    SpriteRenderer, TabView, Tilemap, TimelineDirector, Toggle, Transform,
};
use mengine_core::{Entity, TransformHierarchy, World};
use mengine_physics::{PhysicsWorld, PhysicsWorld2D};
use mengine_platform::InputState;
use mengine_rhi::{
    look_at, orthographic, perspective, validate_surface_shader_hook, DirectionalLightData,
    EnvironmentLightData, FrameCamera, FrameLighting, PointLightData, RenderMaterial, RenderObject,
    Renderer, SpotLightData, UiBatchPlan,
};
use mengine_runtime::animation::{infer_project_root_from_scene, AnimationRuntime};
use mengine_runtime::audio::AudioRuntime;
use mengine_runtime::build_manifest::verify_build_manifest;
use mengine_runtime::lighting2d::apply_2d_lighting;
use mengine_runtime::materials::RuntimeMaterialCache;
use mengine_runtime::meshes::RuntimeMeshCache;
use mengine_runtime::particles::ParticleWorld;
use mengine_runtime::player_config::load_player_config;
use mengine_runtime::prefabs::instantiate_project_prefab;
use mengine_runtime::scenes::{LoadedScene, SceneManager, SceneSelector};
use mengine_runtime::sorting::{sort_world_primitives, SortingLayers};
use mengine_runtime::sprites::collect_world_primitives_with_hierarchy;
use mengine_runtime::textures::RuntimeTextureCache;
use mengine_runtime::timeline::TimelineRuntime;
use mengine_runtime::ui::{
    append_ui_focus_ring, collect_ui_frame_with_hierarchy, next_ui_focus, set_toggle_value,
    UiControlKind, UiControlRegion,
};
use mengine_scene::load_scene;
use mengine_script::{
    ScriptAnimationEvent, ScriptHost, ScriptRuntimeRequest, ScriptTimelineSignal,
};
use serde_json::json;
use std::collections::HashSet;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use winit::application::ApplicationHandler;
use winit::event::{ElementState, Ime, KeyEvent, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::keyboard::{KeyCode as WinitKey, ModifiersState, PhysicalKey};
use winit::window::{Window, WindowId};

#[derive(Parser, Debug)]
#[command(name = "mengine-runtime")]
struct Args {
    #[arg(long, default_value = "spinning-cube")]
    sample: String,

    #[arg(long)]
    script: Option<PathBuf>,

    /// Project directory used to resolve texture keys such as Assets/Textures/icon.png.
    #[arg(long)]
    project_root: Option<PathBuf>,

    /// Scene file to run. Relative paths are resolved from --project-root.
    #[arg(long)]
    scene: Option<PathBuf>,

    /// Override the player window title.
    #[arg(long)]
    title: Option<String>,

    /// Validate the adjacent packaged project without creating a window.
    #[arg(long, hide = true)]
    validate_package: bool,

    #[arg(skip)]
    build_scenes: Vec<PathBuf>,

    #[arg(skip)]
    packaged: bool,
}

struct App {
    args: Args,
    window: Option<Arc<Window>>,
    renderer: Option<Renderer>,
    world: World,
    script: Option<ScriptHost>,
    input: InputState,
    last: Instant,
    cube: Option<mengine_core::Entity>,
    angle: f32,
    cursor: [f32; 2],
    ui_controls: Vec<UiControlRegion>,
    active_slider: Option<Entity>,
    focused_input: Option<Entity>,
    focused_ui: Option<Entity>,
    modifiers: ModifiersState,
    last_ui_draw_calls: u32,
    particles: ParticleWorld,
    sorting_layers: SortingLayers,
    textures: RuntimeTextureCache,
    animations: AnimationRuntime,
    timelines: TimelineRuntime,
    audio: AudioRuntime,
    materials: RuntimeMaterialCache,
    meshes: RuntimeMeshCache,
    physics: PhysicsWorld,
    physics_2d: PhysicsWorld2D,
    scenes: SceneManager,
    loaded_scene: Option<LoadedScene>,
}

impl App {
    fn new(mut args: Args) -> Self {
        if args.project_root.is_none() {
            args.project_root = args.scene.as_deref().and_then(|scene| {
                let absolute = if scene.is_absolute() {
                    scene.to_owned()
                } else {
                    std::env::current_dir().ok()?.join(scene)
                };
                infer_project_root_from_scene(&absolute)
            });
        }
        let textures = RuntimeTextureCache::new(args.project_root.clone());
        let animations = AnimationRuntime::new(args.project_root.clone());
        let timelines = TimelineRuntime::new(args.project_root.clone());
        let audio = AudioRuntime::new(args.project_root.clone());
        let materials = RuntimeMaterialCache::new(args.project_root.clone());
        let meshes = RuntimeMeshCache::new(args.project_root.clone());
        let sorting_layers =
            SortingLayers::load(args.project_root.as_deref()).unwrap_or_else(|error| {
                log::warn!("sorting layer settings rejected; using Default only: {error}");
                SortingLayers::default()
            });
        let scenes = SceneManager::new(
            args.project_root.clone(),
            args.build_scenes.clone(),
            args.packaged,
        );
        Self {
            args,
            window: None,
            renderer: None,
            world: World::new(),
            script: None,
            input: InputState::default(),
            last: Instant::now(),
            cube: None,
            angle: 0.0,
            cursor: [0.0, 0.0],
            ui_controls: Vec::new(),
            active_slider: None,
            focused_input: None,
            focused_ui: None,
            modifiers: ModifiersState::empty(),
            last_ui_draw_calls: u32::MAX,
            particles: ParticleWorld::default(),
            sorting_layers,
            textures,
            animations,
            timelines,
            audio,
            materials,
            meshes,
            physics: PhysicsWorld::default(),
            physics_2d: PhysicsWorld2D::default(),
            scenes,
            loaded_scene: None,
        }
    }

    fn load_requested_scene(&mut self) -> bool {
        let Some(scene) = self.args.scene.as_deref() else {
            return false;
        };
        let scene = scene.to_owned();
        match self.scenes.load_initial(&scene, &mut self.world) {
            Ok(loaded) => {
                log::info!(
                    "loaded scene '{}' from {}",
                    loaded.name,
                    loaded.path.display()
                );
                self.loaded_scene = Some(loaded);
                true
            }
            Err(error) => {
                log::error!("failed to load scene {}: {error}", scene.display());
                false
            }
        }
    }

    fn apply_runtime_request(&mut self, request: ScriptRuntimeRequest) {
        match &request {
            ScriptRuntimeRequest::SetAnimatorParameter {
                entity,
                name,
                value,
            } => {
                let entity = Entity::from_u64(*entity);
                let Some(animator) = self.world.get_component_mut::<Animator>(entity) else {
                    log::warn!(
                        "script tried to set Animator parameter on missing entity {entity:?}"
                    );
                    return;
                };
                let mut parameters =
                    serde_json::from_str::<serde_json::Value>(&animator.parameters_json)
                        .ok()
                        .and_then(|value| value.as_object().cloned())
                        .unwrap_or_default();
                parameters.insert(name.clone(), value.clone());
                animator.parameters_json = serde_json::Value::Object(parameters).to_string();
                return;
            }
            ScriptRuntimeRequest::PlayAnimatorState { entity, state } => {
                let entity = Entity::from_u64(*entity);
                let Some(animator) = self.world.get_component_mut::<Animator>(entity) else {
                    log::warn!("script tried to play Animator state on missing entity {entity:?}");
                    return;
                };
                animator.current_state = state.clone();
                animator.playing = true;
                return;
            }
            ScriptRuntimeRequest::SetAnimatorLayerWeight {
                entity,
                layer,
                weight,
            } => {
                let entity = Entity::from_u64(*entity);
                let Some(animator) = self.world.get_component_mut::<Animator>(entity) else {
                    log::warn!(
                        "script tried to set Animator layer weight on missing entity {entity:?}"
                    );
                    return;
                };
                let mut weights =
                    serde_json::from_str::<serde_json::Value>(&animator.layer_weights_json)
                        .ok()
                        .and_then(|value| value.as_object().cloned())
                        .unwrap_or_default();
                weights.insert(layer.clone(), serde_json::json!(weight.clamp(0.0, 1.0)));
                animator.layer_weights_json = serde_json::Value::Object(weights).to_string();
                return;
            }
            ScriptRuntimeRequest::PlayAnimatorLayerState {
                entity,
                layer,
                state,
            } => {
                let entity = Entity::from_u64(*entity);
                if self.world.get_component::<Animator>(entity).is_none() {
                    log::warn!(
                        "script tried to play Animator layer state on missing entity {entity:?}"
                    );
                    return;
                }
                self.animations
                    .play_animator_layer_state(entity, layer, state);
                return;
            }
            ScriptRuntimeRequest::PlayAnimation { entity, restart } => {
                let entity = Entity::from_u64(*entity);
                if *restart {
                    self.animations.reset_player(entity);
                }
                let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) else {
                    log::warn!("script tried to play AnimationPlayer on missing entity {entity:?}");
                    return;
                };
                if *restart {
                    player.time = 0.0;
                }
                player.playing = true;
                return;
            }
            ScriptRuntimeRequest::PauseAnimation { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) {
                    player.playing = false;
                } else {
                    log::warn!(
                        "script tried to pause AnimationPlayer on missing entity {entity:?}"
                    );
                }
                return;
            }
            ScriptRuntimeRequest::StopAnimation { entity } => {
                let entity = Entity::from_u64(*entity);
                self.animations.reset_player(entity);
                if let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) {
                    player.playing = false;
                    player.time = 0.0;
                } else {
                    log::warn!("script tried to stop AnimationPlayer on missing entity {entity:?}");
                }
                return;
            }
            ScriptRuntimeRequest::SeekAnimation { entity, time } => {
                let entity = Entity::from_u64(*entity);
                if let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) {
                    player.time = *time;
                } else {
                    log::warn!("script tried to seek AnimationPlayer on missing entity {entity:?}");
                }
                return;
            }
            ScriptRuntimeRequest::PlayTimeline { entity, restart } => {
                let entity = Entity::from_u64(*entity);
                if *restart {
                    self.timelines.reset_director(entity);
                }
                let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity)
                else {
                    log::warn!(
                        "script tried to play TimelineDirector on missing entity {entity:?}"
                    );
                    return;
                };
                if *restart {
                    director.time = 0.0;
                }
                director.playing = true;
                return;
            }
            ScriptRuntimeRequest::PauseTimeline { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity) {
                    director.playing = false;
                } else {
                    log::warn!(
                        "script tried to pause TimelineDirector on missing entity {entity:?}"
                    );
                }
                return;
            }
            ScriptRuntimeRequest::StopTimeline { entity } => {
                let entity = Entity::from_u64(*entity);
                self.timelines.reset_director(entity);
                if let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity) {
                    director.playing = false;
                    director.time = 0.0;
                } else {
                    log::warn!(
                        "script tried to stop TimelineDirector on missing entity {entity:?}"
                    );
                }
                return;
            }
            ScriptRuntimeRequest::SeekTimeline { entity, time } => {
                let entity = Entity::from_u64(*entity);
                if let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity) {
                    director.time = *time;
                    self.timelines.reset_director(entity);
                } else {
                    log::warn!(
                        "script tried to seek TimelineDirector on missing entity {entity:?}"
                    );
                }
                return;
            }
            ScriptRuntimeRequest::PlayAudio { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.playing = true;
                } else {
                    log::warn!("script tried to play AudioSource on missing entity {entity:?}");
                }
                return;
            }
            ScriptRuntimeRequest::PauseAudio { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.playing = false;
                } else {
                    log::warn!("script tried to pause AudioSource on missing entity {entity:?}");
                }
                return;
            }
            ScriptRuntimeRequest::StopAudio { entity } => {
                let entity = Entity::from_u64(*entity);
                self.audio.stop_source(entity);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.playing = false;
                    source.time = 0.0;
                } else {
                    log::warn!("script tried to stop AudioSource on missing entity {entity:?}");
                }
                return;
            }
            ScriptRuntimeRequest::SeekAudio { entity, time } => {
                let entity = Entity::from_u64(*entity);
                self.audio.seek_source(entity, *time);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.time = *time;
                } else {
                    log::warn!("script tried to seek AudioSource on missing entity {entity:?}");
                }
                return;
            }
            ScriptRuntimeRequest::InstantiatePrefab { path, parent } => {
                match instantiate_project_prefab(
                    self.args.project_root.as_deref(),
                    path,
                    *parent,
                    &mut self.world,
                ) {
                    Ok(instance) => log::info!(
                        "instantiated prefab '{path}' as entity {} ({} nodes)",
                        instance.root,
                        instance.entities.len()
                    ),
                    Err(error) => log::error!("failed to instantiate prefab '{path}': {error}"),
                }
                return;
            }
            _ => {}
        }
        let selector = match request {
            ScriptRuntimeRequest::LoadSceneByIndex(index) => SceneSelector::Index(index),
            ScriptRuntimeRequest::LoadScene(reference) => SceneSelector::PathOrName(reference),
            ScriptRuntimeRequest::ReloadScene => SceneSelector::Reload,
            ScriptRuntimeRequest::SetAnimatorParameter { .. }
            | ScriptRuntimeRequest::SetAnimatorLayerWeight { .. }
            | ScriptRuntimeRequest::InstantiatePrefab { .. }
            | ScriptRuntimeRequest::PlayAnimatorState { .. }
            | ScriptRuntimeRequest::PlayAnimatorLayerState { .. }
            | ScriptRuntimeRequest::PlayAnimation { .. }
            | ScriptRuntimeRequest::PauseAnimation { .. }
            | ScriptRuntimeRequest::StopAnimation { .. }
            | ScriptRuntimeRequest::SeekAnimation { .. }
            | ScriptRuntimeRequest::PlayTimeline { .. }
            | ScriptRuntimeRequest::PauseTimeline { .. }
            | ScriptRuntimeRequest::StopTimeline { .. }
            | ScriptRuntimeRequest::SeekTimeline { .. }
            | ScriptRuntimeRequest::PlayAudio { .. }
            | ScriptRuntimeRequest::PauseAudio { .. }
            | ScriptRuntimeRequest::StopAudio { .. }
            | ScriptRuntimeRequest::SeekAudio { .. } => unreachable!(),
        };
        match self.scenes.load(selector, &mut self.world) {
            Ok(loaded) => {
                self.args.scene = Some(loaded.path.clone());
                self.cube = None;
                self.angle = 0.0;
                self.ui_controls.clear();
                self.active_slider = None;
                self.focused_input = None;
                self.focused_ui = None;
                self.last_ui_draw_calls = u32::MAX;
                self.particles = ParticleWorld::default();
                self.animations = AnimationRuntime::new(self.args.project_root.clone());
                self.timelines = TimelineRuntime::new(self.args.project_root.clone());
                self.audio.clear();
                self.physics.clear();
                self.physics_2d.clear();
                if let Some(window) = &self.window {
                    window.set_ime_allowed(false);
                }
                if let Some(script) = self.script.as_mut() {
                    let path = loaded.path.to_string_lossy().replace('\\', "/");
                    if let Err(error) = script.notify_scene_loaded(
                        &loaded.name,
                        &path,
                        loaded.build_index,
                        loaded.build_scene_count,
                    ) {
                        log::error!("onSceneLoaded failed: {error}");
                    }
                }
                log::info!(
                    "switched to scene '{}' ({})",
                    loaded.name,
                    loaded.path.display()
                );
                self.loaded_scene = Some(loaded);
            }
            Err(error) => log::error!("scene switch rejected: {error}"),
        }
    }

    fn bootstrap_sample(&mut self) {
        match self.args.sample.as_str() {
            "hello-triangle" | "clear" => {
                self.world.time.clear_color = Vec4::new(0.15, 0.2, 0.35, 1.0);
            }
            "lighting-materials" => self.bootstrap_lighting_materials(),
            _ => {
                // spinning-cube default, also used behind the UI controls sample.
                self.world.commands.push(WorldCommand::Spawn {
                    name: Some("MainCamera".into()),
                    components: json!({
                        "Transform": {
                            "position": [0.0, 2.0, 6.0],
                            "rotation": [-0.122, 0.0, 0.0, 0.9925],
                            "scale": [1.0, 1.0, 1.0]
                        },
                        "Camera3D": {
                            "fov_y_degrees": 60.0,
                            "near": 0.1,
                            "far": 100.0,
                            "primary": true
                        }
                    }),
                });
                self.world.commands.push(WorldCommand::Spawn {
                    name: Some("Directional Light".into()),
                    components: json!({
                        "Transform": {
                            "position": [2.0, 4.0, 1.0],
                            "rotation": [-0.3827, 0.0, 0.0, 0.9239],
                            "scale": [1.0, 1.0, 1.0]
                        },
                        "DirectionalLight": { "color": [1.0, 0.96, 0.9, 1.0], "intensity": 1.25 }
                    }),
                });
                self.world.commands.push(WorldCommand::Spawn {
                    name: Some("Cube".into()),
                    components: json!({
                        "Transform": {
                            "position": [0.0, 0.0, 0.0],
                            "rotation": [0.0, 0.0, 0.0, 1.0],
                            "scale": [1.0, 1.0, 1.0]
                        },
                        "MeshRenderer": {
                            "mesh": "cube",
                            "material": "default"
                        },
                        "PbrMaterial": {
                            "base_color": [0.85, 0.38, 0.12, 1.0],
                            "metallic": 0.15,
                            "roughness": 0.32
                        }
                    }),
                });
                if self.args.sample == "particles" {
                    self.world.commands.push(WorldCommand::Spawn {
                        name: Some("Fire Particles 2D".into()),
                        components: json!({
                            "Transform": {
                                "position": [-1.2, 0.0, 0.0],
                                "rotation": [0.0, 0.0, 0.0, 1.0],
                                "scale": [1.0, 1.0, 1.0]
                            },
                            "ParticleEmitter2D": {
                                "rate_over_time": 80.0,
                                "max_particles": 800,
                                "blend_mode": "additive"
                            }
                        }),
                    });
                    self.world.commands.push(WorldCommand::Spawn {
                        name: Some("Energy Particles 3D".into()),
                        components: json!({
                            "Transform": {
                                "position": [1.2, 0.0, 0.0],
                                "rotation": [0.0, 0.0, 0.0, 1.0],
                                "scale": [1.0, 1.0, 1.0]
                            },
                            "ParticleEmitter3D": {
                                "rate_over_time": 120.0,
                                "max_particles": 1200,
                                "blend_mode": "additive"
                            }
                        }),
                    });
                }
                let spawned = self.world.commit();
                self.cube = spawned.get(2).copied();
                if self.args.sample == "ui-controls" {
                    self.bootstrap_ui_controls();
                }
            }
        }
    }

    fn bootstrap_lighting_materials(&mut self) {
        let entities = [
            (
                "Main Camera",
                json!({
                    "Transform": {
                        "position": [0.0, 3.0, 9.0],
                        "rotation": [-0.14, 0.0, 0.0, 0.9902],
                        "scale": [1.0, 1.0, 1.0]
                    },
                    "Camera3D": {
                        "fov_y_degrees": 52.0, "near": 0.1, "far": 120.0,
                        "primary": true, "projection": "perspective"
                    }
                }),
            ),
            (
                "Sun",
                json!({
                    "Transform": {
                        "position": [0.0, 4.0, 0.0],
                        "rotation": [-0.32, 0.24, 0.08, 0.91],
                        "scale": [1.0, 1.0, 1.0]
                    },
                    "DirectionalLight": { "color": [1.0, 0.93, 0.82, 1.0], "intensity": 1.4 }
                }),
            ),
            (
                "Warm Point Light",
                json!({
                    "Transform": {
                        "position": [-3.0, 2.5, 2.0],
                        "rotation": [0.0, 0.0, 0.0, 1.0],
                        "scale": [1.0, 1.0, 1.0]
                    },
                    "PointLight": { "color": [1.0, 0.35, 0.12, 1.0], "intensity": 7.0, "range": 8.0 }
                }),
            ),
            (
                "Cool Spot Light",
                json!({
                    "Transform": {
                        "position": [3.0, 4.0, 1.0],
                            "rotation": [-std::f32::consts::FRAC_1_SQRT_2, 0.0, 0.0, std::f32::consts::FRAC_1_SQRT_2],
                        "scale": [1.0, 1.0, 1.0]
                    },
                    "SpotLight": {
                        "color": [0.15, 0.45, 1.0, 1.0], "intensity": 12.0, "range": 10.0,
                        "inner_angle_degrees": 28.0, "outer_angle_degrees": 48.0
                    }
                }),
            ),
            (
                "Matte",
                material_cube([-2.2, 0.65, 0.0], [0.65, 0.08, 0.05, 1.0], 0.0, 0.9),
            ),
            (
                "Gold",
                material_cube([0.0, 0.65, 0.0], [1.0, 0.55, 0.08, 1.0], 0.9, 0.22),
            ),
            (
                "Polished Metal",
                material_cube([2.2, 0.65, 0.0], [0.55, 0.68, 0.82, 1.0], 1.0, 0.08),
            ),
            (
                "Floor",
                json!({
                    "Transform": {
                        "position": [0.0, -0.05, 0.0],
                        "rotation": [0.0, 0.0, 0.0, 1.0],
                        "scale": [7.0, 0.1, 4.0]
                    },
                    "MeshRenderer": { "mesh": "cube", "material": "default" },
                    "PbrMaterial": {
                        "base_color": [0.16, 0.18, 0.22, 1.0],
                        "metallic": 0.05, "roughness": 0.82
                    }
                }),
            ),
        ];
        for (name, components) in entities {
            self.world.commands.push(WorldCommand::Spawn {
                name: Some(name.into()),
                components,
            });
        }
        let spawned = self.world.commit();
        self.cube = spawned.get(5).copied();
    }

    fn bootstrap_ui_controls(&mut self) {
        let components = [
            (
                "Canvas",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.0, 0.0], "anchor_max": [1.0, 1.0],
                        "pivot": [0.5, 0.5], "anchored_position": [0.0, 0.0],
                        "size_delta": [0.0, 0.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Canvas": { "render_mode": "ScreenSpaceOverlay", "sorting_order": 0 },
                    "CanvasScaler": {
                        "ui_scale_mode": "ScaleWithScreenSize",
                        "reference_resolution": [1280.0, 720.0],
                        "match_width_or_height": 0.5,
                        "scale_factor": 1.0
                    }
                }),
            ),
            (
                "Runtime UI",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [0.0, -95.0],
                        "size_delta": [320.0, 40.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Text": { "text": "MENGINE UI", "font_size": 24.0, "alignment": "Center" }
                }),
            ),
            (
                "Button",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [0.0, -35.0],
                        "size_delta": [220.0, 42.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Image": { "sprite": "white", "color": [0.2, 0.45, 0.85, 0.95] },
                    "Button": { "label": "BUTTON", "interactable": true }
                }),
            ),
            (
                "Toggle",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [0.0, 25.0],
                        "size_delta": [220.0, 36.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Toggle": { "label": "ENABLE", "is_on": true, "interactable": true }
                }),
            ),
            (
                "Slider",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [0.0, 82.0],
                        "size_delta": [260.0, 28.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Slider": { "min_value": 0.0, "max_value": 100.0, "value": 50.0 }
                }),
            ),
            (
                "Panel",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [-380.0, 0.0],
                        "size_delta": [300.0, 270.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Panel": { "color": [0.075, 0.085, 0.11, 0.96], "border_width": 1.0 }
                }),
            ),
            (
                "Input Field",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [-380.0, -78.0],
                        "size_delta": [250.0, 38.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "InputField": { "placeholder": "Type here...", "character_limit": 32 }
                }),
            ),
            (
                "Dropdown",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [-380.0, -24.0],
                        "size_delta": [250.0, 38.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Dropdown": { "options": ["Windowed", "Borderless", "Fullscreen"] }
                }),
            ),
            (
                "Progress Bar",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [-380.0, 30.0],
                        "size_delta": [250.0, 30.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "ProgressBar": { "min_value": 0.0, "max_value": 100.0, "value": 68.0 }
                }),
            ),
            (
                "List View",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [380.0, -30.0],
                        "size_delta": [280.0, 220.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "ListView": {
                        "items": ["Scene", "Game", "Inspector", "Console", "Profiler", "Assets", "Animation", "Lighting"],
                        "selected_index": 1
                    }
                }),
            ),
            (
                "Tabs",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [380.0, 180.0],
                        "size_delta": [280.0, 110.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "TabView": { "tabs": ["General", "Graphics", "Audio"], "selected_index": 0 }
                }),
            ),
            (
                "Scroll View",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [-380.0, 86.0],
                        "size_delta": [250.0, 58.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "ScrollView": { "vertical": true, "show_scrollbar": true }
                }),
            ),
            (
                "Layout Group",
                json!({
                    "RectTransform": {
                        "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                        "pivot": [0.5, 0.5], "anchored_position": [0.0, 210.0],
                        "size_delta": [330.0, 58.0], "local_rotation": 0.0,
                        "local_scale": [1.0, 1.0]
                    },
                    "Panel": { "color": [0.075, 0.085, 0.11, 0.96] },
                    "LayoutGroup": {
                        "direction": "Horizontal", "padding": [8.0, 8.0, 8.0, 8.0],
                        "spacing": [6.0, 6.0], "cell_size": [98.0, 42.0]
                    }
                }),
            ),
            (
                "Play",
                json!({
                    "RectTransform": { "size_delta": [98.0, 42.0] },
                    "Image": { "color": [0.18, 0.45, 0.28, 1.0] },
                    "Button": { "label": "PLAY" }
                }),
            ),
            (
                "Pause",
                json!({
                    "RectTransform": { "size_delta": [98.0, 42.0] },
                    "Image": { "color": [0.48, 0.37, 0.14, 1.0] },
                    "Button": { "label": "PAUSE" }
                }),
            ),
            (
                "Stop",
                json!({
                    "RectTransform": { "size_delta": [98.0, 42.0] },
                    "Image": { "color": [0.48, 0.18, 0.18, 1.0] },
                    "Button": { "label": "STOP" }
                }),
            ),
        ];
        for (name, value) in components {
            self.world.commands.push(WorldCommand::Spawn {
                name: Some(name.into()),
                components: value,
            });
        }
        let spawned = self.world.commit();
        if let Some(canvas) = spawned.first().copied() {
            // The last three buttons demonstrate automatic child placement by LayoutGroup.
            let layout_index = spawned.len().saturating_sub(4);
            for child in spawned
                .iter()
                .skip(1)
                .take(layout_index.saturating_sub(1))
                .copied()
            {
                self.world.set_parent(child, Some(canvas));
            }
            if let Some(layout) = spawned.get(layout_index).copied() {
                self.world.set_parent(layout, Some(canvas));
                for child in spawned.iter().skip(layout_index + 1).copied() {
                    self.world.set_parent(child, Some(layout));
                }
            }
        }
    }

    fn update_active_slider(&mut self) {
        let Some(entity) = self.active_slider else {
            return;
        };
        let Some(region) = self
            .ui_controls
            .iter()
            .find(|control| control.entity == entity)
            .cloned()
        else {
            return;
        };
        if let Some(value) = region.range_value_at(self.cursor[0], self.cursor[1]) {
            if let Some(slider) = self.world.get_component_mut::<Slider>(entity) {
                slider.value = value;
            } else if let Some(scrollbar) = self.world.get_component_mut::<Scrollbar>(entity) {
                scrollbar.value = value;
            }
        }
    }

    fn press_ui(&mut self) {
        let Some(control) = self
            .ui_controls
            .iter()
            .rev()
            .find(|control| control.contains(self.cursor[0], self.cursor[1]))
            .cloned()
        else {
            return;
        };
        if !matches!(
            control.kind,
            UiControlKind::Blocker | UiControlKind::ScrollView
        ) {
            self.focused_ui = Some(control.entity);
            if !matches!(control.kind, UiControlKind::InputField) {
                self.focused_input = None;
                if let Some(window) = &self.window {
                    window.set_ime_allowed(false);
                }
            }
        }
        match control.kind {
            UiControlKind::Blocker => {}
            UiControlKind::Button => {
                log::info!(
                    "UI Button {:?} clicked: {}",
                    control.entity,
                    control.callback
                );
            }
            UiControlKind::Toggle { is_on } => {
                if set_toggle_value(&mut self.world, control.entity, !is_on) {
                    let value = self
                        .world
                        .get_component::<Toggle>(control.entity)
                        .is_some_and(|toggle| toggle.is_on);
                    log::info!("UI Toggle {:?} = {}", control.entity, value);
                }
            }
            UiControlKind::Slider { .. } => {
                self.active_slider = Some(control.entity);
                self.update_active_slider();
            }
            UiControlKind::Scrollbar { .. } => {
                self.active_slider = Some(control.entity);
                self.update_active_slider();
            }
            UiControlKind::InputField => {
                self.focused_input = Some(control.entity);
                if let Some(window) = &self.window {
                    window.set_ime_allowed(true);
                }
                log::info!("UI InputField {:?} focused", control.entity);
            }
            UiControlKind::Dropdown { option_index } => {
                if let Some(dropdown) = self.world.get_component_mut::<Dropdown>(control.entity) {
                    if let Some(index) = option_index {
                        dropdown.selected_index = index;
                        dropdown.expanded = false;
                        log::info!("UI Dropdown {:?} selected {}", control.entity, index);
                    } else {
                        dropdown.expanded = !dropdown.expanded;
                    }
                }
            }
            UiControlKind::ListItem { index } => {
                if let Some(list) = self.world.get_component_mut::<ListView>(control.entity) {
                    list.selected_index = index;
                    log::info!("UI ListView {:?} selected {}", control.entity, index);
                }
            }
            UiControlKind::ScrollView => {}
            UiControlKind::Tab { index } => {
                if let Some(tab) = self.world.get_component_mut::<TabView>(control.entity) {
                    tab.selected_index = index;
                    log::info!("UI TabView {:?} selected {}", control.entity, index);
                }
            }
        }
    }

    fn move_ui_focus(&mut self, reverse: bool) {
        self.focused_ui = next_ui_focus(&self.ui_controls, self.focused_ui, reverse);
        self.focused_input = None;
        if let Some(window) = &self.window {
            window.set_ime_allowed(false);
        }
    }

    fn activate_focused_ui(&mut self) -> bool {
        let Some(entity) = self.focused_ui else {
            return false;
        };
        if let Some(control) = self.ui_controls.iter().find(|control| {
            control.entity == entity && matches!(control.kind, UiControlKind::Button)
        }) {
            log::info!("UI Button {:?} clicked: {}", entity, control.callback);
            return true;
        }
        if let Some(is_on) = self
            .world
            .get_component::<Toggle>(entity)
            .map(|toggle| toggle.is_on)
        {
            return set_toggle_value(&mut self.world, entity, !is_on);
        }
        if self.world.get_component::<InputField>(entity).is_some() {
            self.focused_input = Some(entity);
            if let Some(window) = &self.window {
                window.set_ime_allowed(true);
            }
            return true;
        }
        if let Some(dropdown) = self.world.get_component_mut::<Dropdown>(entity) {
            dropdown.expanded = !dropdown.expanded;
            return true;
        }
        false
    }

    fn adjust_focused_ui(&mut self, key: WinitKey) -> bool {
        let Some(entity) = self.focused_ui else {
            return false;
        };
        if let Some(slider) = self.world.get_component_mut::<Slider>(entity) {
            let sign = range_navigation_sign(&slider.direction, key);
            if sign == 0.0 {
                return false;
            }
            let low = slider.min_value.min(slider.max_value);
            let high = slider.min_value.max(slider.max_value);
            let step = if slider.whole_numbers {
                1.0
            } else {
                ((high - low) * 0.05).max(0.0001)
            };
            slider.value = (slider.value + sign * step).clamp(low, high);
            if slider.whole_numbers {
                slider.value = slider.value.round();
            }
            return true;
        }
        if let Some(scrollbar) = self.world.get_component_mut::<Scrollbar>(entity) {
            let sign = range_navigation_sign(&scrollbar.direction, key);
            if sign == 0.0 {
                return false;
            }
            let step = if scrollbar.number_of_steps > 1 {
                1.0 / (scrollbar.number_of_steps - 1) as f32
            } else {
                0.1
            };
            scrollbar.value = (scrollbar.value + sign * step).clamp(0.0, 1.0);
            return true;
        }
        let list_delta = match key {
            WinitKey::ArrowUp => -1,
            WinitKey::ArrowDown => 1,
            _ => 0,
        };
        if let Some(dropdown) = self.world.get_component_mut::<Dropdown>(entity) {
            if list_delta == 0 || dropdown.options.is_empty() {
                return false;
            }
            dropdown.selected_index =
                (dropdown.selected_index + list_delta).clamp(0, dropdown.options.len() as i32 - 1);
            return true;
        }
        if let Some(list) = self.world.get_component_mut::<ListView>(entity) {
            if list_delta == 0 || list.items.is_empty() {
                return false;
            }
            let selected = list.selected_index.max(0);
            list.selected_index = (selected + list_delta).clamp(0, list.items.len() as i32 - 1);
            return true;
        }
        let tab_delta = match key {
            WinitKey::ArrowLeft => -1,
            WinitKey::ArrowRight => 1,
            _ => 0,
        };
        if let Some(tabs) = self.world.get_component_mut::<TabView>(entity) {
            if tab_delta == 0 || tabs.tabs.is_empty() {
                return false;
            }
            tabs.selected_index =
                (tabs.selected_index + tab_delta).clamp(0, tabs.tabs.len() as i32 - 1);
            return true;
        }
        false
    }

    fn edit_focused_input(&mut self, text: &str) {
        let Some(entity) = self.focused_input else {
            return;
        };
        let Some(input) = self.world.get_component_mut::<InputField>(entity) else {
            self.focused_input = None;
            return;
        };
        let sanitized;
        let text = if input.multiline {
            text
        } else {
            sanitized = text.replace(['\r', '\n'], "");
            &sanitized
        };
        if text.is_empty() {
            return;
        }
        let remaining = if input.character_limit > 0 {
            input.character_limit as usize
                - input
                    .text
                    .chars()
                    .count()
                    .min(input.character_limit as usize)
        } else {
            usize::MAX
        };
        input.text.extend(text.chars().take(remaining));
    }

    fn backspace_focused_input(&mut self) -> bool {
        let Some(entity) = self.focused_input else {
            return false;
        };
        if let Some(input) = self.world.get_component_mut::<InputField>(entity) {
            input.text.pop();
            true
        } else {
            self.focused_input = None;
            false
        }
    }

    fn submit_focused_input(&mut self) -> bool {
        let Some(entity) = self.focused_input else {
            return false;
        };
        if let Some(input) = self.world.get_component_mut::<InputField>(entity) {
            if input.multiline {
                let within_limit = input.character_limit <= 0
                    || input.text.chars().count() < input.character_limit as usize;
                if within_limit {
                    input.text.push('\n');
                }
                return true;
            }
            log::info!("UI InputField {:?} submitted: {}", entity, input.text);
            self.focused_input = None;
            true
        } else {
            self.focused_input = None;
            false
        }
    }

    fn scroll_ui(&mut self, delta_x: f32, delta_y: f32) -> bool {
        let Some(control) = self
            .ui_controls
            .iter()
            .rev()
            .find(|control| {
                matches!(
                    control.kind,
                    UiControlKind::ScrollView | UiControlKind::ListItem { .. }
                ) && control.contains(self.cursor[0], self.cursor[1])
            })
            .cloned()
        else {
            return false;
        };
        if let Some(scroll) = self.world.get_component_mut::<ScrollView>(control.entity) {
            if scroll.horizontal {
                scroll.normalized_position[0] = (scroll.normalized_position[0]
                    - delta_x * scroll.scroll_sensitivity)
                    .clamp(0.0, 1.0);
            }
            if scroll.vertical {
                scroll.normalized_position[1] = (scroll.normalized_position[1]
                    - delta_y * scroll.scroll_sensitivity)
                    .clamp(0.0, 1.0);
            }
            return true;
        }
        if let Some(list) = self.world.get_component_mut::<ListView>(control.entity) {
            let content_height = list.items.len() as f32 * (list.item_height + list.spacing);
            let max_offset = (content_height - control.rect.height).max(0.0);
            list.scroll_offset =
                (list.scroll_offset - delta_y * list.item_height * 0.5).clamp(0.0, max_offset);
            return true;
        }
        false
    }
}

fn range_navigation_sign(direction: &str, key: WinitKey) -> f32 {
    match (direction, key) {
        ("LeftToRight", WinitKey::ArrowRight)
        | ("RightToLeft", WinitKey::ArrowLeft)
        | ("BottomToTop", WinitKey::ArrowUp)
        | ("TopToBottom", WinitKey::ArrowDown) => 1.0,
        ("LeftToRight", WinitKey::ArrowLeft)
        | ("RightToLeft", WinitKey::ArrowRight)
        | ("BottomToTop", WinitKey::ArrowDown)
        | ("TopToBottom", WinitKey::ArrowUp) => -1.0,
        _ => 0.0,
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_title(self.args.title.as_deref().unwrap_or("MEngine Runtime"))
                        .with_inner_size(winit::dpi::LogicalSize::new(1280, 720)),
                )
                .expect("window"),
        );
        let renderer = pollster::block_on(Renderer::new(window.clone())).expect("renderer");
        self.window = Some(window);
        self.renderer = Some(renderer);
        if !self.load_requested_scene() {
            self.bootstrap_sample();
        }

        let mut script = ScriptHost::new().ok();
        if let Some(ref mut s) = script {
            let default_script = r#"
var t = 0.0;
function onTick(dt, frame) {
  t += dt;
  var r = 0.1 + 0.1 * Math.sin(t);
  var g = 0.1 + 0.05 * Math.cos(t * 0.7);
  engine.setClearColor(r, g, 0.14, 1.0);
}
"#;
            if let Some(path) = &self.args.script {
                let _ = s.load_file(path);
            } else if self.args.scene.is_some() {
                // Project scenes run without the sample fallback script unless explicitly requested.
            } else {
                let mut loaded = false;
                let sample_root = PathBuf::from(format!("samples/{}", self.args.sample));
                let standard_js = sample_root.join("Assets/Scripts/Main.js");
                let legacy_js = sample_root.join("main.js");
                let standard_ts = sample_root.join("Assets/Scripts/Main.ts");
                let legacy_ts = sample_root.join("main.ts");
                let sample_js = if standard_js.exists() {
                    standard_js
                } else {
                    legacy_js
                };
                let sample_ts = if standard_ts.exists() {
                    standard_ts
                } else {
                    legacy_ts
                };
                if sample_js.exists() {
                    loaded = s.load_file(&sample_js).is_ok();
                }
                if !loaded && sample_ts.exists() {
                    log::warn!(
                        "found {}.ts but no compiled .js — run: npm run build:samples",
                        self.args.sample
                    );
                }
                if !loaded {
                    let _ = s.eval(default_script);
                }
            }
            if let Some(loaded) = self.loaded_scene.as_ref() {
                let path = loaded.path.to_string_lossy().replace('\\', "/");
                if let Err(error) = s.notify_scene_loaded(
                    &loaded.name,
                    &path,
                    loaded.build_index,
                    loaded.build_scene_count,
                ) {
                    log::error!("initial onSceneLoaded failed: {error}");
                }
            }
        }
        self.script = script;
        self.last = Instant::now();
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Some(r) = self.renderer.as_mut() {
                    r.resize(size);
                }
            }
            WindowEvent::KeyboardInput {
                event:
                    KeyEvent {
                        physical_key: PhysicalKey::Code(code),
                        state,
                        ..
                    },
                ..
            } => {
                if state == ElementState::Pressed {
                    match code {
                        WinitKey::Tab => {
                            self.move_ui_focus(self.modifiers.shift_key());
                            return;
                        }
                        WinitKey::Backspace if self.backspace_focused_input() => return,
                        WinitKey::Enter | WinitKey::NumpadEnter if self.submit_focused_input() => {
                            if self.focused_input.is_none() {
                                if let Some(window) = &self.window {
                                    window.set_ime_allowed(false);
                                }
                            }
                            return;
                        }
                        WinitKey::Escape if self.focused_input.is_some() => {
                            self.focused_input = None;
                            if let Some(window) = &self.window {
                                window.set_ime_allowed(false);
                            }
                            return;
                        }
                        WinitKey::Enter | WinitKey::NumpadEnter | WinitKey::Space
                            if self.focused_input.is_none() && self.activate_focused_ui() =>
                        {
                            return;
                        }
                        WinitKey::ArrowLeft
                        | WinitKey::ArrowRight
                        | WinitKey::ArrowUp
                        | WinitKey::ArrowDown
                            if self.adjust_focused_ui(code) =>
                        {
                            return;
                        }
                        _ => {}
                    }
                }
                let key = match code {
                    WinitKey::KeyW => mengine_platform::KeyCode::W,
                    WinitKey::KeyA => mengine_platform::KeyCode::A,
                    WinitKey::KeyS => mengine_platform::KeyCode::S,
                    WinitKey::KeyD => mengine_platform::KeyCode::D,
                    WinitKey::Space => mengine_platform::KeyCode::Space,
                    WinitKey::Escape => mengine_platform::KeyCode::Escape,
                    WinitKey::F5 => mengine_platform::KeyCode::F5,
                    _ => mengine_platform::KeyCode::Other,
                };
                match state {
                    ElementState::Pressed => self.input.key_down(key),
                    ElementState::Released => self.input.key_up(key),
                }
                if key == mengine_platform::KeyCode::Escape && state == ElementState::Pressed {
                    event_loop.exit();
                }
            }
            WindowEvent::ModifiersChanged(modifiers) => self.modifiers = modifiers.state(),
            WindowEvent::Ime(Ime::Commit(text)) => self.edit_focused_input(&text),
            WindowEvent::CursorMoved { position, .. } => {
                self.cursor = [position.x as f32, position.y as f32];
                self.update_active_slider();
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let (delta_x, delta_y) = match delta {
                    MouseScrollDelta::LineDelta(x, y) => (x, y),
                    MouseScrollDelta::PixelDelta(position) => {
                        (position.x as f32 / 40.0, position.y as f32 / 40.0)
                    }
                };
                self.scroll_ui(delta_x, delta_y);
            }
            WindowEvent::MouseInput {
                button: MouseButton::Left,
                state: ElementState::Pressed,
                ..
            } => self.press_ui(),
            WindowEvent::MouseInput {
                button: MouseButton::Left,
                state: ElementState::Released,
                ..
            } => self.active_slider = None,
            WindowEvent::RedrawRequested => {
                let now = Instant::now();
                let dt = (now - self.last).as_secs_f32();
                self.last = now;
                self.input.begin_frame(self.world.time.frame);
                let steps = self.world.time.tick(dt);
                let fixed_delta = self.world.time.fixed_delta;
                let mut collision_started = Vec::new();
                let mut collision_stopped = Vec::new();
                let mut trigger_started = Vec::new();
                let mut trigger_stopped = Vec::new();
                let mut collision_started_2d = Vec::new();
                let mut collision_stopped_2d = Vec::new();
                let mut trigger_started_2d = Vec::new();
                let mut trigger_stopped_2d = Vec::new();

                for _ in 0..steps {
                    self.angle += fixed_delta;
                    if let Some(cube) = self.cube {
                        if let Some(t) = self.world.get_component_mut::<Transform>(cube) {
                            let half = self.angle * 0.5;
                            t.rotation = [0.0, half.sin(), 0.0, half.cos()];
                        }
                    }
                    let events = self.physics.step(&mut self.world, fixed_delta);
                    collision_started.extend(
                        events
                            .started
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                    collision_stopped.extend(
                        events
                            .stopped
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                    trigger_started.extend(
                        events
                            .trigger_started
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                    trigger_stopped.extend(
                        events
                            .trigger_stopped
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );

                    let events_2d = self.physics_2d.step(&mut self.world, fixed_delta);
                    collision_started_2d.extend(
                        events_2d
                            .started
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                    collision_stopped_2d.extend(
                        events_2d
                            .stopped
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                    trigger_started_2d.extend(
                        events_2d
                            .trigger_started
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                    trigger_stopped_2d.extend(
                        events_2d
                            .trigger_stopped
                            .into_iter()
                            .map(|pair| (pair.first.to_u64(), pair.second.to_u64())),
                    );
                }

                for failure in self.animations.update(&mut self.world, dt) {
                    log::error!(
                        "Animation runtime {:?} failed to load '{}': {}",
                        failure.entity,
                        failure.clip,
                        failure.error
                    );
                }
                let animation_events = self
                    .animations
                    .take_events()
                    .into_iter()
                    .map(|event| ScriptAnimationEvent {
                        entity: event.entity.to_u64(),
                        function: event.function,
                        time: event.time,
                        parameter: event
                            .parameter
                            .and_then(|parameter| serde_json::to_value(parameter).ok()),
                        state: event.state,
                        weight: event.weight,
                    })
                    .collect::<Vec<_>>();

                for failure in self.timelines.update(&mut self.world, dt) {
                    log::error!(
                        "Timeline runtime {:?} failed to load '{}': {}",
                        failure.entity,
                        failure.asset,
                        failure.error
                    );
                }
                let timeline_signals = self
                    .timelines
                    .take_signals()
                    .into_iter()
                    .map(|signal| ScriptTimelineSignal {
                        entity: signal.entity.to_u64(),
                        track: signal.track,
                        signal: signal.signal,
                        time: signal.time,
                        payload: signal.payload,
                    })
                    .collect::<Vec<_>>();

                for failure in self.audio.update(&mut self.world) {
                    log::error!(
                        "Audio runtime {:?} failed to load '{}': {}",
                        failure.entity,
                        failure.clip,
                        failure.error
                    );
                }

                let runtime_requests = if let Some(script) = self.script.as_mut() {
                    if let Err(error) = script.notify_animation_events(&animation_events) {
                        log::error!("animation event callback failed: {error}");
                    }
                    if let Err(error) = script.notify_timeline_signals(&timeline_signals) {
                        log::error!("timeline signal callback failed: {error}");
                    }
                    if let Err(error) =
                        script.notify_collision_events(&collision_started, &collision_stopped)
                    {
                        log::error!("physics callback failed: {error}");
                    }
                    if let Err(error) =
                        script.notify_trigger_events(&trigger_started, &trigger_stopped)
                    {
                        log::error!("3D trigger callback failed: {error}");
                    }
                    if let Err(error) = script
                        .notify_collision_events_2d(&collision_started_2d, &collision_stopped_2d)
                    {
                        log::error!("2D physics callback failed: {error}");
                    }
                    if let Err(error) =
                        script.notify_trigger_events_2d(&trigger_started_2d, &trigger_stopped_2d)
                    {
                        log::error!("2D trigger callback failed: {error}");
                    }
                    if let Err(error) = script.tick(&mut self.world, dt) {
                        log::error!("script tick failed: {error}");
                    }
                    script.take_runtime_requests()
                } else {
                    Vec::new()
                };
                for request in runtime_requests {
                    self.apply_runtime_request(request);
                }

                if let Some(r) = self.renderer.as_mut() {
                    let hierarchy = TransformHierarchy::build(&self.world);
                    let aspect = r.aspect();
                    let active_camera = find_camera(&self.world, &hierarchy, aspect);
                    let camera = active_camera.frame;
                    let objects = collect_objects(&self.world, &hierarchy, &mut self.materials);
                    for failure in self.meshes.sync(r, &objects) {
                        log::warn!(
                            "Mesh '{}' could not be loaded from {}: {}",
                            failure.key,
                            failure.path.display(),
                            failure.error
                        );
                    }
                    let mut lighting = collect_lighting(&self.world, &hierarchy);
                    r.clear = resolve_camera_background(
                        &active_camera,
                        self.world.time.clear_color,
                        &mut lighting,
                    )
                    .into();
                    let window_size = self
                        .window
                        .as_ref()
                        .map(|window| window.inner_size())
                        .unwrap_or(winit::dpi::PhysicalSize::new(1, 1));
                    let mut ui = collect_ui_frame_with_hierarchy(
                        &self.world,
                        &hierarchy,
                        window_size.width,
                        window_size.height,
                    );
                    append_ui_focus_ring(&mut ui.plan, &ui.controls, self.focused_ui);
                    let mut world_primitives = collect_world_primitives_with_hierarchy(
                        &self.world,
                        &hierarchy,
                        camera,
                        [window_size.width, window_size.height],
                    );
                    let particle_primitives =
                        self.particles.update_and_collect_world_with_hierarchy(
                            &self.world,
                            &hierarchy,
                            camera,
                            [window_size.width, window_size.height],
                            dt,
                        );
                    world_primitives.extend(particle_primitives);
                    apply_2d_lighting(&self.world, &hierarchy, &mut world_primitives);
                    if !world_primitives.is_empty() {
                        sort_world_primitives(&mut world_primitives, &self.sorting_layers);
                        let mut primitives = world_primitives
                            .into_iter()
                            .map(|value| value.primitive)
                            .collect::<Vec<_>>();
                        primitives.extend(std::mem::take(&mut ui.plan.primitives));
                        ui.plan = UiBatchPlan::build(primitives);
                    }
                    for failure in self
                        .textures
                        .resolve_sprite_regions(&mut ui.plan.primitives)
                    {
                        log::warn!(
                            "Sprite '{}' could not be resolved from {}: {}",
                            failure.key,
                            failure.path.display(),
                            failure.error
                        );
                    }
                    ui.plan = UiBatchPlan::build(std::mem::take(&mut ui.plan.primitives));
                    for failure in self.textures.sync(r, &ui.plan) {
                        log::warn!(
                            "UI texture '{}' could not be loaded from {}: {}",
                            failure.key,
                            failure.path.display(),
                            failure.error
                        );
                    }
                    for failure in self.textures.sync_materials(r, &objects) {
                        log::warn!(
                            "Material texture '{}' could not be loaded from {}: {}",
                            failure.key,
                            failure.path.display(),
                            failure.error
                        );
                    }
                    for failure in self.textures.sync_environment(r, &lighting) {
                        log::warn!(
                            "Environment texture '{}' could not be loaded from {}: {}",
                            failure.key,
                            failure.path.display(),
                            failure.error
                        );
                    }
                    self.ui_controls = ui.controls;
                    if let Err(e) = r.render_lit_frame(camera, &objects, &lighting, Some(&ui.plan))
                    {
                        log::warn!("render: {e}");
                    }
                    let stats = r.ui_stats();
                    if stats.draw_calls != self.last_ui_draw_calls {
                        log::info!(
                            "UI batch stats: primitives={}, batches={}, draw_calls={}",
                            stats.primitives,
                            stats.batches,
                            stats.draw_calls
                        );
                        self.last_ui_draw_calls = stats.draw_calls;
                    }
                }

                if let Some(w) = &self.window {
                    w.request_redraw();
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        event_loop.set_control_flow(ControlFlow::Poll);
        if let Some(w) = &self.window {
            w.request_redraw();
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CameraClearFlags {
    Scene,
    Skybox,
    SolidColor,
}

#[derive(Clone, Copy, Debug)]
struct ActiveFrameCamera {
    frame: FrameCamera,
    clear_flags: CameraClearFlags,
    background_color: [f32; 4],
}

fn find_camera(
    world: &World,
    hierarchy: &TransformHierarchy,
    viewport_aspect: f32,
) -> ActiveFrameCamera {
    for e in world.iter_entities() {
        if let (Some(t), Some(c)) = (hierarchy.get(e), world.get_component::<Camera2D>(e)) {
            if c.primary {
                return ActiveFrameCamera {
                    frame: camera2d_from_components(&t.to_transform(), c, viewport_aspect),
                    clear_flags: parse_camera_clear_flags(&c.clear_flags),
                    background_color: c.background_color,
                };
            }
        }
    }
    for e in world.iter_entities() {
        if let (Some(t), Some(c)) = (hierarchy.get(e), world.get_component::<Camera3D>(e)) {
            if c.primary {
                return ActiveFrameCamera {
                    frame: camera_from_components(&t.to_transform(), c, viewport_aspect),
                    clear_flags: parse_camera_clear_flags(&c.clear_flags),
                    background_color: c.background_color,
                };
            }
        }
    }
    let position = Vec3::new(0.0, 1.5, 4.0);
    ActiveFrameCamera {
        frame: FrameCamera {
            view: look_at(position, Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, viewport_aspect.max(0.001), 0.1, 100.0),
            position,
        },
        clear_flags: CameraClearFlags::Scene,
        background_color: [0.1, 0.1, 0.14, 1.0],
    }
}

fn parse_camera_clear_flags(value: &str) -> CameraClearFlags {
    match value.trim().to_ascii_lowercase().as_str() {
        "skybox" => CameraClearFlags::Skybox,
        "solid_color" | "solidcolor" | "solid" => CameraClearFlags::SolidColor,
        _ => CameraClearFlags::Scene,
    }
}

fn resolve_camera_background(
    camera: &ActiveFrameCamera,
    scene_clear: Vec4,
    lighting: &mut FrameLighting,
) -> Vec4 {
    match camera.clear_flags {
        CameraClearFlags::Scene => scene_clear,
        CameraClearFlags::Skybox => {
            lighting.environment.background_enabled = true;
            scene_clear
        }
        CameraClearFlags::SolidColor => {
            lighting.environment.background_enabled = false;
            let channel = |value: f32, fallback: f32, maximum: f32| {
                if value.is_finite() {
                    value.clamp(0.0, maximum)
                } else {
                    fallback
                }
            };
            Vec4::new(
                channel(camera.background_color[0], 0.1, 1.0),
                channel(camera.background_color[1], 0.1, 1.0),
                channel(camera.background_color[2], 0.14, 1.0),
                channel(camera.background_color[3], 1.0, 1.0),
            )
        }
    }
}

fn camera2d_from_components(t: &Transform, c: &Camera2D, viewport_aspect: f32) -> FrameCamera {
    let position = Vec3::from(t.position);
    let rotation = safe_rotation(t.rotation);
    let forward = rotation * -Vec3::Z;
    let up = rotation * Vec3::Y;
    FrameCamera {
        view: look_at(position, position + forward, up),
        proj: orthographic(c.size.max(0.001), viewport_aspect.max(0.001), 0.01, 1000.0),
        position,
    }
}

fn camera_from_components(t: &Transform, c: &Camera3D, viewport_aspect: f32) -> FrameCamera {
    let position = Vec3::from(t.position);
    let rotation = safe_rotation(t.rotation);
    let forward = rotation * -Vec3::Z;
    let up = rotation * Vec3::Y;
    let near = c.near.max(0.001);
    let far = c.far.max(near + 0.001);
    let aspect = viewport_aspect.max(0.001);
    let proj = if c.projection.eq_ignore_ascii_case("orthographic") {
        orthographic(c.orthographic_size.max(0.001), aspect, near, far)
    } else {
        perspective(c.fov_y_degrees.clamp(1.0, 179.0), aspect, near, far)
    };
    FrameCamera {
        view: look_at(position, position + forward, up),
        proj,
        position,
    }
}

fn collect_objects(
    world: &World,
    hierarchy: &TransformHierarchy,
    materials: &mut RuntimeMaterialCache,
) -> Vec<RenderObject> {
    let mut out = Vec::new();
    for e in world.iter_entities() {
        if let (Some(t), Some(m)) = (hierarchy.get(e), world.get_component::<MeshRenderer>(e)) {
            out.push(RenderObject {
                mesh_key: m.mesh.trim().replace('\\', "/"),
                model: t.matrix,
                cast_shadows: m.cast_shadows,
                receive_shadows: m.receive_shadows,
                material: world
                    .get_component::<PbrMaterial>(e)
                    .map(render_material_from_component)
                    .unwrap_or_else(|| {
                        materials
                            .resolve(&m.material)
                            .unwrap_or_else(|| material_preset(&m.material))
                    }),
            });
        }
    }
    out
}

fn collect_lighting(world: &World, hierarchy: &TransformHierarchy) -> FrameLighting {
    let mut frame = FrameLighting {
        environment: EnvironmentLightData::default(),
        directional: None,
        points: Vec::new(),
        spots: Vec::new(),
    };
    let mut environment_found = false;
    for entity in world.iter_entities() {
        let Some(transform) = hierarchy.get(entity) else {
            continue;
        };
        if !environment_found {
            if let Some(environment) = world.get_component::<EnvironmentLight>(entity) {
                frame.environment = EnvironmentLightData {
                    sky_color: [
                        environment.sky_color[0],
                        environment.sky_color[1],
                        environment.sky_color[2],
                    ],
                    equator_color: [
                        environment.equator_color[0],
                        environment.equator_color[1],
                        environment.equator_color[2],
                    ],
                    ground_color: [
                        environment.ground_color[0],
                        environment.ground_color[1],
                        environment.ground_color[2],
                    ],
                    diffuse_intensity: environment.diffuse_intensity,
                    specular_intensity: environment.specular_intensity,
                    texture: environment.texture.trim().replace('\\', "/"),
                    rotation_degrees: environment.rotation_degrees,
                    background_enabled: environment.background_enabled,
                    background_intensity: environment.background_intensity,
                    exposure: environment.exposure,
                };
                environment_found = true;
            }
        }
        let rotation = transform.rotation;
        let direction = rotation * -Vec3::Z;
        if frame.directional.is_none() {
            if let Some(light) = world.get_component::<DirectionalLight>(entity) {
                frame.directional = Some(DirectionalLightData {
                    direction,
                    color: [light.color[0], light.color[1], light.color[2]],
                    intensity: light.intensity,
                    cast_shadows: light.cast_shadows,
                    shadow_strength: light.shadow_strength,
                    shadow_bias: light.shadow_bias,
                    shadow_normal_bias: light.shadow_normal_bias,
                    shadow_distance: light.shadow_distance,
                });
            }
        }
        if let Some(light) = world.get_component::<PointLight>(entity) {
            frame.points.push(PointLightData {
                position: transform.position,
                color: [light.color[0], light.color[1], light.color[2]],
                intensity: light.intensity,
                range: light.range,
            });
        }
        if let Some(light) = world.get_component::<SpotLight>(entity) {
            frame.spots.push(SpotLightData {
                position: transform.position,
                direction,
                color: [light.color[0], light.color[1], light.color[2]],
                intensity: light.intensity,
                range: light.range,
                inner_angle_degrees: light.inner_angle_degrees,
                outer_angle_degrees: light.outer_angle_degrees,
            });
        }
    }
    frame
}

fn render_material_from_component(material: &PbrMaterial) -> RenderMaterial {
    RenderMaterial {
        base_color: material.base_color,
        metallic: material.metallic,
        roughness: material.roughness,
        emissive: material.emissive,
        emissive_strength: material.emissive_strength,
        unlit: material.unlit,
        double_sided: material.double_sided,
        ..Default::default()
    }
}

fn material_preset(name: &str) -> RenderMaterial {
    match name.to_ascii_lowercase().as_str() {
        "gold" => RenderMaterial {
            base_color: [1.0, 0.55, 0.08, 1.0],
            metallic: 0.9,
            roughness: 0.22,
            ..Default::default()
        },
        "chrome" | "metal" => RenderMaterial {
            base_color: [0.62, 0.7, 0.82, 1.0],
            metallic: 1.0,
            roughness: 0.1,
            ..Default::default()
        },
        "unlit" => RenderMaterial {
            base_color: [0.25, 0.7, 1.0, 1.0],
            unlit: true,
            ..Default::default()
        },
        _ => RenderMaterial::default(),
    }
}

fn material_cube(
    position: [f32; 3],
    base_color: [f32; 4],
    metallic: f32,
    roughness: f32,
) -> serde_json::Value {
    json!({
        "Transform": {
            "position": position, "rotation": [0.0, 0.0, 0.0, 1.0], "scale": [1.3, 1.3, 1.3]
        },
        "MeshRenderer": { "mesh": "cube", "material": "default" },
        "PbrMaterial": {
            "base_color": base_color, "metallic": metallic, "roughness": roughness
        }
    })
}

fn safe_rotation(value: [f32; 4]) -> Quat {
    let rotation = Quat::from_array(value);
    if rotation.is_finite() && rotation.length_squared() > 0.000001 {
        rotation.normalize()
    } else {
        Quat::IDENTITY
    }
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let mut args = Args::parse();
    if args.scene.is_none() {
        match std::env::current_exe() {
            Ok(executable) => match load_player_config(executable) {
                Ok(Some(config)) => {
                    log::info!(
                        "starting packaged project '{}' from {}",
                        config.project_name,
                        config.project_root.display()
                    );
                    args.project_root.get_or_insert(config.project_root);
                    args.scene = Some(config.main_scene);
                    args.build_scenes = config.build_scenes;
                    args.packaged = true;
                    if args.script.is_none() {
                        args.script = config.startup_script;
                    }
                    args.title.get_or_insert(config.project_name);
                }
                Ok(None) => {}
                Err(error) => log::warn!("ignoring invalid packaged player config: {error}"),
            },
            Err(error) => {
                log::warn!("cannot locate packaged player config: {error}");
            }
        }
    }
    if args.validate_package {
        let build_root = args
            .project_root
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("packaged player project root was not resolved"))?;
        let integrity = verify_build_manifest(build_root)?;
        let Some(scene) = args.scene.as_deref() else {
            bail!("no packaged player config or scene was found");
        };
        let scenes = if args.build_scenes.is_empty() {
            vec![scene.to_owned()]
        } else {
            args.build_scenes.clone()
        };
        let mut validated = Vec::with_capacity(scenes.len());
        let mut validated_assets = HashSet::new();
        for scene in scenes {
            let path = if scene.is_absolute() {
                scene
            } else if let Some(project_root) = args.project_root.as_deref() {
                project_root.join(scene)
            } else {
                scene
            };
            let mut world = World::new();
            let loaded = load_scene(&path, &mut world)?;
            if let Some(project_root) = args.project_root.as_deref() {
                validate_world_assets(&world, project_root, &mut validated_assets)?;
            }
            validated.push((loaded.name, path, world.iter_entities().count()));
        }
        if let Some(script) = args.script.as_deref() {
            let mut host = ScriptHost::new()?;
            host.load_file(script)?;
        }
        println!(
            "validated {} packaged file(s) ({} bytes), {} scene(s), {} runtime asset(s), script={}",
            integrity.file_count,
            integrity.byte_count,
            validated.len(),
            validated_assets.len(),
            args.script.is_some()
        );
        for (name, path, entities) in validated {
            println!(
                "  '{}' from {} ({} entities)",
                name,
                path.display(),
                entities
            );
        }
        return Ok(());
    }
    let event_loop = EventLoop::new()?;
    let mut app = App::new(args);
    event_loop.run_app(&mut app)?;
    Ok(())
}

fn validate_world_assets(
    world: &World,
    project_root: &Path,
    validated: &mut HashSet<PathBuf>,
) -> Result<()> {
    let resolve = |reference: &str, kind: &str| -> Result<PathBuf> {
        mengine_runtime::textures::resolve_project_asset_path(project_root, reference)
            .with_context(|| format!("unsafe {kind} path: {reference}"))
    };
    for entity in world.iter_entities() {
        if let Some(renderer) = world.get_component::<MeshRenderer>(entity) {
            let mesh = renderer.mesh.trim();
            if mesh.to_ascii_lowercase().ends_with(".gltf")
                || mesh.to_ascii_lowercase().ends_with(".glb")
            {
                let path = resolve(mesh, "model")?;
                if validated.insert(path.clone()) {
                    mengine_assets::load_gltf_mesh_data(&path)
                        .with_context(|| format!("invalid model {}", path.display()))?;
                }
            }
            let material = renderer.material.trim();
            if material.to_ascii_lowercase().ends_with(".mmat")
                || material.to_ascii_lowercase().ends_with(".mat")
            {
                let path = resolve(material, "material")?;
                if validated.insert(path.clone()) {
                    let asset = mengine_assets::load_material_asset(&path)
                        .with_context(|| format!("invalid material {}", path.display()))?;
                    if asset.shader == mengine_assets::MaterialShader::Custom {
                        let shader = asset.custom_shader.trim();
                        if shader.is_empty() {
                            bail!(
                                "invalid material {}: custom material requires a .mshader asset",
                                path.display()
                            );
                        }
                        if !shader.to_ascii_lowercase().ends_with(".mshader") {
                            bail!(
                                "invalid material {}: custom shader path must end with .mshader",
                                path.display()
                            );
                        }
                        let shader_path = resolve(shader, "material surface shader")?;
                        if validated.insert(shader_path.clone()) {
                            let source = mengine_assets::load_surface_shader(&shader_path)
                                .with_context(|| {
                                    format!(
                                        "invalid material surface shader {}",
                                        shader_path.display()
                                    )
                                })?;
                            validate_surface_shader_hook(&source).map_err(|error| {
                                anyhow::anyhow!(
                                    "invalid material surface shader {}: {error}",
                                    shader_path.display()
                                )
                            })?;
                        }
                    }
                    for texture in [
                        asset.base_color_texture,
                        asset.normal_texture,
                        asset.metallic_roughness_texture,
                        asset.occlusion_texture,
                        asset.emissive_texture,
                    ] {
                        if texture.is_empty() {
                            continue;
                        }
                        let texture_path = resolve(&texture, "material texture")?;
                        if validated.insert(texture_path.clone()) {
                            mengine_assets::load_texture_rgba8(&texture_path).with_context(
                                || format!("invalid material texture {}", texture_path.display()),
                            )?;
                        }
                    }
                }
            }
        }
        if let Some(environment) = world.get_component::<EnvironmentLight>(entity) {
            let texture = environment.texture.trim();
            if texture.contains('#') {
                bail!("environment texture cannot reference a sprite subresource: {texture}");
            }
            validate_environment_texture_asset(texture, project_root, validated)?;
        }
        if let Some(renderer) = world.get_component::<SpriteRenderer>(entity) {
            validate_texture_asset(&renderer.sprite, "sprite", project_root, validated)?;
        }
        if let Some(renderer) = world.get_component::<AnimatedSprite2D>(entity) {
            for frame in &renderer.frames {
                validate_texture_asset(frame, "animated sprite frame", project_root, validated)?;
            }
        }
        if let Some(tilemap) = world.get_component::<Tilemap>(entity) {
            for sprite in tilemap.sprites.iter().take(tilemap.cells.len()) {
                validate_texture_asset(sprite, "tile sprite", project_root, validated)?;
            }
        }
        if let Some(emitter) = world.get_component::<ParticleEmitter2D>(entity) {
            validate_texture_asset(
                &emitter.texture,
                "2D particle texture",
                project_root,
                validated,
            )?;
        }
        if let Some(emitter) = world.get_component::<ParticleEmitter3D>(entity) {
            validate_texture_asset(
                &emitter.texture,
                "3D particle texture",
                project_root,
                validated,
            )?;
        }
        if let Some(player) = world.get_component::<AnimationPlayer>(entity) {
            validate_animation_clip_asset(&player.clip, project_root, validated)?;
        }
        if let Some(animator) = world.get_component::<Animator>(entity) {
            let reference = animator.controller.trim();
            if !reference.is_empty() {
                let path = resolve(reference, "animator controller")?;
                if validated.insert(path.clone()) {
                    let controller =
                        mengine_assets::load_animator_controller(&path).with_context(|| {
                            format!("invalid animator controller {}", path.display())
                        })?;
                    for state in &controller.states {
                        validate_animation_clip_asset(&state.clip, project_root, validated)?;
                    }
                    for layer in &controller.layers {
                        if !layer.avatar_mask.is_empty() {
                            let mask_path = resolve(&layer.avatar_mask, "Avatar Mask")?;
                            if validated.insert(mask_path.clone()) {
                                mengine_assets::load_avatar_mask(&mask_path).with_context(
                                    || format!("invalid Avatar Mask {}", mask_path.display()),
                                )?;
                            }
                        }
                        for motion in &layer.motions {
                            validate_animation_clip_asset(&motion.clip, project_root, validated)?;
                        }
                        for state in &layer.states {
                            validate_animation_clip_asset(&state.clip, project_root, validated)?;
                        }
                    }
                }
            }
        }
        if let Some(source) = world.get_component::<AudioSource>(entity) {
            let _ = validate_audio_clip_asset(&source.clip, project_root, validated)?;
        }
        if let Some(director) = world.get_component::<TimelineDirector>(entity) {
            let reference = director.asset.trim();
            if !reference.is_empty() {
                let path = resolve(reference, "Timeline asset")?;
                if validated.insert(path.clone()) {
                    let timeline = mengine_assets::load_timeline_asset(&path)
                        .with_context(|| format!("invalid Timeline asset {}", path.display()))?;
                    for track in &timeline.tracks {
                        if let mengine_assets::TimelineTrack::Audio { clips, .. } = track {
                            for clip in clips {
                                let duration = validate_audio_clip_asset(
                                    &clip.clip,
                                    project_root,
                                    validated,
                                )?
                                .expect("Timeline audio clip paths are non-empty after validation");
                                if clip.clip_in as f64 >= duration {
                                    bail!(
                                        "Timeline audio clip '{}' starts at {:.3}s, outside its {:.3}s decoded duration",
                                        clip.clip,
                                        clip.clip_in,
                                        duration
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn validate_audio_clip_asset(
    reference: &str,
    project_root: &Path,
    validated: &mut HashSet<PathBuf>,
) -> Result<Option<f64>> {
    let reference = reference.trim();
    if reference.is_empty() {
        return Ok(None);
    }
    let path = mengine_runtime::textures::resolve_project_asset_path(project_root, reference)
        .with_context(|| format!("unsafe audio clip path: {reference}"))?;
    let duration = mengine_audio::validate_audio_clip(&path)
        .with_context(|| format!("invalid audio clip {}", path.display()))?;
    validated.insert(path);
    Ok(Some(duration))
}

fn validate_texture_asset(
    reference: &str,
    kind: &str,
    project_root: &Path,
    validated: &mut HashSet<PathBuf>,
) -> Result<()> {
    let reference = reference.trim();
    if reference.is_empty() || reference.eq_ignore_ascii_case("white") {
        return Ok(());
    }
    let (texture_reference, slice) = mengine_assets::split_sprite_reference(reference);
    let path =
        mengine_runtime::textures::resolve_project_asset_path(project_root, texture_reference)
            .with_context(|| format!("unsafe {kind} path: {reference}"))?;
    if validated.insert(path.clone()) {
        mengine_assets::load_texture_rgba8(&path)
            .with_context(|| format!("invalid {kind} {}", path.display()))?;
    }
    if let Some(slice) = slice {
        let dimensions = mengine_assets::texture_dimensions(&path)
            .with_context(|| format!("invalid {kind} {}", path.display()))?;
        let import_path = mengine_assets::sprite_import_path(&path);
        let import = mengine_assets::load_sprite_import(&path, dimensions)
            .with_context(|| format!("invalid sprite import {}", import_path.display()))?;
        validated.insert(import_path.clone());
        if import.resolve(slice, dimensions).is_none() {
            bail!(
                "missing sprite slice '{slice}' for {kind} in {}",
                import_path.display()
            );
        }
    }
    Ok(())
}

fn validate_environment_texture_asset(
    reference: &str,
    project_root: &Path,
    validated: &mut HashSet<PathBuf>,
) -> Result<()> {
    let reference = reference.trim();
    if reference.is_empty() {
        return Ok(());
    }
    let path = mengine_runtime::textures::resolve_project_asset_path(project_root, reference)
        .with_context(|| format!("unsafe environment texture path: {reference}"))?;
    if validated.insert(path.clone()) {
        mengine_assets::load_environment_texture(&path)
            .with_context(|| format!("invalid environment texture {}", path.display()))?;
    }
    Ok(())
}

fn validate_animation_clip_asset(
    reference: &str,
    project_root: &Path,
    validated: &mut HashSet<PathBuf>,
) -> Result<()> {
    if reference.trim().is_empty() {
        return Ok(());
    }
    let path = mengine_runtime::textures::resolve_project_asset_path(project_root, reference)
        .with_context(|| format!("unsafe animation clip path: {reference}"))?;
    if validated.insert(path.clone()) {
        mengine_assets::load_animation_clip(&path)
            .with_context(|| format!("invalid animation clip {}", path.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_project_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "mengine-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn write_test_wav(path: &Path) {
        let mut wav = b"RIFF".to_vec();
        wav.extend_from_slice(&40u32.to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&8_000u32.to_le_bytes());
        wav.extend_from_slice(&16_000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&4u32.to_le_bytes());
        wav.extend_from_slice(&0i16.to_le_bytes());
        wav.extend_from_slice(&1_000i16.to_le_bytes());
        std::fs::write(path, wav).unwrap();
    }

    fn world_with_material(reference: &str) -> World {
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Material validation".into()),
            components: json!({
                "MeshRenderer": { "mesh": "cube", "material": reference }
            }),
        });
        world.commit();
        world
    }

    #[test]
    fn camera_uses_transform_rotation_and_orthographic_projection() {
        let transform = Transform {
            position: [1.0, 2.0, 3.0],
            rotation: [-0.70710677, 0.0, 0.0, 0.70710677],
            scale: [1.0; 3],
        };
        let camera = Camera3D {
            projection: "orthographic".into(),
            orthographic_size: 3.0,
            near: 0.2,
            far: 40.0,
            ..Default::default()
        };
        let frame = camera_from_components(&transform, &camera, 2.0);
        let forward = safe_rotation(transform.rotation) * -Vec3::Z;
        let view_forward = frame.view.transform_vector3(forward);
        assert!((view_forward.z + 1.0).abs() < 0.0001);
        assert!((frame.proj.x_axis.x - (1.0 / 6.0)).abs() < 0.0001);
        assert_eq!(frame.position, Vec3::new(1.0, 2.0, 3.0));
    }

    #[test]
    fn primary_2d_camera_wins_and_uses_orthographic_size() {
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Main Camera".into()),
            components: json!({
                "Transform": { "position": [0, 0, 4], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
                "Camera3D": { "primary": true, "projection": "perspective" }
            }),
        });
        world.commands.push(WorldCommand::Spawn {
            name: Some("Camera 2D".into()),
            components: json!({
                "Transform": { "position": [2, 3, 10], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
                "Camera2D": { "size": 4, "primary": true }
            }),
        });
        world.commit();

        let hierarchy = TransformHierarchy::build(&world);
        let active_camera = find_camera(&world, &hierarchy, 2.0);
        assert_eq!(active_camera.clear_flags, CameraClearFlags::Scene);
        let frame = active_camera.frame;
        assert_eq!(frame.position, Vec3::new(2.0, 3.0, 10.0));
        assert!((frame.proj.x_axis.x - 0.125).abs() < 0.0001);
        assert!((frame.proj.y_axis.y - 0.25).abs() < 0.0001);
    }

    #[test]
    fn camera_clear_flags_control_environment_and_sanitize_solid_color() {
        let frame = FrameCamera {
            view: glam::Mat4::IDENTITY,
            proj: glam::Mat4::IDENTITY,
            position: Vec3::ZERO,
        };
        let scene_clear = Vec4::new(0.2, 0.3, 0.4, 1.0);
        let mut lighting = FrameLighting::default();
        lighting.environment.background_enabled = true;
        let solid = ActiveFrameCamera {
            frame,
            clear_flags: CameraClearFlags::SolidColor,
            background_color: [f32::NAN, 2.0, -3.0, 5.0],
        };
        let clear = resolve_camera_background(&solid, scene_clear, &mut lighting);
        assert_eq!(clear, Vec4::new(0.1, 1.0, 0.0, 1.0));
        assert!(!lighting.environment.background_enabled);

        let skybox = ActiveFrameCamera {
            clear_flags: CameraClearFlags::Skybox,
            ..solid
        };
        let clear = resolve_camera_background(&skybox, scene_clear, &mut lighting);
        assert_eq!(clear, scene_clear);
        assert!(lighting.environment.background_enabled);
        assert_eq!(parse_camera_clear_flags("unknown"), CameraClearFlags::Scene);
    }

    #[test]
    fn material_component_overrides_named_preset() {
        let component = PbrMaterial {
            base_color: [0.2, 0.3, 0.4, 1.0],
            metallic: 0.7,
            roughness: 0.25,
            emissive: [0.1, 0.0, 0.2],
            emissive_strength: 3.0,
            unlit: true,
            double_sided: true,
        };
        let material = render_material_from_component(&component);
        assert_eq!(material.base_color, component.base_color);
        assert_eq!(material.metallic, 0.7);
        assert!(material.unlit && material.double_sided);
    }

    #[test]
    fn packaged_asset_validation_rejects_unsafe_model_references() {
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Unsafe model".into()),
            components: json!({
                "MeshRenderer": { "mesh": "../outside.gltf", "material": "default" }
            }),
        });
        world.commit();
        let error =
            validate_world_assets(&world, Path::new("C:/Games/Packaged"), &mut HashSet::new())
                .expect_err("parent traversal must not reach outside packaged content");
        assert!(error.to_string().contains("unsafe model path"));
    }

    #[test]
    fn packaged_asset_validation_rejects_unsafe_environment_textures() {
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Unsafe environment".into()),
            components: json!({
                "EnvironmentLight": { "texture": "../outside.png" }
            }),
        });
        world.commit();
        let error =
            validate_world_assets(&world, Path::new("C:/Games/Packaged"), &mut HashSet::new())
                .expect_err("environment paths must stay inside packaged content");
        assert!(error
            .to_string()
            .contains("unsafe environment texture path"));
    }

    #[test]
    fn packaged_asset_validation_includes_custom_material_surface_shaders() {
        let root = temporary_project_root("packaged-custom-material");
        let material_path = root.join("Assets/Materials/Rim.mmat");
        let shader_path = root.join("Assets/Shaders/Rim.mshader");
        std::fs::create_dir_all(material_path.parent().unwrap()).unwrap();
        std::fs::create_dir_all(shader_path.parent().unwrap()).unwrap();
        std::fs::write(
            &material_path,
            r#"{"shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader"}"#,
        )
        .unwrap();
        std::fs::write(
            &shader_path,
            r#"
                fn mengine_lit_surface_hook(
                    surface: MEngineSurface,
                    uv: vec2<f32>,
                    world_position: vec3<f32>,
                ) -> MEngineSurface {
                    var result = surface;
                    result.metallic = uv.x;
                    return result;
                }
            "#,
        )
        .unwrap();

        let mut validated = HashSet::new();
        let result = validate_world_assets(
            &world_with_material("Assets/Materials/Rim.mmat"),
            &root,
            &mut validated,
        );
        std::fs::remove_dir_all(&root).unwrap();

        result.expect("custom material and shader should pass package validation");
        assert_eq!(validated.len(), 2);
        assert!(validated.contains(&material_path));
        assert!(validated.contains(&shader_path));
    }

    #[test]
    fn packaged_asset_validation_rejects_unsafe_custom_shader_references() {
        let root = temporary_project_root("packaged-unsafe-custom-material");
        let material_path = root.join("Assets/Materials/Rim.mmat");
        std::fs::create_dir_all(material_path.parent().unwrap()).unwrap();
        std::fs::write(
            &material_path,
            r#"{"shader":"custom","custom_shader":"../outside.mshader"}"#,
        )
        .unwrap();

        let error = validate_world_assets(
            &world_with_material("Assets/Materials/Rim.mmat"),
            &root,
            &mut HashSet::new(),
        )
        .expect_err("custom shader paths must stay inside packaged content");
        std::fs::remove_dir_all(&root).unwrap();

        assert!(error
            .to_string()
            .contains("unsafe material surface shader path"));
    }

    #[test]
    fn packaged_asset_validation_rejects_missing_custom_surface_shaders() {
        let root = temporary_project_root("packaged-missing-custom-material");
        let material_path = root.join("Assets/Materials/Rim.mmat");
        std::fs::create_dir_all(material_path.parent().unwrap()).unwrap();
        std::fs::write(
            &material_path,
            r#"{"shader":"custom","custom_shader":"Assets/Shaders/Missing.mshader"}"#,
        )
        .unwrap();

        let error = validate_world_assets(
            &world_with_material("Assets/Materials/Rim.mmat"),
            &root,
            &mut HashSet::new(),
        )
        .expect_err("missing custom shaders must fail package validation");
        std::fs::remove_dir_all(&root).unwrap();

        assert!(error
            .to_string()
            .contains("invalid material surface shader"));
    }

    #[test]
    fn packaged_asset_validation_rejects_invalid_custom_surface_shaders() {
        let root = temporary_project_root("packaged-invalid-custom-material");
        let material_path = root.join("Assets/Materials/Rim.mmat");
        let shader_path = root.join("Assets/Shaders/Rim.mshader");
        std::fs::create_dir_all(material_path.parent().unwrap()).unwrap();
        std::fs::create_dir_all(shader_path.parent().unwrap()).unwrap();
        std::fs::write(
            &material_path,
            r#"{"shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader"}"#,
        )
        .unwrap();
        std::fs::write(&shader_path, "fn mengine_surface_hook() {}").unwrap();

        let error = validate_world_assets(
            &world_with_material("Assets/Materials/Rim.mmat"),
            &root,
            &mut HashSet::new(),
        )
        .expect_err("invalid WGSL hooks must fail package validation");
        std::fs::remove_dir_all(&root).unwrap();

        assert!(error
            .to_string()
            .contains("invalid material surface shader"));
    }

    #[test]
    fn packaged_asset_validation_includes_animator_layer_motion_clips() {
        let root = temporary_project_root("packaged-animator-layers");
        let animations = root.join("Assets/Animations");
        std::fs::create_dir_all(&animations).unwrap();
        std::fs::write(animations.join("Idle.manim"), "{}").unwrap();
        std::fs::write(animations.join("Wave.manim"), "{}").unwrap();
        std::fs::write(animations.join("Aim.manim"), "{}").unwrap();
        std::fs::write(
            animations.join("Upper Body.mavatar"),
            r#"{"version":1,"name":"Upper Body","paths":["Rig/Spine"]}"#,
        )
        .unwrap();
        std::fs::write(
            animations.join("Hero.mcontroller"),
            r#"{
              "version":3,"default_state":"Idle",
              "states":[{"name":"Idle","clip":"Assets/Animations/Idle.manim"}],
              "layers":[{
                "name":"Upper Body","avatar_mask":"Assets/Animations/Upper Body.mavatar",
                "motions":[{"state":"Idle","clip":"Assets/Animations/Wave.manim"}]
              },{
                "name":"Independent Aim","timing_mode":"independent","default_state":"Aim",
                "states":[{"name":"Aim","clip":"Assets/Animations/Aim.manim"}]
              }]
            }"#,
        )
        .unwrap();
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Layered animator".into()),
            components: json!({
                "Animator": { "controller": "Assets/Animations/Hero.mcontroller" }
            }),
        });
        world.commit();

        let mut validated = HashSet::new();
        let result = validate_world_assets(&world, &root, &mut validated);
        std::fs::remove_dir_all(&root).unwrap();

        result.expect("base and layer clips should pass package validation");
        assert_eq!(validated.len(), 5);
    }

    #[test]
    fn packaged_asset_validation_loads_timeline_director_assets() {
        let root = temporary_project_root("packaged-timeline");
        let timelines = root.join("Assets/Timelines");
        let audio = root.join("Assets/Audio");
        std::fs::create_dir_all(&timelines).unwrap();
        std::fs::create_dir_all(&audio).unwrap();
        write_test_wav(&audio.join("Intro.wav"));
        std::fs::write(
            timelines.join("Intro.mtimeline"),
            r#"{
              "version":1,"name":"Intro","duration":2,"frame_rate":30,
              "tracks":[{"type":"signal","id":"gameplay","name":"Gameplay","markers":[
                {"time":1,"name":"SpawnBoss","payload":{"phase":2}}
              ]},{"type":"audio","id":"music","name":"Music","target":"Audio","clips":[
                {"start":0,"duration":2,"clip":"Assets/Audio/Intro.wav"}
              ]}]
            }"#,
        )
        .unwrap();
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Timeline director".into()),
            components: json!({
                "Animator": {},
                "TimelineDirector": { "asset": "Assets/Timelines/Intro.mtimeline" }
            }),
        });
        world.commit();

        let mut validated = HashSet::new();
        let result = validate_world_assets(&world, &root, &mut validated);
        result.expect("Timeline assets should pass final package validation");
        assert_eq!(validated.len(), 2);

        let timeline_path = timelines.join("Intro.mtimeline");
        let source = std::fs::read_to_string(&timeline_path).unwrap();
        std::fs::write(
            &timeline_path,
            source.replace(
                r#""clip":"Assets/Audio/Intro.wav""#,
                r#""clip":"Assets/Audio/Intro.wav","clip_in":1"#,
            ),
        )
        .unwrap();
        let error = validate_world_assets(&world, &root, &mut HashSet::new())
            .expect_err("an audio in-point beyond decoded duration must fail validation");
        assert!(error.to_string().contains("outside its"));

        std::fs::write(audio.join("Intro.wav"), "not audio").unwrap();
        let error = validate_world_assets(&world, &root, &mut HashSet::new())
            .expect_err("corrupt Timeline audio must fail final package validation");
        std::fs::remove_dir_all(&root).unwrap();
        assert!(error.to_string().contains("invalid audio clip"));
    }

    #[test]
    fn packaged_asset_validation_accepts_real_hdr_environment_textures() {
        let root = std::env::temp_dir().join(format!(
            "mengine-packaged-hdr-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let assets = root.join("Assets");
        std::fs::create_dir_all(&assets).unwrap();
        let hdr = assets.join("studio.hdr");
        image::codecs::hdr::HdrEncoder::new(std::fs::File::create(&hdr).unwrap())
            .encode(&[image::Rgb([8.0, 4.0, 2.0])], 1, 1)
            .unwrap();

        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("HDR environment".into()),
            components: json!({
                "EnvironmentLight": { "texture": "Assets/studio.hdr" }
            }),
        });
        world.commit();
        let result = validate_world_assets(&world, &root, &mut HashSet::new());
        std::fs::remove_dir_all(root).unwrap();
        result.expect("Radiance HDR environment maps must survive package validation");
    }

    #[test]
    fn packaged_asset_validation_scans_tilemap_sprite_dependencies() {
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Unsafe tilemap".into()),
            components: json!({
                "Tilemap": {
                    "cells": [[0, 0], [1, 0]],
                    "sprites": ["white", "../outside.png"]
                }
            }),
        });
        world.commit();
        let error =
            validate_world_assets(&world, Path::new("C:/Games/Packaged"), &mut HashSet::new())
                .expect_err("tile sprites must not traverse outside packaged content");
        assert!(error.to_string().contains("unsafe tile sprite path"));
    }

    #[test]
    fn world_lights_feed_all_supported_runtime_light_types() {
        let mut world = World::new();
        for components in [
            json!({
                "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
                "EnvironmentLight": {
                    "sky_color": [0.2, 0.4, 0.8, 1],
                    "diffuse_intensity": 1.5,
                    "specular_intensity": 2,
                    "texture": "Assets\\Textures\\studio.png",
                    "rotation_degrees": 45,
                    "background_enabled": true,
                    "background_intensity": 1.75,
                    "exposure": 1.25
                }
            }),
            json!({
                "Transform": { "position": [0, 2, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
                "DirectionalLight": { "intensity": 2 }
            }),
            json!({
                "Transform": { "position": [1, 2, 3], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
                "PointLight": { "range": 7 }
            }),
            json!({
                "Transform": { "position": [3, 4, 5], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
                "SpotLight": { "outer_angle_degrees": 55 }
            }),
        ] {
            world.commands.push(WorldCommand::Spawn {
                name: None,
                components,
            });
        }
        world.commit();
        let hierarchy = TransformHierarchy::build(&world);
        let lights = collect_lighting(&world, &hierarchy);
        assert_eq!(lights.environment.sky_color, [0.2, 0.4, 0.8]);
        assert_eq!(lights.environment.diffuse_intensity, 1.5);
        assert_eq!(lights.environment.specular_intensity, 2.0);
        assert_eq!(lights.environment.texture, "Assets/Textures/studio.png");
        assert_eq!(lights.environment.rotation_degrees, 45.0);
        assert!(lights.environment.background_enabled);
        assert_eq!(lights.environment.background_intensity, 1.75);
        assert_eq!(lights.environment.exposure, 1.25);
        assert_eq!(lights.directional.unwrap().intensity, 2.0);
        assert_eq!(lights.points[0].range, 7.0);
        assert_eq!(lights.spots[0].outer_angle_degrees, 55.0);
    }

    #[test]
    fn runtime_render_inputs_share_parent_world_transform_and_activity() {
        let mut world = World::new();
        let parent = world.spawn_empty();
        world.insert_component(
            parent,
            Transform {
                position: [10.0, 0.0, 0.0],
                ..Transform::default()
            },
        );
        let child = world.spawn_empty();
        world.insert_component(
            child,
            Transform {
                position: [1.0, 2.0, 3.0],
                ..Transform::default()
            },
        );
        world.insert_component(child, MeshRenderer::default());
        world.insert_component(
            child,
            PointLight {
                range: 7.0,
                ..PointLight::default()
            },
        );
        world.insert_component(child, Camera3D::default());
        world.set_parent(child, Some(parent));

        let hierarchy = TransformHierarchy::build(&world);
        let camera = find_camera(&world, &hierarchy, 1.0).frame;
        let lights = collect_lighting(&world, &hierarchy);
        let objects = collect_objects(&world, &hierarchy, &mut RuntimeMaterialCache::new(None));
        let expected = Vec3::new(11.0, 2.0, 3.0);
        assert_eq!(camera.position, expected);
        assert_eq!(lights.points[0].position, expected);
        assert_eq!(objects[0].model.transform_point3(Vec3::ZERO), expected);

        world.set_editor_state(parent, 0, false);
        let hierarchy = TransformHierarchy::build(&world);
        assert!(collect_lighting(&world, &hierarchy).points.is_empty());
        assert!(
            collect_objects(&world, &hierarchy, &mut RuntimeMaterialCache::new(None),).is_empty()
        );
    }

    #[test]
    fn keyboard_range_navigation_matches_ui_direction() {
        assert_eq!(
            range_navigation_sign("LeftToRight", WinitKey::ArrowRight),
            1.0
        );
        assert_eq!(
            range_navigation_sign("RightToLeft", WinitKey::ArrowRight),
            -1.0
        );
        assert_eq!(range_navigation_sign("BottomToTop", WinitKey::ArrowUp), 1.0);
        assert_eq!(
            range_navigation_sign("TopToBottom", WinitKey::ArrowUp),
            -1.0
        );
        assert_eq!(range_navigation_sign("LeftToRight", WinitKey::ArrowUp), 0.0);
    }
}
