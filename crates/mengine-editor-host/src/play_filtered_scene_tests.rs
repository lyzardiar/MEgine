// Author: MiYu. Keep filtered Scene materialization, picking and Stop ownership in one Play mirror.
use super::*;
use crate::{EditorSceneCamera, EditorViewportRenderer, SceneSnapshotWorld};
use std::sync::{Mutex, Weak};

fn source() -> WorldSnapshot {
    serde_json::from_value(serde_json::json!({"frame":3,"sim_frame":2,"elapsed":0.2,"clear_color":[0.1,0.2,0.3,1],"entities":[
        {"entity":4294967397u64,"name":"Parent","components":{"Transform":{"position":[-1,0,0]},"MeshRenderer":{"mesh":"cube"}}},
        {"entity":77,"name":"Child","parent":4294967397u64,"components":{"Transform":{"position":[0,1,0]},"MeshRenderer":{"mesh":"cube"}}},
        {"entity":15,"name":"Other","components":{"Transform":{"position":[1,0,0]},"MeshRenderer":{"mesh":"cube"}}},
        {"entity":50,"name":"Inactive","active":false,"components":{"MeshRenderer":{"mesh":"cube"}}}
    ]})).unwrap()
}

fn flush(runtime: &EditorPlayRuntime) {
    let (entered,ready)=mpsc::channel();let (release,resume)=mpsc::channel();
    runtime.sender.send(Request::Barrier {entered,resume}).unwrap();ready.recv_timeout(Duration::from_secs(3)).unwrap();release.send(()).unwrap();
}

#[test]
fn filtered_scene_records_leave_the_session_mirror_on_stop() {
    let runtime=EditorPlayRuntime::default();let id=runtime.begin();runtime.start(id,String::new(),source(),PlayProject::default()).unwrap();
    let published=runtime.published_snapshot(id,Some(0)).unwrap();
    let child=published.0.entities.iter().find(|e|e.name.as_deref()==Some("Child")).unwrap().entity;
    let retained:Weak<_>=Arc::downgrade(published.0.entities.iter().find(|e|e.name.as_deref()==Some("Other")).unwrap());
    let output=runtime.render_published_snapshot_with_filter(id,Some(0),published,&runtime.scene_render_world,Some(&[child]),|world,original| {
        assert_eq!(original.entities.len(),4);assert_eq!(world.iter_entities().count(),2);
        Err::<EditorViewportFrame,_>("materialized".into())
    });
    assert_eq!(output.err().unwrap(),"materialized");
    assert_eq!(runtime.scene_render_world.lock().unwrap().1.world().iter_entities().count(),2);
    assert_eq!(runtime.render_world.lock().unwrap().1.world().iter_entities().count(),0);
    runtime.stop_session(id);flush(&runtime);
    assert_eq!(runtime.scene_render_world.lock().unwrap().1.world().iter_entities().count(),0);
    assert!(retained.upgrade().is_none(),"no project-global filtered mirror may retain the stopped records");
}

#[test]
fn busy_filtered_scene_cannot_retain_or_clear_a_restarted_session() {
    let runtime=Arc::new(EditorPlayRuntime::default());let id=runtime.begin();runtime.start(id,String::new(),source(),PlayProject::default()).unwrap();
    let published=runtime.published_snapshot(id,Some(0)).unwrap();let hidden=published.0.entities[0].entity;
    let retained=Arc::downgrade(&published.0.entities[2]);
    let (entered,ready)=mpsc::channel();let (release,resume)=mpsc::channel();let worker=runtime.clone();
    let blocked=std::thread::spawn(move ||worker.render_published_snapshot_with_filter(id,Some(0),published,&worker.scene_render_world,Some(&[hidden]),|world,original| {
        assert_eq!(world.iter_entities().count(),1);assert_eq!(original.entities.len(),4);entered.send(()).unwrap();resume.recv_timeout(Duration::from_secs(5)).unwrap();Err::<EditorViewportFrame,_>("old frame".into())
    }));
    ready.recv_timeout(Duration::from_secs(3)).unwrap();runtime.stop_session(id);let next=runtime.begin();
    let new:WorldSnapshot=serde_json::from_value(serde_json::json!({"entities":[{"entity":555,"name":"New session","components":{}}]})).unwrap();runtime.start(next,String::new(),new,PlayProject::default()).unwrap();
    release.send(()).unwrap();assert_eq!(blocked.join().unwrap().err().unwrap(),"Play session expired");
    let current=runtime.published_snapshot(next,Some(0)).unwrap();
    assert_eq!(runtime.render_published_snapshot_with_filter(next,Some(0),current,&runtime.scene_render_world,Some(&[]),|world,_| {assert_eq!(world.iter_entities().count(),1);Err::<EditorViewportFrame,_>("new frame".into())}).err().unwrap(),"new frame");
    runtime.stop_session(id);assert_eq!(runtime.scene_render_world.lock().unwrap().0,next);
    let deadline=Instant::now()+Duration::from_secs(3);
    while retained.upgrade().is_some() && Instant::now()<deadline {std::thread::sleep(Duration::from_millis(10));}
    assert!(retained.upgrade().is_none());runtime.stop_session(next);flush(&runtime);
}

