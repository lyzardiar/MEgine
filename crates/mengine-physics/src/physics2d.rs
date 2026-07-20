use super::{body_kind, pair_transitions, BodyKind, CollisionPair, PhysicsStepEvents};
use glam::{Quat, Vec3};
use mengine_core::generated::{
    BoxCollider2D, CapsuleCollider2D, CircleCollider2D, DistanceJoint2D, FixedJoint2D,
    HingeJoint2D, PolygonCollider2D, Rigidbody2D, SpringJoint2D, Transform,
};
use mengine_core::{Entity, TransformHierarchy, World};
use rapier2d::prelude::PhysicsWorld as RapierWorld;
use rapier2d::prelude::{
    Ball, ColliderBuilder, ColliderHandle, Cuboid, FixedJointBuilder, ImpulseJointHandle, Pose,
    QueryFilter, Ray, RevoluteJointBuilder, RigidBodyBuilder, RigidBodyHandle, RigidBodyType,
    Rotation, SharedShape, Vec2,
};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq)]
struct BodySignature2D {
    kind: BodyKind,
    mass: f32,
    gravity_scale: f32,
    linear_damping: f32,
    angular_damping: f32,
    freeze_rotation: bool,
    ccd: bool,
    scale: [f32; 2],
    box_collider: Option<BoxColliderSignature2D>,
    circle_collider: Option<CircleColliderSignature2D>,
    polygon_collider: Option<PolygonColliderSignature2D>,
    capsule_collider: Option<CapsuleColliderSignature2D>,
}

#[derive(Clone, Debug, PartialEq)]
struct BoxColliderSignature2D {
    size: [f32; 2],
    offset: [f32; 2],
    is_trigger: bool,
    friction: f32,
    bounciness: f32,
}

#[derive(Clone, Debug, PartialEq)]
struct CircleColliderSignature2D {
    radius: f32,
    offset: [f32; 2],
    is_trigger: bool,
    friction: f32,
    bounciness: f32,
}

#[derive(Clone, Debug, PartialEq)]
struct PolygonColliderSignature2D {
    /// Flattened [x0,y0, x1,y1, ...] vertices in local space.
    points: Vec<[f32; 2]>,
    offset: [f32; 2],
    is_trigger: bool,
    friction: f32,
    bounciness: f32,
}

#[derive(Clone, Debug, PartialEq)]
struct CapsuleColliderSignature2D {
    /// "vertical" | "horizontal"
    direction: String,
    size: [f32; 2],
    offset: [f32; 2],
    is_trigger: bool,
    friction: f32,
    bounciness: f32,
}

struct BodyDefinition2D {
    transform: Transform,
    rigid_body: Option<Rigidbody2D>,
    signature: BodySignature2D,
}

struct BodyEntry2D {
    handle: RigidBodyHandle,
    signature: BodySignature2D,
}

/// Result of a 2D raycast query.
#[derive(Clone, Debug)]
pub struct RaycastHit2D {
    pub entity: Entity,
    pub point: [f32; 2],
    pub normal: [f32; 2],
    pub distance: f32,
}

/// Independent planar physics world. It reads/writes the XY plane of `Transform`,
/// preserves world Z, and converts Unity-style angular velocity degrees to Rapier radians.
pub struct PhysicsWorld2D {
    rapier: RapierWorld,
    bodies: HashMap<Entity, BodyEntry2D>,
    joints: HashMap<Entity, ImpulseJointHandle>,
    active_collision_pairs: HashSet<CollisionPair>,
    active_trigger_pairs: HashSet<CollisionPair>,
}

impl Default for PhysicsWorld2D {
    fn default() -> Self {
        Self::new()
    }
}

impl PhysicsWorld2D {
    pub fn new() -> Self {
        Self {
            rapier: RapierWorld::new(),
            bodies: HashMap::new(),
            joints: HashMap::new(),
            active_collision_pairs: HashSet::new(),
            active_trigger_pairs: HashSet::new(),
        }
    }

