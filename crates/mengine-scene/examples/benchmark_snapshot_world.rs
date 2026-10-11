// Author: MiYu. Compare viewport World reconstruction and retained snapshots with identical output.
use mengine_core::{snapshot::WorldSnapshot, World};
use mengine_scene::{apply_snapshot, SharedSnapshotWorld};
use std::{path::PathBuf, time::Instant};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = PathBuf::from(std::env::args().nth(1).expect("scene path"));
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)?;
    let snapshot: WorldSnapshot = serde_json::from_value(value["world"].clone())?;
    let mut mirror = SharedSnapshotWorld::default(); let mut rebuild = Vec::new(); let mut retained = Vec::new();
    for i in 0..22 {
        let before = snapshot.clone(); let after = snapshot.clone();
        let start = Instant::now(); let mut world = World::new(); apply_snapshot(&mut world, &before); let rebuild_ms = start.elapsed().as_secs_f64()*1000.0;
        let start = Instant::now(); mirror.update_owned(after); let retained_ms = start.elapsed().as_secs_f64()*1000.0;
        assert_eq!(WorldSnapshot::from_world(&world), WorldSnapshot::from_world(mirror.world()));
        if i>=2 { rebuild.push(rebuild_ms); retained.push(retained_ms); }
    }
    rebuild.sort_by(f64::total_cmp); retained.sort_by(f64::total_cmp);
    println!("{}",serde_json::json!({"author":"MiYu","entities":snapshot.entities.len(),"iterations":20,"warmups":2,"outputEqual":true,"scope":"Release CPU viewport snapshot synchronization; excludes common snapshot clone, IPC, renderer and GPU","rebuildMedianMs":rebuild[10],"retainedMedianMs":retained[10],"rebuildMs":rebuild,"retainedMs":retained}));
    Ok(())
}
