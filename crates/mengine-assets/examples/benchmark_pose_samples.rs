//! MiYu: repeat actual pose requests with exact mesh hashes and separate load/sample timings.
use mengine_assets::{GltfPoseSource, GltfBillboardCamera, parse_gltf_pose_sample};
use std::{collections::BTreeMap, hash::{Hash, Hasher}, path::Path, time::Instant};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let root = Path::new(&args[1]);
    let keys: Vec<String> = serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
    let iterations: u32 = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(8);
    let started = Instant::now();
    let mut sources = BTreeMap::new();
    for key in &keys { let (asset, _, _, _) = parse_gltf_pose_sample(key).expect("pose key"); if !sources.contains_key(asset) { sources.insert(asset, GltfPoseSource::load(&root.join(asset)).expect(asset)); } }
    let load_ms = started.elapsed().as_secs_f64() * 1000.0;
    let camera = GltfBillboardCamera { model: glam::Mat4::IDENTITY, look: glam::Vec3::new(0.0,-0.6,-0.8), up: glam::Vec3::Y };
    let mut hash = std::collections::hash_map::DefaultHasher::new(); let mut samples = 0usize; let mut vertices = 0usize;
    let mut windows = Vec::new();
    for pass in 0..iterations {
        let started = Instant::now();
        for key in &keys {
            let (asset, clip, frame, rate) = parse_gltf_pose_sample(key).unwrap(); let source = &sources[asset];
            let mesh = source.sample_with_camera(clip, frame + pass, rate, source.has_mesh_billboards().then_some(camera)).expect(key);
            for value in mesh.positions.iter().flatten().chain(mesh.normals.iter().flatten()).chain(mesh.uvs.iter().flatten()) { value.to_bits().hash(&mut hash); }
            mesh.indices.hash(&mut hash); samples += 1; vertices += mesh.positions.len();
        }
        windows.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    println!("{}", serde_json::json!({"assets":sources.len(),"keys":keys.len(),"iterations":iterations,"loadMs":load_ms,"sampleWindowsMs":windows,"samples":samples,"vertices":vertices,"hash":format!("{:016x}",hash.finish())}));
}
