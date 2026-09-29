//! MiYu: inspect native static or sampled skeletal geometry for authoring previews.
use mengine_assets::{load_gltf_mesh_data, GltfPoseSource};
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let positions = std::env::args().any(|arg| arg == "--positions");
    for argument in std::env::args().skip(1) {
        if argument == "--positions" { continue; }
        let mesh = if let Some((path, pose)) = argument.split_once("#pose=") {
            let (clip, frame) = pose.split_once(':').ok_or("expected clip:frame")?;
            GltfPoseSource::load(Path::new(path))?.sample(clip.parse()?, frame.parse()?)?
        } else { load_gltf_mesh_data(Path::new(&argument))? };
        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];
        for point in &mesh.positions {
            for axis in 0..3 { min[axis] = min[axis].min(point[axis]); max[axis] = max[axis].max(point[axis]); }
        }
        let mut result = serde_json::json!({"mesh":argument,"vertices":mesh.positions.len(),"min":min,"max":max});
        if positions { result["positions"] = serde_json::json!(mesh.positions); }
        println!("{}", result);
    }
    Ok(())
}
