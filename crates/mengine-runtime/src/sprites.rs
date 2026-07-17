use glam::{Quat, Vec3};
use mengine_core::generated::{SpriteRenderer, Transform};
use mengine_core::hierarchy::Parent;
use mengine_core::{Entity, World};
use mengine_rhi::{project_world_to_viewport, FrameCamera, UiBatchKey, UiBlendMode, UiPrimitive};
use std::collections::HashSet;

#[derive(Clone, Debug)]
struct ProjectedSprite {
    sorting_order: i32,
    depth: f32,
    primitive: UiPrimitive,
}

pub fn collect_world_sprites(
    world: &World,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Vec<UiPrimitive> {
    let mut sprites = Vec::new();
    for entity in world.iter_entities() {
        if !active_in_hierarchy(world, entity) {
            continue;
        }
        let (Some(transform), Some(sprite)) = (
            world.get_component::<Transform>(entity),
            world.get_component::<SpriteRenderer>(entity),
        ) else {
            continue;
        };
        if let Some(projected) = project_sprite(transform, sprite, camera, viewport) {
            sprites.push(projected);
        }
    }
    sprites.sort_by(|left, right| {
        left.sorting_order
            .cmp(&right.sorting_order)
            .then_with(|| right.depth.total_cmp(&left.depth))
    });
    sprites.into_iter().map(|sprite| sprite.primitive).collect()
}

fn active_in_hierarchy(world: &World, entity: Entity) -> bool {
    let mut current = Some(entity);
    let mut visited = HashSet::new();
    while let Some(value) = current {
        if !visited.insert(value) || !world.entity_active(value) {
            return false;
        }
        current = world
            .get_component::<Parent>(value)
            .map(|parent| parent.entity);
    }
    true
}

fn project_sprite(
    transform: &Transform,
    sprite: &SpriteRenderer,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Option<ProjectedSprite> {
    if sprite.color[3] <= 0.0 {
        return None;
    }
    let position = Vec3::from(transform.position);
    let rotation = safe_rotation(transform.rotation);
    let half_width = sprite.size[0].abs() * transform.scale[0].abs() * 0.5;
    let half_height = sprite.size[1].abs() * transform.scale[1].abs() * 0.5;
    if half_width <= 0.0 || half_height <= 0.0 {
        return None;
    }
    let center = project_world_to_viewport(position, camera, viewport)?;
    let right =
        project_world_to_viewport(position + rotation * Vec3::X * half_width, camera, viewport)?;
    let up = project_world_to_viewport(
        position + rotation * Vec3::Y * half_height,
        camera,
        viewport,
    )?;
    let width = 2.0 * (right[0] - center[0]).hypot(right[1] - center[1]);
    let height = 2.0 * (up[0] - center[0]).hypot(up[1] - center[1]);
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return None;
    }
    let rect = [
        center[0] - width * 0.5,
        center[1] - height * 0.5,
        width,
        height,
    ];
    if rect[0] >= viewport[0] as f32
        || rect[1] >= viewport[1] as f32
        || rect[0] + rect[2] <= 0.0
        || rect[1] + rect[3] <= 0.0
    {
        return None;
    }
    Some(ProjectedSprite {
        sorting_order: sprite.sorting_order,
        depth: center[2],
        primitive: UiPrimitive {
            rect,
            color: sprite.color,
            pivot: [0.5, 0.5],
            rotation_radians: (right[1] - center[1]).atan2(right[0] - center[0]),
            uv: [0.0, 0.0, 1.0, 1.0],
            key: UiBatchKey {
                material: "sprite/default".into(),
                texture: if sprite.sprite.is_empty() {
                    "white".into()
                } else {
                    sprite.sprite.clone()
                },
                clip: None,
                blend: UiBlendMode::Alpha,
            },
        },
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

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_rhi::{look_at, orthographic};

    fn camera() -> FrameCamera {
        FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: orthographic(5.0, 2.0, 0.01, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        }
    }

    #[test]
    fn projects_world_sprite_size_color_texture_and_rotation() {
        let transform = Transform {
            rotation: [
                0.0,
                0.0,
                (22.5_f32).to_radians().sin(),
                (22.5_f32).to_radians().cos(),
            ],
            scale: [2.0, 1.0, 1.0],
            ..Default::default()
        };
        let sprite = SpriteRenderer {
            sprite: "Assets/Sprites/hero.png".into(),
            color: [0.25, 0.5, 1.0, 0.8],
            size: [2.0, 2.0],
            sorting_order: 4,
        };
        let projected = project_sprite(&transform, &sprite, camera(), [200, 100]).unwrap();

        assert!((projected.primitive.rect[2] - 40.0).abs() < 0.001);
        assert!((projected.primitive.rect[3] - 20.0).abs() < 0.001);
        assert!((projected.primitive.rotation_radians + std::f32::consts::FRAC_PI_4).abs() < 0.001);
        assert_eq!(projected.primitive.color, sprite.color);
        assert_eq!(projected.primitive.key.texture, sprite.sprite);
    }

    #[test]
    fn collection_honors_hierarchy_activity_and_sorting_order() {
        let mut world = World::new();
        let hidden_parent = world.spawn_empty();
        world.set_editor_state(hidden_parent, 0, false);
        for (name, sorting_order, parent) in [
            ("front", 10, None),
            ("back", -5, None),
            ("hidden", 20, Some(hidden_parent)),
        ] {
            let entity = world.spawn_empty();
            world.insert_component(entity, Transform::default());
            world.insert_component(
                entity,
                SpriteRenderer {
                    sprite: name.into(),
                    sorting_order,
                    ..Default::default()
                },
            );
            if let Some(parent) = parent {
                world.set_parent(entity, Some(parent));
            }
        }

        let sprites = collect_world_sprites(&world, camera(), [200, 100]);
        assert_eq!(sprites.len(), 2);
        assert_eq!(sprites[0].key.texture, "back");
        assert_eq!(sprites[1].key.texture, "front");
    }
}
