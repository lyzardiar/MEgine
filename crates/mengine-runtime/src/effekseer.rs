use mengine_core::generated::EffekseerEffect;
use mengine_core::{Entity, TransformHierarchy, World};
use mengine_effekseer::{
    DependencyKind, EffectDrawTriangle, EffectDrawVertex, EffectHandle, EffectId, EffectManager,
    EffectModelInstance, EffekseerError,
};
use mengine_rhi::{
    UiBatchKey, UiBatchPlan, UiBlendMode, UiPrimitive, UiShaderChannelData, UiShaderChannels,
    UiStencilMode,
};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EffekseerLoadFailure {
    pub entity: Entity,
    pub effect: String,
    pub path: PathBuf,
    pub error: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EffekseerDependency {
    pub kind: DependencyKind,
    pub path: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct FileStamp {
    modified: Option<SystemTime>,
    length: u64,
}

struct CachedEffect {
    stamp: FileStamp,
    id: Result<EffectId, String>,
    dependencies: Vec<EffekseerDependency>,
}

struct ActiveEffect {
    asset: String,
    effect: EffectId,
    handle: EffectHandle,
    screen_space: bool,
    screen_position: [f32; 2],
    screen_scale: f32,
    sorting_order: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EffekseerRenderFailure {
    pub asset: String,
    pub path: PathBuf,
    pub error: String,
}

#[derive(Clone, Debug)]
struct EffectModelVertex {
    position: [f32; 3],
    uv: [f32; 2],
    color: [f32; 4],
}

#[derive(Clone, Debug, Default)]
struct EffectModelFrame {
    vertices: Vec<EffectModelVertex>,
    faces: Vec<[u32; 3]>,
}

struct CachedModel {
    stamp: FileStamp,
    result: Result<Vec<EffectModelFrame>, String>,
}

pub struct EffekseerWorld {
    project_root: Option<PathBuf>,
    manager: EffectManager,
    assets: HashMap<String, CachedEffect>,
    active: HashMap<Entity, ActiveEffect>,
    models: HashMap<String, CachedModel>,
}

impl EffekseerWorld {
    pub fn new(project_root: Option<PathBuf>) -> Result<Self, EffekseerError> {
        Ok(Self {
            project_root,
            manager: EffectManager::new(16_384)?,
            assets: HashMap::new(),
            active: HashMap::new(),
            models: HashMap::new(),
        })
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        for active in self.active.drain().map(|(_, active)| active) {
            self.manager.stop(active.handle);
        }
        for cached in self.assets.drain().map(|(_, cached)| cached) {
            if let Ok(effect) = cached.id {
                self.manager.release_effect(effect);
            }
        }
        self.project_root = project_root;
        self.models.clear();
    }

    pub fn restart(&mut self) {
        for active in self.active.drain().map(|(_, active)| active) {
            self.manager.stop(active.handle);
        }
    }

    pub fn update(
        &mut self,
        world: &World,
        hierarchy: &TransformHierarchy,
        delta_seconds: f32,
    ) -> Vec<EffekseerLoadFailure> {
        let mut live = HashSet::new();
        let mut failures = Vec::new();
        for entity in world.iter_entities() {
            let Some(component) = world.get_component::<EffekseerEffect>(entity) else {
                continue;
            };
            let Some(transform) = hierarchy.get(entity) else {
                continue;
            };
            let reference = normalize_reference(&component.effect);
            if reference.is_empty() {
                continue;
            }
            live.insert(entity);
            let effect = match self.ensure_effect(&reference) {
                Ok(effect) => effect,
                Err((path, error)) => {
                    failures.push(EffekseerLoadFailure {
                        entity,
                        effect: reference,
                        path,
                        error,
                    });
                    continue;
                }
            };
            let position = transform.position.to_array();
            let restart = self.active.get(&entity).is_none_or(|active| {
                active.asset != reference
                    || active.effect != effect
                    || !self.manager.exists(active.handle)
            });
            if restart {
                if let Some(previous) = self.active.remove(&entity) {
                    self.manager.stop(previous.handle);
                }
                if component.playing || component.prewarm {
                    match self
                        .manager
                        .play_at_frame(effect, position, component.start_frame.max(0))
                    {
                        Ok(handle) => {
                            self.active.insert(
                                entity,
                                ActiveEffect {
                                    asset: reference.clone(),
                                    effect,
                                    handle,
                                    screen_space: false,
                                    screen_position: [0.5, 0.5],
                                    screen_scale: 0.12,
                                    sorting_order: 0,
                                },
                            );
                        }
                        Err(error) => failures.push(EffekseerLoadFailure {
                            entity,
                            effect: reference,
                            path: self.resolve_path(&component.effect),
                            error: error.to_string(),
                        }),
                    }
                }
            }
            if let Some(active) = self.active.get_mut(&entity) {
                active.screen_space = component.render_mode.eq_ignore_ascii_case("screen");
                active.screen_position = finite_screen_position(component.screen_position);
                active.screen_scale = finite_positive(component.screen_scale, 0.12);
                active.sorting_order = component.sorting_order;
                self.manager
                    .set_layer(active.handle, i32::from(active.screen_space));
                if active.screen_space {
                    self.manager.set_rotation(active.handle, [0.0; 3]);
                    self.manager
                        .set_scale(active.handle, [active.screen_scale; 3]);
                } else {
                    let (x, y, z) = transform.rotation.to_euler(glam::EulerRot::XYZ);
                    self.manager.set_location(active.handle, position);
                    self.manager.set_rotation(active.handle, [x, y, z]);
                    self.manager
                        .set_scale(active.handle, transform.scale.to_array());
                }
                self.manager.set_speed(active.handle, component.speed);
                self.manager.set_paused(active.handle, !component.playing);
            }
        }

        let stale = self
            .active
            .keys()
            .copied()
            .filter(|entity| !live.contains(entity))
            .collect::<Vec<_>>();
        for entity in stale {
            if let Some(active) = self.active.remove(&entity) {
                self.manager.stop(active.handle);
            }
        }
        self.manager.update_seconds(delta_seconds);

        let finished = self
            .active
            .iter()
            .filter_map(|(entity, active)| (!self.manager.exists(active.handle)).then_some(*entity))
            .collect::<Vec<_>>();
        for entity in finished {
            let Some(component) = world.get_component::<EffekseerEffect>(entity) else {
                self.active.remove(&entity);
                continue;
            };
            let Some(previous) = self.active.remove(&entity) else {
                continue;
            };
            if component.looping && component.playing {
                let position = hierarchy
                    .get(entity)
                    .map(|transform| transform.position.to_array())
                    .unwrap_or([0.0; 3]);
                if let Ok(handle) = self.manager.play_at_frame(
                    previous.effect,
                    position,
                    component.start_frame.max(0),
                ) {
                    self.manager.set_speed(handle, component.speed);
                    self.active
                        .insert(entity, ActiveEffect { handle, ..previous });
                }
            }
        }
        failures
    }

    pub fn dependencies(&self, reference: &str) -> Option<&[EffekseerDependency]> {
        self.assets
            .get(&normalize_reference(reference))
            .map(|cached| cached.dependencies.as_slice())
    }

    /// Captures the evaluated Effekseer renderer callbacks and appends them to
    /// the same backend-neutral UI/world primitive stream used by every target.
    pub fn append_to_frame(
        &mut self,
        frame: &mut crate::frame_compiler::CompiledFrame,
        viewport: [u32; 2],
    ) -> Vec<EffekseerRenderFailure> {
        let inverse_view = frame.camera.view.inverse();
        let camera_right = inverse_view
            .x_axis
            .truncate()
            .normalize_or_zero()
            .to_array();
        let camera_up = inverse_view
            .y_axis
            .truncate()
            .normalize_or_zero()
            .to_array();
        let camera_front = (-inverse_view.z_axis.truncate())
            .normalize_or_zero()
            .to_array();
        let view_projection = frame.camera.proj * frame.camera.view;
        let mut primitives = Vec::new();
        let mut models = Vec::new();
        if self.active.values().any(|effect| !effect.screen_space) {
            let draws = self.manager.capture_layer(
                camera_right,
                camera_up,
                camera_front,
                frame.camera.position.to_array(),
                1,
            );
            primitives.reserve(draws.triangles.len());
            for triangle in draws.triangles {
                if let Some(primitive) =
                    effect_triangle_primitive(&triangle, view_projection, false)
                {
                    primitives.push(primitive);
                }
            }
            models.extend(
                draws
                    .models
                    .into_iter()
                    .map(|model| (model, false, view_projection)),
            );
        }
        if self.active.values().any(|effect| effect.screen_space) {
            let aspect = viewport[0].max(1) as f32 / viewport[1].max(1) as f32;
            for active in self.active.values().filter(|effect| effect.screen_space) {
                let position = [
                    (active.screen_position[0] * 2.0 - 1.0) * aspect,
                    1.0 - active.screen_position[1] * 2.0,
                    active.sorting_order as f32 * 0.001,
                ];
                self.manager.set_location(active.handle, position);
            }
            let eye = glam::Vec3::new(0.0, 0.0, 10.0);
            let overlay_view = glam::Mat4::look_at_rh(eye, glam::Vec3::ZERO, glam::Vec3::Y);
            let overlay_projection =
                glam::Mat4::orthographic_rh(-aspect, aspect, -1.0, 1.0, 0.01, 100.0);
            let overlay_view_projection = overlay_projection * overlay_view;
            let draws = self.manager.capture_layer(
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, -1.0],
                eye.to_array(),
                2,
            );
            primitives.reserve(draws.triangles.len());
            for triangle in draws.triangles {
                if let Some(primitive) =
                    effect_triangle_primitive(&triangle, overlay_view_projection, true)
                {
                    primitives.push(primitive);
                }
            }
            models.extend(
                draws
                    .models
                    .into_iter()
                    .map(|model| (model, true, overlay_view_projection)),
            );
        }

        let mut failures = Vec::new();
        for (model, screen_space, projection) in models {
            let reference = resolve_dependency_reference(&model.effect, &model.model);
            let path = self.resolve_path(&reference);
            let stamp = file_stamp(&path);
            let stale = self
                .models
                .get(&reference)
                .is_none_or(|cached| cached.stamp != stamp);
            if stale {
                let result = std::fs::read(&path)
                    .map_err(|error| error.to_string())
                    .and_then(|bytes| parse_efkmodel(&bytes));
                self.models
                    .insert(reference.clone(), CachedModel { stamp, result });
            }
            match self.models.get(&reference).map(|cached| &cached.result) {
                Some(Ok(frames)) => append_model_primitives(
                    &mut primitives,
                    &model,
                    frames,
                    projection,
                    screen_space,
                ),
                Some(Err(error)) => failures.push(EffekseerRenderFailure {
                    asset: reference,
                    path,
                    error: error.clone(),
                }),
                None => {}
            }
        }
        if !primitives.is_empty() {
            frame.ui.primitives.extend(primitives);
            frame.ui = UiBatchPlan::build(std::mem::take(&mut frame.ui.primitives));
        }
        failures
    }

    fn ensure_effect(&mut self, reference: &str) -> Result<EffectId, (PathBuf, String)> {
        let path = self.resolve_path(reference);
        let stamp = file_stamp(&path);
        let stale = self
            .assets
            .get(reference)
            .is_none_or(|cached| cached.stamp != stamp);
        if stale {
            if let Some(previous) = self.assets.remove(reference) {
                if let Ok(effect) = previous.id {
                    self.manager.release_effect(effect);
                }
            }
            let loaded = std::fs::read(&path)
                .map_err(|error| error.to_string())
                .and_then(|bytes| {
                    self.manager
                        .load_effect_named(&bytes, reference)
                        .map_err(|error| error.to_string())
                });
            let dependencies = loaded
                .as_ref()
                .ok()
                .map(|effect| collect_dependencies(&self.manager, *effect))
                .unwrap_or_default();
            self.assets.insert(
                reference.to_owned(),
                CachedEffect {
                    stamp,
                    id: loaded,
                    dependencies,
                },
            );
        }
        self.assets
            .get(reference)
            .and_then(|cached| cached.id.as_ref().copied().ok())
            .ok_or_else(|| {
                let error = self
                    .assets
                    .get(reference)
                    .and_then(|cached| cached.id.as_ref().err())
                    .cloned()
                    .unwrap_or_else(|| "effect was not loaded".to_string());
                (path, error)
            })
    }

    fn resolve_path(&self, reference: &str) -> PathBuf {
        let Some(root) = self.project_root.as_deref() else {
            return PathBuf::from(reference);
        };
        mengine_runtime_asset_path(root, reference).unwrap_or_else(|| root.join(reference))
    }
}

fn effect_triangle_primitive(
    triangle: &EffectDrawTriangle,
    view_projection: glam::Mat4,
    screen_space: bool,
) -> Option<UiPrimitive> {
    let mut clips = [[0.0; 4]; 4];
    let mut channel_data = UiShaderChannelData::default();
    for index in 0..3 {
        let vertex = triangle.vertices[index];
        let clip = view_projection * glam::Vec3::from_array(vertex.position).extend(1.0);
        if !clip.is_finite() || clip.w <= 0.0001 {
            return None;
        }
        clips[index] = clip.to_array();
        channel_data.uv0[index] = [vertex.uv[0], vertex.uv[1], 0.0, 0.0];
        channel_data.colors[index] = vertex.color;
    }
    clips[3] = clips[2];
    channel_data.uv0[3] = channel_data.uv0[2];
    channel_data.colors[3] = channel_data.colors[2];
    let texture = resolve_dependency_reference(&triangle.effect, &triangle.texture);
    Some(UiPrimitive {
        rect: [0.0; 4],
        color: [1.0; 4],
        pivot: [0.0; 2],
        rotation_radians: 0.0,
        depth: 0.0,
        clip_corners: Some(clips),
        uv: [0.0, 0.0, 1.0, 1.0],
        vertex_positions: None,
        shader_channel_data: Some(Arc::new(channel_data)),
        render_material: None,
        soft_clips: [None; 8],
        canvas_sorting_grid_size: None,
        key: effect_batch_key(
            texture,
            triangle.blend,
            triangle.depth_test && !screen_space,
        ),
    })
}

fn append_model_primitives(
    output: &mut Vec<UiPrimitive>,
    instance: &EffectModelInstance,
    frames: &[EffectModelFrame],
    view_projection: glam::Mat4,
    screen_space: bool,
) {
    let Some(frame) = frames.get(instance.time.rem_euclid(frames.len().max(1) as i32) as usize)
    else {
        return;
    };
    let origin = glam::Vec3::from_array(instance.origin);
    let axis_x = glam::Vec3::from_array(instance.axis_x) * instance.magnification;
    let axis_y = glam::Vec3::from_array(instance.axis_y) * instance.magnification;
    let axis_z = glam::Vec3::from_array(instance.axis_z) * instance.magnification;
    let texture = resolve_dependency_reference(&instance.effect, &instance.texture);
    for face in &frame.faces {
        let Some(vertices) = face
            .iter()
            .map(|index| frame.vertices.get(*index as usize))
            .collect::<Option<Vec<_>>>()
        else {
            continue;
        };
        let converted = std::array::from_fn(|index| {
            let vertex = vertices[index];
            let position = glam::Vec3::from_array(vertex.position);
            EffectDrawVertex {
                position: (origin
                    + axis_x * position.x
                    + axis_y * position.y
                    + axis_z * position.z)
                    .to_array(),
                uv: vertex.uv,
                color: std::array::from_fn(|channel| {
                    vertex.color[channel] * instance.color[channel]
                }),
            }
        });
        let triangle = EffectDrawTriangle {
            vertices: converted,
            blend: instance.blend,
            depth_test: instance.depth_test,
            texture: texture.clone().into(),
            effect: "".into(),
        };
        if let Some(primitive) = effect_triangle_primitive(&triangle, view_projection, screen_space)
        {
            output.push(primitive);
        }
    }
}

fn effect_batch_key(texture: String, blend: i32, depth_test: bool) -> UiBatchKey {
    UiBatchKey {
        canvas_group: None,
        material: "effekseer/default".into(),
        texture: if texture.is_empty() {
            "white".into()
        } else {
            texture
        },
        clip: None,
        blend: match blend {
            2 | 3 => UiBlendMode::Additive,
            4 => UiBlendMode::Multiply,
            _ => UiBlendMode::Alpha,
        },
        shader_channels: UiShaderChannels::default(),
        depth_test,
        stencil: UiStencilMode::Disabled,
    }
}

fn resolve_dependency_reference(effect: &str, dependency: &str) -> String {
    let dependency = normalize_reference(dependency);
    if dependency.is_empty() || dependency.eq_ignore_ascii_case("white") {
        return dependency;
    }
    let path = Path::new(&dependency);
    if path.is_absolute()
        || dependency.starts_with("Assets/")
        || dependency.starts_with("Packages/")
    {
        return dependency;
    }
    let base = Path::new(effect).parent().unwrap_or_else(|| Path::new(""));
    normalize_project_reference(&base.join(path))
}

fn normalize_project_reference(path: &Path) -> String {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(value) => components.push(value.to_string_lossy()),
            std::path::Component::ParentDir => {
                components.pop();
            }
            std::path::Component::CurDir => {}
            _ => {}
        }
    }
    components.join("/")
}

