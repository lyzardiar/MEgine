// Author: MiYu. Pick immutable submitted mesh geometry with the displayed camera and exact world matrices.
use crate::{spatial::Aabb, FrameCamera, Vertex};
use glam::{Mat4, Vec3, Vec4};
use std::sync::Arc;

#[derive(Debug)]
pub struct MeshPickGeometry { positions: Vec<Vec3>, indices: Vec<u32>, bounds: Option<Aabb> }

impl MeshPickGeometry {
    pub(crate) fn new(vertices: &[Vertex], indices: &[u32]) -> Self {
        let positions: Vec<_> = vertices.iter().map(|vertex| Vec3::from_array(vertex.position)).collect();
        let bounds = Aabb::from_points(positions.iter().copied());
        Self { positions, indices: indices.to_vec(), bounds }
    }
    pub fn bytes(&self) -> usize { self.positions.len() * std::mem::size_of::<Vec3>() + self.indices.len() * std::mem::size_of::<u32>() }
}

#[derive(Clone, Debug)]
pub struct MeshPickObject { pub entity: u64, pub model: Mat4, pub geometry: Arc<MeshPickGeometry>, pub index_count: u32, pub double_sided: bool }

#[derive(Clone, Debug)]
pub struct MeshPickFrame { pub camera: FrameCamera, pub objects: Vec<MeshPickObject> }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MeshPickHit { pub entity: u64, pub position: [f32; 3], pub depth: f32 }

impl MeshPickFrame {
    pub fn remap_entities(&mut self, mut source: impl FnMut(u64) -> Option<u64>) {
        self.objects.retain_mut(|object| { if let Some(entity) = source(object.entity) { object.entity = entity; true } else { false } });
    }

    /// Point is normalized to the displayed image (top-left origin); the filter permits locked objects to be skipped.
    pub fn pick(&self, point: [f32; 2], mut allowed: impl FnMut(u64) -> bool) -> Option<MeshPickHit> {
        if point.iter().any(|value| !value.is_finite() || !(0.0..=1.0).contains(value)) { return None; }
        let view_projection = self.camera.proj * self.camera.view; let inverse = view_projection.inverse();
        if !inverse.is_finite() { return None; }
        let unproject = |z| { let point = inverse * Vec4::new(point[0] * 2. - 1., 1. - point[1] * 2., z, 1.); (point.w.abs() > 1e-12).then(|| point.truncate() / point.w) };
        let near = unproject(0.)?; let far = unproject(1.)?; let direction = far - near;
        if !near.is_finite() || !direction.is_finite() || direction.length_squared() == 0. { return None; }
        let mut closest = 1.; let mut hit = None;
        for object in &self.objects {
            if !allowed(object.entity) || !object.model.is_finite() { continue; }
            if let Some(bounds) = object.geometry.bounds.and_then(|bounds| bounds.transformed(object.model)) {
                if !intersects_bounds(near, direction, bounds, closest) { continue; }
            }
            for triangle in object.geometry.indices[..(object.index_count as usize).min(object.geometry.indices.len())].chunks_exact(3) {
                let (Some(a), Some(b), Some(c)) = (object.geometry.positions.get(triangle[0] as usize), object.geometry.positions.get(triangle[1] as usize), object.geometry.positions.get(triangle[2] as usize)) else { continue; };
                let a = object.model.transform_point3(*a); let edge1 = object.model.transform_point3(*b) - a; let edge2 = object.model.transform_point3(*c) - a; let cross = direction.cross(edge2); let determinant = edge1.dot(cross);
                if !determinant.is_finite() || if object.double_sided { determinant.abs() <= 1e-12 } else { determinant <= 1e-12 } { continue; }
                let offset = near - a; let u = offset.dot(cross) / determinant;
                if !(0.0..=1.0).contains(&u) { continue; }
                let q = offset.cross(edge1); let v = direction.dot(q) / determinant;
                if v < 0. || u + v > 1. { continue; }
                let distance = edge2.dot(q) / determinant;
                if !distance.is_finite() || distance < 0. || distance > closest || hit.is_some() && distance == closest { continue; }
                let position = near + direction * distance; let clip = view_projection * position.extend(1.);
                if !clip.is_finite() || clip.w <= 0. || clip.z < 0. || clip.z > clip.w { continue; }
                closest = distance; hit = Some(MeshPickHit { entity: object.entity, position: position.to_array(), depth: clip.z / clip.w });
            }
        }
        hit
    }
}

