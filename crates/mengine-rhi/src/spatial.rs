//! MiYu: conservative world bounds and octree queries for independent camera and shadow passes.
use glam::{Mat4, Vec3, Vec4};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb { pub min: Vec3, pub max: Vec3 }

impl Aabb {
    pub fn from_points(points: impl IntoIterator<Item = Vec3>) -> Option<Self> {
        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = Vec3::splat(f32::NEG_INFINITY);
        for point in points {
            if !point.is_finite() { return None; }
            min = min.min(point); max = max.max(point);
        }
        (min.is_finite() && max.is_finite()).then_some(Self { min, max })
    }
    pub fn transformed(self, model: Mat4) -> Option<Self> {
        if !model.is_finite() { return None; }
        // All corners retain parent shear, nonuniform scale and negative scale.
        Self::from_points((0..8).map(|i| model.transform_point3(Vec3::new(
            if i & 1 == 0 { self.min.x } else { self.max.x },
            if i & 2 == 0 { self.min.y } else { self.max.y },
            if i & 4 == 0 { self.min.z } else { self.max.z },
        ))))
    }
    fn union(self, other: Self) -> Self { Self { min: self.min.min(other.min), max: self.max.max(other.max) } }
    fn contains(self, other: Self) -> bool { self.min.cmple(other.min).all() && self.max.cmpge(other.max).all() }
}

pub struct Frustum { planes: [Vec4; 6] }
impl Frustum {
    pub fn from_wgpu_matrix(matrix: Mat4) -> Self {
        if !matrix.is_finite() { return Self { planes: [Vec4::ZERO; 6] }; }
        let r = matrix.transpose();
        // wgpu clip depth is 0..w, so the near plane is row 2.
        Self { planes: [r.w_axis + r.x_axis, r.w_axis - r.x_axis, r.w_axis + r.y_axis, r.w_axis - r.y_axis, r.z_axis, r.w_axis - r.z_axis] }
    }
    pub fn intersects(&self, bounds: Aabb) -> bool {
        self.planes.iter().all(|plane| {
            let normal = plane.truncate();
            let positive = Vec3::new(if normal.x >= 0.0 { bounds.max.x } else { bounds.min.x }, if normal.y >= 0.0 { bounds.max.y } else { bounds.min.y }, if normal.z >= 0.0 { bounds.max.z } else { bounds.min.z });
            let distance = normal.dot(positive) + plane.w;
            // Invalid geometry/projections stay visible. A small tolerance avoids edge flicker.
            !distance.is_finite() || distance >= -1e-4 * normal.length().max(1.0)
        })
    }
}

struct Node { bounds: Aabb, entries: Vec<usize>, children: Vec<Node> }
impl Node {
    fn build(bounds: Aabb, indices: Vec<usize>, entries: &[Option<Aabb>], depth: u8) -> Self {
        if indices.len() <= 32 || depth >= 8 { return Self { bounds, entries: indices, children: vec![] }; }
        let center = (bounds.min + bounds.max) * 0.5;
        let child_bounds: Vec<_> = (0..8).map(|i| Aabb {
            min: Vec3::new(if i & 1 == 0 { bounds.min.x } else { center.x }, if i & 2 == 0 { bounds.min.y } else { center.y }, if i & 4 == 0 { bounds.min.z } else { center.z }),
            max: Vec3::new(if i & 1 == 0 { center.x } else { bounds.max.x }, if i & 2 == 0 { center.y } else { bounds.max.y }, if i & 4 == 0 { center.z } else { bounds.max.z }),
        }).collect();
        let mut buckets: [Vec<usize>; 8] = Default::default();
        let mut resident = vec![];
        for index in indices {
            let entry = entries[index].unwrap();
            if let Some(child) = child_bounds.iter().position(|b| b.contains(entry)) { buckets[child].push(index); }
            else { resident.push(index); }
        }
        let children = buckets.into_iter().enumerate().filter(|(_, bucket)| !bucket.is_empty()).map(|(i, bucket)| Self::build(child_bounds[i], bucket, entries, depth + 1)).collect();
        Self { bounds, entries: resident, children }
    }
    fn query(&self, frustum: &Frustum, entries: &[Option<Aabb>], result: &mut Vec<usize>) {
        if !frustum.intersects(self.bounds) { return; }
        for &index in &self.entries { if frustum.intersects(entries[index].unwrap()) { result.push(index); } }
        for child in &self.children { child.query(frustum, entries, result); }
    }
}

