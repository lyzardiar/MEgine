// Author: MiYu. Focused allocator comparison for identical immutable vertices uploaded by two live viewports.
use mengine_rhi::{Renderer, Vertex};
use std::time::Instant;
use winit::dpi::PhysicalSize;

fn snapshot(renderer: &Renderer, stage: &str, elapsed_ms: f64, reused: usize) {
    let (device, report) = renderer.gpu_allocator_report();
    if let Some(report) = report {
        let vertices = report.allocations.iter().filter(|(name,_)| name == "mesh_vb").collect::<Vec<_>>();
        println!("{{\"stage\":\"{stage}\",\"deviceId\":{device},\"vertexAllocations\":{},\"vertexBytes\":{},\"allocatedBytes\":{},\"reservedBytes\":{},\"uploadMs\":{elapsed_ms},\"reused\":{reused}}}", vertices.len(), vertices.iter().map(|(_,bytes)| bytes).sum::<u64>(), report.allocated_bytes, report.reserved_bytes);
    } else { println!("{{\"stage\":\"{stage}\",\"available\":false}}"); }
}

fn main() {
    let size = PhysicalSize::new(32,32);
    let mut views = [Renderer::new_shared_headless(size).unwrap(),Renderer::new_shared_headless(size).unwrap()];
    snapshot(&views[0], "before", 0.0, 0);
    for index in 0..2 {
        let started = Instant::now(); let mut reused = 0;
        for mesh in 0..2048 {
            let x = mesh as f32 * 0.0001;
            let vertices = [[x,0.0,0.5],[x+0.25,0.0,0.5],[x,0.25,0.5]].map(|position| Vertex { position, normal:[0.0,0.0,1.0], uv:[0.5,0.5] });
            reused += usize::from(views[index].upload_gltf_static_profiled(&format!("view-{index}-mesh-{mesh}"), &vertices, &[0,1,2]).vertex_buffer_reused);
        }
        views[index].queue.submit([]);let _ = views[index].device.poll(wgpu::Maintain::Wait);
        snapshot(&views[index], if index == 0 { "first" } else { "both" }, started.elapsed().as_secs_f64()*1000.0, reused);
    }
}
