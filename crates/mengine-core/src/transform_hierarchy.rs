use crate::generated::Transform;
use crate::{Entity, Parent, World};
use glam::{Mat4, Quat, Vec3};
use std::collections::HashMap;

/// Resolved world-space TRS and exact hierarchy matrix for one entity.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldTransform {
    pub position: Vec3,
    pub rotation: Quat,
    pub scale: Vec3,
    pub matrix: Mat4,
}

impl WorldTransform {
    pub const IDENTITY: Self = Self {
        position: Vec3::ZERO,
        rotation: Quat::IDENTITY,
        scale: Vec3::ONE,
        matrix: Mat4::IDENTITY,
    };

    pub fn from_local(transform: &Transform) -> Self {
        let position = finite_vec3(Vec3::from(transform.position), Vec3::ZERO);
        let scale = finite_vec3(Vec3::from(transform.scale), Vec3::ONE);
        let raw_rotation = Quat::from_xyzw(
            transform.rotation[0],
            transform.rotation[1],
            transform.rotation[2],
            transform.rotation[3],
        );
        let rotation = finite_rotation(raw_rotation);
        Self {
            position,
            rotation,
            scale,
            matrix: Mat4::from_scale_rotation_translation(scale, rotation, position),
        }
    }

    pub fn compose(self, local: Self) -> Self {
        let position = self.matrix.transform_point3(local.position);
        let rotation = finite_rotation(self.rotation * local.rotation);
        let scale = finite_vec3(self.scale * local.scale, Vec3::ONE);
        Self {
            position,
            rotation,
            scale,
            // Matrix multiplication preserves shear produced by rotated children
            // below non-uniformly scaled parents, unlike decomposing back to TRS.
            matrix: self.matrix * local.matrix,
        }
    }

