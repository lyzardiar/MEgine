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
        if !model.row(3).abs_diff_eq(Vec4::W, 1e-6) { return self.transformed_corners(model); }
        if !self.min.is_finite() || !self.max.is_finite() { return None; }
        let lower = self.min.min(self.max); let upper = self.min.max(self.max);
        let endpoints = |axis: Vec4, low: f32, high: f32| {
            let positive = axis.cmpge(Vec4::ZERO);
            (Vec4::select(positive, Vec4::splat(low), Vec4::splat(high)), Vec4::select(positive, Vec4::splat(high), Vec4::splat(low)))
        };
        let (low_x, high_x) = endpoints(model.x_axis, lower.x, upper.x);
        let (low_y, high_y) = endpoints(model.y_axis, lower.y, upper.y);
        let (low_z, high_z) = endpoints(model.z_axis, lower.z, upper.z);
        // Match transform_point3's multiplication/addition order for each output lane.
        let point = |x: Vec4, y: Vec4, z: Vec4| (model.w_axis + (model.z_axis * z + (model.y_axis * y + model.x_axis * x))).truncate();
        let min = point(low_x, low_y, low_z); let max = point(high_x, high_y, high_z);
        (min.is_finite() && max.is_finite()).then_some(Self { min, max })
    }
    fn transformed_corners(self, model: Mat4) -> Option<Self> {
        Self::from_points((0..8).map(|i| model.transform_point3(Vec3::new(
            if i & 1 == 0 { self.min.x } else { self.max.x },
            if i & 2 == 0 { self.min.y } else { self.max.y },
            if i & 4 == 0 { self.min.z } else { self.max.z },
        ))))
    }
    fn union(self, other: Self) -> Self { Self { min: self.min.min(other.min), max: self.max.max(other.max) } }
    fn contains(self, other: Self) -> bool { self.min.cmple(other.min).all() && self.max.cmpge(other.max).all() }
    fn surface_area(self) -> f64 {
        let x = (self.max.x as f64 - self.min.x as f64).max(0.0);
        let y = (self.max.y as f64 - self.min.y as f64).max(0.0);
        let z = (self.max.z as f64 - self.min.z as f64).max(0.0);
        2.0 * (x * y + x * z + y * z)
    }
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

const NO_NODE: usize = usize::MAX;
struct Node { bounds: Aabb, entries: Vec<usize>, children: Vec<usize>, parent: usize, dirty: bool }
impl Node {
    fn build(bounds: Aabb, indices: Vec<usize>, entries: &[Option<Aabb>], depth: u8, parent: usize, nodes: &mut Vec<Node>, owners: &mut [usize]) -> usize {
        let node = nodes.len();
        nodes.push(Self { bounds, entries: vec![], children: vec![], parent, dirty: false });
        if indices.len() <= 32 || depth >= 8 {
            for &index in &indices { owners[index] = node; }
            nodes[node].entries = indices;
            nodes[node].bounds = nodes[node].refitted_bounds(nodes, entries);
            return node;
        }
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
        let children = buckets.into_iter().enumerate().filter(|(_, bucket)| !bucket.is_empty()).map(|(i, bucket)| Self::build(child_bounds[i], bucket, entries, depth + 1, node, nodes, owners)).collect();
        for &index in &resident { owners[index] = node; }
        nodes[node].entries = resident;
        nodes[node].children = children;
        nodes[node].bounds = nodes[node].refitted_bounds(nodes, entries);
        node
    }
    fn refitted_bounds(&self, nodes: &[Node], entries: &[Option<Aabb>]) -> Aabb {
        self.entries.iter().map(|&index| entries[index].unwrap()).chain(self.children.iter().map(|&child| nodes[child].bounds)).reduce(Aabb::union).unwrap()
    }
    fn cost(&self) -> f64 { self.bounds.surface_area() * (self.entries.len() + self.children.len()) as f64 }
    fn query(&self, frustum: &Frustum, nodes: &[Node], entries: &[Option<Aabb>], result: &mut Vec<usize>) {
        if !frustum.intersects(self.bounds) { return; }
        for &index in &self.entries { if frustum.intersects(entries[index].unwrap()) { result.push(index); } }
        for &child in &self.children { nodes[child].query(frustum, nodes, entries, result); }
    }
}

