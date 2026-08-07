//! Shared CPU-side scene evaluation for every runtime render target.

use crate::fonts::{FontLoadFailure, RuntimeFontCache};
use crate::lighting2d::apply_2d_lighting;
use crate::materials::{apply_material_property_block, resolve_ui_materials, RuntimeMaterialCache};
use crate::particles::ParticleWorld;
use crate::sorting::{sort_world_primitives, SortingLayers};
use crate::sprites::collect_world_primitives_with_hierarchy;
use crate::textures::{RuntimeTextureCache, TextureLoadFailure};
use crate::timeline::RuntimeCameraOverride;
use crate::trails::TrailWorld;
use crate::ui::{
    append_ui_focus_ring, collect_ui_frame_for_display_with_interaction_and_fonts, RuntimeUiFrame,
    UiButtonTintTween, UiControlRegion, UiInteractionState,
};
use glam::{Quat, Vec3, Vec4};
use mengine_core::generated::{
    Camera2D, Camera3D, DirectionalLight, EnvironmentLight, MaterialPropertyBlock, MeshRenderer,
    PbrMaterial, PointLight, SpotLight,
};
use mengine_core::{Entity, TransformHierarchy, World};
use mengine_rhi::{
    look_at, orthographic, perspective, ClearColor, DirectionalLightData, EnvironmentLightData,
    FrameCamera, FrameLighting, PointLightData, RenderFrame, RenderMaterial, RenderObject,
    SpotLightData, UiBatchPlan,
};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CameraClearFlags {
    Scene,
    Skybox,
    SolidColor,
}

#[derive(Clone, Copy, Debug)]
pub struct ActiveFrameCamera {
    pub frame: FrameCamera,
    pub clear_flags: CameraClearFlags,
    pub background_color: [f32; 4],
    pub entity: Option<Entity>,
}

#[derive(Clone, Copy, Debug)]
enum CameraProjection {
    Perspective { fov: f32, near: f32, far: f32 },
    Orthographic { size: f32, near: f32, far: f32 },
}

#[derive(Clone, Copy, Debug)]
struct CameraDefinition {
    entity: Option<Entity>,
    position: Vec3,
    rotation: Quat,
    projection: CameraProjection,
    clear_flags: CameraClearFlags,
    background_color: [f32; 4],
    target_display: i32,
}

impl CameraDefinition {
    fn active(self, viewport_aspect: f32) -> ActiveFrameCamera {
        let forward = self.rotation * -Vec3::Z;
        let up = self.rotation * Vec3::Y;
        let aspect = viewport_aspect.max(0.001);
        let proj = match self.projection {
            CameraProjection::Perspective { fov, near, far } => {
                perspective(fov.clamp(1.0, 179.0), aspect, near, far)
            }
            CameraProjection::Orthographic { size, near, far } => {
                orthographic(size.max(0.001), aspect, near, far)
            }
        };
        ActiveFrameCamera {
            frame: FrameCamera {
                view: look_at(self.position, self.position + forward, up),
                proj,
                position: self.position,
            },
            clear_flags: self.clear_flags,
            background_color: self.background_color,
            entity: self.entity,
        }
    }
}

/// Inputs that affect scene evaluation but do not own runtime caches.
pub struct FrameCompileRequest<'a> {
    pub world: &'a World,
    pub hierarchy: &'a TransformHierarchy,
    pub viewport: [u32; 2],
    pub scene_clear: Vec4,
    pub camera_override: Option<RuntimeCameraOverride>,
    pub view_camera: Option<FrameCamera>,
    pub include_ui: bool,
    pub target_display: i32,
    pub interaction: UiInteractionState,
    pub button_tints: &'a HashMap<Entity, UiButtonTintTween>,
    pub focused_ui: Option<Entity>,
    pub sorting_layers: &'a SortingLayers,
    pub delta_seconds: f32,
}

/// Stateful caches needed while compiling a frame. None of these select a GPU target.
pub struct FrameCompiler<'a> {
    pub materials: &'a mut RuntimeMaterialCache,
    pub particles: &'a mut ParticleWorld,
    pub trails: &'a mut TrailWorld,
    pub textures: &'a mut RuntimeTextureCache,
    pub fonts: &'a mut RuntimeFontCache,
}

/// Owned frame packet shared by window, editor, and future offscreen submission paths.
pub struct CompiledFrame {
    pub clear: ClearColor,
    pub camera: FrameCamera,
    pub objects: Vec<RenderObject>,
    pub lighting: FrameLighting,
    pub ui: UiBatchPlan,
    pub controls: Vec<UiControlRegion>,
    pub texture_failures: Vec<TextureLoadFailure>,
    pub font_failures: Vec<FontLoadFailure>,
    pub has_authored_camera: bool,
}

