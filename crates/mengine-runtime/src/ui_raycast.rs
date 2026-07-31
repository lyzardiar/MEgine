//! Unity-style physics blocking queries used by `GraphicRaycaster`.

use glam::{Mat4, Vec3};
use mengine_core::generated::{
    BoxCollider2D, BoxCollider3D, CircleCollider2D, Layer, SphereCollider3D,
};
use mengine_core::{Entity, TransformHierarchy, World};
use mengine_rhi::FrameCamera;

const RAY_EPSILON: f32 = 0.000_001;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BlockingObjects {
    None,
    TwoD,
    ThreeD,
    All,
}

impl BlockingObjects {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "2d" | "twod" => Self::TwoD,
            "3d" | "threed" => Self::ThreeD,
            "all" => Self::All,
            _ => Self::None,
        }
    }

    pub fn includes_2d(self) -> bool {
        matches!(self, Self::TwoD | Self::All)
    }

    pub fn includes_3d(self) -> bool {
        matches!(self, Self::ThreeD | Self::All)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorldRay {
    pub origin: Vec3,
    pub direction: Vec3,
}

impl WorldRay {
    pub fn new(origin: Vec3, direction: Vec3) -> Option<Self> {
        if !origin.is_finite() || !direction.is_finite() {
            return None;
        }
        let direction = direction.try_normalize()?;
        Some(Self { origin, direction })
    }

    pub fn point_at(self, distance: f32) -> Vec3 {
        self.origin + self.direction * distance
    }
}

/// Reconstructs the camera ray for a physical viewport coordinate. MEngine uses the same 0..1
/// clip-space depth convention as wgpu, so the two inverse-projected points are the near/far planes.
pub fn viewport_world_ray(
    camera: FrameCamera,
    viewport: [u32; 2],
    point: [f32; 2],
) -> Option<WorldRay> {
    let width = viewport[0].max(1) as f32;
    let height = viewport[1].max(1) as f32;
    let ndc_x = point[0] / width * 2.0 - 1.0;
    let ndc_y = 1.0 - point[1] / height * 2.0;
    let view_projection = camera.proj * camera.view;
    let determinant = view_projection.determinant();
    if !determinant.is_finite() || determinant.abs() <= RAY_EPSILON {
        return None;
    }
    let inverse = view_projection.inverse();
    let near = inverse * glam::Vec4::new(ndc_x, ndc_y, 0.0, 1.0);
    let far = inverse * glam::Vec4::new(ndc_x, ndc_y, 1.0, 1.0);
    if !near.is_finite()
        || !far.is_finite()
        || near.w.abs() <= RAY_EPSILON
        || far.w.abs() <= RAY_EPSILON
    {
        return None;
    }
    let near = near.truncate() / near.w;
    let far = far.truncate() / far.w;
    WorldRay::new(near, far - near)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhysicsRayHit {
    pub entity: Entity,
    pub distance: f32,
}

/// Returns the closest authored 2D/3D collider in front of the ray. The query reads the same ECS
/// transforms that feed Rapier, which also makes the result deterministic before the first physics
/// step and keeps editor/runtime scene observations aligned.
pub fn raycast_blocking_colliders(
    world: &World,
    hierarchy: &TransformHierarchy,
    ray: WorldRay,
    max_distance: f32,
    blocking: BlockingObjects,
    layer_mask: i32,
) -> Option<PhysicsRayHit> {
    if blocking == BlockingObjects::None || !max_distance.is_finite() || max_distance < 0.0 {
        return None;
    }
    let mut closest: Option<PhysicsRayHit> = None;
    for entity in world.iter_entities() {
        if !hierarchy.is_active(entity) || !layer_in_mask(world, entity, layer_mask) {
            continue;
        }
        let Some(transform) = hierarchy.get(entity) else {
            continue;
        };
        let mut consider = |distance: Option<f32>| {
            let Some(distance) = distance else { return };
            if distance < 0.0 || distance > max_distance {
                return;
            }
            if closest.is_none_or(|hit| distance < hit.distance) {
                closest = Some(PhysicsRayHit { entity, distance });
            }
        };

        if blocking.includes_3d() {
            if let Some(collider) = world.get_component::<BoxCollider3D>(entity) {
                consider(ray_box_3d(ray, transform.matrix, collider));
            }
            if let Some(collider) = world.get_component::<SphereCollider3D>(entity) {
                consider(ray_sphere_3d(ray, transform.matrix, collider));
            }
        }
        if blocking.includes_2d() {
            if let Some(collider) = world.get_component::<BoxCollider2D>(entity) {
                consider(ray_box_2d(ray, transform.matrix, collider));
            }
            if let Some(collider) = world.get_component::<CircleCollider2D>(entity) {
                consider(ray_circle_2d(ray, transform.matrix, collider));
            }
        }
    }
    closest
}

fn layer_in_mask(world: &World, entity: Entity, mask: i32) -> bool {
    let layer = world
        .get_component::<Layer>(entity)
        .map_or(0, |layer| layer.value);
    (0..32).contains(&layer) && (mask as u32 & (1_u32 << layer)) != 0
}

fn ray_box_3d(ray: WorldRay, world_matrix: Mat4, collider: &BoxCollider3D) -> Option<f32> {
    let local_from_world = invert_affine(world_matrix)?;
    let origin = local_from_world.transform_point3(ray.origin) - Vec3::from(collider.center);
    let direction = local_from_world.transform_vector3(ray.direction);
    let half = Vec3::from(collider.size).abs() * 0.5;
    ray_aabb(origin, direction, half)
}

fn ray_sphere_3d(ray: WorldRay, world_matrix: Mat4, collider: &SphereCollider3D) -> Option<f32> {
    let center = world_matrix.transform_point3(Vec3::from(collider.center));
    let radius = collider.radius.abs() * maximum_axis_scale(world_matrix);
    ray_sphere(ray, center, radius)
}

fn ray_box_2d(ray: WorldRay, world_matrix: Mat4, collider: &BoxCollider2D) -> Option<f32> {
    let local_from_world = invert_affine(world_matrix)?;
    let origin = local_from_world.transform_point3(ray.origin);
    let direction = local_from_world.transform_vector3(ray.direction);
    let distance = ray_local_xy_plane(origin, direction)?;
    let point = origin + direction * distance;
    let half = glam::Vec2::from(collider.size).abs() * 0.5;
    let offset = glam::Vec2::from(collider.offset);
    let local = point.truncate() - offset;
    (local.x.abs() <= half.x && local.y.abs() <= half.y).then_some(distance)
}

fn ray_circle_2d(ray: WorldRay, world_matrix: Mat4, collider: &CircleCollider2D) -> Option<f32> {
    let plane_point = world_matrix.transform_point3(Vec3::ZERO);
    let plane_normal = world_matrix.transform_vector3(Vec3::Z).try_normalize()?;
    let distance = ray_plane(ray, plane_point, plane_normal)?;
    let center =
        world_matrix.transform_point3(Vec3::new(collider.offset[0], collider.offset[1], 0.0));
    let radius = collider.radius.abs() * maximum_xy_axis_scale(world_matrix);
    let delta = ray.point_at(distance) - center;
    (delta.length_squared() <= radius * radius).then_some(distance)
}

pub fn ray_plane(ray: WorldRay, point: Vec3, normal: Vec3) -> Option<f32> {
    let normal = normal.try_normalize()?;
    let denominator = normal.dot(ray.direction);
    if denominator.abs() <= RAY_EPSILON {
        return None;
    }
    let distance = normal.dot(point - ray.origin) / denominator;
    (distance >= 0.0 && distance.is_finite()).then_some(distance)
}

fn ray_local_xy_plane(origin: Vec3, direction: Vec3) -> Option<f32> {
    if direction.z.abs() <= RAY_EPSILON {
        return None;
    }
    let distance = -origin.z / direction.z;
    (distance >= 0.0 && distance.is_finite()).then_some(distance)
}

fn ray_aabb(origin: Vec3, direction: Vec3, half: Vec3) -> Option<f32> {
    let mut minimum = 0.0_f32;
    let mut maximum = f32::INFINITY;
    for axis in 0..3 {
        let origin = origin[axis];
        let direction = direction[axis];
        let extent = half[axis].max(0.0005);
        if direction.abs() <= RAY_EPSILON {
            if origin < -extent || origin > extent {
                return None;
            }
            continue;
        }
        let first = (-extent - origin) / direction;
        let second = (extent - origin) / direction;
        minimum = minimum.max(first.min(second));
        maximum = maximum.min(first.max(second));
        if maximum < minimum {
            return None;
        }
    }
    (maximum >= 0.0).then_some(minimum.max(0.0))
}

fn ray_sphere(ray: WorldRay, center: Vec3, radius: f32) -> Option<f32> {
    let radius = radius.max(0.0005);
    let offset = ray.origin - center;
    let projection = offset.dot(ray.direction);
    let discriminant = projection * projection - (offset.length_squared() - radius * radius);
    if discriminant < 0.0 {
        return None;
    }
    let root = discriminant.sqrt();
    let near = -projection - root;
    let far = -projection + root;
    if near >= 0.0 {
        Some(near)
    } else if far >= 0.0 {
        Some(0.0)
    } else {
        None
    }
}

fn invert_affine(matrix: Mat4) -> Option<Mat4> {
    let determinant = matrix.determinant();
    if !determinant.is_finite() || determinant.abs() <= RAY_EPSILON {
        return None;
    }
    let inverse = matrix.inverse();
    inverse.is_finite().then_some(inverse)
}

fn maximum_axis_scale(matrix: Mat4) -> f32 {
    matrix.x_axis.truncate().length().max(
        matrix
            .y_axis
            .truncate()
            .length()
            .max(matrix.z_axis.truncate().length()),
    )
}

fn maximum_xy_axis_scale(matrix: Mat4) -> f32 {
    matrix
        .x_axis
        .truncate()
        .length()
        .max(matrix.y_axis.truncate().length())
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::generated::Transform;
    use mengine_rhi::{look_at, orthographic, perspective};

    fn entity_with_transform(world: &mut World, position: [f32; 3]) -> Entity {
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            Transform {
                position,
                ..Transform::default()
            },
        );
        entity
    }

    #[test]
    fn raycast_3d_uses_nearest_shape_and_layer_mask() {
        let mut world = World::new();
        let sphere = entity_with_transform(&mut world, [0.0, 0.0, 2.0]);
        world.insert_component(sphere, SphereCollider3D::default());
        world.insert_component(sphere, Layer { value: 3 });
        let cube = entity_with_transform(&mut world, [0.0, 0.0, 0.0]);
        world.insert_component(cube, BoxCollider3D::default());
        let hierarchy = TransformHierarchy::build(&world);
        let ray = WorldRay::new(Vec3::new(0.0, 0.0, 5.0), -Vec3::Z).unwrap();

        let all =
            raycast_blocking_colliders(&world, &hierarchy, ray, 10.0, BlockingObjects::ThreeD, -1)
                .unwrap();
        assert_eq!(all.entity, sphere);
        assert!((all.distance - 2.5).abs() < 0.0001);

        let default_layer =
            raycast_blocking_colliders(&world, &hierarchy, ray, 10.0, BlockingObjects::ThreeD, 1)
                .unwrap();
        assert_eq!(default_layer.entity, cube);
        assert!((default_layer.distance - 4.5).abs() < 0.0001);
    }

    #[test]
    fn camera_depth_ray_hits_planar_2d_shapes() {
        let mut world = World::new();
        let circle = entity_with_transform(&mut world, [0.0, 0.0, 1.0]);
        world.insert_component(circle, CircleCollider2D::default());
        let hierarchy = TransformHierarchy::build(&world);
        let ray = WorldRay::new(Vec3::new(0.0, 0.0, 5.0), -Vec3::Z).unwrap();
        let hit =
            raycast_blocking_colliders(&world, &hierarchy, ray, 10.0, BlockingObjects::TwoD, -1)
                .unwrap();
        assert_eq!(hit.entity, circle);
        assert!((hit.distance - 4.0).abs() < 0.0001);
    }

    #[test]
    fn blocking_kind_does_not_cross_2d_and_3d_worlds() {
        let mut world = World::new();
        let collider = entity_with_transform(&mut world, [0.0, 0.0, 0.0]);
        world.insert_component(collider, BoxCollider2D::default());
        let hierarchy = TransformHierarchy::build(&world);
        let ray = WorldRay::new(Vec3::new(0.0, 0.0, 5.0), -Vec3::Z).unwrap();
        assert!(raycast_blocking_colliders(
            &world,
            &hierarchy,
            ray,
            10.0,
            BlockingObjects::ThreeD,
            -1,
        )
        .is_none());
        assert!(raycast_blocking_colliders(
            &world,
            &hierarchy,
            ray,
            10.0,
            BlockingObjects::All,
            -1,
        )
        .is_some());
    }

    #[test]
    fn viewport_rays_match_perspective_and_orthographic_cameras() {
        let perspective_camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 5.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 5.0),
        };
        let center = viewport_world_ray(perspective_camera, [800, 600], [400.0, 300.0]).unwrap();
        assert!((center.origin.z - 4.9).abs() < 0.001);
        assert!((center.direction + Vec3::Z).length() < 0.0001);

        let orthographic_camera = FrameCamera {
            proj: orthographic(3.0, 4.0 / 3.0, 0.1, 100.0),
            ..perspective_camera
        };
        let right = viewport_world_ray(orthographic_camera, [800, 600], [800.0, 300.0]).unwrap();
        assert!((right.origin.x - 4.0).abs() < 0.001);
        assert!((right.direction + Vec3::Z).length() < 0.0001);
    }
}