#[test]
fn filtered_scene_gpu_pixels_and_source_pick_ids_match_the_separate_world_path() {
    let runtime=EditorPlayRuntime::default();let id=runtime.begin();runtime.start(id,String::new(),source(),PlayProject::default()).unwrap();
    let mut snapshot=runtime.published_snapshot(id,Some(0)).unwrap().0;
    let parent=snapshot.entities.iter().find(|e|e.name.as_deref()==Some("Parent")).unwrap().entity;
    let other=snapshot.entities.iter().find(|e|e.name.as_deref()==Some("Other")).unwrap().entity;
    let renderer=Arc::new(Mutex::new(pollster::block_on(EditorViewportRenderer::new(std::env::temp_dir(),64,64)).unwrap()));
    let camera=EditorSceneCamera {eye:[0.,0.,6.],target:[0.,0.,0.],orthographic:false,orthographic_size:5.,fov_y_degrees:60.};
    let mut legacy=SceneSnapshotWorld::default();
    for (phase,hidden) in [vec![parent],vec![],vec![other],vec![parent,other],vec![],vec![parent]].into_iter().enumerate() {
        if phase==2 {
            let mut edit=snapshot.clone().into_owned();
            for record in &mut edit.entities {
                if record.name.as_deref()==Some("Other") {record.components.get_mut("Transform").unwrap()["position"]=serde_json::json!([0.3,0,0]);}
                if record.name.as_deref()==Some("Child") {record.parent=Some(other);}
                if record.name.as_deref()==Some("Inactive") {record.active=true;}
            }
            assert_eq!(runtime.advance_update(id,Some(edit),ScriptInput::default(),0.016).unwrap().revision,1);
        }
        let revision=if phase<2 || phase==3 {0}else {1};snapshot=runtime.published_snapshot(id,Some(revision)).unwrap().0;
        let draw=renderer.clone();let expected_count=if hidden.is_empty() {4}else {crate::scene_snapshot_world::filter_scene_snapshot(&snapshot,&hidden).entities.len()};
        let mut actual=runtime.submit_scene_revision_with_filter(id,Some(revision),hidden.clone(),move |world,original| {
            assert_eq!(original.entities.len(),4);assert_eq!(world.iter_entities().count(),expected_count);
            draw.lock().unwrap().with_mesh_picking().with_play_session(Some(id)).submit_scene(world,64,64,camera).map_err(|e|e.to_string())
        }).unwrap().finish().unwrap();
        let world=if hidden.is_empty() {legacy.update(None,Some(snapshot.clone().into_owned())).unwrap()}else {legacy.update_filtered(&snapshot,&hidden)};
        let mut expected=renderer.lock().unwrap().with_mesh_picking().with_play_session(Some(id)).render_scene(world,64,64,camera).unwrap();
        expected.mesh_picking.as_mut().unwrap().remap_entities(|entity|legacy.source_entity(entity));
        assert_eq!(actual.rgba,expected.rgba,"complete RGBA for {hidden:?}");
        let mut actual_picks=actual.mesh_picking.take().unwrap();let mut expected_picks=expected.mesh_picking.take().unwrap();
        actual_picks.objects.sort_by_key(|object|object.entity);expected_picks.objects.sort_by_key(|object|object.entity);
        assert_eq!(actual_picks.objects.iter().map(|object|object.entity).collect::<Vec<_>>(),expected_picks.objects.iter().map(|object|object.entity).collect::<Vec<_>>());
        for y in 0..8 {for x in 0..8 {assert_eq!(actual_picks.pick([x as f32/7.,y as f32/7.],|_|true),expected_picks.pick([x as f32/7.,y as f32/7.],|_|true));}}
    }
    for preview in [false,true] {
        let read=|world:&World,original:&SharedWorldSnapshot| {assert_eq!(world.iter_entities().count(),4);assert_eq!(original.entities.len(),4);Err::<EditorViewportFrame,_>("independent".into())};
        let output=if preview {runtime.render_preview_revision_with_snapshot(id,Some(0),read)}else {runtime.render_revision_with_snapshot(id,Some(0),read)};
        assert_eq!(output.err().unwrap(),"independent");
    }
    runtime.stop_session(id);flush(&runtime);
}