impl CompiledFrame {
    pub fn render_frame(&self) -> RenderFrame<'_> {
        RenderFrame {
            clear: self.clear,
            camera: self.camera,
            objects: &self.objects,
            lighting: &self.lighting,
            ui: Some(&self.ui),
        }
    }
}

impl FrameCompiler<'_> {
    pub fn compile(&mut self, request: FrameCompileRequest<'_>) -> CompiledFrame {
        let width = request.viewport[0].max(1);
        let height = request.viewport[1].max(1);
        let active_camera = request.view_camera.map_or_else(
            || {
                find_camera_for_display(
                    request.world,
                    request.hierarchy,
                    width as f32 / height as f32,
                    request.camera_override,
                    request.target_display,
                )
            },
            |frame| ActiveFrameCamera {
                frame,
                clear_flags: CameraClearFlags::Scene,
                background_color: request.scene_clear.to_array(),
                entity: None,
            },
        );
        let camera = active_camera.frame;
        let has_authored_camera = active_camera.entity.is_some();
        let has_scene_camera = has_authored_camera || request.view_camera.is_some();
        let objects = if has_scene_camera {
            collect_objects(request.world, request.hierarchy, self.materials)
        } else {
            Vec::new()
        };
        let mut lighting = collect_lighting(request.world, request.hierarchy);
        let clear = resolve_camera_background(&active_camera, request.scene_clear, &mut lighting);

        self.fonts.begin_frame();
        let mut ui = if request.include_ui {
            collect_ui_frame_for_display_with_interaction_and_fonts(
                request.world,
                request.hierarchy,
                width,
                height,
                has_scene_camera.then_some(camera),
                request.sorting_layers,
                request.target_display,
                request.interaction,
                request.button_tints,
                self.fonts,
            )
        } else {
            RuntimeUiFrame::default()
        };
        let mut texture_failures = self
            .textures
            .resolve_image_alpha_hit_tests(&mut ui.controls);
        append_ui_focus_ring(&mut ui.plan, &ui.controls, request.focused_ui);

        let mut world_primitives = if has_scene_camera {
            collect_world_primitives_with_hierarchy(
                request.world,
                request.hierarchy,
                camera,
                [width, height],
            )
        } else {
            Vec::new()
        };
        let particle_primitives = self.particles.update_and_collect_world_with_hierarchy(
            request.world,
            request.hierarchy,
            camera,
            [width, height],
            request.delta_seconds,
        );
        let trail_primitives = self.trails.update_and_collect_world_with_hierarchy(
            request.world,
            request.hierarchy,
            camera,
            [width, height],
            request.delta_seconds,
        );
        if has_scene_camera {
            world_primitives.extend(particle_primitives);
            world_primitives.extend(trail_primitives);
        }
        apply_2d_lighting(request.world, request.hierarchy, &mut world_primitives);
        world_primitives.append(&mut ui.world_primitives);
        if !world_primitives.is_empty() {
            sort_world_primitives(&mut world_primitives, request.sorting_layers);
            let mut primitives = world_primitives
                .into_iter()
                .map(|value| value.primitive)
                .collect::<Vec<_>>();
            primitives.extend(std::mem::take(&mut ui.plan.primitives));
            ui.plan = UiBatchPlan::build(primitives);
        }
        texture_failures.extend(
            self.textures
                .resolve_sprite_regions(&mut ui.plan.primitives),
        );
        resolve_ui_materials(&mut ui.plan.primitives, self.materials);
        ui.plan = UiBatchPlan::build(std::mem::take(&mut ui.plan.primitives));

        CompiledFrame {
            clear: clear.into(),
            camera,
            objects,
            lighting,
            ui: ui.plan,
            controls: ui.controls,
            texture_failures,
            font_failures: self.fonts.take_failures(),
            has_authored_camera,
        }
    }
}

pub fn find_camera(
    world: &World,
    hierarchy: &TransformHierarchy,
    viewport_aspect: f32,
    timeline: Option<RuntimeCameraOverride>,
) -> ActiveFrameCamera {
    find_camera_for_display(world, hierarchy, viewport_aspect, timeline, 0)
}