fn parse_efkmodel(bytes: &[u8]) -> Result<Vec<EffectModelFrame>, String> {
    let mut cursor = ModelCursor { bytes, offset: 0 };
    let version = cursor.i32()?;
    if !(0..=6).contains(&version) {
        return Err(format!("unsupported .efkmodel version {version}"));
    }
    if version == 2 || version >= 5 {
        cursor.i32()?;
    }
    cursor.i32()?;
    let frame_count = if version >= 5 { cursor.i32()? } else { 1 };
    if !(0..=4096).contains(&frame_count) {
        return Err("invalid .efkmodel frame count".into());
    }
    let mut frames = Vec::with_capacity(frame_count as usize);
    for _ in 0..frame_count {
        let vertex_count = cursor.count("vertex")?;
        let mut vertices = Vec::with_capacity(vertex_count);
        for _ in 0..vertex_count {
            let position = cursor.vec3()?;
            cursor.skip(12 * 3)?;
            let uv = cursor.vec2()?;
            if version >= 6 {
                cursor.skip(8)?;
            }
            let color = if version >= 1 {
                let rgba = cursor.bytes(4)?;
                std::array::from_fn(|index| rgba[index] as f32 / 255.0)
            } else {
                [1.0; 4]
            };
            vertices.push(EffectModelVertex {
                position,
                uv,
                color,
            });
        }
        let face_count = cursor.count("face")?;
        let mut faces = Vec::with_capacity(face_count);
        for _ in 0..face_count {
            faces.push([
                cursor.i32()?.max(0) as u32,
                cursor.i32()?.max(0) as u32,
                cursor.i32()?.max(0) as u32,
            ]);
        }
        frames.push(EffectModelFrame { vertices, faces });
    }
    Ok(frames)
}