#[derive(Default)]
pub struct SpatialIndex { entries: Vec<Option<Aabb>>, root: Option<Node>, unknown: Vec<usize> }
impl SpatialIndex {
    pub fn update(&mut self, entries: Vec<Option<Aabb>>) {
        if entries == self.entries { return; }
        self.unknown = entries.iter().enumerate().filter_map(|(i, bounds)| bounds.is_none().then_some(i)).collect();
        let known: Vec<_> = entries.iter().enumerate().filter_map(|(i, bounds)| bounds.is_some().then_some(i)).collect();
        self.root = known.iter().map(|&i| entries[i].unwrap()).reduce(Aabb::union).map(|bounds| Node::build(bounds, known, &entries, 0));
        self.entries = entries;
    }
    pub fn query(&self, frustum: &Frustum) -> Vec<usize> {
        let mut result = self.unknown.clone();
        if let Some(root) = &self.root { root.query(frustum, &self.entries, &mut result); }
        result.sort_unstable();
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cube(position: Vec3) -> Aabb { Aabb { min: position - Vec3::splat(0.1), max: position + Vec3::splat(0.1) } }
    #[test]
    fn wgpu_depth_and_intersecting_large_objects() {
        let f = Frustum::from_wgpu_matrix(Mat4::IDENTITY);
        assert!(f.intersects(cube(Vec3::new(0.0, 0.0, 0.5))));
        assert!(!f.intersects(cube(Vec3::new(0.0, 0.0, -0.5))));
        assert!(!f.intersects(cube(Vec3::new(0.0, 0.0, 1.5))));
        assert!(f.intersects(Aabb { min: Vec3::splat(-100.0), max: Vec3::splat(100.0) }));
    }
    #[test]
    fn transformed_bounds_keep_shear_and_mirrors() {
        let model = Mat4::from_cols(Vec4::new(-2.0, 0.0, 0.0, 0.0), Vec4::new(3.0, 1.0, 0.0, 0.0), Vec4::Z, Vec4::W);
        let b = Aabb { min: Vec3::splat(-1.0), max: Vec3::splat(1.0) }.transformed(model).unwrap();
        assert_eq!(b.min, Vec3::new(-5.0, -1.0, -1.0));
        assert_eq!(b.max, Vec3::new(5.0, 1.0, 1.0));
    }
    #[test]
    fn octree_matches_linear_queries_and_updates_dynamic_geometry() {
        let mut index = SpatialIndex::default();
        let mut entries: Vec<_> = (0..10000).map(|i| Some(cube(Vec3::new((i % 100) as f32 - 50.0, (i / 100) as f32 - 50.0, 0.5)))).collect();
        entries.push(None);
        let camera = Frustum::from_wgpu_matrix(Mat4::IDENTITY);
        for step in 0..3 {
            entries[6000] = Some(cube(Vec3::new(step as f32, 0.0, 0.5)));
            index.update(entries.clone());
            let expected: Vec<_> = entries.iter().enumerate().filter_map(|(i, b)| b.is_none_or(|b| camera.intersects(b)).then_some(i)).collect();
            assert_eq!(index.query(&camera), expected);
        }
        let shadow = Frustum::from_wgpu_matrix(Mat4::from_translation(Vec3::new(-30.0, 0.0, 0.0)));
        assert_ne!(index.query(&camera), index.query(&shadow));
        index.update(vec![]); assert!(index.query(&camera).is_empty());
    }
    #[test]
    fn perspective_and_orthographic_views_match_clip_space() {
        let view = Mat4::look_at_rh(Vec3::new(0.0, 0.0, 5.0), Vec3::ZERO, Vec3::Y);
        for projection in [Mat4::perspective_rh(1.0, 1.0, 0.1, 100.0), Mat4::orthographic_rh(-2.0, 2.0, -2.0, 2.0, 0.1, 100.0)] {
            let matrix = projection * view;
            let f = Frustum::from_wgpu_matrix(matrix);
            for point in [Vec3::ZERO, Vec3::new(10.0, 0.0, 0.0), Vec3::new(0.0, 0.0, 6.0)] {
                let clip = matrix * point.extend(1.0);
                let inside = clip.x.abs() <= clip.w && clip.y.abs() <= clip.w && clip.z >= 0.0 && clip.z <= clip.w;
                assert_eq!(f.intersects(Aabb { min: point, max: point }), inside);
            }
        }
    }
}