fn intersects_bounds(origin: Vec3, direction: Vec3, bounds: Aabb, maximum: f32) -> bool {
    let mut near = 0f32; let mut far = maximum;
    for axis in 0..3 {
        if direction[axis] == 0. { if origin[axis] < bounds.min[axis] || origin[axis] > bounds.max[axis] { return false; } continue; }
        let a = (bounds.min[axis] - origin[axis]) / direction[axis]; let b = (bounds.max[axis] - origin[axis]) / direction[axis];
        near = near.max(a.min(b)); far = far.min(a.max(b)); if near > far { return false; }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    fn object(entity: u64, z: f32) -> MeshPickObject {
        let vertices = [[-1., -1., 0.], [1., -1., 0.], [0., 1., 0.]].map(|position| Vertex { position, normal: [0., 0., 1.], uv: [0.; 2] });
        MeshPickObject { entity, model: Mat4::from_translation(Vec3::new(0., 0., z)), geometry: Arc::new(MeshPickGeometry::new(&vertices, &[0, 1, 2])), index_count: 3, double_sided: false }
    }
    fn frame(objects: Vec<MeshPickObject>, orthographic: bool) -> MeshPickFrame {
        MeshPickFrame { camera: FrameCamera { view: crate::look_at(Vec3::new(0., 0., 5.), Vec3::ZERO, Vec3::Y), proj: if orthographic { crate::orthographic(2., 1., 0.1, 20.) } else { crate::perspective(60., 1., 0.1, 20.) }, position: Vec3::new(0., 0., 5.) }, objects }
    }
    #[test]
    fn displayed_mesh_picking_preserves_depth_clipping_faces_filters_and_source_ids() {
        for orthographic in [false, true] {
            let mut snapshot = frame(vec![object(1, 0.), object(2, 1.)], orthographic);
            assert_eq!(snapshot.pick([0.5, 0.5], |_| true).unwrap().entity, 2);
            assert_eq!(snapshot.pick([0.5, 0.5], |id| id != 2).unwrap().entity, 1);
            assert!(snapshot.pick([0., 0.], |_| true).is_none());
            for point in [[-0.1, 0.5], [0.5, 1.1], [f32::NAN, 0.5]] { assert!(snapshot.pick(point, |_| true).is_none()); }
            snapshot.remap_entities(|id| (id == 1).then_some(999)); assert_eq!(snapshot.pick([0.5, 0.5], |_| true).unwrap().entity, 999);
            snapshot.objects[0].model = Mat4::from_scale(Vec3::new(-1., 1., 1.)); assert!(snapshot.pick([0.5, 0.5], |_| true).is_none());
            snapshot.objects[0].double_sided = true; assert!(snapshot.pick([0.5, 0.5], |_| true).is_some());
            for z in [5., 6., -30.] { snapshot.objects[0].model = Mat4::from_translation(Vec3::new(0., 0., z)); assert!(snapshot.pick([0.5, 0.5], |_| true).is_none()); }
        }
    }
    #[test]
    fn snapshots_keep_geometry_versions_shear_flattening_and_stable_ties() {
        let mut snapshot = frame(vec![object(7, 0.), object(8, 0.)], false); let retained = snapshot.clone();
        assert_eq!(snapshot.pick([0.5, 0.5], |_| true).unwrap().entity, 7);
        let geometry = Arc::get_mut(&mut snapshot.objects[0].geometry); assert!(geometry.is_none());
        snapshot.objects[0].geometry = object(9, 0.).geometry; Arc::get_mut(&mut snapshot.objects[0].geometry).unwrap().positions.iter_mut().for_each(|point| point.x += 10.);
        assert_eq!(snapshot.pick([0.5, 0.5], |_| true).unwrap().entity, 8); assert_eq!(retained.pick([0.5, 0.5], |_| true).unwrap().entity, 7);
        snapshot.objects.remove(0); snapshot.objects[0].model = Mat4::from_cols(Vec4::new(1., 0., 0., 0.), Vec4::new(0.5, 1., 0., 0.), Vec4::ZERO, Vec4::W);
        assert_eq!(snapshot.pick([0.5, 0.5], |_| true).unwrap().entity, 8); snapshot.objects[0].index_count = 0; assert!(snapshot.pick([0.5, 0.5], |_| true).is_none());
    }

    #[test]
    fn submitted_gpu_geometry_and_recycled_buffers_match_retained_mesh_picking() {
        use crate::{ClearColor, FrameLighting, RenderFrame, RenderMaterial, RenderObject, RenderTarget, Renderer};
        let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(32, 32))).unwrap();
        renderer.device.push_error_scope(wgpu::ErrorFilter::Validation); assert!(renderer.enable_mesh_picking()); assert!(!renderer.enable_mesh_picking());
        let mut vertices = [[-4.8, -0.8, 0.], [-3.2, -0.8, 0.], [-4., 0.8, 0.]].map(|position| Vertex { position, normal: [0., 0., 1.], uv: [0.; 2] });
        renderer.upload_gltf_static("posed", &vertices, &[0, 1, 2]);
        let objects = [RenderObject { mesh_key: "posed".into(), model: Mat4::from_translation(Vec3::new(4., 0., 0.)), material: RenderMaterial { base_color: [1., 0., 0., 1.], unlit: true, ..Default::default() }.into(), cast_shadows: false, receive_shadows: false }];
        let camera = frame(Vec::new(), true).camera; let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false; lighting.directional = None;
        let target = renderer.create_offscreen_target(winit::dpi::PhysicalSize::new(32, 32));
        let render = |renderer: &mut Renderer, objects: &[RenderObject]| {
            renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
            renderer.read_offscreen_rgba8(&target).unwrap()
        };
        let before = render(&mut renderer, &objects); let retained = renderer.capture_mesh_pick_frame(camera, &objects, &[42]).unwrap();
        let pixel = (16 * 32 + 16) * 4; assert!(before[pixel] > 200); assert_eq!(retained.pick([0.5, 0.5], |_| true).unwrap().entity, 42);
        for vertex in &mut vertices { vertex.position[0] += 1.; }
        let uploaded = renderer.upload_gltf_static_profiled("posed", &vertices, &[0, 1, 2]); assert!(uploaded.vertex_buffer_reused && uploaded.index_buffer_reused);
        let after = render(&mut renderer, &objects); let current = renderer.capture_mesh_pick_frame(camera, &objects, &[42]).unwrap();
        assert!(after[pixel] < 10); assert!(current.pick([0.5, 0.5], |_| true).is_none()); assert_eq!(current.pick([0.75, 0.5], |_| true).unwrap().entity, 42);
        assert_eq!(retained.pick([0.5, 0.5], |_| true).unwrap().entity, 42); assert!(!Arc::ptr_eq(&retained.objects[0].geometry, &current.objects[0].geometry));
        let mut red = objects[0].clone(); red.material.render_queue = 3000; red.model = Mat4::from_translation(Vec3::new(3., 0., 0.));
        let mut blue = red.clone(); blue.material.render_queue = 1000; blue.material.base_color = [0., 0., 1., 1.]; let layered = [red, blue];
        let pixels = render(&mut renderer, &layered); assert!(pixels[pixel + 2] > 200 && pixels[pixel] < 10);
        let sorted = renderer.capture_mesh_pick_frame(camera, &layered, &[91, 92]).unwrap(); assert_eq!(sorted.pick([0.5, 0.5], |_| true).unwrap().entity, 92);
        assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    }
}