struct ModelCursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl ModelCursor<'_> {
    fn bytes(&mut self, length: usize) -> Result<&[u8], String> {
        let end = self
            .offset
            .checked_add(length)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(|| "truncated .efkmodel".to_string())?;
        let value = &self.bytes[self.offset..end];
        self.offset = end;
        Ok(value)
    }

    fn skip(&mut self, length: usize) -> Result<(), String> {
        self.bytes(length).map(|_| ())
    }

    fn i32(&mut self) -> Result<i32, String> {
        let bytes: [u8; 4] = self.bytes(4)?.try_into().expect("four bytes");
        Ok(i32::from_le_bytes(bytes))
    }

    fn f32(&mut self) -> Result<f32, String> {
        let bytes: [u8; 4] = self.bytes(4)?.try_into().expect("four bytes");
        Ok(f32::from_le_bytes(bytes))
    }

    fn vec2(&mut self) -> Result<[f32; 2], String> {
        Ok([self.f32()?, self.f32()?])
    }

    fn vec3(&mut self) -> Result<[f32; 3], String> {
        Ok([self.f32()?, self.f32()?, self.f32()?])
    }

    fn count(&mut self, label: &str) -> Result<usize, String> {
        let value = self.i32()?;
        if !(0..=4_000_000).contains(&value) {
            return Err(format!("invalid .efkmodel {label} count"));
        }
        Ok(value as usize)
    }
}

