use glam::{Mat4, Quat, Vec3};
use mengine_core::entity::Entity;
use mengine_core::generated::Transform;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GizmoMode {
    Translate,
    Rotate,
    Scale,
}

#[derive(Clone, Debug)]
pub struct GizmoState {
    pub mode: GizmoMode,
    pub target: Option<Entity>,
    pub dragging: bool,
}

impl Default for GizmoState {
    fn default() -> Self {
        Self {
            mode: GizmoMode::Translate,
            target: None,
            dragging: false,
        }
    }
}

impl GizmoState {
    pub fn apply_translate(&self, t: &mut Transform, delta: Vec3) {
        t.position[0] += delta.x;
        t.position[1] += delta.y;
        t.position[2] += delta.z;
    }

    pub fn apply_scale(&self, t: &mut Transform, delta: Vec3) {
        t.scale[0] = (t.scale[0] + delta.x).max(0.01);
        t.scale[1] = (t.scale[1] + delta.y).max(0.01);
        t.scale[2] = (t.scale[2] + delta.z).max(0.01);
    }

    pub fn matrix(t: &Transform) -> Mat4 {
        Mat4::from_scale_rotation_translation(
            Vec3::from(t.scale),
            Quat::from_xyzw(t.rotation[0], t.rotation[1], t.rotation[2], t.rotation[3]),
            Vec3::from(t.position),
        )
    }
}
