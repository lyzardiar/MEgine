//! MiYu: downloaded multi-mesh characters must retain all geometry and animate.
use mengine_assets::GltfPoseSource;
#[test]
fn downloaded_character_skin_changes_between_frames() {
    let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms/Assets/Models");
    for (name,clip) in [("Warrior",8),("Ranger",11),("Cleric",7),("Dragon",3)] {
        let source=GltfPoseSource::load(&root.join(format!("{name}.glb"))).unwrap();
        let a=source.sample(clip,0).unwrap();let b=source.sample(clip,4).unwrap();
        assert_eq!(a.positions.len(),b.positions.len());assert!(a.positions.len()>500);
        let changed=a.positions.iter().zip(&b.positions).filter(|(a,b)|a.iter().zip(*b).any(|(a,b)|(a-b).abs()>0.01)).count();assert!(changed>100,"{name}: only {changed} vertices moved");
        assert!(b.positions.iter().flatten().all(|v|v.is_finite()&&v.abs()<100.0));
    }
}
