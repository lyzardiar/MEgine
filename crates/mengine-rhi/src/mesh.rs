// Author: MiYu. GPU mesh uploads share exact index contents within a bounded device cache.
use bytemuck::{Pod, Zeroable};
use std::{collections::HashMap, time::Instant};

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
    pub(crate) recyclable_vertices: bool,
}

/// CPU wall time in buffer creation and bounds calculation; not GPU execution time.
#[derive(Clone, Copy, Debug, Default)]
pub struct MeshUploadProfile { pub vertex_buffer_ms: f64, pub index_buffer_ms: f64, pub bounds_ms: f64, pub index_buffer_reused: bool, pub vertex_buffer_reused: bool }

// Only Renderer-owned buffers enter this pool. Exact capacities avoid inflating live pose memory.
pub(crate) struct MeshVertexBufferPool {
    buffers: HashMap<u64, Vec<wgpu::Buffer>>,
    pub(crate) entries: usize,
    pub(crate) bytes: usize,
    max_entries: usize,
    max_bytes: usize,
}

impl Default for MeshVertexBufferPool {
    fn default() -> Self { Self::with_limits(512, 16 * 1024 * 1024) }
}

impl MeshVertexBufferPool {
    pub(crate) fn with_limits(max_entries: usize, max_bytes: usize) -> Self { Self { buffers: HashMap::new(), entries: 0, bytes: 0, max_entries, max_bytes } }

    pub(crate) fn upload(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, vertices: &[Vertex]) -> (wgpu::Buffer, bool) {
        let contents = bytemuck::cast_slice(vertices);
        let size = contents.len().max(4) as u64;
        let reused = self.buffers.get_mut(&size).and_then(Vec::pop);
        let was_reused = reused.is_some();
        let buffer = if let Some(buffer) = reused {
            self.entries -= 1; self.bytes -= size as usize;
            if self.buffers[&size].is_empty() { self.buffers.remove(&size); }
            buffer
        } else {
            device.create_buffer(&wgpu::BufferDescriptor { label: Some("mesh_vb"), size, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false })
        };
        if !contents.is_empty() { queue.write_buffer(&buffer, 0, contents); }
        (buffer, was_reused)
    }

    pub(crate) fn recycle(&mut self, buffer: wgpu::Buffer) {
        let size = buffer.size() as usize;
        if self.entries >= self.max_entries || size > self.max_bytes.saturating_sub(self.bytes) { return; }
        self.buffers.entry(buffer.size()).or_default().push(buffer);
        self.entries += 1; self.bytes += size;
    }
}

struct CachedIndexBuffer { buffer: wgpu::Buffer, last_used: u64 }

// Exact index contents permit sharing across poses and cameras, including topology changes.
// The budget covers retained CPU keys and GPU buffers; mesh handles survive cache eviction.
pub(crate) struct MeshIndexBufferCache {
    buffers: HashMap<Vec<u32>, CachedIndexBuffer>,
    bytes: usize,
    epoch: u64,
    max_entries: usize,
    max_bytes: usize,
}

impl Default for MeshIndexBufferCache {
    fn default() -> Self { Self::with_limits(512, 16 * 1024 * 1024) }
}

impl MeshIndexBufferCache {
    pub(crate) fn with_limits(max_entries: usize, max_bytes: usize) -> Self { Self { buffers: HashMap::new(), bytes: 0, epoch: 0, max_entries, max_bytes } }

    fn entry_bytes(indices: &[u32]) -> usize { std::mem::size_of_val(indices) + std::mem::size_of_val(indices).max(4) }