    pub fn set_gravity(&mut self, gravity: [f32; 2]) {
        self.rapier.gravity = Vec2::new(finite_or(gravity[0], 0.0), finite_or(gravity[1], -9.81));
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

    // ---- 2D Physics Queries (Unity Physics2D-style) ----

    /// Casts a ray and returns the first collider hit (Unity Physics2D.Raycast).
    pub fn raycast(
        &self,
        origin: [f32; 2],
        direction: [f32; 2],
        max_distance: f32,
    ) -> Option<RaycastHit2D> {
        let dir = Vec2::new(direction[0], direction[1]);
        let dir = if dir.length_squared() > 0.000001 {
            dir.normalize()
        } else {
            return None;
        };
        let ray = Ray::new(
            Vec2::new(origin[0], origin[1]),
            dir,
        );
        let max_toi = finite_or(max_distance, 100.0).max(0.001);
        let (handle, intersection) =
            self.rapier
                .cast_ray_and_get_normal(&ray, max_toi, true, QueryFilter::default())?;
        let collider = self.rapier.colliders.get(handle)?;
        let entity = Entity::from_u64(collider.user_data as u64);
        let point = ray.point_at(intersection.time_of_impact);
        Some(RaycastHit2D {
            entity,
            point: [point.x, point.y],
            normal: [intersection.normal.x, intersection.normal.y],
            distance: intersection.time_of_impact,
        })
    }

    /// Returns all entities whose collider contains the given point (Unity Physics2D.OverlapPoint).
    pub fn overlap_point(&self, point: [f32; 2]) -> Vec<Entity> {
        let point = Vec2::new(point[0], point[1]);
        self.rapier
            .intersect_point(point, QueryFilter::default())
            .filter_map(|(_, collider)| {
                let entity = Entity::from_u64(collider.user_data as u64);
                (entity != Entity::INVALID).then_some(entity)
            })
            .collect()
    }

    /// Returns all entities whose collider overlaps the given circle (Unity Physics2D.OverlapCircle).
    pub fn overlap_circle(&self, center: [f32; 2], radius: f32) -> Vec<Entity> {
        let radius = finite_or(radius, 0.5).abs().max(0.001);
        let shape_pos = Pose::from_parts(Vec2::new(center[0], center[1]), Rotation::new(0.0));
        let shape = SharedShape::new(Ball::new(radius));
        self.rapier
            .intersect_shape(shape_pos, shape.as_ref(), QueryFilter::default())
            .filter_map(|(_, collider)| {
                let entity = Entity::from_u64(collider.user_data as u64);
                (entity != Entity::INVALID).then_some(entity)
            })
            .collect()
    }

    /// Returns all entities whose collider overlaps the given axis-aligned box
    /// (Unity Physics2D.OverlapBox).
    pub fn overlap_box(&self, center: [f32; 2], half_extents: [f32; 2]) -> Vec<Entity> {
        let hx = finite_or(half_extents[0], 0.5).abs().max(0.001);
        let hy = finite_or(half_extents[1], 0.5).abs().max(0.001);
        let shape_pos = Pose::from_parts(Vec2::new(center[0], center[1]), Rotation::new(0.0));
        let shape = SharedShape::new(Cuboid::new(Vec2::new(hx, hy)));
        self.rapier
            .intersect_shape(shape_pos, shape.as_ref(), QueryFilter::default())
            .filter_map(|(_, collider)| {
                let entity = Entity::from_u64(collider.user_data as u64);
                (entity != Entity::INVALID).then_some(entity)
            })
            .collect()
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
        self.sync_joints(world, &hierarchy);

        self.rapier.integration_parameters.dt = finite_or(dt, 1.0 / 60.0).clamp(0.0001, 0.1);
        self.rapier.step();
        self.write_back(world, &hierarchy);
        self.collect_events()
    }

    fn remove_stale_bodies(&mut self, definitions: &HashMap<Entity, BodyDefinition2D>) {
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
        if let Some(joint_handle) = self.joints.remove(&entity) {
            self.rapier.remove_impulse_joint(joint_handle);
        }
        if let Some(entry) = self.bodies.remove(&entity) {
            self.rapier.remove_body(entry.handle);
        }
    }

    fn insert_body(&mut self, entity: Entity, definition: &BodyDefinition2D) {
        let rigid_body = definition.rigid_body.as_ref();
        let kind = definition.signature.kind;
        let body_type = match kind {
            BodyKind::Dynamic => RigidBodyType::Dynamic,
            BodyKind::Fixed => RigidBodyType::Fixed,
            BodyKind::Kinematic => RigidBodyType::KinematicPositionBased,
        };
        let velocity = rigid_body.map_or([0.0; 2], |body| finite_vec2(body.velocity, [0.0; 2]));
        let angular_velocity = if definition.signature.freeze_rotation {
            0.0
        } else {
            rigid_body.map_or(0.0, |body| {
                finite_or(body.angular_velocity, 0.0).to_radians()
            })
        };
        let mut builder = RigidBodyBuilder::new(body_type)
            .pose(transform_pose(&definition.transform))
            .linvel(Vec2::new(velocity[0], velocity[1]))
            .angvel(angular_velocity)
            .gravity_scale(definition.signature.gravity_scale)
            .linear_damping(definition.signature.linear_damping)
            .angular_damping(definition.signature.angular_damping)
            .ccd_enabled(definition.signature.ccd)
            .user_data(entity.to_u64() as u128);
        if kind == BodyKind::Dynamic {
            builder = builder.additional_mass(definition.signature.mass);
        }
        if definition.signature.freeze_rotation {
            builder = builder.lock_rotations();
        }
        let handle = self.rapier.insert_body(builder);

        if let Some(collider) = definition.signature.box_collider.as_ref() {
            let scale = definition.signature.scale;
            let half = [
                (collider.size[0] * scale[0]).abs().max(0.001) * 0.5,
                (collider.size[1] * scale[1]).abs().max(0.001) * 0.5,
            ];
            let offset = [collider.offset[0] * scale[0], collider.offset[1] * scale[1]];
            self.rapier.insert_collider(
                configure_collider(
                    ColliderBuilder::cuboid(half[0], half[1]),
                    offset,
                    collider.is_trigger,
                    collider.friction,
                    collider.bounciness,
                    entity,
                ),
                Some(handle),
            );
        }
        if let Some(collider) = definition.signature.circle_collider.as_ref() {
            let scale = definition.signature.scale;
            let radius = collider.radius * scale[0].abs().max(scale[1].abs());
            let offset = [collider.offset[0] * scale[0], collider.offset[1] * scale[1]];
            self.rapier.insert_collider(
                configure_collider(
                    ColliderBuilder::ball(radius.max(0.001)),
                    offset,
                    collider.is_trigger,
                    collider.friction,
                    collider.bounciness,
                    entity,
                ),
                Some(handle),
            );
        }
        if let Some(collider) = definition.signature.polygon_collider.as_ref() {
            let scale = definition.signature.scale;
            let offset = [collider.offset[0] * scale[0], collider.offset[1] * scale[1]];
            let points: Vec<Vec2> = collider
                .points
                .iter()
                .map(|p| Vec2::new(p[0] * scale[0], p[1] * scale[1]))
                .collect();
            if points.len() >= 3 {
                if let Some(builder) = ColliderBuilder::convex_hull(&points) {
                    self.rapier.insert_collider(
                        configure_collider(builder, offset, collider.is_trigger, collider.friction, collider.bounciness, entity),
                        Some(handle),
                    );
                }
            }
        }
        if let Some(collider) = definition.signature.capsule_collider.as_ref() {
            let scale = definition.signature.scale;
            let offset = [collider.offset[0] * scale[0], collider.offset[1] * scale[1]];
            let is_vertical = collider.direction == "vertical";
            let (half_height, radius) = if is_vertical {
                let h = (collider.size[1] * scale[1]).abs().max(0.002);
                let r = (collider.size[0] * scale[0]).abs().max(0.001) * 0.5;
                ((h * 0.5 - r).max(0.001), r)
            } else {
                let w = (collider.size[0] * scale[0]).abs().max(0.002);
                let r = (collider.size[1] * scale[1]).abs().max(0.001) * 0.5;
                ((w * 0.5 - r).max(0.001), r)
            };
            let builder = if is_vertical {
                ColliderBuilder::capsule_y(half_height, radius)
            } else {
                ColliderBuilder::capsule_x(half_height, radius)
            };
            self.rapier.insert_collider(
                configure_collider(builder, offset, collider.is_trigger, collider.friction, collider.bounciness, entity),
                Some(handle),
            );
        }
        self.bodies.insert(
            entity,
            BodyEntry2D {
                handle,
                signature: definition.signature.clone(),
            },
        );
    }

    fn sync_body_input(&mut self, entity: Entity, definition: &BodyDefinition2D) {
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
                    let velocity = finite_vec2(component.velocity, [0.0; 2]);
                    let velocity = Vec2::new(velocity[0], velocity[1]);
                    if (body.linvel() - velocity).length_squared() > 0.0000001 {
                        body.set_linvel(velocity, true);
                    }
                    let angular = if definition.signature.freeze_rotation {
                        0.0
                    } else {
                        finite_or(component.angular_velocity, 0.0).to_radians()
                    };
                    if (body.angvel() - angular).abs() > 0.0000001 {
                        body.set_angvel(angular, true);
                    }
                }
            }
        }
    }

    /// Creates or removes Rapier impulse joints to match the ECS joint components.
    fn sync_joints(&mut self, world: &World, _hierarchy: &TransformHierarchy) {
        // Collect which entities currently have a joint component.
        let mut joint_entities: HashSet<Entity> = HashSet::new();
        for entity in world.iter_entities() {
            let has_joint = world.get_component::<DistanceJoint2D>(entity).is_some()
                || world.get_component::<HingeJoint2D>(entity).is_some()
                || world.get_component::<SpringJoint2D>(entity).is_some()
                || world.get_component::<FixedJoint2D>(entity).is_some();
            if has_joint {
                joint_entities.insert(entity);
            }
        }

        // Remove joints for entities that no longer have joint components.
        let stale: Vec<Entity> = self
            .joints
            .keys()
            .filter(|e| !joint_entities.contains(e))
            .copied()
            .collect();
        for entity in stale {
            if let Some(handle) = self.joints.remove(&entity) {
                self.rapier.remove_impulse_joint(handle);
            }
        }

        // Create joints for new entities.
        for entity in &joint_entities {
            if self.joints.contains_key(entity) {
                continue;
            }
            let Some(body_entry) = self.bodies.get(entity) else {
                continue;
            };
            let body_handle = body_entry.handle;

            // Resolve connected entity.
            let connected = world
                .get_component::<DistanceJoint2D>(*entity)
                .and_then(|j| parse_entity_id(&j.connected_entity))
                .or_else(|| {
                    world
                        .get_component::<HingeJoint2D>(*entity)
                        .and_then(|j| parse_entity_id(&j.connected_entity))
                })
                .or_else(|| {
                    world
                        .get_component::<SpringJoint2D>(*entity)
                        .and_then(|j| parse_entity_id(&j.connected_entity))
                })
                .or_else(|| {
                    world
                        .get_component::<FixedJoint2D>(*entity)
                        .and_then(|j| parse_entity_id(&j.connected_entity))
                });
            let Some(connected_entity) = connected else {
                continue;
            };
            let Some(connected_entry) = self.bodies.get(&connected_entity) else {
                continue;
            };
            let connected_handle = connected_entry.handle;

            if let Some(joint) = world.get_component::<FixedJoint2D>(*entity) {
                let anchor = finite_vec2(joint.anchor, [0.0; 2]);
                let connected_anchor = finite_vec2(joint.connected_anchor, [0.0; 2]);
                let frame1 = Pose::from_parts(Vec2::new(anchor[0], anchor[1]), Rotation::new(0.0));
                let frame2 = Pose::from_parts(
                    Vec2::new(connected_anchor[0], connected_anchor[1]),
                    Rotation::new(0.0),
                );
                let rapier_joint = FixedJointBuilder::new()
                    .local_frame1(frame1)
                    .local_frame2(frame2)
                    .build();
                let handle =
                    self.rapier
                        .insert_impulse_joint(body_handle, connected_handle, rapier_joint);
                self.joints.insert(*entity, handle);
            } else if let Some(joint) = world.get_component::<HingeJoint2D>(*entity) {
                let anchor = finite_vec2(joint.anchor, [0.0; 2]);
                let connected_anchor = finite_vec2(joint.connected_anchor, [0.0; 2]);
                let mut builder = RevoluteJointBuilder::new()
                    .local_anchor1(Vec2::new(anchor[0], anchor[1]))
                    .local_anchor2(Vec2::new(connected_anchor[0], connected_anchor[1]));
                if joint.use_limits {
                    let min = finite_or(joint.min_angle, -180.0).to_radians();
                    let max = finite_or(joint.max_angle, 180.0).to_radians();
                    builder = builder.limits([min.min(max), min.max(max)]);
                }
                if joint.use_motor {
                    let speed = finite_or(joint.motor_speed, 0.0).to_radians();
                    let torque = finite_or(joint.max_motor_torque, 0.0).max(0.0);
                    builder = builder.motor_velocity(speed, torque);
                }
                let handle =
                    self.rapier
                        .insert_impulse_joint(body_handle, connected_handle, builder.build());
                self.joints.insert(*entity, handle);
            } else if let Some(joint) = world.get_component::<DistanceJoint2D>(*entity) {
                let anchor = finite_vec2(joint.anchor, [0.0; 2]);
                let connected_anchor = finite_vec2(joint.connected_anchor, [0.0; 2]);
                let mut builder = RevoluteJointBuilder::new()
                    .local_anchor1(Vec2::new(anchor[0], anchor[1]))
                    .local_anchor2(Vec2::new(connected_anchor[0], connected_anchor[1]));
                let stiffness = finite_or(joint.stiffness, 0.0).max(0.0);
                let damping = finite_or(joint.damping, 0.0).max(0.0);
                if stiffness > 0.0 {
                    builder = builder.motor_position(0.0, stiffness, damping);
                }
                let handle =
                    self.rapier
                        .insert_impulse_joint(body_handle, connected_handle, builder.build());
                self.joints.insert(*entity, handle);
            } else if let Some(joint) = world.get_component::<SpringJoint2D>(*entity) {
                let anchor = finite_vec2(joint.anchor, [0.0; 2]);
                let connected_anchor = finite_vec2(joint.connected_anchor, [0.0; 2]);
                let stiffness = finite_or(joint.stiffness, 10.0).max(0.0);
                let damping = finite_or(joint.damping, 1.0).max(0.0);
                let builder = RevoluteJointBuilder::new()
                    .local_anchor1(Vec2::new(anchor[0], anchor[1]))
                    .local_anchor2(Vec2::new(connected_anchor[0], connected_anchor[1]))
                    .motor_position(0.0, stiffness, damping);
                let handle =
                    self.rapier
                        .insert_impulse_joint(body_handle, connected_handle, builder.build());
                self.joints.insert(*entity, handle);
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
            let angle = body.rotation().angle();
            let world_z = hierarchy
                .get(*entity)
                .map_or(0.0, |transform| transform.position.z);
            let world_position = Vec3::new(translation.x, translation.y, world_z);
            let world_rotation = Quat::from_rotation_z(angle);
            let parent_world = hierarchy.parent_world(world, *entity);
            let (local_position, local_rotation) = parent_world.map_or(
                (
                    world_position.to_array(),
                    [
                        world_rotation.x,
                        world_rotation.y,
                        world_rotation.z,
                        world_rotation.w,
                    ],
                ),
                |parent| {
                    let determinant = parent.matrix.determinant();
                    let local_position = if determinant.is_finite() && determinant.abs() > 0.000001
                    {
                        parent.matrix.inverse().transform_point3(world_position)
                    } else {
                        world_position
                    };
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
            if let Some(component) = world.get_component_mut::<Rigidbody2D>(*entity) {
                let velocity = body.linvel();
                component.velocity = [velocity.x, velocity.y];
                component.angular_velocity = body.angvel().to_degrees();
            }
        }
    }

    fn collect_events(&mut self) -> PhysicsStepEvents {
        let mut current_collisions = HashSet::new();
        for pair in self.rapier.contact_pairs() {
            if !pair.has_any_active_contact() {
                continue;
            }
            if let Some(pair) = self.entities_from_colliders(pair.collider1, pair.collider2) {
                current_collisions.insert(pair);
            }
        }
        let mut current_triggers = HashSet::new();
        for (first, _, second, _, intersecting) in self.rapier.intersection_pairs() {
            if !intersecting {
                continue;
            }
            if let Some(pair) = self.entities_from_colliders(first, second) {
                current_triggers.insert(pair);
            }
        }
        let (started, stopped) =
            pair_transitions(&current_collisions, &mut self.active_collision_pairs);
        let (trigger_started, trigger_stopped) =
            pair_transitions(&current_triggers, &mut self.active_trigger_pairs);
        PhysicsStepEvents {
            started,
            stopped,
            trigger_started,
            trigger_stopped,
        }
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
) -> HashMap<Entity, BodyDefinition2D> {
    world
        .iter_entities()
        .filter_map(|entity| {
            let transform = hierarchy.get(entity)?.to_transform();
            let rigid_body = world.get_component::<Rigidbody2D>(entity).cloned();
            let box_collider = world.get_component::<BoxCollider2D>(entity).cloned();
            let circle_collider = world.get_component::<CircleCollider2D>(entity).cloned();
            let polygon_collider = world.get_component::<PolygonCollider2D>(entity).cloned();
            let capsule_collider = world.get_component::<CapsuleCollider2D>(entity).cloned();
            if rigid_body.is_none()
                && box_collider.is_none()
                && circle_collider.is_none()
                && polygon_collider.is_none()
                && capsule_collider.is_none()
            {
                return None;
            }
            let kind = rigid_body
                .as_ref()
                .map_or(BodyKind::Fixed, |body| body_kind(&body.body_type));
            let signature = BodySignature2D {
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
                freeze_rotation: rigid_body.as_ref().is_some_and(|body| body.freeze_rotation),
                ccd: rigid_body.as_ref().is_some_and(|body| body.ccd),
                scale: finite_vec2([transform.scale[0], transform.scale[1]], [1.0; 2]),
                box_collider: box_collider.map(normalize_box_collider),
                circle_collider: circle_collider.map(normalize_circle_collider),
                polygon_collider: polygon_collider.map(normalize_polygon_collider),
                capsule_collider: capsule_collider.map(normalize_capsule_collider),
            };
            Some((
                entity,
                BodyDefinition2D {
                    transform,
                    rigid_body,
                    signature,
                },
            ))
        })
        .collect()
}

fn normalize_box_collider(value: BoxCollider2D) -> BoxColliderSignature2D {
    BoxColliderSignature2D {
        size: finite_vec2(value.size, [1.0; 2]),
        offset: finite_vec2(value.offset, [0.0; 2]),
        is_trigger: value.is_trigger,
        friction: finite_or(value.friction, 0.5).max(0.0),
        bounciness: finite_or(value.bounciness, 0.0).clamp(0.0, 1.0),
    }
}

fn normalize_circle_collider(value: CircleCollider2D) -> CircleColliderSignature2D {
    CircleColliderSignature2D {
        radius: finite_or(value.radius, 0.5).abs().max(0.001),
        offset: finite_vec2(value.offset, [0.0; 2]),
        is_trigger: value.is_trigger,
        friction: finite_or(value.friction, 0.5).max(0.0),
        bounciness: finite_or(value.bounciness, 0.0).clamp(0.0, 1.0),
    }
}

fn normalize_polygon_collider(value: PolygonCollider2D) -> PolygonColliderSignature2D {
    let points: Vec<[f32; 2]> = value
        .points
        .iter()
        .map(|p| [finite_or(p[0], 0.0), finite_or(p[1], 0.0)])
        .collect();
    PolygonColliderSignature2D {
        points,
        offset: finite_vec2(value.offset, [0.0; 2]),
        is_trigger: value.is_trigger,
        friction: finite_or(value.friction, 0.5).max(0.0),
        bounciness: finite_or(value.bounciness, 0.0).clamp(0.0, 1.0),
    }
}

fn normalize_capsule_collider(value: CapsuleCollider2D) -> CapsuleColliderSignature2D {
    CapsuleColliderSignature2D {
        direction: if value.direction == "horizontal" {
            "horizontal".into()
        } else {
            "vertical".into()
        },
        size: finite_vec2(value.size, [0.5, 1.0]),
        offset: finite_vec2(value.offset, [0.0; 2]),
        is_trigger: value.is_trigger,
        friction: finite_or(value.friction, 0.5).max(0.0),
        bounciness: finite_or(value.bounciness, 0.0).clamp(0.0, 1.0),
    }
}

fn configure_collider(
    builder: ColliderBuilder,
    offset: [f32; 2],
    is_trigger: bool,
    friction: f32,
    bounciness: f32,
    entity: Entity,
) -> ColliderBuilder {
    builder
        .translation(Vec2::new(offset[0], offset[1]))
        .sensor(is_trigger)
        .friction(friction)
        .restitution(bounciness)
        .density(0.0)
        .user_data(entity.to_u64() as u128)
}

fn transform_pose(transform: &Transform) -> Pose {
    let position = finite_vec2([transform.position[0], transform.position[1]], [0.0; 2]);
    let angle = planar_angle(transform.rotation);
    Pose::from_parts(Vec2::new(position[0], position[1]), Rotation::new(angle))
}

fn planar_angle(rotation: [f32; 4]) -> f32 {
    let [x, y, z, w] = rotation.map(|value| finite_or(value, 0.0));
    let length_squared = x * x + y * y + z * z + w * w;
    if length_squared <= 0.000001 {
        return 0.0;
    }
    let inverse_length = length_squared.sqrt().recip();
    let (x, y, z, w) = (
        x * inverse_length,
        y * inverse_length,
        z * inverse_length,
        w * inverse_length,
    );
    (2.0 * (w * z + x * y)).atan2(1.0 - 2.0 * (y * y + z * z))
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn finite_vec2(value: [f32; 2], fallback: [f32; 2]) -> [f32; 2] {
    [
        finite_or(value[0], fallback[0]),
        finite_or(value[1], fallback[1]),
    ]
}

/// Parses a u64 entity id from a string (JS passes u64 as strings for precision).
fn parse_entity_id(value: &str) -> Option<Entity> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse::<u64>().ok().map(Entity::from_u64)
}

impl mengine_core::PhysicsQuery2D for PhysicsWorld2D {
    fn raycast(
        &self,
        origin: [f32; 2],
        direction: [f32; 2],
        max_distance: f32,
    ) -> Option<mengine_core::PhysicsRaycastHit2D> {
        PhysicsWorld2D::raycast(self, origin, direction, max_distance).map(|hit| {
            mengine_core::PhysicsRaycastHit2D {
                entity: hit.entity.to_u64(),
                point: hit.point,
                normal: hit.normal,
                distance: hit.distance,
            }
        })
    }

    fn overlap_point(&self, point: [f32; 2]) -> Vec<u64> {
        PhysicsWorld2D::overlap_point(self, point)
            .into_iter()
            .map(|e| e.to_u64())
            .collect()
    }

    fn overlap_circle(&self, center: [f32; 2], radius: f32) -> Vec<u64> {
        PhysicsWorld2D::overlap_circle(self, center, radius)
            .into_iter()
            .map(|e| e.to_u64())
            .collect()
    }

    fn overlap_box(&self, center: [f32; 2], half_extents: [f32; 2]) -> Vec<u64> {
        PhysicsWorld2D::overlap_box(self, center, half_extents)
            .into_iter()
            .map(|e| e.to_u64())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spawn_body(
        world: &mut World,
        position: [f32; 3],
        rigid_body: Option<Rigidbody2D>,
        box_collider: Option<BoxCollider2D>,
        circle_collider: Option<CircleCollider2D>,
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
        if let Some(component) = circle_collider {
            world.insert_component(entity, component);
        }
        entity
    }

    #[test]
    fn dynamic_circle_falls_on_implicit_fixed_box_and_preserves_z() {
        let mut world = World::new();
        let ground = spawn_body(
            &mut world,
            [0.0, -0.5, 4.0],
            None,
            Some(BoxCollider2D {
                size: [20.0, 1.0],
                ..BoxCollider2D::default()
            }),
            None,
        );
        let ball = spawn_body(
            &mut world,
            [0.0, 3.0, 4.0],
            Some(Rigidbody2D::default()),
            None,
            Some(CircleCollider2D::default()),
        );
        let mut physics = PhysicsWorld2D::new();
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
        assert_eq!(transform.position[2], 4.0);
        assert_eq!(physics.body_count(), 2);
        assert_eq!(physics.collider_count(), 2);
    }

    #[test]
    fn sensor_reports_trigger_enter_and_exit_without_blocking() {
        let mut world = World::new();
        let trigger = spawn_body(
            &mut world,
            [0.0; 3],
            None,
            Some(BoxCollider2D {
                size: [2.0; 2],
                is_trigger: true,
                ..BoxCollider2D::default()
            }),
            None,
        );
        let moving = spawn_body(
            &mut world,
            [-3.0, 0.0, 0.0],
            Some(Rigidbody2D {
                gravity_scale: 0.0,
                velocity: [3.0, 0.0],
                ..Rigidbody2D::default()
            }),
            None,
            Some(CircleCollider2D::default()),
        );
        let pair = CollisionPair::new(trigger, moving);
        let mut physics = PhysicsWorld2D::new();
        let mut entered = false;
        let mut exited = false;
        for _ in 0..180 {
            let events = physics.step(&mut world, 1.0 / 60.0);
            entered |= events.trigger_started.contains(&pair);
            exited |= events.trigger_stopped.contains(&pair);
        }
        assert!(entered && exited);
        assert!(world.get_component::<Transform>(moving).unwrap().position[0] > 4.0);
    }

    #[test]
    fn angular_velocity_uses_unity_degrees_and_can_be_frozen() {
        let mut world = World::new();
        let spinning = spawn_body(
            &mut world,
            [0.0; 3],
            Some(Rigidbody2D {
                gravity_scale: 0.0,
                angular_velocity: 180.0,
                ..Rigidbody2D::default()
            }),
            Some(BoxCollider2D::default()),
            None,
        );
        let frozen = spawn_body(
            &mut world,
            [3.0, 0.0, 0.0],
            Some(Rigidbody2D {
                gravity_scale: 0.0,
                angular_velocity: 180.0,
                freeze_rotation: true,
                ..Rigidbody2D::default()
            }),
            Some(BoxCollider2D::default()),
            None,
        );
        let mut physics = PhysicsWorld2D::new();
        physics.step(&mut world, 0.1);
        let spinning_rotation = world.get_component::<Transform>(spinning).unwrap().rotation;
        let frozen_rotation = world.get_component::<Transform>(frozen).unwrap().rotation;
        assert!(planar_angle(spinning_rotation).abs() > 0.2);
        assert!(planar_angle(frozen_rotation).abs() < 0.001);
    }

    #[test]
    fn child_body_simulates_in_world_space_and_writes_local_xy() {
        let mut world = World::new();
        let parent = world.spawn_empty();
        world.insert_component(
            parent,
            Transform {
                position: [10.0, 0.0, 2.0],
                ..Transform::default()
            },
        );
        spawn_body(
            &mut world,
            [10.0, -0.5, 2.0],
            None,
            Some(BoxCollider2D {
                size: [10.0, 1.0],
                ..BoxCollider2D::default()
            }),
            None,
        );
        let child = spawn_body(
            &mut world,
            [0.0, 3.0, 0.0],
            Some(Rigidbody2D::default()),
            None,
            Some(CircleCollider2D::default()),
        );
        world.set_parent(child, Some(parent));
        let mut physics = PhysicsWorld2D::new();
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
        assert!(local.position[2].abs() < 0.001, "{:?}", local.position);
    }
}
