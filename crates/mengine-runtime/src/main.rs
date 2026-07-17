//! MEngine PC runtime / sample player.

use anyhow::Result;
use clap::Parser;
use glam::{Quat, Vec3, Vec4};
use mengine_core::command::WorldCommand;
use mengine_core::generated::{
    Camera2D, Camera3D, DirectionalLight, Dropdown, InputField, ListView, MeshRenderer,
    PbrMaterial, PointLight, ScrollView, Scrollbar, Slider, SpotLight, TabView, Toggle, Transform,
};
use mengine_core::{Entity, World};
use mengine_platform::InputState;
use mengine_rhi::{
    look_at, orthographic, perspective, DirectionalLightData, FrameCamera, FrameLighting,
    PointLightData, RenderMaterial, RenderObject, Renderer, SpotLightData, UiBatchPlan,
};
use mengine_runtime::particles::ParticleWorld;
use mengine_runtime::sprites::collect_world_sprites;
use mengine_runtime::textures::RuntimeTextureCache;
use mengine_runtime::ui::{
    append_ui_focus_ring, collect_ui_frame, next_ui_focus, UiControlKind, UiControlRegion,
};
use mengine_script::ScriptHost;
use serde_json::json;
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
    textures: RuntimeTextureCache,
}

impl App {
    fn new(args: Args) -> Self {
        let textures = RuntimeTextureCache::new(args.project_root.clone());
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
            textures,
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
                if let Some(toggle) = self.world.get_component_mut::<Toggle>(control.entity) {
                    toggle.is_on = !is_on;
                    log::info!("UI Toggle {:?} = {}", control.entity, toggle.is_on);
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
        if let Some(toggle) = self.world.get_component_mut::<Toggle>(entity) {
            toggle.is_on = !toggle.is_on;
            return true;
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
                        .with_title("MEngine Runtime")
                        .with_inner_size(winit::dpi::LogicalSize::new(1280, 720)),
                )
                .expect("window"),
        );
        let renderer = pollster::block_on(Renderer::new(window.clone())).expect("renderer");
        self.window = Some(window);
        self.renderer = Some(renderer);
        self.bootstrap_sample();

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
            } else {
                let mut loaded = false;
                let sample_js = PathBuf::from(format!("samples/{}/main.js", self.args.sample));
                let sample_ts = PathBuf::from(format!("samples/{}/main.ts", self.args.sample));
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

                for _ in 0..steps {
                    self.angle += self.world.time.fixed_delta;
                    if let Some(cube) = self.cube {
                        if let Some(t) = self.world.get_component_mut::<Transform>(cube) {
                            let half = self.angle * 0.5;
                            t.rotation = [0.0, half.sin(), 0.0, half.cos()];
                        }
                    }
                }

                if let Some(script) = self.script.as_mut() {
                    let _ = script.tick(&mut self.world, dt);
                }

                if let Some(r) = self.renderer.as_mut() {
                    r.clear = self.world.time.clear_color.into();
                    let aspect = r.aspect();
                    let camera = find_camera(&self.world, aspect);
                    let objects = collect_objects(&self.world);
                    let lighting = collect_lighting(&self.world);
                    let window_size = self
                        .window
                        .as_ref()
                        .map(|window| window.inner_size())
                        .unwrap_or(winit::dpi::PhysicalSize::new(1, 1));
                    let mut ui =
                        collect_ui_frame(&self.world, window_size.width, window_size.height);
                    append_ui_focus_ring(&mut ui.plan, &ui.controls, self.focused_ui);
                    let mut world_primitives = collect_world_sprites(
                        &self.world,
                        camera,
                        [window_size.width, window_size.height],
                    );
                    let particle_primitives = self.particles.update_and_collect(
                        &self.world,
                        camera,
                        [window_size.width, window_size.height],
                        dt,
                    );
                    world_primitives.extend(particle_primitives);
                    if !world_primitives.is_empty() {
                        world_primitives.extend(std::mem::take(&mut ui.plan.primitives));
                        ui.plan = UiBatchPlan::build(world_primitives);
                    }
                    for failure in self.textures.sync(r, &ui.plan) {
                        log::warn!(
                            "UI texture '{}' could not be loaded from {}: {}",
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

fn find_camera(world: &World, viewport_aspect: f32) -> FrameCamera {
    for e in world.iter_entities() {
        if let (Some(t), Some(c)) = (
            world.get_component::<Transform>(e),
            world.get_component::<Camera2D>(e),
        ) {
            if c.primary {
                return camera2d_from_components(t, c, viewport_aspect);
            }
        }
    }
    for e in world.iter_entities() {
        if let (Some(t), Some(c)) = (
            world.get_component::<Transform>(e),
            world.get_component::<Camera3D>(e),
        ) {
            if c.primary {
                return camera_from_components(t, c, viewport_aspect);
            }
        }
    }
    let position = Vec3::new(0.0, 1.5, 4.0);
    FrameCamera {
        view: look_at(position, Vec3::ZERO, Vec3::Y),
        proj: perspective(60.0, viewport_aspect.max(0.001), 0.1, 100.0),
        position,
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

fn collect_objects(world: &World) -> Vec<RenderObject> {
    let mut out = Vec::new();
    for e in world.iter_entities() {
        if let (Some(t), Some(m)) = (
            world.get_component::<Transform>(e),
            world.get_component::<MeshRenderer>(e),
        ) {
            out.push(RenderObject {
                mesh_key: m.mesh.clone(),
                model: t.to_matrix(),
                material: world
                    .get_component::<PbrMaterial>(e)
                    .map(render_material_from_component)
                    .unwrap_or_else(|| material_preset(&m.material)),
            });
        }
    }
    out
}

fn collect_lighting(world: &World) -> FrameLighting {
    let mut frame = FrameLighting {
        ambient: [0.055, 0.06, 0.08],
        directional: None,
        points: Vec::new(),
        spots: Vec::new(),
    };
    for entity in world.iter_entities() {
        let Some(transform) = world.get_component::<Transform>(entity) else {
            continue;
        };
        let rotation = safe_rotation(transform.rotation);
        let direction = rotation * -Vec3::Z;
        if frame.directional.is_none() {
            if let Some(light) = world.get_component::<DirectionalLight>(entity) {
                frame.directional = Some(DirectionalLightData {
                    direction,
                    color: [light.color[0], light.color[1], light.color[2]],
                    intensity: light.intensity,
                });
            }
        }
        if let Some(light) = world.get_component::<PointLight>(entity) {
            frame.points.push(PointLightData {
                position: Vec3::from(transform.position),
                color: [light.color[0], light.color[1], light.color[2]],
                intensity: light.intensity,
                range: light.range,
            });
        }
        if let Some(light) = world.get_component::<SpotLight>(entity) {
            frame.spots.push(SpotLightData {
                position: Vec3::from(transform.position),
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
    let args = Args::parse();
    let event_loop = EventLoop::new()?;
    let mut app = App::new(args);
    event_loop.run_app(&mut app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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

        let frame = find_camera(&world, 2.0);
        assert_eq!(frame.position, Vec3::new(2.0, 3.0, 10.0));
        assert!((frame.proj.x_axis.x - 0.125).abs() < 0.0001);
        assert!((frame.proj.y_axis.y - 0.25).abs() < 0.0001);
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
    fn world_lights_feed_all_supported_runtime_light_types() {
        let mut world = World::new();
        for components in [
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
        let lights = collect_lighting(&world);
        assert_eq!(lights.directional.unwrap().intensity, 2.0);
        assert_eq!(lights.points[0].range, 7.0);
        assert_eq!(lights.spots[0].outer_angle_degrees, 55.0);
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