    pub fn to_transform(self) -> Transform {
        Transform {
            position: self.position.to_array(),
            rotation: [
                self.rotation.x,
                self.rotation.y,
                self.rotation.z,
                self.rotation.w,
            ],
            scale: self.scale.to_array(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct ResolvedNode {
    active: bool,
    has_transform: bool,
    aggregate: WorldTransform,
}

impl ResolvedNode {
    const INVALID: Self = Self {
        active: false,
        has_transform: false,
        aggregate: WorldTransform::IDENTITY,
    };
}

#[derive(Clone, Copy, Debug)]
enum ResolveState {
    Visiting,
    Done(ResolvedNode),
}

/// Immutable per-frame hierarchy cache shared by render, physics, audio, and tooling systems.
#[derive(Clone, Debug, Default)]
pub struct TransformHierarchy {
    nodes: HashMap<Entity, ResolvedNode>,
}

impl TransformHierarchy {
    /// MiYu: Inactive records need no own transform; referenced ancestors are still resolved.
    pub fn build(world: &World) -> Self { Self::build_for_entities(world, world.iter_entities().filter(|entity| world.entity_active(*entity))) }

    /// Resolves the requested entities and their ancestors without traversing unrelated branches.
    pub fn build_for_entities(world: &World, entities: impl IntoIterator<Item = Entity>) -> Self {
        let mut states = HashMap::new();
        for entity in entities {
            resolve_node(world, entity, &mut states);
        }
        let nodes = states
            .into_iter()
            .filter_map(|(entity, state)| match state {
                ResolveState::Done(node) => Some((entity, node)),
                ResolveState::Visiting => None,
            })
            .collect();
        Self { nodes }
    }

    pub fn is_active(&self, entity: Entity) -> bool {
        self.nodes.get(&entity).is_some_and(|node| node.active)
    }

    pub fn get(&self, entity: Entity) -> Option<WorldTransform> {
        self.nodes
            .get(&entity)
            .filter(|node| node.active && node.has_transform)
            .map(|node| node.aggregate)
    }

    /// Returns the parent's resolved aggregate, or identity for root entities.
    pub fn parent_world(&self, world: &World, entity: Entity) -> Option<WorldTransform> {
        let parent = world
            .get_component::<Parent>(entity)
            .map(|value| value.entity);
        match parent {
            Some(parent) => self
                .nodes
                .get(&parent)
                .filter(|node| node.active)
                .map(|node| node.aggregate),
            None => Some(WorldTransform::IDENTITY),
        }
    }
}

fn resolve_node(
    world: &World,
    entity: Entity,
    states: &mut HashMap<Entity, ResolveState>,
) -> ResolvedNode {
    match states.get(&entity).copied() {
        Some(ResolveState::Done(node)) => return node,
        Some(ResolveState::Visiting) => return ResolvedNode::INVALID,
        None => {}
    }
    if !world.is_alive(entity) {
        return ResolvedNode::INVALID;
    }
    states.insert(entity, ResolveState::Visiting);

    let parent = world
        .get_component::<Parent>(entity)
        .map(|value| value.entity);
    let parent_node = parent.map_or(
        ResolvedNode {
            active: true,
            has_transform: false,
            aggregate: WorldTransform::IDENTITY,
        },
        |parent| resolve_node(world, parent, states),
    );
    let local = world
        .get_component::<Transform>(entity)
        .map(WorldTransform::from_local);
    let node = ResolvedNode {
        active: parent_node.active && world.entity_active(entity),
        has_transform: local.is_some(),
        aggregate: local.map_or(parent_node.aggregate, |local| {
            parent_node.aggregate.compose(local)
        }),
    };
    states.insert(entity, ResolveState::Done(node));
    node
}

fn finite_vec3(value: Vec3, fallback: Vec3) -> Vec3 {
    Vec3::new(
        if value.x.is_finite() {
            value.x
        } else {
            fallback.x
        },
        if value.y.is_finite() {
            value.y
        } else {
            fallback.y
        },
        if value.z.is_finite() {
            value.z
        } else {
            fallback.z
        },
    )
}

fn finite_rotation(value: Quat) -> Quat {
    if value.is_finite() && value.length_squared() > 0.000001 {
        value.normalize()
    } else {
        Quat::IDENTITY
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transform(position: [f32; 3], rotation: Quat, scale: [f32; 3]) -> Transform {
        Transform {
            position,
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
            scale,
        }
    }

    #[test]
    fn subset_resolves_ancestors_and_matches_full_hierarchy_in_sparse_world() {
        let mut world = World::new();
        let child = world.spawn_empty();
        let group = world.spawn_empty();
        let root = world.spawn_empty();
        world.insert_component(root, transform([3.0, 4.0, 5.0], Quat::from_rotation_y(0.8), [2.0, 3.0, -1.0]));
        world.insert_component(child, transform([1.0, 2.0, 3.0], Quat::from_rotation_z(0.4), [1.0; 3]));
        world.set_parent(child, Some(group));
        world.set_parent(group, Some(root));
        for _ in 0..90_000 { let unrelated = world.spawn_empty(); world.insert_component(unrelated, Transform::default()); }
        let subset = TransformHierarchy::build_for_entities(&world, [child, child]);
        let full = TransformHierarchy::build(&world);
        assert_eq!(subset.nodes.len(), 3);
        assert_eq!(subset.get(child), full.get(child));
        assert_eq!(subset.parent_world(&world, child), full.parent_world(&world, child));
        assert_eq!(subset.get(group), None);
        for state in 0..3 {
            world.set_editor_state(root, 0, state != 0);
            if state == 1 { world.insert_component(root, Parent { entity: child }); }
            if state == 2 { world.insert_component(root, Parent { entity: Entity::new(900_000, 0) }); }
            let subset = TransformHierarchy::build_for_entities(&world, [child]);
            let full = TransformHierarchy::build(&world);
            assert_eq!(subset.is_active(child), full.is_active(child));
            assert_eq!(subset.get(child), full.get(child));
            assert!(!subset.is_active(child));
        }
    }

    #[test]
    fn resolves_nested_rotation_scale_and_translation_once() {
        let mut world = World::new();
        let parent = world.spawn_empty();
        world.insert_component(
            parent,
            transform(
                [10.0, 0.0, 0.0],
                Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
                [2.0, 3.0, 1.0],
            ),
        );
        let child = world.spawn_empty();
        world.insert_component(child, transform([1.0, 0.0, 0.0], Quat::IDENTITY, [0.5; 3]));
        world.set_parent(child, Some(parent));

        let hierarchy = TransformHierarchy::build(&world);
        let resolved = hierarchy.get(child).unwrap();
        assert!((resolved.position - Vec3::new(10.0, 2.0, 0.0)).length() < 0.0001);
        assert!((resolved.scale - Vec3::new(1.0, 1.5, 0.5)).length() < 0.0001);
        let transformed_origin = resolved.matrix.transform_point3(Vec3::ZERO);
        assert!((transformed_origin - resolved.position).length() < 0.0001);
    }

    #[test]
    fn active_build_matches_full_cache_for_inactive_pools_and_reactivation() {
        let mut world = World::new();
        let root = world.spawn_empty(); let group = world.spawn_empty(); let child = world.spawn_empty();
        world.insert_component(root, transform([3.0, 4.0, 5.0], Quat::from_rotation_z(0.6), [2.0, 3.0, 1.0]));
        world.insert_component(child, transform([2.0, 1.0, 0.0], Quat::from_rotation_y(0.4), [-1.0, 2.0, 1.0]));
        world.set_parent(group, Some(root)); world.set_parent(child, Some(group));
        for _ in 0..10_000 {
            let pooled = world.spawn_empty(); world.insert_component(pooled, Transform::default());
            world.set_parent(pooled, Some(root)); world.set_editor_state(pooled, 0, false);
        }
        let pooled = world.iter_entities().last().unwrap();
        for phase in 0..4 {
            world.set_editor_state(group, 0, phase != 1);
            world.set_editor_state(pooled, 0, phase == 2);
            let compact = TransformHierarchy::build(&world);
            let all = TransformHierarchy::build_for_entities(&world, world.iter_entities());
            for entity in world.iter_entities() {
                assert_eq!(compact.is_active(entity), all.is_active(entity));
                assert_eq!(compact.get(entity), all.get(entity));
                assert_eq!(compact.parent_world(&world, entity), all.parent_world(&world, entity));
            }
            assert!(compact.nodes.len() <= 4);
            assert_eq!(all.nodes.len(), 10_003);
        }
    }

    #[test]
    fn inactive_missing_and_cyclic_parents_disable_the_whole_branch() {
        let mut world = World::new();
        let root = world.spawn_empty();
        let child = world.spawn_empty();
        world.insert_component(root, Transform::default());
        world.insert_component(child, Transform::default());
        world.set_parent(child, Some(root));
        world.set_editor_state(root, 0, false);
        let hierarchy = TransformHierarchy::build(&world);
        assert!(!hierarchy.is_active(child));
        assert!(hierarchy.get(child).is_none());

        world.set_editor_state(root, 0, true);
        world.insert_component(root, Parent { entity: child });
        let hierarchy = TransformHierarchy::build(&world);
        assert!(!hierarchy.is_active(root));
        assert!(!hierarchy.is_active(child));
    }

    #[test]
    fn transformless_parents_preserve_ancestor_space_for_children() {
        let mut world = World::new();
        let root = world.spawn_empty();
        world.insert_component(root, transform([3.0, 0.0, 0.0], Quat::IDENTITY, [1.0; 3]));
        let group = world.spawn_empty();
        world.set_parent(group, Some(root));
        let child = world.spawn_empty();
        world.insert_component(child, transform([2.0, 0.0, 0.0], Quat::IDENTITY, [1.0; 3]));
        world.set_parent(child, Some(group));
        let hierarchy = TransformHierarchy::build(&world);
        assert_eq!(
            hierarchy.get(child).unwrap().position,
            Vec3::new(5.0, 0.0, 0.0)
        );
        assert!(hierarchy.get(group).is_none());
    }
}