pub fn find_camera_for_display(
    world: &World,
    hierarchy: &TransformHierarchy,
    viewport_aspect: f32,
    timeline: Option<RuntimeCameraOverride>,
    target_display: i32,
) -> ActiveFrameCamera {
    let target_display = target_display.clamp(0, 7);
    if let Some(timeline) = timeline {
        if let Some(target) = camera_definition(world, hierarchy, timeline.target)
            .filter(|camera| camera.target_display == target_display)
        {
            let source = timeline
                .source
                .and_then(|entity| camera_definition(world, hierarchy, entity))
                .filter(|camera| camera.target_display == target_display)
                .or_else(|| primary_camera_definition(world, hierarchy, target_display))
                .unwrap_or_else(default_camera_definition);
            return blend_camera_definitions(source, target, timeline.weight)
                .active(viewport_aspect);
        }
    }
    primary_camera_definition(world, hierarchy, target_display)
        .unwrap_or_else(default_camera_definition)
        .active(viewport_aspect)
}

fn primary_camera_definition(
    world: &World,
    hierarchy: &TransformHierarchy,
    target_display: i32,
) -> Option<CameraDefinition> {
    for entity in world.iter_entities() {
        if world
            .get_component::<Camera2D>(entity)
            .is_some_and(|camera| {
                camera.primary && camera.target_display.clamp(0, 7) == target_display
            })
        {
            if let Some(camera) = camera_definition(world, hierarchy, entity) {
                return Some(camera);
            }
        }
    }
    for entity in world.iter_entities() {
        if world
            .get_component::<Camera3D>(entity)
            .is_some_and(|camera| {
                camera.primary && camera.target_display.clamp(0, 7) == target_display
            })
        {
            if let Some(camera) = camera_definition(world, hierarchy, entity) {
                return Some(camera);
            }
        }
    }
    None
}

fn camera_definition(
    world: &World,
    hierarchy: &TransformHierarchy,
    entity: Entity,
) -> Option<CameraDefinition> {
    let transform = hierarchy.get(entity)?.to_transform();
    let position = Vec3::from(transform.position);
    let rotation = safe_rotation(transform.rotation);
    if let Some(camera) = world.get_component::<Camera2D>(entity) {
        return Some(CameraDefinition {
            entity: Some(entity),
            position,
            rotation,
            projection: CameraProjection::Orthographic {
                size: camera.size.max(0.001),
                near: 0.01,
                far: 1000.0,
            },
            clear_flags: parse_camera_clear_flags(&camera.clear_flags),
            background_color: camera.background_color,
            target_display: camera.target_display.clamp(0, 7),
        });
    }
    let camera = world.get_component::<Camera3D>(entity)?;
    let near = camera.near.max(0.001);
    let far = camera.far.max(near + 0.001);
    let projection = if camera.projection.eq_ignore_ascii_case("orthographic") {
        CameraProjection::Orthographic {
            size: camera.orthographic_size.max(0.001),
            near,
            far,
        }
    } else {
        CameraProjection::Perspective {
            fov: camera.fov_y_degrees.clamp(1.0, 179.0),
            near,
            far,
        }
    };
    Some(CameraDefinition {
        entity: Some(entity),
        position,
        rotation,
        projection,
        clear_flags: parse_camera_clear_flags(&camera.clear_flags),
        background_color: camera.background_color,
        target_display: camera.target_display.clamp(0, 7),
    })
}

fn default_camera_definition() -> CameraDefinition {
    CameraDefinition {
        entity: None,
        position: Vec3::new(0.0, 1.5, 4.0),
        rotation: Quat::from_rotation_x(-0.35877067),
        projection: CameraProjection::Perspective {
            fov: 60.0,
            near: 0.1,
            far: 100.0,
        },
        clear_flags: CameraClearFlags::Scene,
        background_color: [0.1, 0.1, 0.14, 1.0],
        target_display: 0,
    }
}

fn blend_camera_definitions(
    source: CameraDefinition,
    target: CameraDefinition,
    weight: f32,
) -> CameraDefinition {
    let weight = weight.clamp(0.0, 1.0);
    let projection = match (source.projection, target.projection) {
        (
            CameraProjection::Perspective {
                fov: source_fov,
                near: source_near,
                far: source_far,
            },
            CameraProjection::Perspective {
                fov: target_fov,
                near: target_near,
                far: target_far,
            },
        ) => CameraProjection::Perspective {
            fov: source_fov + (target_fov - source_fov) * weight,
            near: source_near + (target_near - source_near) * weight,
            far: source_far + (target_far - source_far) * weight,
        },
        (
            CameraProjection::Orthographic {
                size: source_size,
                near: source_near,
                far: source_far,
            },
            CameraProjection::Orthographic {
                size: target_size,
                near: target_near,
                far: target_far,
            },
        ) => CameraProjection::Orthographic {
            size: source_size + (target_size - source_size) * weight,
            near: source_near + (target_near - source_near) * weight,
            far: source_far + (target_far - source_far) * weight,
        },
        _ => return if weight < 0.5 { source } else { target },
    };
    let mut background_color = [0.0; 4];
    for (index, channel) in background_color.iter_mut().enumerate() {
        *channel = source.background_color[index]
            + (target.background_color[index] - source.background_color[index]) * weight;
    }
    CameraDefinition {
        entity: if weight < 0.5 {
            source.entity
        } else {
            target.entity
        },
        position: source.position.lerp(target.position, weight),
        rotation: source.rotation.slerp(target.rotation, weight),
        projection,
        clear_flags: if weight < 0.5 {
            source.clear_flags
        } else {
            target.clear_flags
        },
        background_color,
        target_display: target.target_display,
    }
}

