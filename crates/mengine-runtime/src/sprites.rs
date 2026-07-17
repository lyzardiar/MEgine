use crate::sorting::{sort_world_primitives, SortingLayers, WorldPrimitive, WorldPrimitiveKind};
use glam::{Quat, Vec3};
use mengine_core::generated::{AnimatedSprite2D, Line2D, SpriteRenderer, Transform};
use mengine_core::{TransformHierarchy, World};
use mengine_rhi::{project_world_to_viewport, FrameCamera, UiBatchKey, UiBlendMode, UiPrimitive};

pub fn collect_world_sprites(
    world: &World,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Vec<UiPrimitive> {
    let hierarchy = TransformHierarchy::build(world);
    collect_world_sprites_with_hierarchy(world, &hierarchy, camera, viewport)
}

pub fn collect_world_sprites_with_hierarchy(
    world: &World,
    hierarchy: &TransformHierarchy,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Vec<UiPrimitive> {
    let mut sprites = collect_world_primitives_with_hierarchy(world, hierarchy, camera, viewport);
    sort_world_primitives(&mut sprites, &SortingLayers::default());
    sprites.into_iter().map(|sprite| sprite.primitive).collect()
}

pub fn collect_world_primitives_with_hierarchy(
    world: &World,
    hierarchy: &TransformHierarchy,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Vec<WorldPrimitive> {
    let mut sprites = Vec::new();
    for entity in world.iter_entities() {
        let Some(transform) = hierarchy.get(entity).map(|value| value.to_transform()) else {
            continue;
        };
        if let Some(line) = world.get_component::<Line2D>(entity) {
            sprites.extend(project_line(&transform, line, camera, viewport));
            continue;
        }
        let animated = world.get_component::<AnimatedSprite2D>(entity);
        let static_sprite = world.get_component::<SpriteRenderer>(entity);
        let resolved;
        let sprite = if let Some(animation) = animated {
            resolved = SpriteRenderer {
                sprite: resolve_animated_frame(animation, world.time.elapsed).into(),
                color: animation.color,
                size: animation.size,
                pivot: animation.pivot,
                flip_x: animation.flip_x,
                flip_y: animation.flip_y,
                sorting_layer: animation.sorting_layer.clone(),
                sorting_order: animation.sorting_order,
            };
            &resolved
        } else if let Some(sprite) = static_sprite {
            sprite
        } else {
            continue;
        };
        if let Some(projected) = project_sprite(&transform, sprite, camera, viewport) {
            sprites.push(projected);
        }
    }
    sprites
}

fn project_line(
    transform: &Transform,
    line: &Line2D,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Vec<WorldPrimitive> {
    if line.points.len() < 2 || line.width <= 0.0 || line.color[3] <= 0.0 {
        return Vec::new();
    }
    let position = Vec3::from(transform.position);
    let scale = Vec3::from(transform.scale);
    let rotation = safe_rotation(transform.rotation);
    let mut pairs: Vec<([f32; 2], [f32; 2])> = line
        .points
        .windows(2)
        .map(|points| (points[0], points[1]))
        .collect();
    if line.closed && line.points.len() > 2 {
        pairs.push((*line.points.last().unwrap(), line.points[0]));
    }
    pairs
        .into_iter()
        .filter_map(|(start, end)| {
            let local_delta = Vec3::new(end[0] - start[0], end[1] - start[1], 0.0);
            let local_length = local_delta.length();
            if local_length <= 0.000001 {
                return None;
            }
            let local_start = Vec3::new(start[0], start[1], 0.0) * scale;
            let local_end = Vec3::new(end[0], end[1], 0.0) * scale;
            let world_start = position + rotation * local_start;
            let world_end = position + rotation * local_end;
            let midpoint = (world_start + world_end) * 0.5;
            let normal = Vec3::new(-local_delta.y, local_delta.x, 0.0) / local_length;
            let normal_offset =
                rotation * (Vec3::new(normal.x, normal.y, 0.0) * scale * (line.width * 0.5));
            let start_screen = project_world_to_viewport(world_start, camera, viewport)?;
            let end_screen = project_world_to_viewport(world_end, camera, viewport)?;
            let midpoint_screen = project_world_to_viewport(midpoint, camera, viewport)?;
            let normal_screen =
                project_world_to_viewport(midpoint + normal_offset, camera, viewport)?;
            let dx = end_screen[0] - start_screen[0];
            let dy = end_screen[1] - start_screen[1];
            let length = dx.hypot(dy);
            let width = (2.0
                * (normal_screen[0] - midpoint_screen[0])
                    .hypot(normal_screen[1] - midpoint_screen[1]))
            .max(0.5);
            if !length.is_finite() || !width.is_finite() || length <= 0.0 {
                return None;
            }
            Some(WorldPrimitive {
                kind: WorldPrimitiveKind::TwoD,
                sorting_layer: line.sorting_layer.clone(),
                sorting_order: line.sorting_order,
                depth: (start_screen[2] + end_screen[2]) * 0.5,
                primitive: UiPrimitive {
                    rect: [
                        (start_screen[0] + end_screen[0] - length) * 0.5,
                        (start_screen[1] + end_screen[1] - width) * 0.5,
                        length,
                        width,
                    ],
                    color: line.color,
                    pivot: [0.5, 0.5],
                    rotation_radians: dy.atan2(dx),
                    uv: [0.0, 0.0, 1.0, 1.0],
                    key: UiBatchKey {
                        material: "line2d/default".into(),
                        texture: "white".into(),
                        clip: None,
                        blend: UiBlendMode::Alpha,
                    },
                },
            })
        })
        .collect()
}

fn animated_frame_index(animation: &AnimatedSprite2D, elapsed_seconds: f64) -> Option<usize> {
    let count = animation.frames.len();
    if count == 0 {
        return None;
    }
    let base = animation.frame.clamp(0, count as i32 - 1) as usize;
    if !animation.playing || animation.fps <= 0.0 || !elapsed_seconds.is_finite() {
        return Some(base);
    }
    let advanced =
        base.saturating_add((elapsed_seconds.max(0.0) * animation.fps as f64).floor() as usize);
    Some(if animation.looped {
        advanced % count
    } else {
        advanced.min(count - 1)
    })
}

fn resolve_animated_frame(animation: &AnimatedSprite2D, elapsed_seconds: f64) -> &str {
    animated_frame_index(animation, elapsed_seconds)
        .and_then(|index| animation.frames.get(index))
        .map(String::as_str)
        .filter(|frame| !frame.is_empty())
        .unwrap_or("white")
}

fn project_sprite(
    transform: &Transform,
    sprite: &SpriteRenderer,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Option<WorldPrimitive> {
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
    let pivot = normalized_pivot(sprite.pivot);
    let screen_pivot = [pivot[0], 1.0 - pivot[1]];
    let rect = [
        center[0] - width * screen_pivot[0],
        center[1] - height * screen_pivot[1],
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
    Some(WorldPrimitive {
        kind: WorldPrimitiveKind::TwoD,
        sorting_layer: sprite.sorting_layer.clone(),
        sorting_order: sprite.sorting_order,
        depth: center[2],
        primitive: UiPrimitive {
            rect,
            color: sprite.color,
            pivot: screen_pivot,
            rotation_radians: (right[1] - center[1]).atan2(right[0] - center[0]),
            uv: [
                if sprite.flip_x { 1.0 } else { 0.0 },
                if sprite.flip_y { 1.0 } else { 0.0 },
                if sprite.flip_x { -1.0 } else { 1.0 },
                if sprite.flip_y { -1.0 } else { 1.0 },
            ],
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

fn normalized_pivot(value: [f32; 2]) -> [f32; 2] {
    value.map(|part| {
        if part.is_finite() {
            part.clamp(0.0, 1.0)
        } else {
            0.5
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
            pivot: [0.25, 0.75],
            flip_x: true,
            flip_y: false,
            sorting_layer: "default".into(),
            sorting_order: 4,
        };
        let projected = project_sprite(&transform, &sprite, camera(), [200, 100]).unwrap();

        assert!((projected.primitive.rect[2] - 40.0).abs() < 0.001);
        assert!((projected.primitive.rect[3] - 20.0).abs() < 0.001);
        assert!((projected.primitive.rect[0] - 90.0).abs() < 0.001);
        assert!((projected.primitive.rect[1] - 45.0).abs() < 0.001);
        assert_eq!(projected.primitive.pivot, [0.25, 0.25]);
        assert!((projected.primitive.rotation_radians + std::f32::consts::FRAC_PI_4).abs() < 0.001);
        assert_eq!(projected.primitive.color, sprite.color);
        assert_eq!(projected.primitive.key.texture, sprite.sprite);
        assert_eq!(projected.primitive.uv, [1.0, 0.0, -1.0, 1.0]);
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

    #[test]
    fn animated_sprite_resolves_playback_loop_pause_and_render_texture() {
        let animation = AnimatedSprite2D {
            frames: vec!["idle-0".into(), "idle-1".into(), "idle-2".into()],
            fps: 4.0,
            playing: true,
            looped: true,
            frame: 0,
            flip_x: false,
            flip_y: true,
            ..Default::default()
        };
        assert_eq!(animated_frame_index(&animation, 0.26), Some(1));
        assert_eq!(animated_frame_index(&animation, 0.76), Some(0));
        assert_eq!(
            animated_frame_index(
                &AnimatedSprite2D {
                    looped: false,
                    ..animation.clone()
                },
                9.0
            ),
            Some(2)
        );
        assert_eq!(
            animated_frame_index(
                &AnimatedSprite2D {
                    playing: false,
                    frame: 2,
                    ..animation.clone()
                },
                0.26,
            ),
            Some(2)
        );

        let mut world = World::new();
        world.time.elapsed = 0.26;
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(entity, animation);
        let sprites = collect_world_sprites(&world, camera(), [200, 100]);
        assert_eq!(sprites[0].key.texture, "idle-1");
        assert_eq!(sprites[0].uv, [0.0, 1.0, 1.0, -1.0]);
    }

    #[test]
    fn line2d_projects_closed_segments_as_one_batchable_material() {
        let line = Line2D {
            points: vec![[-1.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            width: 0.2,
            color: [0.2, 0.8, 1.0, 0.75],
            closed: true,
            sorting_layer: "default".into(),
            sorting_order: 3,
        };
        let segments = project_line(&Transform::default(), &line, camera(), [200, 100]);
        assert_eq!(segments.len(), 3);
        assert!((segments[0].primitive.rect[2] - 20.0).abs() < 0.001);
        assert!((segments[0].primitive.rect[3] - 2.0).abs() < 0.001);
        assert!(segments.iter().all(|segment| {
            segment.sorting_order == 3
                && segment.primitive.key.material == "line2d/default"
                && segment.primitive.color == line.color
        }));
        let plan = mengine_rhi::UiBatchPlan::build(
            segments
                .into_iter()
                .map(|segment| segment.primitive)
                .collect(),
        );
        assert_eq!(plan.batches.len(), 1);
    }
}
