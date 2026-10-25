// Author: MiYu. Compare backend allocations for identical immutable material textures in two live viewports.
use mengine_rhi::Renderer;
use std::time::Instant;
use winit::dpi::PhysicalSize;

fn snapshot(renderer: &Renderer, stage: &str, elapsed_ms: f64) {
    let (device, report) = renderer.gpu_allocator_report();
    if let Some(report) = report {
        let textures = report.allocations.iter().filter(|(name,_)| name == "material_texture").collect::<Vec<_>>();
        println!("{{\"stage\":\"{stage}\",\"deviceId\":{device},\"textureAllocations\":{},\"textureBytes\":{},\"allocatedBytes\":{},\"reservedBytes\":{},\"uploadMs\":{elapsed_ms}}}",textures.len(),textures.iter().map(|(_,bytes)| bytes).sum::<u64>(),report.allocated_bytes,report.reserved_bytes);
    } else { println!("{{\"stage\":\"{stage}\",\"available\":false}}"); }
}

fn main() {
    let textures = (0..16).map(|index| { let mut data = vec![255;512*512*4]; data[0] = index; data }).collect::<Vec<_>>();
    let mut views = [Renderer::new_shared_headless(PhysicalSize::new(32,32)).unwrap(),Renderer::new_shared_headless(PhysicalSize::new(32,32)).unwrap()];
    snapshot(&views[0],"before",0.0);
    for index in 0..2 {
        let started = Instant::now();
        for (texture,data) in textures.iter().enumerate() { views[index].upload_material_texture_rgba8(&format!("view-{index}-texture-{texture}"),512,512,data,true).unwrap(); }
        views[index].queue.submit([]);let _ = views[index].device.poll(wgpu::Maintain::Wait);
        snapshot(&views[index],if index == 0 { "first" } else { "both" },started.elapsed().as_secs_f64()*1000.0);
    }
}
