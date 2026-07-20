use crate::sorting::{WorldPrimitive, WorldPrimitiveKind};
use mengine_core::generated::Light2D;
use mengine_core::{TransformHierarchy, World};

const MAX_LIGHTS_2D: usize = 128;
const MAX_LIGHT_MULTIPLIER: f32 = 16.0;

#[derive(Clone, Copy, Debug, PartialEq)]
enum LightType2D {
    Global,
    Point,
    Spot,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum FalloffMode {
    Linear,
    Quadratic,
    Smooth,
}

#[derive(Clone, Debug)]
struct RuntimeLight2D {
    light_type: LightType2D,
    position: [f32; 2],
    color: [f32; 3],
    intensity: f32,
    radius: f32,
    inner_radius: f32,
    falloff: f32,
    falloff_mode: FalloffMode,
    /// Spot light cone half-angle in radians.
    spot_half_angle: f32,
    /// Spot light direction as a unit vector [cos, sin].
    spot_direction: [f32; 2],
    sorting_layers: Vec<String>,
}

/// Apply active Light2D components to world-space 2D primitives before batching.
///
/// This first-stage renderer samples lighting once per primitive (per sprite, tile,
/// line segment, or particle). It preserves existing unlit scenes when no Light2D
/// exists and leaves screen-space UI and 3D primitives untouched.
pub fn apply_2d_lighting(
    world: &World,
    hierarchy: &TransformHierarchy,
    primitives: &mut [WorldPrimitive],
) {
    let lights = collect_lights(world, hierarchy);
    if lights.is_empty() {
        return;
    }

    for value in primitives {
        if value.kind != WorldPrimitiveKind::TwoD {
            continue;
        }
        let lighting = sample_lights(&lights, value.world_position, &value.sorting_layer);
        for (channel, multiplier) in lighting.into_iter().enumerate() {
            let color = value.primitive.color[channel];
            value.primitive.color[channel] = if color.is_finite() {
                (color.max(0.0) * multiplier).min(MAX_LIGHT_MULTIPLIER)
            } else {
                0.0
            };
        }
    }
}

fn collect_lights(world: &World, hierarchy: &TransformHierarchy) -> Vec<RuntimeLight2D> {
    world
        .iter_entities()
        .filter_map(|entity| {
            let transform = hierarchy.get(entity)?;
            let light = world.get_component::<Light2D>(entity)?;
            let radius = finite(light.radius, 5.0).abs().max(0.001);
            let light_type = match light.light_type.trim().to_ascii_lowercase().as_str() {
                "global" => LightType2D::Global,
                "spot" => LightType2D::Spot,
                _ => LightType2D::Point,
            };
            let falloff_mode = match light.falloff_mode.trim().to_ascii_lowercase().as_str() {
                "quadratic" => FalloffMode::Quadratic,
                "smooth" => FalloffMode::Smooth,
                _ => FalloffMode::Linear,
            };
            let spot_direction_deg = finite(light.spot_direction_degrees, 0.0);
            let spot_rad = spot_direction_deg.to_radians();
            Some(RuntimeLight2D {
                light_type,
                position: [
                    finite(transform.position.x, 0.0),
                    finite(transform.position.y, 0.0),
                ],
                color: [
                    finite(light.color[0], 1.0).clamp(0.0, MAX_LIGHT_MULTIPLIER),
                    finite(light.color[1], 1.0).clamp(0.0, MAX_LIGHT_MULTIPLIER),
                    finite(light.color[2], 1.0).clamp(0.0, MAX_LIGHT_MULTIPLIER),
                ],
                intensity: finite(light.intensity, 1.0).clamp(0.0, MAX_LIGHT_MULTIPLIER)
                    * finite(light.color[3], 1.0).clamp(0.0, 1.0),
                radius,
                inner_radius: finite(light.inner_radius, 0.0).clamp(0.0, radius),
                falloff: finite(light.falloff, 1.0).clamp(0.01, 8.0),
                falloff_mode,
                spot_half_angle: finite(light.spot_angle_degrees, 30.0)
                    .clamp(1.0, 179.0)
                    .to_radians()
                    * 0.5,
                spot_direction: [spot_rad.cos(), spot_rad.sin()],
                sorting_layers: light
                    .sorting_layers
                    .iter()
                    .map(|layer| layer.trim().to_ascii_lowercase())
                    .filter(|layer| !layer.is_empty())
                    .collect(),
            })
        })
        .take(MAX_LIGHTS_2D)
        .collect()
}

fn sample_lights(
    lights: &[RuntimeLight2D],
    world_position: Option<[f32; 2]>,
    sorting_layer: &str,
) -> [f32; 3] {
    let layer = sorting_layer.trim().to_ascii_lowercase();
    let mut result = [0.0; 3];
    for light in lights {
        if !light.sorting_layers.is_empty()
            && !light.sorting_layers.iter().any(|target| target == &layer)
        {
            continue;
        }
        let attenuation = match light.light_type {
            LightType2D::Global => 1.0,
            LightType2D::Point | LightType2D::Spot => {
                if let Some(position) = world_position {
                    let radial = radial_attenuation(light, position);
                    if light.light_type == LightType2D::Spot {
                        radial * spot_angular_attenuation(light, position)
                    } else {
                        radial
                    }
                } else {
                    0.0
                }
            }
        };
        let energy = light.intensity * attenuation;
        for (channel, color) in result.iter_mut().zip(light.color) {
            *channel = (*channel + color * energy).min(MAX_LIGHT_MULTIPLIER);
        }
    }
    result
}

/// Distance-based attenuation with configurable falloff curve.
fn radial_attenuation(light: &RuntimeLight2D, position: [f32; 2]) -> f32 {
    let distance =
        (position[0] - light.position[0]).hypot(position[1] - light.position[1]);
    if distance <= light.inner_radius {
        return 1.0;
    }
    if distance >= light.radius {
        return 0.0;
    }
    let span = (light.radius - light.inner_radius).max(0.001);
    let t = (distance - light.inner_radius) / span; // 0..1
    let base = 1.0 - t;
    match light.falloff_mode {
        FalloffMode::Linear => base.powf(light.falloff),
        FalloffMode::Quadratic => base * base,
        FalloffMode::Smooth => {
            // Smoothstep: 3t^2 - 2t^3 mapped to the remaining range.
            let s = base * base * (3.0 - 2.0 * base);
            s.powf(light.falloff)
        }
    }
}

/// Angular attenuation for spot lights: full intensity within the inner cone,
/// smooth falloff to zero at the outer cone edge.
fn spot_angular_attenuation(light: &RuntimeLight2D, position: [f32; 2]) -> f32 {
    let dx = position[0] - light.position[0];
    let dy = position[1] - light.position[1];
    let length = dx.hypot(dy);
    if length < 0.0001 {
        return 1.0; // At the light source, full intensity.
    }
    // Normalize direction to the fragment.
    let dir_x = dx / length;
    let dir_y = dy / length;
    // Dot product with the spot direction.
    let dot = dir_x * light.spot_direction[0] + dir_y * light.spot_direction[1];
    let angle = dot.acos().clamp(0.0, std::f32::consts::PI);
    if angle <= light.spot_half_angle * 0.5 {
        // Inner cone: full intensity.
        1.0
    } else if angle >= light.spot_half_angle {
        // Outside outer cone: no light.
        0.0
    } else {
        // Smooth falloff between inner and outer cone.
        let inner = light.spot_half_angle * 0.5;
        let t = (angle - inner) / (light.spot_half_angle - inner).max(0.001);
        // Smoothstep falloff.
        let s = 1.0 - t;
        s * s * (3.0 - 2.0 * s)
    }
}

fn finite(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sorting::WorldPrimitive;
    use mengine_core::generated::Transform;
    use mengine_rhi::{UiBatchKey, UiPrimitive};

    fn primitive(position: [f32; 2], layer: &str, color: [f32; 4]) -> WorldPrimitive {
        WorldPrimitive {
            kind: WorldPrimitiveKind::TwoD,
            sorting_layer: layer.into(),
            sorting_order: 0,
            depth: 0.0,
            world_position: Some(position),
            primitive: UiPrimitive {
                rect: [0.0; 4],
                color,
                pivot: [0.5; 2],
                rotation_radians: 0.0,
                uv: [0.0, 0.0, 1.0, 1.0],
                key: UiBatchKey::default(),
            },
        }
    }

    fn add_light(world: &mut World, position: [f32; 2], light: Light2D) {
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            Transform {
                position: [position[0], position[1], 0.0],
                ..Transform::default()
            },
        );
        world.insert_component(entity, light);
    }

