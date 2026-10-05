//! MiYu: secondary glTF joint sets contribute to poses and validate their paired data.
use mengine_assets::GltfPoseSource;
use serde_json::json;

fn fixture(second_weights: [f32; 4], paired: bool, uv_track: Option<serde_json::Value>, collapsed: bool) -> std::path::PathBuf {
    let mut blob = Vec::new();
    let mut views = Vec::new();
    let mut accessors = Vec::new();
    let mut floats = |values: &[f32], count: usize, kind: &str| {
        let start = blob.len();
        for v in values { blob.extend_from_slice(&v.to_le_bytes()); }
        views.push(json!({"buffer":0,"byteOffset":start,"byteLength":blob.len()-start}));
        accessors.push(json!({"bufferView":views.len()-1,"componentType":5126,"count":count,"type":kind}));
        accessors.len()-1
    };
    let positions = floats(&[0.0; 9], 3, "VEC3");
    let weights0 = floats(&[0.125; 12], 3, "VEC4");
    let weights1 = floats(&second_weights.repeat(3), 3, "VEC4");
    let times = floats(&[0.0, 1.0], 2, "SCALAR");
    let translations = floats(&[0.0, 0.0, 0.0, 8.0, 0.0, 0.0], 2, "VEC3");
    let uv = floats(&[0.25,0.75,0.25,0.75,0.25,0.75],3,"VEC2");
    drop(floats);
    accessors[positions]["min"] = json!([0.0,0.0,0.0]); accessors[positions]["max"] = json!([0.0,0.0,0.0]);
    accessors[times]["min"] = json!([0.0]); accessors[times]["max"] = json!([1.0]);
    let mut joint_ids = Vec::new();
    for base in [0u16, 4] {
        let start = blob.len();
        for _ in 0..3 { for id in base..base+4 { blob.extend_from_slice(&id.to_le_bytes()); } }
        views.push(json!({"buffer":0,"byteOffset":start,"byteLength":blob.len()-start}));
        accessors.push(json!({"bufferView":views.len()-1,"componentType":5123,"count":3,"type":"VEC4"}));
        joint_ids.push(accessors.len()-1);
    }
    let mut attributes = json!({"POSITION":positions,"TEXCOORD_0":uv,"JOINTS_0":joint_ids[0],"WEIGHTS_0":weights0,"JOINTS_1":joint_ids[1]});
    if paired { attributes["WEIGHTS_1"] = json!(weights1); }
    let mut nodes = vec![json!({});8]; nodes.push(json!({"mesh":0,"skin":0}));
    if collapsed { for node in nodes.iter_mut().take(8) { node["scale"]=json!([0,0,0]); } }
    let mut doc = json!({"asset":{"version":"2.0"},"buffers":[{"byteLength":blob.len()}],"bufferViews":views,"accessors":accessors,"meshes":[{"primitives":[{"attributes":attributes}]}],"nodes":nodes,"skins":[{"joints":[0,1,2,3,4,5,6,7]}],"scenes":[{"nodes":[0,1,2,3,4,5,6,7,8]}],"scene":0,"animations":[{"samplers":[{"input":times,"output":translations,"interpolation":"LINEAR"}],"channels":[{"sampler":0,"target":{"node":4,"path":"translation"}}]}]});
    if let Some(track) = uv_track { doc["animations"][0]["extras"] = json!({"mengineUv":track}); }
    let mut encoded = serde_json::to_vec(&doc).unwrap(); while encoded.len()%4 != 0 { encoded.push(b' '); }
    let mut file = Vec::new();
    for v in [0x46546c67u32,2,(28+encoded.len()+blob.len()) as u32,encoded.len() as u32,0x4e4f534a] { file.extend_from_slice(&v.to_le_bytes()); }
    file.extend_from_slice(&encoded);
    for v in [blob.len() as u32,0x004e4942] { file.extend_from_slice(&v.to_le_bytes()); } file.extend_from_slice(&blob);
    let tag=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let path=std::env::temp_dir().join(format!("mengine-skin-{}-{tag}.glb",std::process::id())); std::fs::write(&path,file).unwrap(); path
}

#[test]
fn fifth_joint_contributes_without_dropping_or_renormalizing_the_first_set() {
    let path=fixture([0.125;4],true,None,false); let source=GltfPoseSource::load(&path).unwrap(); let pose=source.sample(0,6).unwrap();
    assert_eq!(pose.positions.len(),3);
    for p in pose.positions { assert!((p[0]-0.5).abs()<1e-6); assert_eq!(p[1],0.0); assert_eq!(p[2],0.0); }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn invalid_secondary_weights_and_missing_pairs_are_rejected() {
    for (weights,paired) in [([-0.1,0.2,0.2,0.2],true),([f32::NAN,0.125,0.125,0.125],true),([0.125;4],false)] {
        let path=fixture(weights,paired,None,false); let result=GltfPoseSource::load(&path).and_then(|s|s.sample(0,6)); assert!(result.is_err()); std::fs::remove_file(path).unwrap();
    }
}

#[test]
fn uv_animation_samples_each_material_layers_transform() {
    let path=fixture([0.125;4],true,Some(json!({"fps":2,"frames":[[1,0,0,1,0,0],[0,2,-3,0,1,4],[1,0,0,1,0,0]]})),false);
    let source=GltfPoseSource::load(&path).unwrap();
    assert_eq!(source.sample(0,0).unwrap().uvs,vec![[0.25,0.75];3]);
    assert_eq!(source.sample(0,6).unwrap().uvs,vec![[-1.25,4.5];3]);
    std::fs::remove_file(path).unwrap();
    for track in [json!({"fps":0,"frames":[[1,0,0,1,0,0]]}),json!({"fps":12,"frames":[[1,0,0,1,0,0]]}),json!({"fps":12,"frames":[[1,0,0]]})] {
        let path=fixture([0.125;4],true,Some(track),false);
        assert!(GltfPoseSource::load(&path).and_then(|s|s.sample(0,6)).is_err()); std::fs::remove_file(path).unwrap();
    }
}

#[test]
fn collapsed_death_skeleton_keeps_finite_vertices_and_normals() {
    let path=fixture([0.125;4],true,None,true);
    let pose=GltfPoseSource::load(&path).unwrap().sample(0,6).unwrap();
    assert_eq!(pose.positions.len(),3);
    assert!(pose.positions.iter().chain(pose.normals.iter()).flatten().all(|v|v.is_finite()));
    assert_eq!(pose.normals,vec![[0.0,1.0,0.0];3]);
    std::fs::remove_file(path).unwrap();
}
