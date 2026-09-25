use super::{body_kind, pair_transitions, BodyKind, CollisionPair, PhysicsStepEvents};
use glam::{Quat, Vec3};
use mengine_core::generated::{BoxCollider2D, CircleCollider2D, EdgeCollider2D, Rigidbody2D, TargetJoint2D, Transform};
use mengine_core::{Entity, TransformHierarchy, World};
use rapier2d::prelude::PhysicsWorld as RapierWorld;
use rapier2d::prelude::{
    ColliderBuilder, ColliderHandle, Pose, RigidBodyBuilder, RigidBodyHandle, RigidBodyType,
    CoefficientCombineRule, GenericJointBuilder, ImpulseJointHandle, JointAxesMask, JointAxis, MotorModel, Rotation, Vec2,
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
    edge_collider: Option<EdgeColliderSignature2D>,
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

struct BodyDefinition2D {
    transform: Transform,
    rigid_body: Option<Rigidbody2D>,
    signature: BodySignature2D,
}

#[derive(Clone, Debug, PartialEq)]
struct EdgeColliderSignature2D {
    points: Vec<[f32; 2]>,
    offset: [f32; 2],
    is_trigger: bool,
    friction: f32,
    bounciness: f32,
}

struct BodyEntry2D {
    handle: RigidBodyHandle,
    signature: BodySignature2D,
}

/// Independent planar physics world. It reads/writes the XY plane of `Transform`,
/// preserves world Z, and converts Unity-style angular velocity degrees to Rapier radians.
pub struct PhysicsWorld2D {
    rapier: RapierWorld,
    bodies: HashMap<Entity, BodyEntry2D>,
    active_collision_pairs: HashSet<CollisionPair>,
    active_trigger_pairs: HashSet<CollisionPair>,
    target_ground: Option<RigidBodyHandle>,
    target_joints: HashMap<Entity, ImpulseJointHandle>,
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
            active_collision_pairs: HashSet::new(),
            active_trigger_pairs: HashSet::new(),
            target_ground: None,
            target_joints: HashMap::new(),
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

        self.sync_target_joints(world);
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

    fn sync_target_joints(&mut self, world: &World) {
        let mut active = HashSet::new();
        for (&entity, entry) in &self.bodies {
            let Some(joint) = world.get_component::<TargetJoint2D>(entity).filter(|joint| joint.enabled) else { continue };
            if entry.signature.kind != BodyKind::Dynamic { continue; }
            let ground = *self.target_ground.get_or_insert_with(|| self.rapier.insert_body(RigidBodyBuilder::fixed()));
            let target = finite_vec2(joint.target, [0.0; 2]);
            let anchor = finite_vec2(joint.anchor, [0.0; 2]);
            let scale = entry.signature.scale;
            let omega = finite_or(joint.frequency, 5.0).clamp(0.0, 60.0) * std::f32::consts::TAU;
            let stiffness = entry.signature.mass * omega * omega;
            let damping = 2.0 * entry.signature.mass * omega * finite_or(joint.damping_ratio, 0.7).clamp(0.0, 1.0);
            // Divide the vector force budget between the orthogonal solver motors.
            let force = finite_or(joint.max_force, 1000.0).max(0.0) * std::f32::consts::FRAC_1_SQRT_2;
            let mut data = GenericJointBuilder::new(JointAxesMask::empty())
                .local_anchor1(Vec2::new(target[0], target[1]))
                .local_anchor2(Vec2::from_array(finite_vec2([anchor[0] * scale[0], anchor[1] * scale[1]], [0.0; 2])))
                .motor_position(JointAxis::LinX, 0.0, stiffness, damping)
                .motor_position(JointAxis::LinY, 0.0, stiffness, damping)
                .motor_model(JointAxis::LinX, MotorModel::ForceBased)
                .motor_model(JointAxis::LinY, MotorModel::ForceBased)
                .motor_max_force(JointAxis::LinX, force)
                .motor_max_force(JointAxis::LinY, force).build();
            if let Some(existing) = self.target_joints.get(&entity).and_then(|handle| self.rapier.impulse_joints.get_mut(*handle, false)) {
                for (motor, previous) in data.motors.iter_mut().zip(&existing.data.motors) { motor.impulse = previous.impulse; }
                if existing.data != data {
                    existing.data = data;
                    if let Some(body) = self.rapier.bodies.get_mut(entry.handle) { body.wake_up(true); }
                }
            } else {
                let handle = self.rapier.insert_impulse_joint(ground, entry.handle, data);
                self.target_joints.insert(entity, handle);
            }
            active.insert(entity);
        }
        self.target_joints.retain(|entity, handle| {
            if active.contains(entity) { true } else { self.rapier.remove_impulse_joint(*handle); false }
        });
    }

    fn remove_body(&mut self, entity: Entity) {
        if let Some(entry) = self.bodies.remove(&entity) {
            self.rapier.remove_body(entry.handle);
        }
    }

    fn insert_body(&mut self, entity: Entity, definition: &BodyDefinition2D) {
        let rigid_body = definition.rigid_body.as_ref();
        let kind = definition.signature.kind;
        let scale = definition.signature.scale;
        let box_area = definition.signature.box_collider.as_ref().map_or(0.0, |collider| finite_or(collider.size[0] * scale[0], 1.0).abs().max(0.001) * finite_or(collider.size[1] * scale[1], 1.0).abs().max(0.001));
        let circle_area = definition.signature.circle_collider.as_ref().map_or(0.0, |collider| std::f32::consts::PI * finite_or(collider.radius * scale[0].abs().max(scale[1].abs()), 0.5).max(0.001).powi(2));
        let area = box_area + circle_area;
        let density = if kind == BodyKind::Dynamic && area.is_finite() && area > 0.0 { definition.signature.mass / area } else { 0.0 };
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
        if kind == BodyKind::Dynamic && density == 0.0 {
            builder = builder.additional_mass(definition.signature.mass);
        }
        if definition.signature.freeze_rotation {
            builder = builder.lock_rotations();
        }
        let handle = self.rapier.insert_body(builder);

        if let Some(collider) = definition.signature.box_collider.as_ref() {
            let scale = definition.signature.scale;
            let half = [
                finite_or(collider.size[0] * scale[0], 1.0).abs().max(0.001) * 0.5,
                finite_or(collider.size[1] * scale[1], 1.0).abs().max(0.001) * 0.5,
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
                ).density(density),
                Some(handle),
            );
        }
        if let Some(collider) = definition.signature.circle_collider.as_ref() {
            let scale = definition.signature.scale;
            let radius = finite_or(collider.radius * scale[0].abs().max(scale[1].abs()), 0.5);
            let offset = [collider.offset[0] * scale[0], collider.offset[1] * scale[1]];
            self.rapier.insert_collider(
                configure_collider(
                    ColliderBuilder::ball(radius.max(0.001)),
                    offset,
                    collider.is_trigger,
                    collider.friction,
                    collider.bounciness,
                    entity,
                ).density(density),
                Some(handle),
            );
        }
        if let Some(collider) = definition.signature.edge_collider.as_ref() {
            let scale = definition.signature.scale;
            let mut points: Vec<_> = collider.points.iter().map(|p| Vec2::from_array(finite_vec2([p[0] * scale[0], p[1] * scale[1]], [0.0; 2]))).collect();
            points.dedup();
            if points.len() >= 2 {
                self.rapier.insert_collider(configure_collider(ColliderBuilder::polyline(points, None), [collider.offset[0] * scale[0], collider.offset[1] * scale[1]], collider.is_trigger, collider.friction, collider.bounciness, entity), Some(handle));
            }
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
            let edge_collider = world.get_component::<EdgeCollider2D>(entity).cloned().and_then(normalize_edge_collider);
            if rigid_body.is_none() && box_collider.is_none() && circle_collider.is_none() && edge_collider.is_none() {
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
                edge_collider,
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

fn normalize_edge_collider(value: EdgeCollider2D) -> Option<EdgeColliderSignature2D> {
    if value.points.len() > 4096 || value.points.iter().flatten().any(|value| !value.is_finite()) { return None; }
    let mut points: Vec<_> = value.points.into_iter().map(|point| finite_vec2(point, [0.0; 2])).collect();
    points.dedup_by(|a, b| (a[0] - b[0]).hypot(a[1] - b[1]) < 0.00001);
    if points.len() < 2 { return None; }
    Some(EdgeColliderSignature2D { points, offset: finite_vec2(value.offset, [0.0; 2]), is_trigger: value.is_trigger, friction: finite_or(value.friction, 0.5).max(0.0), bounciness: finite_or(value.bounciness, 0.0).clamp(0.0, 1.0) })
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
        .translation(Vec2::from_array(finite_vec2(offset, [0.0; 2])))
        .sensor(is_trigger)
        .friction(friction.sqrt())
        .friction_combine_rule(CoefficientCombineRule::Multiply)
        .restitution(bounciness)
        .restitution_combine_rule(CoefficientCombineRule::Max)
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
        // Keep authored scalar values and scaled geometry within a useful f32 physics range.
        value.clamp(-1.0e6, 1.0e6)
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
    fn shape_mass_preserves_authored_total_and_allows_off_center_rotation() {
        let mut world = World::new();
        let entity = spawn_body(&mut world, [0.0; 3], Some(Rigidbody2D { mass: 12.0, gravity_scale: 0.0, ..Default::default() }), Some(BoxCollider2D { size: [4.0, 1.0], ..Default::default() }), None);
        let mut physics = PhysicsWorld2D::new();
        physics.step(&mut world, 1.0 / 60.0);
        let body = physics.rapier.bodies.get_mut(physics.bodies[&entity].handle).unwrap();
        assert!((body.mass() - 12.0).abs() < 0.0001);
        body.apply_impulse_at_point(Vec2::new(0.0, 4.0), Vec2::new(2.0, 0.0), true);
        assert!(body.angvel() > 0.1, "off-center impulses must rotate an unlocked body");
    }

    #[test]
    fn edge_polyline_supports_collision_trigger_and_invalid_input() {
        let mut world = World::new();
        let ground = spawn_body(&mut world, [0.0; 3], None, None, None);
        world.insert_component(ground, EdgeCollider2D { points: vec![[-3.0, 2.0], [-3.0, 0.0], [3.0, 0.0], [3.0, 2.0]], ..Default::default() });
        let ball = spawn_body(&mut world, [0.0, 2.0, 7.0], Some(Rigidbody2D::default()), None, Some(CircleCollider2D::default()));
        let mut physics = PhysicsWorld2D::new();
        for _ in 0..240 { physics.step(&mut world, 1.0 / 60.0); }
        assert!((world.get_component::<Transform>(ball).unwrap().position[1] - 0.5).abs() < 0.04);
        world.get_component_mut::<EdgeCollider2D>(ground).unwrap().is_trigger = true;
        let mut triggered = false;
        for _ in 0..120 { triggered |= !physics.step(&mut world, 1.0 / 60.0).trigger_started.is_empty(); }
        assert!(triggered);
        assert!(world.get_component::<Transform>(ball).unwrap().position[1] < -2.0);
        world.get_component_mut::<EdgeCollider2D>(ground).unwrap().points = vec![[f32::NAN, 0.0], [0.0, 0.0]];
        physics.step(&mut world, 1.0 / 60.0);
        assert_eq!(physics.collider_count(), 1);
    }

    #[test]
    fn target_joint_tracks_rebuilds_releases_and_bounds_force() {
        let mut world = World::new();
        let entity = spawn_body(&mut world, [0.0; 3], Some(Rigidbody2D { gravity_scale: 0.0, linear_damping: 0.0, ..Default::default() }), Some(BoxCollider2D::default()), None);
        world.insert_component(entity, TargetJoint2D { target: [2.0, 3.0], damping_ratio: 1.0, ..Default::default() });
        let mut physics = PhysicsWorld2D::new();
        for _ in 0..120 { physics.step(&mut world, 1.0 / 60.0); }
        let position = world.get_component::<Transform>(entity).unwrap().position;
        assert!((position[0] - 2.0).hypot(position[1] - 3.0) < 0.02, "{position:?}");
        physics.rapier.bodies.get_mut(physics.bodies[&entity].handle).unwrap().sleep();
        physics.rapier.impulse_joints.get_mut(physics.target_joints[&entity], false).unwrap().data.motors[0].impulse = 0.25;
        physics.sync_target_joints(&world);
        assert!(physics.rapier.bodies.get(physics.bodies[&entity].handle).unwrap().is_sleeping(), "unchanged joint parameters must preserve sleep and cached solver impulses");
        world.get_component_mut::<BoxCollider2D>(entity).unwrap().size = [2.0, 1.0];
        world.get_component_mut::<TargetJoint2D>(entity).unwrap().target = [-1.0, 2.0];
        for _ in 0..120 { physics.step(&mut world, 1.0 / 60.0); }
        assert_eq!(physics.target_joints.len(), 1);
        assert!((world.get_component::<Transform>(entity).unwrap().position[0] + 1.0).abs() < 0.02);
        world.get_component_mut::<TargetJoint2D>(entity).unwrap().enabled = false;
        world.get_component_mut::<Rigidbody2D>(entity).unwrap().velocity = [1.0, 0.0];
        for _ in 0..60 { physics.step(&mut world, 1.0 / 60.0); }
        assert!(physics.target_joints.is_empty());
        assert!(world.get_component::<Transform>(entity).unwrap().position[0] > -0.02);
        world.get_component_mut::<Rigidbody2D>(entity).unwrap().velocity = [0.0; 2];
        world.insert_component(entity, TargetJoint2D { target: [100.0, 100.0], max_force: 1.0, ..Default::default() });
        physics.step(&mut world, 0.1);
        let velocity = world.get_component::<Rigidbody2D>(entity).unwrap().velocity;
        assert!(velocity[0].hypot(velocity[1]) <= 0.101, "force budget must be bounded: {velocity:?}");
        world.despawn(entity);
        physics.step(&mut world, 1.0 / 60.0);
        assert!(physics.target_joints.is_empty());
        assert_eq!(physics.collider_count(), 0);
    }

    #[test]
    fn target_anchor_rotates_body_and_extreme_inputs_remain_finite() {
        let mut world = World::new();
        let entity = spawn_body(&mut world, [0.0; 3], Some(Rigidbody2D { gravity_scale: 0.0, ..Default::default() }), Some(BoxCollider2D::default()), None);
        world.insert_component(entity, TargetJoint2D { anchor: [0.5, 0.0], target: [0.5, 2.0], ..Default::default() });
        let mut physics = PhysicsWorld2D::new();
        physics.step(&mut world, 1.0 / 60.0);
        assert!(world.get_component::<Rigidbody2D>(entity).unwrap().angular_velocity.abs() > 1.0);
        world.get_component_mut::<Transform>(entity).unwrap().scale = [f32::MAX, f32::MAX, 1.0];
        world.get_component_mut::<Rigidbody2D>(entity).unwrap().mass = f32::MAX;
        world.get_component_mut::<TargetJoint2D>(entity).unwrap().anchor = [f32::MAX; 2];
        world.insert_component(entity, EdgeCollider2D { points: vec![[-f32::MAX, 0.0], [f32::MAX, 0.0]], ..Default::default() });
        for _ in 0..4 { physics.step(&mut world, 1.0 / 60.0); }
        assert!(world.get_component::<Transform>(entity).unwrap().position.iter().all(|value| value.is_finite()));
        let body = physics.rapier.bodies.get(physics.bodies[&entity].handle).unwrap();
        assert!(body.mass().is_finite() && body.linvel().is_finite() && body.angvel().is_finite());
        let joint = &physics.rapier.impulse_joints.get(physics.target_joints[&entity]).unwrap().data;
        assert!(joint.local_anchor2().is_finite());
        assert!(joint.motors.iter().all(|motor| motor.stiffness.is_finite() && motor.damping.is_finite()));
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
