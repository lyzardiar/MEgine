// Author: MiYu. GPU mesh buffers with separate CPU allocation/upload and bounds timings.
use bytemuck::{Pod, Zeroable};
use std::time::Instant;

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
}

pub struct MeshGpu {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub index_count: u32,
    pub(crate) bounds: Option<crate::spatial::Aabb>,
}

/// CPU wall time in buffer creation and bounds calculation; not GPU execution time.
#[derive(Clone, Copy, Debug, Default)]
pub struct MeshUploadProfile { pub vertex_buffer_ms: f64, pub index_buffer_ms: f64, pub bounds_ms: f64 }

type CubeFace = ([f32; 3], [f32; 3], [[f32; 3]; 4]);

impl MeshGpu {
    pub fn upload(device: &wgpu::Device, vertices: &[Vertex], indices: &[u32]) -> Self {
        Self::upload_profiled(device, vertices, indices).0
    }

    pub fn upload_profiled(device: &wgpu::Device, vertices: &[Vertex], indices: &[u32]) -> (Self, MeshUploadProfile) {
        use wgpu::util::DeviceExt;
        let started = Instant::now();
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("mesh_vb"),
            contents: bytemuck::cast_slice(vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let vertex_buffer_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("mesh_ib"),
            contents: bytemuck::cast_slice(indices),
            usage: wgpu::BufferUsages::INDEX,
        });
        let index_buffer_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let bounds = crate::spatial::Aabb::from_points(vertices.iter().map(|v| glam::Vec3::from_array(v.position)));
        let bounds_ms = started.elapsed().as_secs_f64() * 1000.0;
        (Self { vertex_buffer, index_buffer, index_count: indices.len() as u32, bounds }, MeshUploadProfile { vertex_buffer_ms, index_buffer_ms, bounds_ms })
    }

    pub fn unit_cube(device: &wgpu::Device) -> Self {
        // 24 unique verts (per-face normals)
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let faces: [CubeFace; 6] = [
            (
                [0.0, 0.0, 1.0],
                [0.0, 0.0, 1.0],
                [
                    [-0.5, -0.5, 0.5],
                    [0.5, -0.5, 0.5],
                    [0.5, 0.5, 0.5],
                    [-0.5, 0.5, 0.5],
                ],
            ),
            (
                [0.0, 0.0, -1.0],
                [0.0, 0.0, -1.0],
                [
                    [0.5, -0.5, -0.5],
                    [-0.5, -0.5, -0.5],
                    [-0.5, 0.5, -0.5],
                    [0.5, 0.5, -0.5],
                ],
            ),
            (
                [0.0, 1.0, 0.0],
                [0.0, 1.0, 0.0],
                [
                    [-0.5, 0.5, 0.5],
                    [0.5, 0.5, 0.5],
                    [0.5, 0.5, -0.5],
                    [-0.5, 0.5, -0.5],
                ],
            ),
            (
                [0.0, -1.0, 0.0],
                [0.0, -1.0, 0.0],
                [
                    [-0.5, -0.5, -0.5],
                    [0.5, -0.5, -0.5],
                    [0.5, -0.5, 0.5],
                    [-0.5, -0.5, 0.5],
                ],
            ),
            (
                [1.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [
                    [0.5, -0.5, 0.5],
                    [0.5, -0.5, -0.5],
                    [0.5, 0.5, -0.5],
                    [0.5, 0.5, 0.5],
                ],
            ),
            (
                [-1.0, 0.0, 0.0],
                [-1.0, 0.0, 0.0],
                [
                    [-0.5, -0.5, -0.5],
                    [-0.5, -0.5, 0.5],
                    [-0.5, 0.5, 0.5],
                    [-0.5, 0.5, -0.5],
                ],
            ),
        ];
        let uvs = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        for (_n, normal, corners) in faces {
            let base = vertices.len() as u32;
            for i in 0..4 {
                vertices.push(Vertex {
                    position: corners[i],
                    normal,
                    uv: uvs[i],
                });
            }
            indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
        }
        Self::upload(device, &vertices, &indices)
    }
}
