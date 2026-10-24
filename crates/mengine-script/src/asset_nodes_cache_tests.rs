// Author: MiYu. Retain exact adjacent-frame node results while validating each frame's source ownership.
use super::*;
use super::tests::{Fixture, nodes};

#[test]
fn unchanged_node_queries_reuse_adjacent_results_and_release_idle_entries() {
    let fixture=Fixture::new(8.);let mut cache=AssetNodeCache::default();cache.set_root(fixture.root.clone());
    let reference="Assets/actor.gltf#pose=0:15@30";
    let first=cache.query(reference,"{}");assert_eq!(cache.profile.samples,1);
    for _ in 0..40 {
        cache.begin_frame();assert_eq!(cache.query(reference,"{}"),first);
        assert_eq!((cache.profile.queries,cache.profile.loads,cache.profile.samples,cache.profile.serializations),(1,0,0,0));
        assert_eq!(cache.sources.values().next().unwrap().checked,cache.epoch);
    }
    cache.begin_frame();assert_eq!(cache.sources.values().next().unwrap().results.len(),1);
    cache.begin_frame();assert!(cache.sources.values().all(|source|source.results.is_empty()));
    assert_eq!(cache.query(reference,"{}"),first);assert_eq!(cache.profile.samples,1);
    cache.epoch=u64::MAX;for source in cache.sources.values_mut() {for result in source.results.values_mut() {result.frame=u64::MAX;}}
    cache.begin_frame();assert_eq!(cache.epoch,0);assert_eq!(cache.query(reference,"{}"),first);assert_eq!(cache.profile.samples,0);
}

#[test]
fn retained_results_validate_buffer_main_and_project_changes_before_reuse() {
    let fixture=Fixture::new(8.);let mut cache=AssetNodeCache::default();cache.set_root(fixture.root.clone());
    let reference="Assets/actor.gltf#pose=0:15@30";
    assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([6.,0.,0.]));
    fixture.buffer(12.,true);cache.begin_frame();
    assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([8.,0.,0.]));assert_eq!(cache.profile.samples,1);
    let path=fixture.root.join("Assets/actor.gltf");
    let mut document:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    document["nodes"][1]["translation"]=serde_json::json!([5,0,0]);std::fs::write(&path,document.to_string()).unwrap();cache.begin_frame();
    assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([11.,0.,0.]));assert_eq!(cache.profile.samples,1);
    std::fs::remove_file(fixture.root.join("Assets/pose data.bin")).unwrap();cache.begin_frame();
    let missing:serde_json::Value=serde_json::from_str(&cache.query(reference,"{}")).unwrap();assert_eq!(missing["ok"],false);
    fixture.buffer(14.,false);cache.begin_frame();assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([12.,0.,0.]));
    let next=Fixture::new(32.);cache.set_root(next.root.clone());
    assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([18.,0.,0.]));assert_eq!(cache.sources.len(),1);
    std::fs::remove_file(next.root.join("Assets/actor.gltf")).unwrap();
    assert_eq!(serde_json::from_str::<serde_json::Value>(&cache.query(reference,"{}")).unwrap()["ok"],false,"requested path is still resolved on every query");
}

#[test]
fn retained_query_keys_keep_pose_rate_camera_and_options_separate_and_bounded() {
    let fixture=Fixture::new(8.);let mut cache=AssetNodeCache::default();cache.set_root(fixture.root.clone());
    let reference="Assets/actor.gltf#pose=0:15@30";
    let plain=nodes(&mut cache,reference,"{}");
    let options=serde_json::json!({"camera":{"model":Mat4::IDENTITY.to_cols_array(),"look":[0,0,-1],"up":[0,1,0]}}).to_string();
    let camera=nodes(&mut cache,reference,&options);assert_ne!(plain,camera);
    let attachments=nodes(&mut cache,reference,"{\"attachmentsOnly\":true}");assert!(attachments.as_array().unwrap().is_empty());
    let rate=nodes(&mut cache,"Assets/actor.gltf#pose=0:15@60","{}");assert_ne!(rate,plain);
    cache.begin_frame();
    for (reference,options,expected) in [(reference,"{}",plain),(reference,options.as_str(),camera),(reference,"{\"attachmentsOnly\":true}",attachments),("Assets/actor.gltf#pose=0:15@60","{}",rate)] {assert_eq!(nodes(&mut cache,reference,options),expected);}
    assert_eq!(cache.profile.samples,0);
    for frame in 0..160 {nodes(&mut cache,&format!("Assets/actor.gltf#pose=0:{frame}@30"),"{}");}
    for source in cache.sources.values() {assert!(source.results.len()<=128);assert!(source.results.values().map(|result|result.value.len()).sum::<usize>()<=512*1024);}
    cache.begin_frame();cache.begin_frame();assert!(cache.sources.values().all(|source|source.results.is_empty()));
}

