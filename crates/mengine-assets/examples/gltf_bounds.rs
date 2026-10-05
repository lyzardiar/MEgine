//! MiYu: inspect native static or sampled skeletal geometry for authoring previews.
use mengine_assets::{load_gltf_mesh_data, parse_gltf_pose_sample, GltfPoseSource};
use std::path::Path;
use std::io::BufRead;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let positions = std::env::args().any(|arg| arg == "--positions");
    let uvs = std::env::args().any(|arg| arg == "--uvs");
    let normals = std::env::args().any(|arg| arg == "--normals");
    let streamed = std::env::args().any(|arg| arg == "--stdin");
    let arguments: Box<dyn Iterator<Item=Result<String,std::io::Error>>> = if streamed { Box::new(std::io::stdin().lock().lines()) } else { Box::new(std::env::args().skip(1).filter(|a| !a.starts_with("--")).map(Ok)) };
    let mut source: Option<(String,GltfPoseSource)> = None;
    for argument in arguments {
        let argument = argument?;
        let mesh = if let Some((path, clip, frame, rate)) = parse_gltf_pose_sample(&argument) {
            if source.as_ref().map(|s| s.0.as_str()) != Some(path) { source = Some((path.into(),GltfPoseSource::load(Path::new(path))?)); }
            source.as_ref().unwrap().1.sample_at_rate(clip, frame, rate)?
        } else { load_gltf_mesh_data(Path::new(&argument))? };
        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];
        for point in &mesh.positions {
            for axis in 0..3 { min[axis] = min[axis].min(point[axis]); max[axis] = max[axis].max(point[axis]); }
        }
        let mut result = serde_json::json!({"mesh":argument,"vertices":mesh.positions.len(),"min":min,"max":max});
        if positions { result["positions"] = serde_json::json!(mesh.positions); }
        if uvs { result["uvs"] = serde_json::json!(mesh.uvs); }
        if normals { result["normals"] = serde_json::json!(mesh.normals); }
        println!("{}", result);
    }
    Ok(())
}