    pub(crate) fn acquire(&mut self, device: &wgpu::Device, indices: &[u32]) -> (wgpu::Buffer, bool) {
        self.epoch = self.epoch.wrapping_add(1);
        if let Some(entry) = self.buffers.get_mut(indices) {
            entry.last_used = self.epoch;
            return (entry.buffer.clone(), true);
        }
        let buffer = upload_indices(device, indices);
        let bytes = Self::entry_bytes(indices);
        if self.max_entries > 0 && bytes <= self.max_bytes {
            while self.buffers.len() >= self.max_entries || self.bytes + bytes > self.max_bytes {
                let oldest = self.buffers.iter().min_by_key(|(_, entry)| entry.last_used).map(|(indices, _)| indices.clone()).expect("nonempty index cache exceeds budget");
                self.bytes -= Self::entry_bytes(&oldest);
                self.buffers.remove(oldest.as_slice());
            }
            self.buffers.insert(indices.to_vec(), CachedIndexBuffer { buffer: buffer.clone(), last_used: self.epoch });
            self.bytes += bytes;
        }
        (buffer, false)
    }
}

fn upload_indices(device: &wgpu::Device, indices: &[u32]) -> wgpu::Buffer {
    use wgpu::util::DeviceExt;
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("mesh_ib"), contents: bytemuck::cast_slice(indices), usage: wgpu::BufferUsages::INDEX })
}

type CubeFace = ([f32; 3], [f32; 3], [[f32; 3]; 4]);

impl MeshGpu {
    pub fn upload(device: &wgpu::Device, vertices: &[Vertex], indices: &[u32]) -> Self {
        Self::upload_profiled(device, vertices, indices).0
    }

    pub fn upload_profiled(device: &wgpu::Device, vertices: &[Vertex], indices: &[u32]) -> (Self, MeshUploadProfile) {
        Self::upload_with_indices(device, vertices, indices, || (upload_indices(device, indices), false))
    }