#[test]
fn oversized_node_results_do_not_enter_the_retained_cache() {
    let fixture=Fixture::new(8.);let path=fixture.root.join("Assets/actor.gltf");
    let mut document:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    document["nodes"].as_array_mut().unwrap().extend((0..3500).map(|index|serde_json::json!({"name":format!("Large node {index} with a deliberately long authored name")})));
    std::fs::write(path,document.to_string()).unwrap();
    let mut cache=AssetNodeCache::default();cache.set_root(fixture.root.clone());
    let result=cache.query("Assets/actor.gltf#pose=0:15@30","{}");assert!(result.len()>512*1024);
    assert!(cache.sources.values().all(|source|source.results.is_empty()));
    cache.begin_frame();assert_eq!(cache.query("Assets/actor.gltf#pose=0:15@30","{}"),result);assert_eq!(cache.profile.samples,1);
}

#[test]
#[ignore = "manual Frostbound adjacent-frame node query CPU benchmark"]
fn benchmark_adjacent_node_query_results() {
    let root=Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut paths=std::collections::BTreeSet::new();
    for name in ["human-army-models.json","human-aviary-models.json"] {
        let catalog:serde_json::Value=serde_json::from_slice(&std::fs::read(root.join(name)).unwrap()).unwrap();
        for model in catalog.as_object().unwrap().values() {let part=&model["parts"].as_array().unwrap()[0];paths.insert(part["animatedMesh"].as_str().or_else(||part["mesh"].as_str()).unwrap().to_owned());}
    }
    let paths=paths.into_iter().collect::<Vec<_>>();assert_eq!(paths.len(),7);
    let mut rows=Vec::new();
    for mode in ["unchanged","two_frames_per_pose","unique_pose","unique_camera"] {
        let inputs=(0..48).map(|frame| {
            let pose=match mode {"two_frames_per_pose"=>frame/2,"unique_pose"=>frame,_=>0};
            let options=if mode=="unique_camera" {serde_json::json!({"attachmentsOnly":true,"camera":{"model":Mat4::from_rotation_y(frame as f32*0.01).to_cols_array(),"look":[0,0,-1],"up":[0,1,0]}}).to_string()} else {"{\"attachmentsOnly\":true}".to_owned()};
            (paths.iter().map(|path|format!("{path}#pose=0:{pose}@30")).collect::<Vec<_>>(),options)
        }).collect::<Vec<_>>();
        let mut caches=[AssetNodeCache::default(),AssetNodeCache::default()];
        for cache in &mut caches {cache.set_root(root.clone());for reference in &inputs[0].0 {assert_eq!(serde_json::from_str::<serde_json::Value>(&cache.query(reference,&inputs[0].1)).unwrap()["ok"],true);}}
        let mut samples=[Vec::new(),Vec::new()];let mut counts=[(0,0),(0,0)];
        for run in 0..11 {
            let mut outputs=[Vec::new(),Vec::new()];
            for index in if run%2==0 {[0,1]} else {[1,0]} {
                let cache=&mut caches[index];let mut elapsed=0.;let mut work=(0,0);
                for (references,options) in &inputs {
                    let started=Instant::now();
                    // b14cc1d clears node results at each frame; the remaining query path is shared.
                    if index==0 {cache.profile=AssetNodeProfile::default();cache.epoch=cache.epoch.wrapping_add(1);for source in cache.sources.values_mut() {source.results.clear();}} else {cache.begin_frame();}
                    let values=references.iter().map(|reference|cache.query(reference,options)).collect::<Vec<_>>();
                    elapsed+=started.elapsed().as_secs_f64()*1000.;work.0+=cache.profile.samples;work.1+=cache.profile.serializations;
                    outputs[index].extend(values);
                }
                if run>1 {samples[index].push(elapsed/48.);}counts[index]=work;
            }
            assert_eq!(outputs[0],outputs[1]);
        }
        for sample in &mut samples {sample.sort_by(f64::total_cmp);}
        if mode=="unchanged" {assert_eq!(counts[1],(0,0));}
        if mode=="two_frames_per_pose" {let expected=paths.len() as u32*24;assert_eq!(counts[1],(expected,expected));}
        if mode.starts_with("unique_") {assert_eq!(counts[0],counts[1]);}
        rows.push(serde_json::json!({"workload":mode,"baseline_ms":samples[0][4],"retained_ms":samples[1][4],"baseline_samples":counts[0].0,"retained_samples":counts[1].0,"baseline_serializations":counts[0].1,"retained_serializations":counts[1].1}));
    }
    println!("ADJACENT_NODE_RESULTS={}",serde_json::json!({"baseline":"b14cc1d frame-clear policy","sources":paths,"frames":48,"samples":9,"rows":rows,"scope":"Native node queries including dependency validation and cache maintenance; excludes VM, gameplay, renderer and FPS"}));
}