#[derive(Default)]
pub struct SpatialIndex { entries: Vec<Option<Aabb>>, nodes: Vec<Node>, owners: Vec<usize>, unknown: Vec<usize>, cost: f64, build_quality: f64 }
impl SpatialIndex {
    pub fn update(&mut self, entries: Vec<Option<Aabb>>) {
        if entries.len() != self.entries.len() { self.rebuild(entries); return; }
        let mut changed = false;
        for (index, (next, previous)) in entries.iter().zip(&self.entries).enumerate() {
            if next == previous { continue; }
            if next.is_some() != previous.is_some() { self.rebuild(entries); return; }
            changed = true;
            let mut node = self.owners[index];
            while node != NO_NODE && !self.nodes[node].dirty {
                self.nodes[node].dirty = true;
                node = self.nodes[node].parent;
            }
        }
        if !changed { return; }
        self.entries = entries;
        // Parents precede descendants. Refit tight bounds bottom-up, including motion outside the old root.
        for index in (0..self.nodes.len()).rev() {
            if !self.nodes[index].dirty { continue; }
            self.cost -= self.nodes[index].cost();
            self.nodes[index].bounds = self.nodes[index].refitted_bounds(&self.nodes, &self.entries);
            self.nodes[index].dirty = false;
            self.cost += self.nodes[index].cost();
        }
        // Surface-area cost bounds persistent overlap; depth and membership stay bounded between rebuilds.
        if self.nodes.len() > 1 && self.quality() > self.build_quality * 1.5 {
            let entries = std::mem::take(&mut self.entries);
            self.rebuild(entries);
        }
    }
    fn quality(&self) -> f64 { self.nodes.first().map_or(0.0, |root| self.cost / root.bounds.surface_area().max(f64::MIN_POSITIVE)) }
    fn rebuild(&mut self, entries: Vec<Option<Aabb>>) {
        self.nodes.clear();
        self.owners.clear(); self.owners.resize(entries.len(), NO_NODE);
        self.unknown = entries.iter().enumerate().filter_map(|(i, bounds)| bounds.is_none().then_some(i)).collect();
        let known: Vec<_> = entries.iter().enumerate().filter_map(|(i, bounds)| bounds.is_some().then_some(i)).collect();
        if let Some(bounds) = known.iter().map(|&i| entries[i].unwrap()).reduce(Aabb::union) { Node::build(bounds, known, &entries, 0, NO_NODE, &mut self.nodes, &mut self.owners); }
        self.entries = entries;
        self.cost = self.nodes.iter().map(Node::cost).sum();
        self.build_quality = self.quality();
    }
    pub fn query(&self, frustum: &Frustum) -> Vec<usize> {
        let mut result = self.unknown.clone();
        if let Some(root) = self.nodes.first() { root.query(frustum, &self.nodes, &self.entries, &mut result); }
        result.sort_unstable();
        result
    }
}