pub fn parse_camera_clear_flags(value: &str) -> CameraClearFlags {
    match value.trim().to_ascii_lowercase().as_str() {
        "skybox" => CameraClearFlags::Skybox,
        "solid_color" | "solidcolor" | "solid" => CameraClearFlags::SolidColor,
        _ => CameraClearFlags::Scene,
    }
}

pub fn resolve_camera_background(
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
            let channel = |value: f32, fallback: f32| {
                if value.is_finite() {
                    value.clamp(0.0, 1.0)
                } else {
                    fallback
                }
            };
            Vec4::new(
                channel(camera.background_color[0], 0.1),
                channel(camera.background_color[1], 0.1),
                channel(camera.background_color[2], 0.14),
                channel(camera.background_color[3], 1.0),
            )
        }
    }
}

pub fn collect_objects(
    world: &World,
    hierarchy: &TransformHierarchy,
    materials: &mut RuntimeMaterialCache,
) -> Vec<RenderObject> {
    let mut out = Vec::new();
    for entity in world.iter_entities() {
        if let (Some(transform), Some(mesh)) = (
            hierarchy.get(entity),
            world.get_component::<MeshRenderer>(entity),
        ) {
            let mut material = world
                .get_component::<PbrMaterial>(entity)
                .map(render_material_from_component)
                .unwrap_or_else(|| {
                    materials
                        .resolve(&mesh.material)
                        .unwrap_or_else(|| material_preset(&mesh.material))
                });
            if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) {
                material = apply_material_property_block(material, block);
            }
            out.push(RenderObject {
                mesh_key: mesh.mesh.trim().replace('\\', "/"),
                model: transform.matrix,
                cast_shadows: mesh.cast_shadows,
                receive_shadows: mesh.receive_shadows,
                material,
            });
        }
    }
    out
}

pub fn collect_lighting(world: &World, hierarchy: &TransformHierarchy) -> FrameLighting {
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
                    sky_color: environment.sky_color[..3].try_into().unwrap(),
                    equator_color: environment.equator_color[..3].try_into().unwrap(),
                    ground_color: environment.ground_color[..3].try_into().unwrap(),
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
        let direction = transform.rotation * -Vec3::Z;
        if frame.directional.is_none() {
            if let Some(light) = world.get_component::<DirectionalLight>(entity) {
                frame.directional = Some(DirectionalLightData {
                    direction,
                    color: light.color[..3].try_into().unwrap(),
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
                color: light.color[..3].try_into().unwrap(),
                intensity: light.intensity,
                range: light.range,
            });
        }
        if let Some(light) = world.get_component::<SpotLight>(entity) {
            frame.spots.push(SpotLightData {
                position: transform.position,
                direction,
                color: light.color[..3].try_into().unwrap(),
                intensity: light.intensity,
                range: light.range,
                inner_angle_degrees: light.inner_angle_degrees,
                outer_angle_degrees: light.outer_angle_degrees,
            });
        }
    }
    frame
}

pub fn render_material_from_component(material: &PbrMaterial) -> RenderMaterial {
    RenderMaterial {
        base_color: material.base_color,
        metallic: material.metallic,
        roughness: material.roughness,
        ior: material.ior,
        emissive: material.emissive,
        emissive_strength: material.emissive_strength,
        unlit: material.unlit,
        double_sided: material.double_sided,
        ..Default::default()
    }
}

pub fn material_preset(name: &str) -> RenderMaterial {
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

fn safe_rotation(value: [f32; 4]) -> Quat {
    let rotation = Quat::from_array(value);
    if rotation.is_finite() && rotation.length_squared() > 0.000001 {
        rotation.normalize()
    } else {
        Quat::IDENTITY
    }
}
