//! MiYu: inspect native static or sampled skeletal geometry for authoring previews.
use mengine_assets::{load_gltf_mesh_data, mesh_height_at, parse_gltf_pose_sample, parse_mesh_patch_key, GltfPoseSource, MeshPatchSource};
use std::path::Path;
use std::io::BufRead;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let positions = std::env::args().any(|arg| arg == "--positions");
    let uvs = std::env::args().any(|arg| arg == "--uvs");
    let normals = std::env::args().any(|arg| arg == "--normals");
    let streamed = std::env::args().any(|arg| arg == "--stdin");
    let grid=std::env::args().find_map(|arg|arg.strip_prefix("--height-grid=").map(str::to_owned)).map(|text| -> Result<[f32;5],Box<dyn std::error::Error>> {
        let values=text.split(',').map(str::parse::<f32>).collect::<Result<Vec<_>,_>>()?;
        let grid:[f32;5]=values.try_into().map_err(|_|"height grid requires x0,z0,x1,z1,count")?;
        if !grid.iter().all(|v|v.is_finite()) || grid[0]>=grid[2] || grid[1]>=grid[3] || !(1.0..=129.0).contains(&grid[4]) || grid[4].fract()!=0. { return Err("invalid height grid".into()); }
        Ok(grid)
    }).transpose()?;
    let arguments: Box<dyn Iterator<Item=Result<String,std::io::Error>>> = if streamed { Box::new(std::io::stdin().lock().lines()) } else { Box::new(std::env::args().skip(1).filter(|a| !a.starts_with("--")).map(Ok)) };
    let mut source: Option<(String,GltfPoseSource)> = None;
    let mut patch: Option<(String,MeshPatchSource)> = None;
    for argument in arguments {
        let argument = argument?;
        let mesh = if let Some((path, cells)) = parse_mesh_patch_key(&argument) {
            if patch.as_ref().map(|s| s.0.as_str()) != Some(path) { patch = Some((path.into(),MeshPatchSource::load(Path::new(path))?)); }
            patch.as_ref().unwrap().1.compose(cells)?
        } else if let Some((path, clip, frame, rate)) = parse_gltf_pose_sample(&argument) {
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
        if let Some([x0,z0,x1,z1,count])=grid {
            let mut heights=Vec::new();
            for z in 0..count as usize { for x in 0..count as usize { let px=x0+(x as f32+0.5)*(x1-x0)/count;let pz=z0+(z as f32+0.5)*(z1-z0)/count;heights.push(mesh_height_at(&mesh,px,pz)?.map(|hit|hit.position[1])); } }
            result["heightGrid"]=serde_json::json!(heights);
        }
        println!("{}", result);
    }
    Ok(())
}
