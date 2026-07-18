use crate::sorting::{WorldPrimitive, WorldPrimitiveKind};
use mengine_core::generated::Light2D;
use mengine_core::{TransformHierarchy, World};

const MAX_LIGHTS_2D: usize = 128;
const MAX_LIGHT_MULTIPLIER: f32 = 16.0;

#[derive(Clone, Debug)]
struct RuntimeLight2D {
    global: bool,
    position: [f32; 2],
    color: [f32; 3],
    intensity: f32,
    radius: f32,
    inner_radius: f32,
    falloff: f32,
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
            Some(RuntimeLight2D {
                global: light.light_type.trim().eq_ignore_ascii_case("global"),
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
        let attenuation = if light.global {
            1.0
        } else if let Some(position) = world_position {
            point_attenuation(light, position)
        } else {
            0.0
        };
        let energy = light.intensity * attenuation;
        for (channel, color) in result.iter_mut().zip(light.color) {
            *channel = (*channel + color * energy).min(MAX_LIGHT_MULTIPLIER);
        }
    }
    result
}

fn point_attenuation(light: &RuntimeLight2D, position: [f32; 2]) -> f32 {
    let distance = (position[0] - light.position[0]).hypot(position[1] - light.position[1]);
    if distance <= light.inner_radius {
        return 1.0;
    }
    if distance >= light.radius {
        return 0.0;
    }
    let span = (light.radius - light.inner_radius).max(0.001);
    (1.0 - (distance - light.inner_radius) / span).powf(light.falloff)
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
}
