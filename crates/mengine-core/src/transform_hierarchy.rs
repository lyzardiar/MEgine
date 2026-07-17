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
    pub fn build(world: &World) -> Self {
        let mut states = HashMap::new();
        for entity in world.iter_entities() {
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
