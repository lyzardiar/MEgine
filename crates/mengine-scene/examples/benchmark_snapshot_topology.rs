//! MiYu: measure sparse topology edits in a large immutable viewport world.
use mengine_core::{World, generated::{Name, Transform, MeshRenderer}, snapshot::WorldSnapshotCache};
use mengine_scene::SharedSnapshotWorld;
use std::time::Instant;
fn main() {
    let mut source = World::new(); let mut entities=Vec::new();
    for i in 0..6000 {let e=source.spawn_empty(); source.insert_component(e,Name {value:format!("entity-{i}")}); source.insert_component(e,Transform::default());source.insert_component(e,MeshRenderer::default());entities.push(e);}
    let mut cache=WorldSnapshotCache::default();let original=cache.capture(&source);let mut snapshots=Vec::new();
    for i in 0..80 {let e=source.spawn_empty();source.insert_component(e,Transform::default());snapshots.push(cache.capture(&source));source.despawn(e);snapshots.push(cache.capture(&source));source.set_parent(entities[i+1],Some(entities[0]));snapshots.push(cache.capture(&source));source.set_parent(entities[i+1],None);snapshots.push(cache.capture(&source));}
    let mut results=Vec::new();
    for _ in 0..3 {let mut mirror=SharedSnapshotWorld::default();mirror.update(&original);let start=Instant::now();for snapshot in &snapshots {mirror.update(snapshot);assert_eq!(mirror.world().iter_entities().count(),snapshot.entities.len());}results.push(start.elapsed().as_secs_f64()*1000.0);}
    let mut mirror=SharedSnapshotWorld::default();mirror.update(&original);
    let started=Instant::now();for _ in 0..320 {mirror.update(&original);}let stable_ms=started.elapsed().as_secs_f64()*1000.0;
    let mut reordered=original.clone();reordered.entities.rotate_left(1000);mirror.update(&reordered);
    let started=Instant::now();for _ in 0..320 {assert_eq!(mirror.world().entities_with_components(&["Transform"]).count(),6000);assert_eq!(mirror.world().entities_with_any_component(&["Transform","Name"]).count(),6000);}let ordered_queries_ms=started.elapsed().as_secs_f64()*1000.0;
    let parent=reordered.entities[0].entity;for record in reordered.entities.iter_mut().skip(1) {std::sync::Arc::make_mut(record).parent=Some(parent);}
    let mut half=reordered.clone();half.entities.truncate(3000);let mut empty=reordered.clone();empty.entities.clear();
    mirror.update(&reordered);let started=Instant::now();mirror.update(&half);let half_remove_ms=started.elapsed().as_secs_f64()*1000.0;
    assert_eq!(mirror.world().iter_entities().count(),3000);
    let started=Instant::now();mirror.update(&empty);let full_remove_ms=started.elapsed().as_secs_f64()*1000.0;
    assert_eq!(mirror.world().iter_entities().count(),0);mirror.update(&reordered);assert_eq!(mirror.world().iter_entities().count(),6000);
    println!("{}",serde_json::json!({"entities":6000,"updates":snapshots.len(),"replayMs":results,"stable320UpdatesMs":stable_ms,"ordered640QueriesMs":ordered_queries_ms,"removeHalfMs":half_remove_ms,"removeRemainingMs":full_remove_ms}));
}
