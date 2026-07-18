use crate::sorting::{sort_world_primitives, SortingLayers, WorldPrimitive, WorldPrimitiveKind};
use glam::{Quat, Vec3};
use mengine_core::generated::{AnimatedSprite2D, Grid, Line2D, SpriteRenderer, Tilemap, Transform};
use mengine_core::{Entity, Parent, TransformHierarchy, World};
use mengine_rhi::{project_world_to_viewport, FrameCamera, UiBatchKey, UiBlendMode, UiPrimitive};
use std::collections::{BTreeMap, HashSet};

const MAX_TILEMAP_TILES: usize = 100_000;

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
        if let Some(tilemap) = world.get_component::<Tilemap>(entity) {
            sprites.extend(project_tilemap(
                &transform,
                tilemap,
                nearest_grid(world, entity),
                camera,
                viewport,
            ));
            continue;
        }
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

fn nearest_grid(world: &World, entity: Entity) -> Option<&Grid> {
    let mut current = Some(entity);
    let mut visited = HashSet::new();
    while let Some(candidate) = current {
        if !visited.insert(candidate) {
            return None;
        }
        if let Some(grid) = world.get_component::<Grid>(candidate) {
            return Some(grid);
        }
        current = world
            .get_component::<Parent>(candidate)
            .map(|parent| parent.entity);
    }
    None
}

fn project_tilemap(
    transform: &Transform,
    tilemap: &Tilemap,
    grid: Option<&Grid>,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Vec<WorldPrimitive> {
    if tilemap.color[3] <= 0.0 {
        return Vec::new();
    }
    let default_grid = Grid::default();
    let grid = grid.unwrap_or(&default_grid);
    if !grid.cell_layout.eq_ignore_ascii_case("rectangle") {
        return Vec::new();
    }
    let cell_size = sanitize_positive_pair(grid.cell_size, [1.0, 1.0]);
    let cell_gap = sanitize_pair(grid.cell_gap, [0.0, 0.0]);
    let step = [cell_size[0] + cell_gap[0], cell_size[1] + cell_gap[1]];
    if !step[0].is_finite()
        || !step[1].is_finite()
        || step[0].abs() <= f32::EPSILON
        || step[1].abs() <= f32::EPSILON
    {
        return Vec::new();
    }

    // Sparse cells are canonicalized here as well as in the editor so hand-authored scenes
    // cannot create duplicate overdraw or unbounded work. The last duplicate wins.
    let mut cells = BTreeMap::new();
    for (cell, sprite) in tilemap.cells.iter().zip(&tilemap.sprites) {
        let Some(key) = tile_key(*cell) else {
            continue;
        };
        if cells.len() >= MAX_TILEMAP_TILES && !cells.contains_key(&key) {
            continue;
        }
        cells.insert(key, sprite.as_str());
    }

    let origin = Vec3::from(transform.position);
    let scale = Vec3::from(transform.scale);
    let rotation = safe_rotation(transform.rotation);
    cells
        .into_iter()
        .filter_map(|((x, y), sprite)| {
            let local = Vec3::new(x as f32 * step[0], y as f32 * step[1], 0.0);
            let position = origin + rotation * (local * scale);
            project_sprite(
                &Transform {
                    position: position.to_array(),
                    rotation: transform.rotation,
                    scale: transform.scale,
                },
                &SpriteRenderer {
                    sprite: if sprite.is_empty() { "white" } else { sprite }.into(),
                    color: tilemap.color,
                    size: cell_size,
                    pivot: tilemap.tile_anchor,
                    flip_x: false,
                    flip_y: false,
                    sorting_layer: tilemap.sorting_layer.clone(),
                    sorting_order: tilemap.sorting_order,
                },
                camera,
                viewport,
            )
        })
        .collect()
}

fn tile_key(cell: [f32; 2]) -> Option<(i32, i32)> {
    if !cell[0].is_finite() || !cell[1].is_finite() {
        return None;
    }
    let x = f64::from(cell[0]).round();
    let y = f64::from(cell[1]).round();
    if x < f64::from(i32::MIN)
        || x > f64::from(i32::MAX)
        || y < f64::from(i32::MIN)
        || y > f64::from(i32::MAX)
    {
        return None;
    }
    Some((x as i32, y as i32))
}

fn sanitize_pair(value: [f32; 2], fallback: [f32; 2]) -> [f32; 2] {
    [
        if value[0].is_finite() {
            value[0]
        } else {
            fallback[0]
        },
        if value[1].is_finite() {
            value[1]
        } else {
            fallback[1]
        },
    ]
}

fn sanitize_positive_pair(value: [f32; 2], fallback: [f32; 2]) -> [f32; 2] {
    let value = sanitize_pair(value, fallback);
    [value[0].abs().max(0.0001), value[1].abs().max(0.0001)]
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
                world_position: Some([midpoint.x, midpoint.y]),
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
        world_position: Some([position.x, position.y]),
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

    #[test]
    fn tilemap_uses_nearest_parent_grid_and_canonicalizes_sparse_cells() {
        let mut world = World::new();
        let grid_entity = world.spawn_empty();
        world.insert_component(grid_entity, Transform::default());
        world.insert_component(
            grid_entity,
            Grid {
                cell_size: [2.0, 1.0],
                cell_gap: [0.5, 0.0],
                cell_layout: "Rectangle".into(),
            },
        );
        let tilemap_entity = world.spawn_empty();
        world.insert_component(tilemap_entity, Transform::default());
        world.insert_component(
            tilemap_entity,
            Tilemap {
                cells: vec![[1.0, 0.0], [0.0, 0.0], [1.2, 0.1], [f32::NAN, 2.0]],
                sprites: vec!["old".into(), "origin".into(), "new".into(), "bad".into()],
                sorting_order: 7,
                ..Default::default()
            },
        );
        world.set_parent(tilemap_entity, Some(grid_entity));

        let sprites = collect_world_sprites(&world, camera(), [200, 100]);
        assert_eq!(sprites.len(), 2);
        assert_eq!(sprites[0].key.texture, "origin");
        assert_eq!(sprites[1].key.texture, "new");
        assert!((sprites[1].rect[0] - 115.0).abs() < 0.001);
        assert!((sprites[1].rect[2] - 20.0).abs() < 0.001);
    }

    #[test]
    fn tilemap_rejects_unsupported_layout_and_mismatched_parallel_entries() {
        let tilemap = Tilemap {
            cells: vec![[0.0, 0.0], [1.0, 0.0]],
            sprites: vec!["only-first".into()],
            ..Default::default()
        };
        assert_eq!(
            project_tilemap(
                &Transform::default(),
                &tilemap,
                Some(&Grid::default()),
                camera(),
                [200, 100],
            )
            .len(),
            1
        );
        assert!(project_tilemap(
            &Transform::default(),
            &tilemap,
            Some(&Grid {
                cell_layout: "Hexagon".into(),
                ..Default::default()
            }),
            camera(),
            [200, 100],
        )
        .is_empty());
        assert!(project_tilemap(
            &Transform::default(),
            &tilemap,
            Some(&Grid {
                cell_size: [f32::MAX, 1.0],
                cell_gap: [f32::MAX, 0.0],
                ..Default::default()
            }),
            camera(),
            [200, 100],
        )
        .is_empty());
        assert_eq!(tile_key([2_147_483_648.0, 0.0]), None);
    }
}