fn collect_dependencies(manager: &EffectManager, effect: EffectId) -> Vec<EffekseerDependency> {
    const KINDS: [DependencyKind; 7] = [
        DependencyKind::ColorTexture,
        DependencyKind::NormalTexture,
        DependencyKind::DistortionTexture,
        DependencyKind::Model,
        DependencyKind::Material,
        DependencyKind::Sound,
        DependencyKind::Curve,
    ];
    KINDS
        .into_iter()
        .flat_map(|kind| {
            manager
                .dependencies(effect, kind)
                .unwrap_or_default()
                .into_iter()
                .map(move |path| EffekseerDependency { kind, path })
        })
        .collect()
}

fn normalize_reference(reference: &str) -> String {
    reference.trim().replace('\\', "/")
}

fn mengine_runtime_asset_path(root: &Path, reference: &str) -> Option<PathBuf> {
    crate::textures::resolve_project_asset_path(root, reference)
}

fn file_stamp(path: &Path) -> FileStamp {
    std::fs::metadata(path)
        .ok()
        .map(|metadata| FileStamp {
            modified: metadata.modified().ok(),
            length: metadata.len(),
        })
        .unwrap_or_default()
}

fn finite_screen_position(position: [f32; 2]) -> [f32; 2] {
    std::array::from_fn(|index| {
        if position[index].is_finite() {
            position[index]
        } else {
            0.5
        }
    })
}