    pub(crate) fn upload_with_indices(device: &wgpu::Device, vertices: &[Vertex], indices: &[u32], acquire: impl FnOnce() -> (wgpu::Buffer, bool)) -> (Self, MeshUploadProfile) {
        use wgpu::util::DeviceExt;
        Self::upload_with_buffers(vertices, indices, || (device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("mesh_vb"), contents: bytemuck::cast_slice(vertices), usage: wgpu::BufferUsages::VERTEX,
        }), false), acquire)
    }

    pub(crate) fn upload_with_buffers(vertices: &[Vertex], indices: &[u32], acquire_vertices: impl FnOnce() -> (wgpu::Buffer, bool), acquire_indices: impl FnOnce() -> (wgpu::Buffer, bool)) -> (Self, MeshUploadProfile) {
        let started = Instant::now();
        let (vertex_buffer, vertex_buffer_reused) = acquire_vertices();
        let vertex_buffer_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let (index_buffer, index_buffer_reused) = acquire_indices();
        let index_buffer_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let bounds = crate::spatial::Aabb::from_points(vertices.iter().map(|v| glam::Vec3::from_array(v.position)));
        let bounds_ms = started.elapsed().as_secs_f64() * 1000.0;
        (Self { vertex_buffer, index_buffer, index_count: indices.len() as u32, bounds, recyclable_vertices: false }, MeshUploadProfile { vertex_buffer_ms, index_buffer_ms, bounds_ms, index_buffer_reused, vertex_buffer_reused })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vertex_buffer_pool_reuses_exact_capacity_and_respects_limits() {
        let renderer = pollster::block_on(crate::Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).expect("GPU for vertex pool acceptance");
        let device = &renderer.device;
        let queue = &renderer.queue;
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let vertices = [[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]].map(|position| Vertex { position, normal: [0.,0.,1.], uv: [0.,0.] });
        let bytes = std::mem::size_of_val(&vertices);
        let mut pool = MeshVertexBufferPool::with_limits(2, bytes * 2);
        let (first, reused) = pool.upload(device, queue, &vertices);
        let first_handle = first.clone();
        assert!(!reused); assert_eq!(first.size(), bytes as u64);
        assert!(first.usage().contains(wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST));
        pool.recycle(first);
        let (smaller, reused) = pool.upload(device, queue, &vertices[..2]);
        assert!(!reused); assert_ne!(smaller, first_handle, "a larger retained buffer must not inflate a smaller live mesh");
        assert_eq!(smaller.size(), (bytes / 3 * 2) as u64);
        let (again, reused) = pool.upload(device, queue, &vertices);
        assert!(reused); assert_eq!(again, first_handle); assert!(pool.buffers.is_empty());
        assert_eq!((pool.entries, pool.bytes), (0,0));
        let (live, reused) = pool.upload(device, queue, &vertices);
        assert!(!reused); assert_ne!(live, again, "a live allocation is never a pool candidate");
        pool.recycle(again); pool.recycle(live); pool.recycle(smaller);
        assert_eq!((pool.entries, pool.bytes), (2,bytes * 2));
        assert_eq!(pool.buffers.len(), 1);

        let mut byte_limited = MeshVertexBufferPool::with_limits(8, bytes);
        let (retained, _) = byte_limited.upload(device, queue, &vertices);
        let retained_handle = retained.clone();
        byte_limited.recycle(retained);
        let (extra, _) = byte_limited.upload(device, queue, &vertices[..1]);
        byte_limited.recycle(extra);
        let oversized = [vertices[0]; 4];
        let (large, _) = byte_limited.upload(device, queue, &oversized);
        byte_limited.recycle(large);
        assert_eq!((byte_limited.entries, byte_limited.bytes), (1,bytes));
        let (retained, reused) = byte_limited.upload(device, queue, &vertices);
        assert!(reused); assert_eq!(retained, retained_handle);

        let mut entry_limited = MeshVertexBufferPool::with_limits(1, bytes * 4);
        let (one, _) = entry_limited.upload(device, queue, &vertices);
        let (two, _) = entry_limited.upload(device, queue, &vertices);
        let one_handle = one.clone();
        entry_limited.recycle(one); entry_limited.recycle(two);
        assert_eq!((entry_limited.entries, entry_limited.bytes), (1,bytes));
        assert_eq!(entry_limited.upload(device, queue, &vertices).0, one_handle);

        let mut empty_pool = MeshVertexBufferPool::with_limits(1, 4);
        let (empty, reused) = empty_pool.upload(device, queue, &[]);
        assert!(!reused); assert_eq!(empty.size(), 4);
        let empty_handle = empty.clone();
        empty_pool.recycle(empty);
        let (empty, reused) = empty_pool.upload(device, queue, &[]);
        assert!(reused); assert_eq!(empty, empty_handle); assert!(empty_pool.buffers.is_empty());
        for (entries, budget) in [(0,bytes),(2,0)] {
            let mut disabled = MeshVertexBufferPool::with_limits(entries, budget);
            let (buffer, _) = disabled.upload(device, queue, &vertices);
            let handle = buffer.clone();
            disabled.recycle(buffer);
            let (fresh, reused) = disabled.upload(device, queue, &vertices);
            assert!(!reused); assert_ne!(fresh, handle); assert!(disabled.buffers.is_empty());
            assert_eq!((disabled.entries, disabled.bytes), (0,0));
        }
        queue.submit([]);
        assert!(pollster::block_on(device.pop_error_scope()).is_none(), "vertex pool GPU validation");
    }

    #[test]
    fn index_buffer_cache_shares_exact_contents_and_bounds_retention() {
        let renderer = pollster::block_on(crate::Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).expect("GPU for index buffer cache acceptance");
        let device = &renderer.device;
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let mut cache = MeshIndexBufferCache::with_limits(2, 48);
        let indices = [0,1,2];
        let different = [0,2,1];
        let third = [1,0,2];
        let (first, reused) = cache.acquire(device, &indices);
        assert!(!reused);
        let (other, reused) = cache.acquire(device, &different);
        assert!(!reused); assert_ne!(first, other, "equal-length topology must compare every index");
        let (again, reused) = cache.acquire(device, &indices);
        assert!(reused); assert_eq!(first, again);
        cache.acquire(device, &third);
        assert_eq!(cache.buffers.len(), 2); assert_eq!(cache.bytes, 48);
        assert!(cache.buffers.contains_key(indices.as_slice())); assert!(!cache.buffers.contains_key(different.as_slice()), "cache hits must refresh LRU order");
        let (replacement, reused) = cache.acquire(device, &different);
        assert!(!reused); assert_ne!(replacement, other);

        let mut byte_limited = MeshIndexBufferCache::with_limits(8, 24);
        byte_limited.acquire(device, &indices); byte_limited.acquire(device, &different);
        assert_eq!(byte_limited.buffers.len(), 1); assert_eq!(byte_limited.bytes, 24);
        let oversized = [0,1,2,0,2,1];
        let (large, reused) = byte_limited.acquire(device, &oversized);
        assert!(!reused);
        let (large_again, reused) = byte_limited.acquire(device, &oversized);
        assert!(!reused); assert_ne!(large, large_again);
        assert_eq!(byte_limited.buffers.len(), 1); assert_eq!(byte_limited.bytes, 24);
        assert!(byte_limited.buffers.contains_key(different.as_slice()), "oversized uploads must not evict retained entries");
        let mut empty_cache = MeshIndexBufferCache::with_limits(1, 4);
        let (empty, reused) = empty_cache.acquire(device, &[]);
        assert!(!reused);
        let (empty_again, reused) = empty_cache.acquire(device, &[]);
        assert!(reused); assert_eq!(empty, empty_again); assert_eq!(empty_cache.buffers.len(), 1); assert_eq!(empty_cache.bytes, 4);
        for (entries, bytes) in [(0,24),(2,0)] {
            let mut disabled = MeshIndexBufferCache::with_limits(entries, bytes);
            assert!(!disabled.acquire(device, &indices).1); assert!(!disabled.acquire(device, &indices).1);
            assert!(disabled.buffers.is_empty()); assert_eq!(disabled.bytes, 0);
        }

        let vertices = [[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]].map(|position| Vertex { position, normal: [0.,0.,1.], uv: [0.,0.] });
        let moved = vertices.map(|mut vertex| { vertex.position[0] += 3.; vertex });
        let mut shared = MeshIndexBufferCache::default();
        let (mesh, profile) = MeshGpu::upload_with_indices(device, &vertices, &indices, || shared.acquire(device, &indices));
        let (pose, pose_profile) = MeshGpu::upload_with_indices(device, &moved, &indices, || shared.acquire(device, &indices));
        assert!(!profile.index_buffer_reused); assert!(pose_profile.index_buffer_reused);
        assert_eq!(mesh.index_buffer, pose.index_buffer); assert_ne!(mesh.vertex_buffer, pose.vertex_buffer);
        assert_eq!(mesh.index_count, 3); assert_eq!(pose.index_count, 3);
        assert_eq!(mesh.bounds.unwrap().min, glam::Vec3::ZERO); assert_eq!(mesh.bounds.unwrap().max, glam::Vec3::new(1.,1.,0.));
        assert_eq!(pose.bounds.unwrap().min, glam::Vec3::new(3.,0.,0.)); assert_eq!(pose.bounds.unwrap().max, glam::Vec3::new(4.,1.,0.));
        let independent = MeshGpu::upload(device, &vertices, &indices);
        let (independent_profiled, profile) = MeshGpu::upload_profiled(device, &vertices, &indices);
        assert!(!profile.index_buffer_reused);
        assert_ne!(independent.index_buffer, mesh.index_buffer); assert_ne!(independent_profiled.index_buffer, independent.index_buffer);
        assert_eq!(independent.bounds, mesh.bounds); assert_eq!(independent_profiled.index_count, 3);
        let empty_mesh = MeshGpu::upload(device, &[], &[]);
        assert_eq!(empty_mesh.index_count, 0); assert!(empty_mesh.bounds.is_none());
        assert!(pollster::block_on(device.pop_error_scope()).is_none(), "index buffer cache GPU validation");
    }
}
