use crate::sorting::{WorldPrimitive, WorldPrimitiveKind};
use crate::sprites::project_world_segment;
use glam::{Vec3, Vec4};
use mengine_core::generated::TrailRenderer2D;
use mengine_core::{Entity, TransformHierarchy, World};
use mengine_rhi::{FrameCamera, UiBlendMode};
use std::collections::{HashMap, HashSet};

const MAX_TRAIL_POINTS: usize = 2_048;
const MAX_DELTA: f32 = 0.25;

#[derive(Clone, Copy, Debug)]
struct TrailPoint {
    position: Vec3,
    age: f32,
}

#[derive(Default)]
struct TrailState {
    points: Vec<TrailPoint>,
    head: Option<Vec3>,
}

#[derive(Default)]
pub struct TrailWorld {
    trails: HashMap<Entity, TrailState>,
}

impl TrailWorld {
    pub fn update_and_collect_world_with_hierarchy(
        &mut self,
        world: &World,
        hierarchy: &TransformHierarchy,
        camera: FrameCamera,
        viewport: [u32; 2],
        delta_seconds: f32,
    ) -> Vec<WorldPrimitive> {
        let mut live = HashSet::new();
        let mut output = Vec::new();
        for entity in world.iter_entities() {
            let Some(component) = world.get_component::<TrailRenderer2D>(entity) else {
                continue;
            };
            let Some(transform) = hierarchy.get(entity) else {
                continue;
            };
            if !component.enabled {
                continue;
            }
            live.insert(entity);
            let state = self.trails.entry(entity).or_default();
            step_trail(
                state,
                component,
                Vec3::from(transform.position),
                delta_seconds,
            );
            collect_trail(state, component, camera, viewport, &mut output);
        }
        self.trails.retain(|entity, _| live.contains(entity));
        output
    }
}

fn step_trail(
    state: &mut TrailState,
    component: &TrailRenderer2D,
    position: Vec3,
    delta_seconds: f32,
) {
    let delta = delta_seconds.clamp(0.0, MAX_DELTA);
    let lifetime = component.time.max(0.01);
    for point in &mut state.points {
        point.age += delta;
    }
    state.points.retain(|point| point.age < lifetime);
    if !component.emitting {
        state.head = None;
        return;
    }
    state.head = Some(position);
    let minimum = component.min_vertex_distance.max(0.0001);
    if state
        .points
        .last()
        .is_none_or(|last| last.position.distance(position) >= minimum)
    {
        state.points.push(TrailPoint { position, age: 0.0 });
    }
    let max_points = (component.max_points.max(2) as usize).min(MAX_TRAIL_POINTS);
    if state.points.len() > max_points {
        state.points.drain(0..state.points.len() - max_points);
    }
}

fn collect_trail(
    state: &TrailState,
    component: &TrailRenderer2D,
    camera: FrameCamera,
    viewport: [u32; 2],
    output: &mut Vec<WorldPrimitive>,
) {
    let mut path = state.points.clone();
    if let Some(head) = state.head {
        if path
            .last()
            .is_none_or(|last| last.position.distance(head) > 0.000001)
        {
            path.push(TrailPoint {
                position: head,
                age: 0.0,
            });
        }
    }
    let lifetime = component.time.max(0.01);
    let width_start = component.width_start.max(0.0);
    let width_end = component.width_end.max(0.0);
    let color_start = Vec4::from_array(component.color_start);
    let color_end = Vec4::from_array(component.color_end);
    let blend = if component.blend_mode.eq_ignore_ascii_case("additive") {
        UiBlendMode::Additive
    } else {
        UiBlendMode::Alpha
    };
    for points in path.windows(2) {
        let progress = (((points[0].age + points[1].age) * 0.5) / lifetime).clamp(0.0, 1.0);
        let width = width_start + (width_end - width_start) * progress;
        let color = color_start.lerp(color_end, progress).to_array();
        if let Some(mut primitive) = project_world_segment(
            points[0].position,
            points[1].position,
            width,
            color,
            &component.sorting_layer,
            component.sorting_order,
            &component.texture,
            blend,
            "trail2d/default",
            camera,
            viewport,
        ) {
            primitive.kind = WorldPrimitiveKind::TwoD;
            output.push(primitive);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::generated::Transform;
    use mengine_rhi::{look_at, orthographic};

    fn camera() -> FrameCamera {
        FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: orthographic(10.0, 1.0, 0.01, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        }
    }

    #[test]
    fn moving_entities_emit_bounded_fading_segments() {
        let component = TrailRenderer2D {
            min_vertex_distance: 0.1,
            max_points: 3,
            time: 0.5,
            sorting_layer: "effects".into(),
            sorting_order: 7,
            texture: "Assets/Sprites/trail.png".into(),
            ..TrailRenderer2D::default()
        };
        let mut state = TrailState::default();
        for index in 0..5 {
            step_trail(
                &mut state,
                &component,
                Vec3::new(index as f32 * 0.2, 0.0, 0.0),
                0.1,
            );
        }
        assert_eq!(state.points.len(), 3);
        let mut output = Vec::new();
        collect_trail(&state, &component, camera(), [200, 200], &mut output);
        assert_eq!(output.len(), 2);
        assert!(output.iter().all(|item| item.sorting_layer == "effects"));
        assert!(output.iter().all(|item| item.sorting_order == 7));
        assert!(output
            .iter()
            .all(|item| item.primitive.key.texture == "Assets/Sprites/trail.png"));

        let mut stopped = component.clone();
        stopped.emitting = false;
        step_trail(&mut state, &stopped, Vec3::ZERO, 0.5);
        step_trail(&mut state, &stopped, Vec3::ZERO, 0.5);
        output.clear();
        collect_trail(&state, &stopped, camera(), [200, 200], &mut output);
        assert!(output.is_empty());
    }

    #[test]
    fn world_skips_inactive_hierarchies_and_drops_stale_state() {
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(entity, TrailRenderer2D::default());
        let mut trails = TrailWorld::default();
        let hierarchy = TransformHierarchy::build(&world);
        trails.update_and_collect_world_with_hierarchy(
            &world,
            &hierarchy,
            camera(),
            [200, 200],
            0.1,
        );
        assert!(trails.trails.contains_key(&entity));
        world.set_editor_state(entity, 0, false);
        let hierarchy = TransformHierarchy::build(&world);
        trails.update_and_collect_world_with_hierarchy(
            &world,
            &hierarchy,
            camera(),
            [200, 200],
            0.1,
        );
        assert!(!trails.trails.contains_key(&entity));
    }

    #[test]
    fn world_emits_a_segment_after_the_transform_moves() {
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(entity, TrailRenderer2D {
            min_vertex_distance: 0.01,
            width_start: 0.5,
            ..TrailRenderer2D::default()
        });
        let mut trails = TrailWorld::default();
        let hierarchy = TransformHierarchy::build(&world);
        assert!(trails
            .update_and_collect_world_with_hierarchy(
                &world,
                &hierarchy,
                camera(),
                [200, 200],
                0.1,
            )
            .is_empty());

        world.get_component_mut::<Transform>(entity).unwrap().position[0] = 1.0;
        let hierarchy = TransformHierarchy::build(&world);
        let primitives = trails.update_and_collect_world_with_hierarchy(
            &world,
            &hierarchy,
            camera(),
            [200, 200],
            0.1,
        );
        assert_eq!(primitives.len(), 1);
        assert!(primitives[0].primitive.rect[2] > 0.0);
        assert!(primitives[0].primitive.rect[3] > 0.0);
    }
}