#[cfg(test)]
#[path = "spatial_bounds_tests.rs"]
mod bounds_tests;

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

    fn test_views() -> [Frustum; 3] {
        [Frustum::from_wgpu_matrix(Mat4::IDENTITY), Frustum::from_wgpu_matrix(Mat4::orthographic_rh(-12.0, 12.0, -8.0, 8.0, 0.1, 150.0) * Mat4::look_at_rh(Vec3::new(0.0, 0.0, 60.0), Vec3::ZERO, Vec3::Y)), Frustum::from_wgpu_matrix(Mat4::perspective_rh(0.8, 1.5, 0.1, 200.0) * Mat4::look_at_rh(Vec3::new(25.0, 20.0, 50.0), Vec3::ZERO, Vec3::Y))]
    }

    fn assert_queries(index: &SpatialIndex, entries: &[Option<Aabb>], views: &[Frustum]) {
        for view in views {
            let expected: Vec<_> = entries.iter().enumerate().filter_map(|(i, bounds)| bounds.is_none_or(|bounds| view.intersects(bounds)).then_some(i)).collect();
            assert_eq!(index.query(view), expected);
        }
    }

    fn distributed_entries(count: usize) -> Vec<Option<Aabb>> {
        (0..count).map(|i| Some(cube(Vec3::new((i % 100) as f32 * 2.0 - 100.0, ((i / 100) % 20) as f32 * 2.0 - 20.0, (i / 2000) as f32 * 2.0 - 10.0)))).collect()
    }

    #[test]
    fn moving_bounds_unknown_transitions_and_membership_match_linear_queries() {
        let mut index = SpatialIndex::default();
        let mut entries = distributed_entries(2048);
        let views = test_views();
        for frame in 0..160 {
            for offset in 0..80 {
                let i = (frame * 79 + offset) % entries.len();
                entries[i] = Some(cube(Vec3::new(((frame * 17 + offset * 37) % 241) as f32 - 120.0, ((frame * 13 + offset) % 81) as f32 - 40.0, ((frame + offset * 3) % 61) as f32 - 30.0)));
            }
            entries[0] = if frame % 3 == 0 { None } else { Some(cube(Vec3::new(500.0 + frame as f32, 0.0, 0.5))) };
            if frame % 7 == 0 { entries.push(None); }
            if frame % 11 == 0 { entries.remove(4); }
            index.update(entries.clone());
            assert_queries(&index, &entries, &views);
        }
        for entries in [vec![None; 100], vec![], vec![Some(cube(Vec3::ZERO)); 100]] {
            index.update(entries.clone());
            assert_queries(&index, &entries, &views);
        }
    }

    #[test]
    fn refits_follow_motion_outside_root_and_rebuild_degraded_partitions() {
        let mut index = SpatialIndex::default();
        let initial = distributed_entries(4096);
        index.update(initial.clone());
        let old_owners = index.owners.clone();
        let translation = Vec3::new(500.0, -200.0, 30.0);
        let translated: Vec<_> = initial.iter().map(|bounds| bounds.map(|b| Aabb { min: b.min + translation, max: b.max + translation })).collect();
        index.update(translated.clone());
        assert_eq!(index.owners, old_owners);
        assert_queries(&index, &translated, &[Frustum::from_wgpu_matrix(Mat4::from_translation(-translation))]);

        let views = test_views();
        let mut rebuilds = 0;
        for frame in 0..128 {
            let entries: Vec<_> = initial.iter().enumerate().map(|(i, bounds)| bounds.map(|b| {
                let phase = frame as f32 * 0.07 + (i % 13) as f32;
                let offset = Vec3::new(phase.sin() * 180.0, (phase * 1.3).cos() * 40.0, (phase * 0.8).sin() * 20.0);
                Aabb { min: b.min + offset, max: b.max + offset }
            })).collect();
            let previous_quality = index.build_quality;
            index.update(entries.clone());
            rebuilds += usize::from(index.build_quality != previous_quality);
            assert!(index.quality() <= index.build_quality * 1.5 + 1e-8);
            assert!(index.nodes.iter().all(|node| !node.dirty));
            assert_queries(&index, &entries, &views);
            for &owner in &index.owners {
                let mut node = owner;
                let mut depth = 0;
                while index.nodes[node].parent != NO_NODE { node = index.nodes[node].parent; depth += 1; }
                assert!(depth <= 8);
            }
        }
        assert!(rebuilds > 0 && rebuilds < 128, "rebuild only when refitted partition quality deteriorates: {rebuilds}");
    }

    #[test]
    #[ignore = "10k/20k moving-bounds CPU benchmark; run explicitly in release mode with --nocapture"]
    fn benchmark_moving_spatial_updates() {
        use std::{hint::black_box, time::Instant};
        for count in [10_000, 20_000] {
            for moved in [count / 100, count] {
                let initial = distributed_entries(count);
                let mut index = SpatialIndex::default();
                index.update(initial.clone());
                let views = test_views();
                let mut updates = Vec::new();
                let mut queries = Vec::new();
                let mut totals = Vec::new();
                for frame in 0..80 {
                    let mut entries = initial.clone();
                    for (i, bounds) in entries.iter_mut().take(moved).enumerate() {
                        let offset = Vec3::new(((frame + i % 11) as f32 * 0.17).sin() * 0.4, ((frame + i % 7) as f32 * 0.13).cos() * 0.3, 0.0);
                        let bounds = bounds.as_mut().unwrap(); bounds.min += offset; bounds.max += offset;
                    }
                    let expected = entries.clone();
                    let start = Instant::now();
                    index.update(entries);
                    let update_ms = start.elapsed().as_secs_f64() * 1000.0;
                    let start = Instant::now();
                    for view in &views { black_box(index.query(view)); }
                    let query_ms = start.elapsed().as_secs_f64() * 1000.0;
                    assert_queries(&index, &expected, &views);
                    if frame >= 10 { updates.push(update_ms); queries.push(query_ms); totals.push(update_ms + query_ms); }
                }
                for samples in [&mut updates, &mut queries, &mut totals] { samples.sort_by(f64::total_cmp); }
                let retained_bytes = std::mem::size_of::<SpatialIndex>() + index.entries.capacity() * std::mem::size_of::<Option<Aabb>>() + (index.unknown.capacity() + index.owners.capacity()) * std::mem::size_of::<usize>() + index.nodes.capacity() * std::mem::size_of::<Node>() + index.nodes.iter().map(|node| (node.entries.capacity() + node.children.capacity()) * std::mem::size_of::<usize>()).sum::<usize>();
                println!("{{\"entities\":{count},\"moved\":{moved},\"queryPasses\":3,\"updateMedianMs\":{},\"queryMedianMs\":{},\"totalMedianMs\":{},\"retainedBytes\":{retained_bytes}}}", updates[35], queries[35], totals[35]);
            }
        }
    }
}