fn finite_positive(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::{Mat4, Vec3, Vec4};
    use mengine_rhi::{ClearColor, FrameCamera, FrameLighting, UiBatchPlan};

    fn sample_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/effekseer-fire")
    }

    fn frame() -> crate::frame_compiler::CompiledFrame {
        let eye = Vec3::new(0.0, 1.5, 4.0);
        crate::frame_compiler::CompiledFrame {
            clear: ClearColor::from(Vec4::new(0.025, 0.03, 0.045, 1.0)),
            camera: FrameCamera {
                view: Mat4::look_at_rh(eye, Vec3::ZERO, Vec3::Y),
                proj: Mat4::perspective_rh(60.0_f32.to_radians(), 16.0 / 9.0, 0.1, 100.0),
                position: eye,
            },
            objects: Vec::new(),
            lighting: FrameLighting::default(),
            ui: UiBatchPlan::default(),
            controls: Vec::new(),
            texture_failures: Vec::new(),
            font_failures: Vec::new(),
            has_authored_camera: true,
        }
    }

    #[test]
    fn official_fire_sample_loads_dependencies_and_emits_render_primitives() {
        let root = sample_root();
        let effect = "Assets/Effects/ef_fire01.efkefc";
        assert!(root.join(effect).is_file());

        let mut world = World::new();
        let scene = mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world)
            .expect("load Effekseer sample scene");
        assert_eq!(scene.name, "EffekseerShowcase");
        assert!(world.iter_entities().any(|entity| world
            .get_component::<EffekseerEffect>(entity)
            .is_some_and(|component| component.effect == effect)));
        let hierarchy = TransformHierarchy::build(&world);
        let mut runtime = EffekseerWorld::new(Some(root.clone())).expect("Effekseer runtime");
        let mut peak_primitives = 0;
        let mut peak_untextured = 0;
        let mut draw_textures = HashSet::new();

        for _ in 0..180 {
            assert!(runtime.update(&world, &hierarchy, 1.0 / 60.0).is_empty());
            let mut compiled = frame();
            assert!(runtime
                .append_to_frame(&mut compiled, [1280, 720])
                .is_empty());
            peak_primitives = peak_primitives.max(compiled.ui.primitives.len());
            peak_untextured = peak_untextured.max(
                compiled
                    .ui
                    .primitives
                    .iter()
                    .filter(|primitive| primitive.key.texture == "white")
                    .count(),
            );
            draw_textures.extend(
                compiled
                    .ui
                    .primitives
                    .iter()
                    .map(|primitive| primitive.key.texture.clone())
                    .filter(|path| !path.is_empty()),
            );
        }

        let dependencies = runtime.dependencies(effect).expect("loaded dependencies");
        let paths = dependencies
            .iter()
            .map(|dependency| dependency.path.as_str())
            .collect::<HashSet<_>>();
        for path in [
            "Textures/tx_fire_flipbook01_1024.png",
            "Textures/tx_glow02_128.png",
            "Textures/tx_noise01_256.png",
            "Materials/mt_dissolve02.efkmat",
        ] {
            assert!(paths.contains(path), "missing dependency {path}");
            assert!(
                root.join("Assets/Effects").join(path).is_file(),
                "missing asset {path}"
            );
        }
        assert!(
            peak_primitives > 0,
            "the sample effect produced no render primitives"
        );
        assert_eq!(
            peak_untextured, 0,
            "custom-material particles must not degrade to opaque white geometry"
        );
        for texture in [
            "Assets/Effects/Textures/tx_fire_flipbook01_1024.png",
            "Assets/Effects/Textures/tx_glow02_128.png",
        ] {
            assert!(
                draw_textures.contains(texture),
                "unused draw texture {texture}"
            );
        }
    }

    #[test]
    fn screen_mode_renders_as_depth_independent_ui_overlay() {
        let root = sample_root();
        let mut world = World::new();
        mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world)
            .expect("load Effekseer sample scene");
        let entity = world
            .iter_entities()
            .find(|entity| world.get_component::<EffekseerEffect>(*entity).is_some())
            .expect("sample Effekseer entity");
        let component = world
            .get_component_mut::<EffekseerEffect>(entity)
            .expect("sample Effekseer component");
        component.render_mode = "screen".into();
        component.screen_position = [0.25, 0.75];
        component.screen_scale = 0.2;
        component.sorting_order = 4;

        let hierarchy = TransformHierarchy::build(&world);
        let mut runtime = EffekseerWorld::new(Some(root)).expect("Effekseer runtime");
        let mut primitives = Vec::new();
        for _ in 0..30 {
            assert!(runtime.update(&world, &hierarchy, 1.0 / 60.0).is_empty());
            let mut compiled = frame();
            assert!(runtime
                .append_to_frame(&mut compiled, [1920, 1080])
                .is_empty());
            primitives = compiled.ui.primitives;
            if !primitives.is_empty() {
                break;
            }
        }
        assert!(
            !primitives.is_empty(),
            "screen effect produced no UI primitives"
        );
        assert!(
            primitives.iter().all(|primitive| !primitive.key.depth_test),
            "screen effects must render independently of scene depth"
        );
    }
}