    #[test]
    fn no_lights_preserve_existing_unlit_primitives() {
        let world = World::new();
        let hierarchy = TransformHierarchy::build(&world);
        let mut primitives = vec![primitive([0.0, 0.0], "default", [0.8, 0.6, 0.4, 0.5])];
        apply_2d_lighting(&world, &hierarchy, &mut primitives);
        assert_eq!(primitives[0].primitive.color, [0.8, 0.6, 0.4, 0.5]);
    }

    #[test]
    fn global_and_point_lights_sum_and_preserve_alpha() {
        let mut world = World::new();
        add_light(
            &mut world,
            [0.0, 0.0],
            Light2D {
                light_type: "global".into(),
                color: [0.2, 0.4, 0.6, 1.0],
                intensity: 0.5,
                ..Light2D::default()
            },
        );
        add_light(
            &mut world,
            [0.0, 0.0],
            Light2D {
                color: [1.0, 0.0, 0.0, 1.0],
                radius: 10.0,
                inner_radius: 0.0,
                falloff: 1.0,
                ..Light2D::default()
            },
        );
        let hierarchy = TransformHierarchy::build(&world);
        let mut primitives = vec![primitive([5.0, 0.0], "default", [1.0, 1.0, 1.0, 0.35])];
        apply_2d_lighting(&world, &hierarchy, &mut primitives);
        assert_eq!(primitives[0].primitive.color, [0.6, 0.2, 0.3, 0.35]);
    }

