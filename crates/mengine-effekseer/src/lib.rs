//! Safe Rust ownership and lifecycle API for the vendored Effekseer 1.80.6 evaluator.

use std::ffi::{c_char, c_void};
use std::cell::Cell;
use std::marker::PhantomData;
use std::ptr::NonNull;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct EffectId(u64);

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct EffectHandle(i32);

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(i32)]
pub enum DependencyKind {
    ColorTexture = 0,
    NormalTexture = 1,
    DistortionTexture = 2,
    Model = 3,
    Material = 4,
    Sound = 5,
    Curve = 6,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct EffectDrawVertex {
    pub position: [f32; 3],
    pub uv: [f32; 2],
    pub color: [f32; 4],
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct EffectDrawTriangle {
    pub vertices: [EffectDrawVertex; 3],
    pub blend: i32,
    pub depth_test: bool,
    pub texture: String,
    pub effect: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct EffectModelInstance {
    pub origin: [f32; 3],
    pub axis_x: [f32; 3],
    pub axis_y: [f32; 3],
    pub axis_z: [f32; 3],
    pub color: [f32; 4],
    pub time: i32,
    pub magnification: f32,
    pub blend: i32,
    pub depth_test: bool,
    pub texture: String,
    pub model: String,
    pub effect: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct EffectDrawList {
    pub triangles: Vec<EffectDrawTriangle>,
    pub models: Vec<EffectModelInstance>,
}

#[derive(Debug, thiserror::Error)]
pub enum EffekseerError {
    #[error("Effekseer manager creation failed")]
    ManagerCreation,
    #[error("Effekseer rejected the effect data")]
    InvalidEffect,
    #[error("Effekseer could not play the effect")]
    PlayFailed,
    #[error("Effekseer returned an invalid dependency path")]
    InvalidDependencyPath,
}

pub struct EffectManager {
    raw: NonNull<c_void>,
    _not_sync: PhantomData<Cell<()>>,
}

// The native manager has no thread affinity. Moving ownership is safe; all API
// access still requires `&mut self`, and `Cell` keeps the wrapper from being Sync.
unsafe impl Send for EffectManager {}

impl EffectManager {
    pub fn new(max_instances: usize) -> Result<Self, EffekseerError> {
        let raw = unsafe { mengine_effekseer_create(max_instances.min(i32::MAX as usize) as i32) };
        Ok(Self {
            raw: NonNull::new(raw).ok_or(EffekseerError::ManagerCreation)?,
            _not_sync: PhantomData,
        })
    }

    pub fn load_effect(&mut self, data: &[u8]) -> Result<EffectId, EffekseerError> {
        self.load_effect_named(data, "")
    }

    pub fn load_effect_named(
        &mut self,
        data: &[u8],
        reference: &str,
    ) -> Result<EffectId, EffekseerError> {
        let id = unsafe {
            mengine_effekseer_load_effect(
                self.raw.as_ptr(),
                data.as_ptr(),
                data.len().min(i32::MAX as usize) as i32,
                reference.as_ptr().cast(),
                reference.len().min(i32::MAX as usize) as i32,
            )
        };
        (id != 0)
            .then_some(EffectId(id))
            .ok_or(EffekseerError::InvalidEffect)
    }

    pub fn release_effect(&mut self, effect: EffectId) {
        unsafe { mengine_effekseer_release_effect(self.raw.as_ptr(), effect.0) }
    }

    pub fn play(
        &mut self,
        effect: EffectId,
        position: [f32; 3],
    ) -> Result<EffectHandle, EffekseerError> {
        self.play_at_frame(effect, position, 0)
    }

    pub fn play_at_frame(
        &mut self,
        effect: EffectId,
        position: [f32; 3],
        start_frame: i32,
    ) -> Result<EffectHandle, EffekseerError> {
        let handle = unsafe {
            mengine_effekseer_play(
                self.raw.as_ptr(),
                effect.0,
                position[0],
                position[1],
                position[2],
                start_frame.max(0),
            )
        };
        (handle >= 0)
            .then_some(EffectHandle(handle))
            .ok_or(EffekseerError::PlayFailed)
    }

    /// Effekseer measures time in 60 Hz frames.
    pub fn update_seconds(&mut self, delta_seconds: f32) {
        let frames = if delta_seconds.is_finite() {
            delta_seconds.max(0.0) * 60.0
        } else {
            0.0
        };
        unsafe { mengine_effekseer_update(self.raw.as_ptr(), frames) }
    }

    pub fn exists(&self, handle: EffectHandle) -> bool {
        unsafe { mengine_effekseer_exists(self.raw.as_ptr(), handle.0) }
    }

    pub fn stop(&mut self, handle: EffectHandle) {
        unsafe { mengine_effekseer_stop(self.raw.as_ptr(), handle.0) }
    }

    pub fn set_paused(&mut self, handle: EffectHandle, paused: bool) {
        unsafe { mengine_effekseer_set_paused(self.raw.as_ptr(), handle.0, paused) }
    }

    pub fn set_speed(&mut self, handle: EffectHandle, speed: f32) {
        let speed = if speed.is_finite() {
            speed.max(0.0)
        } else {
            1.0
        };
        unsafe { mengine_effekseer_set_speed(self.raw.as_ptr(), handle.0, speed) }
    }

    pub fn set_location(&mut self, handle: EffectHandle, position: [f32; 3]) {
        unsafe {
            mengine_effekseer_set_location(
                self.raw.as_ptr(),
                handle.0,
                position[0],
                position[1],
                position[2],
            )
        }
    }

    pub fn capture(
        &mut self,
        camera_right: [f32; 3],
        camera_up: [f32; 3],
        camera_front: [f32; 3],
        camera_position: [f32; 3],
    ) -> EffectDrawList {
        unsafe {
            mengine_effekseer_capture(
                self.raw.as_ptr(),
                camera_right.as_ptr(),
                camera_up.as_ptr(),
                camera_front.as_ptr(),
                camera_position.as_ptr(),
            );
        }
        let triangle_count =
            unsafe { mengine_effekseer_triangle_count(self.raw.as_ptr()) }.max(0);
        let model_count = unsafe { mengine_effekseer_model_count(self.raw.as_ptr()) }.max(0);
        let mut triangles = Vec::with_capacity(triangle_count as usize);
        let mut models = Vec::with_capacity(model_count as usize);
        for index in 0..triangle_count {
            let mut raw = RawTriangle::default();
            if unsafe { mengine_effekseer_triangle(self.raw.as_ptr(), index, &mut raw) } {
                triangles.push(EffectDrawTriangle {
                    vertices: raw.vertices.map(EffectDrawVertex::from),
                    blend: raw.blend,
                    depth_test: raw.depth_test != 0,
                    texture: unsafe { read_raw_string(raw.texture, raw.texture_length) },
                    effect: unsafe { read_raw_string(raw.effect, raw.effect_length) },
                });
            }
        }
        for index in 0..model_count {
            let mut raw = RawModelInstance::default();
            if unsafe { mengine_effekseer_model(self.raw.as_ptr(), index, &mut raw) } {
                models.push(EffectModelInstance {
                    origin: raw.origin,
                    axis_x: raw.axis_x,
                    axis_y: raw.axis_y,
                    axis_z: raw.axis_z,
                    color: raw.color,
                    time: raw.time,
                    magnification: raw.magnification,
                    blend: raw.blend,
                    depth_test: raw.depth_test != 0,
                    texture: unsafe { read_raw_string(raw.texture, raw.texture_length) },
                    model: unsafe { read_raw_string(raw.model, raw.model_length) },
                    effect: unsafe { read_raw_string(raw.effect, raw.effect_length) },
                });
            }
        }
        EffectDrawList { triangles, models }
    }

    pub fn dependencies(
        &self,
        effect: EffectId,
        kind: DependencyKind,
    ) -> Result<Vec<String>, EffekseerError> {
        let count =
            unsafe { mengine_effekseer_dependency_count(self.raw.as_ptr(), effect.0, kind as i32) }
                .max(0);
        (0..count)
            .map(|index| self.dependency_path(effect, kind, index))
            .collect()
    }

    fn dependency_path(
        &self,
        effect: EffectId,
        kind: DependencyKind,
        index: i32,
    ) -> Result<String, EffekseerError> {
        let required = unsafe {
            mengine_effekseer_dependency_path(
                self.raw.as_ptr(),
                effect.0,
                kind as i32,
                index,
                std::ptr::null_mut(),
                0,
            )
        };
        if required < 0 {
            return Err(EffekseerError::InvalidDependencyPath);
        }
        let mut bytes = vec![0_u8; required as usize + 1];
        let written = unsafe {
            mengine_effekseer_dependency_path(
                self.raw.as_ptr(),
                effect.0,
                kind as i32,
                index,
                bytes.as_mut_ptr().cast(),
                bytes.len() as i32,
            )
        };
        if written != required {
            return Err(EffekseerError::InvalidDependencyPath);
        }
        bytes.truncate(required as usize);
        String::from_utf8(bytes).map_err(|_| EffekseerError::InvalidDependencyPath)
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
struct RawVertex {
    position: [f32; 3],
    uv: [f32; 2],
    color: [f32; 4],
}

impl From<RawVertex> for EffectDrawVertex {
    fn from(value: RawVertex) -> Self {
        Self {
            position: value.position,
            uv: value.uv,
            color: value.color,
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct RawTriangle {
    vertices: [RawVertex; 3],
    blend: i32,
    depth_test: i32,
    texture: *const c_char,
    texture_length: i32,
    effect: *const c_char,
    effect_length: i32,
}

impl Default for RawTriangle {
    fn default() -> Self {
        Self {
            vertices: [RawVertex::default(); 3],
            blend: 0,
            depth_test: 0,
            texture: std::ptr::null(),
            texture_length: 0,
            effect: std::ptr::null(),
            effect_length: 0,
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct RawModelInstance {
    origin: [f32; 3],
    axis_x: [f32; 3],
    axis_y: [f32; 3],
    axis_z: [f32; 3],
    color: [f32; 4],
    time: i32,
    magnification: f32,
    blend: i32,
    depth_test: i32,
    texture: *const c_char,
    texture_length: i32,
    model: *const c_char,
    model_length: i32,
    effect: *const c_char,
    effect_length: i32,
}

impl Default for RawModelInstance {
    fn default() -> Self {
        Self {
            origin: [0.0; 3],
            axis_x: [0.0; 3],
            axis_y: [0.0; 3],
            axis_z: [0.0; 3],
            color: [1.0; 4],
            time: 0,
            magnification: 1.0,
            blend: 0,
            depth_test: 0,
            texture: std::ptr::null(),
            texture_length: 0,
            model: std::ptr::null(),
            model_length: 0,
            effect: std::ptr::null(),
            effect_length: 0,
        }
    }
}

unsafe fn read_raw_string(pointer: *const c_char, length: i32) -> String {
    if pointer.is_null() || length <= 0 {
        return String::new();
    }
    let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), length as usize) };
    String::from_utf8_lossy(bytes).into_owned()
}

impl Drop for EffectManager {
    fn drop(&mut self) {
        unsafe { mengine_effekseer_destroy(self.raw.as_ptr()) }
    }
}

unsafe extern "C" {
    fn mengine_effekseer_create(max_instances: i32) -> *mut c_void;
    fn mengine_effekseer_destroy(state: *mut c_void);
    fn mengine_effekseer_load_effect(
        state: *mut c_void,
        data: *const u8,
        size: i32,
        reference: *const c_char,
        reference_length: i32,
    ) -> u64;
    fn mengine_effekseer_release_effect(state: *mut c_void, effect: u64);
    fn mengine_effekseer_play(
        state: *mut c_void,
        effect: u64,
        x: f32,
        y: f32,
        z: f32,
        start_frame: i32,
    ) -> i32;
    fn mengine_effekseer_update(state: *mut c_void, delta_frames: f32);
    fn mengine_effekseer_capture(
        state: *mut c_void,
        camera_right: *const f32,
        camera_up: *const f32,
        camera_front: *const f32,
        camera_position: *const f32,
    ) -> i32;
    fn mengine_effekseer_triangle_count(state: *mut c_void) -> i32;
    fn mengine_effekseer_triangle(
        state: *mut c_void,
        index: i32,
        output: *mut RawTriangle,
    ) -> bool;
    fn mengine_effekseer_model_count(state: *mut c_void) -> i32;
    fn mengine_effekseer_model(
        state: *mut c_void,
        index: i32,
        output: *mut RawModelInstance,
    ) -> bool;
    fn mengine_effekseer_exists(state: *mut c_void, handle: i32) -> bool;
    fn mengine_effekseer_stop(state: *mut c_void, handle: i32);
    fn mengine_effekseer_set_paused(state: *mut c_void, handle: i32, paused: bool);
    fn mengine_effekseer_set_speed(state: *mut c_void, handle: i32, speed: f32);
    fn mengine_effekseer_set_location(state: *mut c_void, handle: i32, x: f32, y: f32, z: f32);
    fn mengine_effekseer_dependency_count(state: *mut c_void, effect: u64, kind: i32) -> i32;
    fn mengine_effekseer_dependency_path(
        state: *mut c_void,
        effect: u64,
        kind: i32,
        index: i32,
        output: *mut c_char,
        capacity: i32,
    ) -> i32;
}
