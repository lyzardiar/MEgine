//! MiYu: compare geometry and pose-source loading for real project models.
use std::{path::Path, time::Instant};
use mengine_assets::{load_gltf_mesh_data, GltfPoseSource};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let root = Path::new(&args[1]);
    let paths: Vec<String> = serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
    let mut rows = Vec::new();
    for path in paths {
        let full = root.join(&path);
        if !full.is_file() { continue; }
        let start = Instant::now(); let mesh = load_gltf_mesh_data(&full); let geometry_ms = start.elapsed().as_secs_f64()*1000.0;
        let start = Instant::now(); let pose = GltfPoseSource::load(&full); let pose_source_ms = start.elapsed().as_secs_f64()*1000.0;
        rows.push(serde_json::json!({"path":path,"geometryMs":geometry_ms,"poseSourceMs":pose_source_ms,"vertices":mesh.as_ref().map(|m|m.positions.len()).ok(),"indices":mesh.as_ref().map(|m|m.indices.len()).ok(),"error":mesh.err().map(|e|e.to_string()),"poseError":pose.err().map(|e|e.to_string())}));
    }
    println!("{}",serde_json::to_string(&rows).unwrap());
}