    #[test]
    fn sorting_layer_masks_and_inactive_lights_are_respected() {
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(
            entity,
            Light2D {
                light_type: "global".into(),
                color: [0.5, 1.0, 0.25, 1.0],
                sorting_layers: vec!["characters".into()],
                ..Light2D::default()
            },
        );
        let hierarchy = TransformHierarchy::build(&world);
        let mut primitives = vec![
            primitive([0.0, 0.0], "characters", [1.0; 4]),
            primitive([0.0, 0.0], "background", [1.0; 4]),
        ];
        apply_2d_lighting(&world, &hierarchy, &mut primitives);
        assert_eq!(primitives[0].primitive.color, [0.5, 1.0, 0.25, 1.0]);
        assert_eq!(primitives[1].primitive.color, [0.0, 0.0, 0.0, 1.0]);

        world.set_editor_state(entity, 0, false);
        let hierarchy = TransformHierarchy::build(&world);
        let mut primitive = vec![primitive([0.0, 0.0], "characters", [1.0; 4])];
        apply_2d_lighting(&world, &hierarchy, &mut primitive);
        assert_eq!(primitive[0].primitive.color, [1.0; 4]);
    }

    #[test]
    fn spot_light_illuminates_cone_and_rejects_outside() {
        let mut world = World::new();
        // Spot light at origin pointing right (0 degrees), 60 degree cone (30 half-angle).
        add_light(
            &mut world,
            [0.0, 0.0],
            Light2D {
                light_type: "spot".into(),
                color: [1.0, 1.0, 1.0, 1.0],
                intensity: 1.0,
                radius: 10.0,
                spot_angle_degrees: 60.0,
                spot_direction_degrees: 0.0,
                ..Light2D::default()
            },
        );
        let hierarchy = TransformHierarchy::build(&world);
        // Point directly in front (within cone).
        let mut in_cone = vec![primitive([5.0, 0.0], "default", [1.0; 4])];
        apply_2d_lighting(&world, &hierarchy, &mut in_cone);
        assert!(
            in_cone[0].primitive.color[0] >= 0.4,
            "spot should illuminate in-cone point, got {:?}",
            in_cone[0].primitive.color
        );
        // Point behind the light (outside cone).
        let mut behind = vec![primitive([-5.0, 0.0], "default", [1.0; 4])];
        apply_2d_lighting(&world, &hierarchy, &mut behind);
        assert!(
            behind[0].primitive.color[0] < 0.01,
            "spot should not illuminate behind, got {:?}",
            behind[0].primitive.color
        );
    }

    #[test]
    fn quadratic_and_smooth_falloff_modes_differ_from_linear() {
        let mut world_linear = World::new();
        add_light(
            &mut world_linear,
            [0.0, 0.0],
            Light2D {
                radius: 10.0,
                falloff_mode: "linear".into(),
                ..Light2D::default()
            },
        );
        let mut world_quad = World::new();
        add_light(
            &mut world_quad,
            [0.0, 0.0],
            Light2D {
                radius: 10.0,
                falloff_mode: "quadratic".into(),
                ..Light2D::default()
            },
        );
        let h_lin = TransformHierarchy::build(&world_linear);
        let h_quad = TransformHierarchy::build(&world_quad);
        let mut p_lin = vec![primitive([5.0, 0.0], "default", [1.0; 4])];
        let mut p_quad = vec![primitive([5.0, 0.0], "default", [1.0; 4])];
        apply_2d_lighting(&world_linear, &h_lin, &mut p_lin);
        apply_2d_lighting(&world_quad, &h_quad, &mut p_quad);
        // Quadratic should be dimmer than linear at the same distance.
        assert!(
            p_quad[0].primitive.color[0] < p_lin[0].primitive.color[0],
            "quadratic ({}) should be dimmer than linear ({})",
            p_quad[0].primitive.color[0],
            p_lin[0].primitive.color[0]
        );
    }
}