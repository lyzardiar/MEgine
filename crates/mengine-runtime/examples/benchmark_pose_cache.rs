//! MiYu: replay animated mesh requests across repeated cycles and measure GPU cache synchronization.
use mengine_assets::parse_gltf_pose_sample;
use mengine_runtime::meshes::RuntimeMeshCache;
use mengine_rhi::{Renderer, RenderObject};
use std::{path::PathBuf, time::Instant};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let keys: Vec<String> = serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).unwrap();
    let mut cache = RuntimeMeshCache::new(Some(PathBuf::from(&args[1])));
    let mut frames = Vec::new();
    for tick in 0..64 {
        frames.push(keys.iter().map(|key| {
            let (asset, clip, frame, rate) = parse_gltf_pose_sample(key).unwrap();
            RenderObject { mesh_key:format!("{asset}#pose={clip}:{}@{rate}",frame+tick), model:glam::Mat4::IDENTITY, material:Default::default(), cast_shadows:false, receive_shadows:false }
        }).collect::<Vec<_>>());
    }
    let mut windows = Vec::new();
    for _ in 0..3 {
        let started = Instant::now();
        for frame in &frames { let failures = cache.sync(&mut renderer, frame); assert!(failures.is_empty(), "{failures:?}"); }
        windows.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    println!("{}",serde_json::json!({"keysPerFrame":keys.len(),"framesPerCycle":frames.len(),"cycleMs":windows}));
}
