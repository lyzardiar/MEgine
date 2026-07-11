use bytemuck::{Pod, Zeroable};

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal:   [f32; 3],
    pub uv:       [f32; 2],
}

pub struct MeshGpu {
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer:  wgpu::Buffer,
    pub index_count:   u32,
}

impl MeshGpu {
    pub fn upload(device: &wgpu::Device, vertices: &[Vertex], indices: &[u32]) -> Self {
        use wgpu::util::DeviceExt;
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label:    Some("mesh_vb"),
            contents: bytemuck::cast_slice(vertices),
            usage:    wgpu::BufferUsages::VERTEX,
        });
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label:    Some("mesh_ib"),
            contents: bytemuck::cast_slice(indices),
            usage:    wgpu::BufferUsages::INDEX,
        });
        Self {
            vertex_buffer,
            index_buffer,
            index_count: indices.len() as u32,
        }
    }

    pub fn unit_cube(device: &wgpu::Device) -> Self {
        // 24 unique verts (per-face normals)
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let faces: [([f32; 3], [f32; 3], [[f32; 3]; 4]); 6] = [
            ([0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]),
            ([0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]),
            ([0.0, 1.0, 0.0], [0.0, 1.0, 0.0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]),
            ([0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]),
            ([1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]),
            ([-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]),
        ];
        let uvs = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        for (_n, normal, corners) in faces {
            let base = vertices.len() as u32;
            for i in 0..4 {
                vertices.push(Vertex {
                    position: corners[i],
                    normal,
                    uv:       uvs[i],
                });
            }
            indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
        }
        Self::upload(device, &vertices, &indices)
    }
}
