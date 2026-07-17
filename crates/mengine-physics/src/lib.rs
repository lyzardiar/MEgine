//! Rapier-backed 3D rigid-body simulation synchronized with MEngine ECS components.

use mengine_core::generated::{BoxCollider3D, RigidBody3D, SphereCollider3D, Transform};
use mengine_core::{Entity, TransformHierarchy, World};
use rapier3d::prelude::PhysicsWorld as RapierWorld;
use rapier3d::prelude::{
    ColliderBuilder, ColliderHandle, Pose, RigidBodyBuilder, RigidBodyHandle, RigidBodyType,
    Rotation, Vec3,
};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct CollisionPair {
    pub first: Entity,
    pub second: Entity,
}

impl CollisionPair {
    fn new(left: Entity, right: Entity) -> Self {
        if left.to_u64() <= right.to_u64() {
            Self {
                first: left,
                second: right,
            }
        } else {
            Self {
                first: right,
                second: left,
            }
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PhysicsStepEvents {
    pub started: Vec<CollisionPair>,
    pub stopped: Vec<CollisionPair>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BodyKind {
    Dynamic,
    Fixed,
    Kinematic,
}

#[derive(Clone, Debug, PartialEq)]
struct BodySignature {
    kind: BodyKind,
    mass: f32,
    gravity_scale: f32,
    linear_damping: f32,
    angular_damping: f32,
    lock_rotation: bool,
    ccd: bool,
    scale: [f32; 3],
    box_collider: Option<BoxColliderSignature>,
    sphere_collider: Option<SphereColliderSignature>,
}

#[derive(Clone, Debug, PartialEq)]
struct BoxColliderSignature {
    size: [f32; 3],
    center: [f32; 3],
    is_trigger: bool,
    friction: f32,
    restitution: f32,
}

#[derive(Clone, Debug, PartialEq)]
struct SphereColliderSignature {
    radius: f32,
    center: [f32; 3],
    is_trigger: bool,
    friction: f32,
    restitution: f32,
}

struct BodyDefinition {
    transform: Transform,
    rigid_body: Option<RigidBody3D>,
    signature: BodySignature,
}

struct BodyEntry {
    handle: RigidBodyHandle,
    signature: BodySignature,
}

pub struct PhysicsWorld {
    rapier: RapierWorld,
    bodies: HashMap<Entity, BodyEntry>,
    active_pairs: HashSet<CollisionPair>,
}

impl Default for PhysicsWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl PhysicsWorld {
    pub fn new() -> Self {
        Self {
            rapier: RapierWorld::new(),
            bodies: HashMap::new(),
            active_pairs: HashSet::new(),
        }
    }

    pub fn set_gravity(&mut self, gravity: [f32; 3]) {
        self.rapier.gravity = Vec3::new(
            finite_or(gravity[0], 0.0),
            finite_or(gravity[1], -9.81),
            finite_or(gravity[2], 0.0),
        );
    }

    pub fn body_count(&self) -> usize {
        self.bodies.len()
    }

    pub fn collider_count(&self) -> usize {
        self.rapier.colliders.len()
    }

    pub fn clear(&mut self) {
        *self = Self::new();
    }

    pub fn step(&mut self, world: &mut World, dt: f32) -> PhysicsStepEvents {
        let hierarchy = TransformHierarchy::build(world);
        let definitions = collect_definitions(world, &hierarchy);
        self.remove_stale_bodies(&definitions);
        for (entity, definition) in &definitions {
            let rebuild = self
                .bodies
                .get(entity)
                .is_none_or(|entry| entry.signature != definition.signature);
            if rebuild {
                self.remove_body(*entity);
                self.insert_body(*entity, definition);
            }
            self.sync_body_input(*entity, definition);
        }

        self.rapier.integration_parameters.dt = finite_or(dt, 1.0 / 60.0).clamp(0.0001, 0.1);
        self.rapier.step();
        self.write_back(world, &hierarchy);
        self.collect_events()
    }

    fn remove_stale_bodies(&mut self, definitions: &HashMap<Entity, BodyDefinition>) {
        let stale: Vec<_> = self
            .bodies
            .keys()
            .filter(|entity| !definitions.contains_key(entity))
            .copied()
            .collect();
        for entity in stale {
            self.remove_body(entity);
        }
    }

    fn remove_body(&mut self, entity: Entity) {
        if let Some(entry) = self.bodies.remove(&entity) {
            self.rapier.remove_body(entry.handle);
        }
    }

    fn insert_body(&mut self, entity: Entity, definition: &BodyDefinition) {
        let rigid_body = definition.rigid_body.as_ref();
        let kind = definition.signature.kind;
        let body_type = match kind {
            BodyKind::Dynamic => RigidBodyType::Dynamic,
            BodyKind::Fixed => RigidBodyType::Fixed,
            BodyKind::Kinematic => RigidBodyType::KinematicPositionBased,
        };
        let velocity = rigid_body.map_or([0.0; 3], |body| finite_vec3(body.velocity, [0.0; 3]));
        let angular_velocity = rigid_body.map_or([0.0; 3], |body| {
            finite_vec3(body.angular_velocity, [0.0; 3])
        });
        let mut builder = RigidBodyBuilder::new(body_type)
            .pose(transform_pose(&definition.transform))
            .linvel(Vec3::new(velocity[0], velocity[1], velocity[2]))
            .angvel(Vec3::new(
                angular_velocity[0],
                angular_velocity[1],
                angular_velocity[2],
            ))
            .gravity_scale(definition.signature.gravity_scale)
            .linear_damping(definition.signature.linear_damping)
            .angular_damping(definition.signature.angular_damping)
            .ccd_enabled(definition.signature.ccd)
            .user_data(entity.to_u64() as u128);
        if kind == BodyKind::Dynamic {
            builder = builder.additional_mass(definition.signature.mass);
        }
        if definition.signature.lock_rotation {
            builder = builder.lock_rotations();
        }
        let handle = self.rapier.insert_body(builder);
        if let Some(collider) = definition.signature.box_collider.as_ref() {
            let scale = definition.signature.scale;
            let half = [
                (collider.size[0] * scale[0]).abs().max(0.001) * 0.5,
                (collider.size[1] * scale[1]).abs().max(0.001) * 0.5,
                (collider.size[2] * scale[2]).abs().max(0.001) * 0.5,
            ];
            let center = [
                collider.center[0] * scale[0],
                collider.center[1] * scale[1],
                collider.center[2] * scale[2],
            ];
            let collider_handle = self.rapier.insert_collider(
                configure_collider(
                    ColliderBuilder::cuboid(half[0], half[1], half[2]),
                    center,
                    collider.is_trigger,
                    collider.friction,
                    collider.restitution,
                    entity,
                ),
                Some(handle),
            );
            let _ = collider_handle;
        }
        if let Some(collider) = definition.signature.sphere_collider.as_ref() {
            let scale = definition.signature.scale;
            let radius = collider.radius * scale[0].abs().max(scale[1].abs()).max(scale[2].abs());
            let center = [
                collider.center[0] * scale[0],
                collider.center[1] * scale[1],
                collider.center[2] * scale[2],
            ];
            let collider_handle = self.rapier.insert_collider(
                configure_collider(
                    ColliderBuilder::ball(radius.max(0.001)),
                    center,
                    collider.is_trigger,
                    collider.friction,
                    collider.restitution,
                    entity,
                ),
                Some(handle),
            );
            let _ = collider_handle;
        }
        self.bodies.insert(
            entity,
            BodyEntry {
                handle,
                signature: definition.signature.clone(),
            },
        );
    }

    fn sync_body_input(&mut self, entity: Entity, definition: &BodyDefinition) {
        let Some(entry) = self.bodies.get(&entity) else {
            return;
        };
        let Some(body) = self.rapier.bodies.get_mut(entry.handle) else {
            return;
        };
        match definition.signature.kind {
            BodyKind::Kinematic => {
                body.set_next_kinematic_position(transform_pose(&definition.transform));
            }
            BodyKind::Fixed => {
                let position = transform_pose(&definition.transform);
                if body.position() != &position {
                    body.set_position(position, true);
                }
            }
            BodyKind::Dynamic => {
                if let Some(component) = definition.rigid_body.as_ref() {
                    let velocity = finite_vec3(component.velocity, [0.0; 3]);
                    let velocity = Vec3::new(velocity[0], velocity[1], velocity[2]);
                    if (body.linvel() - velocity).length_squared() > 0.0000001 {
                        body.set_linvel(velocity, true);
                    }
                    let angular = finite_vec3(component.angular_velocity, [0.0; 3]);
                    let angular = Vec3::new(angular[0], angular[1], angular[2]);
                    if (body.angvel() - angular).length_squared() > 0.0000001 {
                        body.set_angvel(angular, true);
                    }
                }
            }
        }
    }

    fn write_back(&self, world: &mut World, hierarchy: &TransformHierarchy) {
        for (entity, entry) in &self.bodies {
            if entry.signature.kind != BodyKind::Dynamic {
                continue;
            }
            let Some(body) = self.rapier.bodies.get(entry.handle) else {
                continue;
            };
            let translation = body.translation();
            let rotation = body.rotation();
            let parent_world = hierarchy.parent_world(world, *entity);
            let (local_position, local_rotation) = parent_world.map_or(
                (
                    [translation.x, translation.y, translation.z],
                    [rotation.x, rotation.y, rotation.z, rotation.w],
                ),
                |parent| {
                    let mut world_position = parent.position;
                    world_position.x = translation.x;
                    world_position.y = translation.y;
                    world_position.z = translation.z;
                    let determinant = parent.matrix.determinant();
                    let local_position = if determinant.is_finite() && determinant.abs() > 0.000001
                    {
                        parent.matrix.inverse().transform_point3(world_position)
                    } else {
                        world_position
                    };
                    let mut world_rotation = parent.rotation;
                    world_rotation.x = rotation.x;
                    world_rotation.y = rotation.y;
                    world_rotation.z = rotation.z;
                    world_rotation.w = rotation.w;
                    let local_rotation = (parent.rotation.conjugate() * world_rotation).normalize();
                    (
                        local_position.to_array(),
                        [
                            local_rotation.x,
                            local_rotation.y,
                            local_rotation.z,
                            local_rotation.w,
                        ],
                    )
                },
            );
            if let Some(transform) = world.get_component_mut::<Transform>(*entity) {
                transform.position = local_position;
                transform.rotation = local_rotation;
            }
            if let Some(component) = world.get_component_mut::<RigidBody3D>(*entity) {
                let velocity = body.linvel();
                let angular = body.angvel();
                component.velocity = [velocity.x, velocity.y, velocity.z];
                component.angular_velocity = [angular.x, angular.y, angular.z];
            }
        }
    }

    fn collect_events(&mut self) -> PhysicsStepEvents {
        let mut current = HashSet::new();
        for pair in self.rapier.contact_pairs() {
            if !pair.has_any_active_contact() {
                continue;
            }
            if let Some(pair) = self.entities_from_colliders(pair.collider1, pair.collider2) {
                current.insert(pair);
            }
        }
        for (first, _, second, _, intersecting) in self.rapier.intersection_pairs() {
            if !intersecting {
                continue;
            }
            if let Some(pair) = self.entities_from_colliders(first, second) {
                current.insert(pair);
            }
        }
        let mut started: Vec<_> = current.difference(&self.active_pairs).copied().collect();
        let mut stopped: Vec<_> = self.active_pairs.difference(&current).copied().collect();
        started.sort_by_key(|pair| (pair.first.to_u64(), pair.second.to_u64()));
        stopped.sort_by_key(|pair| (pair.first.to_u64(), pair.second.to_u64()));
        self.active_pairs = current;
        PhysicsStepEvents { started, stopped }
    }

    fn entities_from_colliders(
        &self,
        first: ColliderHandle,
        second: ColliderHandle,
    ) -> Option<CollisionPair> {
        let first = self.rapier.colliders.get(first)?.user_data as u64;
        let second = self.rapier.colliders.get(second)?.user_data as u64;
        (first != second)
            .then(|| CollisionPair::new(Entity::from_u64(first), Entity::from_u64(second)))
    }
}

fn collect_definitions(
    world: &World,
    hierarchy: &TransformHierarchy,
) -> HashMap<Entity, BodyDefinition> {
    world
        .iter_entities()
        .filter_map(|entity| {
            let transform = hierarchy.get(entity)?.to_transform();
            let rigid_body = world.get_component::<RigidBody3D>(entity).cloned();
            let box_collider = world.get_component::<BoxCollider3D>(entity).cloned();
            let sphere_collider = world.get_component::<SphereCollider3D>(entity).cloned();
            if rigid_body.is_none() && box_collider.is_none() && sphere_collider.is_none() {
                return None;
            }
            let kind = rigid_body
                .as_ref()
                .map_or(BodyKind::Fixed, |body| body_kind(&body.body_type));
            let signature = BodySignature {
                kind,
                mass: rigid_body
                    .as_ref()
                    .map_or(1.0, |body| finite_or(body.mass, 1.0).max(0.001)),
                gravity_scale: rigid_body
                    .as_ref()
                    .map_or(0.0, |body| finite_or(body.gravity_scale, 1.0)),
                linear_damping: rigid_body
                    .as_ref()
                    .map_or(0.0, |body| finite_or(body.linear_damping, 0.05).max(0.0)),
                angular_damping: rigid_body
                    .as_ref()
                    .map_or(0.0, |body| finite_or(body.angular_damping, 0.05).max(0.0)),
                lock_rotation: rigid_body.as_ref().is_some_and(|body| body.lock_rotation),
                ccd: rigid_body.as_ref().is_some_and(|body| body.ccd),
                scale: finite_vec3(transform.scale, [1.0; 3]),
                box_collider: box_collider.map(normalize_box_collider),
                sphere_collider: sphere_collider.map(normalize_sphere_collider),
            };
            Some((
                entity,
                BodyDefinition {
                    transform,
                    rigid_body,
                    signature,
                },
            ))
        })
        .collect()
}

fn body_kind(value: &str) -> BodyKind {
    if value.eq_ignore_ascii_case("fixed") || value.eq_ignore_ascii_case("static") {
        BodyKind::Fixed
    } else if value.eq_ignore_ascii_case("kinematic") {
        BodyKind::Kinematic
    } else {
        BodyKind::Dynamic
    }
}

fn normalize_box_collider(value: BoxCollider3D) -> BoxColliderSignature {
    BoxColliderSignature {
        size: finite_vec3(value.size, [1.0; 3]),
        center: finite_vec3(value.center, [0.0; 3]),
        is_trigger: value.is_trigger,
        friction: finite_or(value.friction, 0.5).max(0.0),
        restitution: finite_or(value.restitution, 0.0).clamp(0.0, 1.0),
    }
}

fn normalize_sphere_collider(value: SphereCollider3D) -> SphereColliderSignature {
    SphereColliderSignature {
        radius: finite_or(value.radius, 0.5).abs().max(0.001),
        center: finite_vec3(value.center, [0.0; 3]),
        is_trigger: value.is_trigger,
        friction: finite_or(value.friction, 0.5).max(0.0),
        restitution: finite_or(value.restitution, 0.0).clamp(0.0, 1.0),
    }
}

fn configure_collider(
    builder: ColliderBuilder,
    center: [f32; 3],
    is_trigger: bool,
    friction: f32,
    restitution: f32,
    entity: Entity,
) -> ColliderBuilder {
    builder
        .translation(Vec3::new(center[0], center[1], center[2]))
        .sensor(is_trigger)
        .friction(friction)
        .restitution(restitution)
        .density(0.0)
        .user_data(entity.to_u64() as u128)
}

fn transform_pose(transform: &Transform) -> Pose {
    let position = finite_vec3(transform.position, [0.0; 3]);
    let rotation = finite_vec4(transform.rotation, [0.0, 0.0, 0.0, 1.0]);
    let quaternion = Rotation::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
    let rotation = if quaternion.length_squared() > 0.000001 {
        quaternion.normalize()
    } else {
        Rotation::IDENTITY
    };
    Pose::from_parts(Vec3::new(position[0], position[1], position[2]), rotation)
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn finite_vec3(value: [f32; 3], fallback: [f32; 3]) -> [f32; 3] {
    [
        finite_or(value[0], fallback[0]),
        finite_or(value[1], fallback[1]),
        finite_or(value[2], fallback[2]),
    ]
}

fn finite_vec4(value: [f32; 4], fallback: [f32; 4]) -> [f32; 4] {
    [
        finite_or(value[0], fallback[0]),
        finite_or(value[1], fallback[1]),
        finite_or(value[2], fallback[2]),
        finite_or(value[3], fallback[3]),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::Parent;

    fn spawn_body(
        world: &mut World,
        position: [f32; 3],
        rigid_body: Option<RigidBody3D>,
        box_collider: Option<BoxCollider3D>,
        sphere_collider: Option<SphereCollider3D>,
    ) -> Entity {
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            Transform {
                position,
                ..Transform::default()
            },
        );
        if let Some(component) = rigid_body {
            world.insert_component(entity, component);
        }
        if let Some(component) = box_collider {
            world.insert_component(entity, component);
        }
        if let Some(component) = sphere_collider {
            world.insert_component(entity, component);
        }
        entity
    }

    #[test]
    fn dynamic_sphere_falls_and_settles_on_an_implicit_fixed_collider() {
        let mut world = World::new();
        let ground = spawn_body(
            &mut world,
            [0.0, -0.5, 0.0],
            None,
            Some(BoxCollider3D {
                size: [20.0, 1.0, 20.0],
                ..BoxCollider3D::default()
            }),
            None,
        );
        let ball = spawn_body(
            &mut world,
            [0.0, 3.0, 0.0],
            Some(RigidBody3D::default()),
            None,
            Some(SphereCollider3D::default()),
        );
        let mut physics = PhysicsWorld::new();
        let mut collided = false;
        for _ in 0..240 {
            let events = physics.step(&mut world, 1.0 / 60.0);
            collided |= events.started.contains(&CollisionPair::new(ground, ball));
        }
        let transform = world.get_component::<Transform>(ball).unwrap();
        assert!(collided);
        assert!(
            (transform.position[1] - 0.5).abs() < 0.08,
            "{:?}",
            transform.position
        );
        assert_eq!(physics.body_count(), 2);
        assert_eq!(physics.collider_count(), 2);
    }

    #[test]
    fn triggers_report_enter_and_exit_without_blocking_motion() {
        let mut world = World::new();
        let trigger = spawn_body(
            &mut world,
            [0.0, 0.0, 0.0],
            None,
            Some(BoxCollider3D {
                size: [2.0; 3],
                is_trigger: true,
                ..BoxCollider3D::default()
            }),
            None,
        );
        let moving = spawn_body(
            &mut world,
            [-3.0, 0.0, 0.0],
            Some(RigidBody3D {
                gravity_scale: 0.0,
                velocity: [3.0, 0.0, 0.0],
                ..RigidBody3D::default()
            }),
            None,
            Some(SphereCollider3D::default()),
        );
        let pair = CollisionPair::new(trigger, moving);
        let mut physics = PhysicsWorld::new();
        let mut entered = false;
        let mut exited = false;
        for _ in 0..180 {
            let events = physics.step(&mut world, 1.0 / 60.0);
            entered |= events.started.contains(&pair);
            exited |= events.stopped.contains(&pair);
        }
        assert!(entered && exited);
        assert!(world.get_component::<Transform>(moving).unwrap().position[0] > 4.0);
    }

    #[test]
    fn kinematic_body_tracks_authored_transform_and_inactive_entities_are_removed() {
        let mut world = World::new();
        let entity = spawn_body(
            &mut world,
            [0.0; 3],
            Some(RigidBody3D {
                body_type: "kinematic".into(),
                ..RigidBody3D::default()
            }),
            Some(BoxCollider3D::default()),
            None,
        );
        let mut physics = PhysicsWorld::new();
        physics.step(&mut world, 1.0 / 60.0);
        world
            .get_component_mut::<Transform>(entity)
            .unwrap()
            .position = [2.0, 1.0, 0.0];
        physics.step(&mut world, 1.0 / 60.0);
        assert_eq!(physics.body_count(), 1);
        world.set_editor_state(entity, 0, false);
        physics.step(&mut world, 1.0 / 60.0);
        assert_eq!(physics.body_count(), 0);
    }

    #[test]
    fn bodies_below_an_inactive_or_cyclic_hierarchy_are_not_simulated() {
        let mut world = World::new();
        let parent = world.spawn_empty();
        let entity = spawn_body(
            &mut world,
            [0.0; 3],
            Some(RigidBody3D::default()),
            Some(BoxCollider3D::default()),
            None,
        );
        world.set_parent(entity, Some(parent));
        world.set_editor_state(parent, 0, false);
        let mut physics = PhysicsWorld::new();
        physics.step(&mut world, 1.0 / 60.0);
        assert_eq!(physics.body_count(), 0);

        world.set_editor_state(parent, 0, true);
        world.insert_component(parent, Parent { entity });
        physics.step(&mut world, 1.0 / 60.0);
        assert_eq!(physics.body_count(), 0);
    }

    #[test]
    fn child_rigid_bodies_simulate_in_world_space_and_write_back_local_space() {
        let mut world = World::new();
        let parent = world.spawn_empty();
        world.insert_component(
            parent,
            Transform {
                position: [10.0, 0.0, 0.0],
                ..Transform::default()
            },
        );
        spawn_body(
            &mut world,
            [10.0, -0.5, 0.0],
            None,
            Some(BoxCollider3D {
                size: [10.0, 1.0, 10.0],
                ..BoxCollider3D::default()
            }),
            None,
        );
        let child = spawn_body(
            &mut world,
            [0.0, 3.0, 0.0],
            Some(RigidBody3D::default()),
            None,
            Some(SphereCollider3D::default()),
        );
        world.set_parent(child, Some(parent));
        let mut physics = PhysicsWorld::new();
        for _ in 0..240 {
            physics.step(&mut world, 1.0 / 60.0);
        }
        let local = world.get_component::<Transform>(child).unwrap();
        assert!(local.position[0].abs() < 0.001, "{:?}", local.position);
        assert!(
            (local.position[1] - 0.5).abs() < 0.08,
            "{:?}",
            local.position
        );
    }
}