#[test]
#[ignore = "manual preserved-map filtered Scene materialization CPU comparison"]
fn benchmark_owned_filtered_scene_world() {
    let path=PathBuf::from(std::env::var_os("MENGINE_FILTERED_SCENE").expect("Set MENGINE_FILTERED_SCENE to a preserved imported map scene"));
    let document:serde_json::Value=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let source:WorldSnapshot=serde_json::from_value(document["world"].clone()).unwrap();
    let base=SharedWorldSnapshot {entities:source.entities.into_iter().map(Arc::new).collect(),frame:source.frame,sim_frame:source.sim_frame,elapsed:source.elapsed,clear_color:source.clear_color,selected:source.selected};
    let mut changed=base.clone();let mut edits=0;
    for record in &mut changed.entities {
        let Some(position)=record.components.get("Transform").and_then(|v|v.get("position")).and_then(|v|v.as_array()) else {continue;};
        let x=position[0].as_f64().unwrap();Arc::make_mut(record).components.get_mut("Transform").unwrap()["position"][0]=serde_json::json!(x+0.25);edits+=1;if edits==64 {break;}
    }
    assert_eq!(edits,64);let hidden=vec![base.entities[0].entity];let mut rows=Vec::new();
    for workload in ["unfiltered","filtered_static","filtered_64_transforms"] {
        let runtime=EditorPlayRuntime::default();let id=runtime.begin();let old_runtime=EditorPlayRuntime::default();let old_id=old_runtime.begin();let mut filtered=SceneSnapshotWorld::default();
        let mut samples=[Vec::new(),Vec::new()];let ids=if workload=="unfiltered" {Vec::new()}else {hidden.clone()};
        for run in 0..11 {
            for index in if run%2==0 {[0,1]}else {[1,0]} {
                let mut elapsed=0.;
                for frame in 0..40 {
                    let input=if workload=="filtered_64_transforms" && frame%2==1 {&changed}else {&base};
                    let published=(input.clone(),0.,Vec::new());let now=Instant::now();
                    if index==0 {
                        assert_eq!(old_runtime.render_published_snapshot(old_id,Some(0),published,&old_runtime.scene_render_world,|_,original| {if !ids.is_empty() {filtered.update_filtered(original,&ids);}Err::<EditorViewportFrame,_>("compared".into())}).err().unwrap(),"compared");
                    }else {
                        assert_eq!(runtime.render_published_snapshot_with_filter(id,Some(0),published,&runtime.scene_render_world,Some(&ids),|_,_|Err::<EditorViewportFrame,_>("compared".into())).err().unwrap(),"compared");
                    }
                    elapsed+=now.elapsed().as_secs_f64();
                }
                if run>1 {samples[index].push(elapsed*1000./40.);}
            }
            let input=if workload=="filtered_64_transforms" {&changed}else {&base};
            let full=old_runtime.scene_render_world.lock().unwrap();let old=if ids.is_empty() {full.1.world()}else {filtered.update_filtered(input,&ids)};
            let next=runtime.scene_render_world.lock().unwrap();assert_eq!(WorldSnapshot::from_world(old),WorldSnapshot::from_world(next.1.world()));
        }
        for sample in &mut samples {sample.sort_by(f64::total_cmp);}
        let new_entities=runtime.scene_render_world.lock().unwrap().1.world().iter_entities().count();
        let old_entities=old_runtime.scene_render_world.lock().unwrap().1.world().iter_entities().count()+if ids.is_empty() {0}else {filtered.update_filtered(&base,&ids).iter_entities().count()};
        rows.push(serde_json::json!({"workload":workload,"baseline_ms":samples[0][4],"owned_ms":samples[1][4],"baseline_retained_entities":old_entities,"owned_retained_entities":new_entities}));
        runtime.stop_session(id);old_runtime.stop_session(old_id);
    }
    println!("OWNED_FILTERED_WORLD={}",serde_json::json!({"baseline":"541d0c2 full Play mirror then separate filtered mirror","input_entities":base.entities.len(),"samples":9,"iterations":40,"rows":rows,"scope":"Filter and native mirror update CPU; excludes script, GPU and process-memory/FPS measurement"}));
}
