//! Cinemachine-style 2D camera follow, deadzone, bounds, and smooth damping.

use glam::Vec3;
use mengine_core::generated::{Camera2D, Transform};
use mengine_core::{Entity, TransformHierarchy, World};

/// Updates the primary Camera2D entity's Transform to follow its target,
/// respecting deadzone, bounds, and smooth-damp settings.
///
/// Call this once per frame before building the frame camera.
pub fn update_camera2d_follow(world: &mut World, hierarchy: &TransformHierarchy, dt: f32) {
    // Find the primary Camera2D entity.
    let camera_entity = world
        .iter_entities()
        .find(|e| {
            world
                .get_component::<Camera2D>(*e)
                .is_some_and(|c| c.primary)
        });
    let Some(camera_entity) = camera_entity else {
        return;
    };
    let Some(camera) = world.get_component::<Camera2D>(camera_entity).cloned() else {
        return;
    };
    if camera.follow_target.trim().is_empty() {
        return;
    }
    let Ok(target_id) = camera.follow_target.trim().parse::<u64>() else {
        return;
    };
    let target_entity = Entity::from_u64(target_id);
    let Some(target_world) = hierarchy.get(target_entity) else {
        return;
    };

    let target_pos = target_world.position;
    let offset = Vec3::new(camera.follow_offset[0], camera.follow_offset[1], 0.0);
    let desired = target_pos + offset;

    // Read current camera position.
    let Some(cam_transform) = world.get_component::<Transform>(camera_entity) else {
        return;
    };
    let current = Vec3::from(cam_transform.position);

    // Apply deadzone: only move if target is outside the deadzone box.
    let deadzone_hw = camera.deadzone_half_width.max(0.0);
    let deadzone_hh = camera.deadzone_half_height.max(0.0);
    let delta = desired - current;
    let mut move_delta = Vec3::ZERO;
    if delta.x.abs() > deadzone_hw {
        move_delta.x = delta.x - delta.x.signum() * deadzone_hw;
    }
    if delta.y.abs() > deadzone_hh {
        move_delta.y = delta.y - delta.y.signum() * deadzone_hh;
    }

    // Smooth damp towards the desired position.
    let smooth_time = camera.follow_smooth_time.max(0.0);
    let new_pos = if smooth_time < 0.0001 {
        // Snap instantly.
        Vec3::new(current.x + move_delta.x, current.y + move_delta.y, current.z)
    } else {
        // Exponential smooth damp: lerp factor = 1 - exp(-dt / smooth_time).
        let t = 1.0 - (-dt / smooth_time).exp();
        let t = t.clamp(0.0, 1.0);
        Vec3::new(
            current.x + move_delta.x * t,
            current.y + move_delta.y * t,
            current.z,
        )
    };

    // Apply bounds clamping.
    let bounds_min = camera.bounds_min;
    let bounds_max = camera.bounds_max;
    let bounded = if bounds_min[0] <= bounds_max[0] && bounds_min[1] <= bounds_max[1] {
        Vec3::new(
            new_pos.x.clamp(bounds_min[0], bounds_max[0]),
            new_pos.y.clamp(bounds_min[1], bounds_max[1]),
            new_pos.z,
        )
    } else {
        new_pos
    };

    // Write back to the camera entity's Transform.
    if let Some(transform) = world.get_component_mut::<Transform>(camera_entity) {
        transform.position = bounded.to_array();
    }
}