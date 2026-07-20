//! Trait abstraction for 2D physics queries, shared between the script host
//! and the physics backend without creating a circular dependency.

/// Result of a 2D raycast query (entity id as u64 for JS precision).
#[derive(Clone, Debug)]
pub struct PhysicsRaycastHit2D {
    pub entity: u64,
    pub point: [f32; 2],
    pub normal: [f32; 2],
    pub distance: f32,
}

/// Trait for 2D physics queries. Implemented by `PhysicsWorld2D` in mengine-physics
/// and consumed by the script host via `Arc<dyn PhysicsQuery2D>`.
pub trait PhysicsQuery2D: Send {
    /// Casts a ray and returns the first hit.
    fn raycast(
        &self,
        origin: [f32; 2],
        direction: [f32; 2],
        max_distance: f32,
    ) -> Option<PhysicsRaycastHit2D>;

    /// Returns all entity ids whose collider contains the given point.
    fn overlap_point(&self, point: [f32; 2]) -> Vec<u64>;

    /// Returns all entity ids whose collider overlaps the given circle.
    fn overlap_circle(&self, center: [f32; 2], radius: f32) -> Vec<u64>;

    /// Returns all entity ids whose collider overlaps the given axis-aligned box.
    fn overlap_box(&self, center: [f32; 2], half_extents: [f32; 2]) -> Vec<u64>;
}