//! MiYu: downloaded multi-mesh characters must retain all geometry and animate.
use mengine_assets::GltfPoseSource;
#[test]
fn downloaded_character_skin_changes_between_frames() {
    let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms/Assets/Models");
    for (name,clip) in [("Warrior",8),("Ranger",11),("Cleric",7),("Dragon",3),("Orc",9),("Orc_Skull",9),("Tribal",9),("Demon",9),("Ghost_Skull",1),("Skeleton_Rogue",1),("Skeleton_Mage",1)] {
        let source=GltfPoseSource::load(&root.join(format!("{name}.glb"))).unwrap();
        let a=source.sample(clip,0).unwrap();let b=source.sample(clip,4).unwrap();
        let dense=source.sample_at_rate(clip,10,30).unwrap();assert_eq!(b.positions,dense.positions,"{name}: sampling rate preserves playback speed");
        let intermediate=source.sample_at_rate(clip,11,30).unwrap();assert!(dense.positions.iter().zip(&intermediate.positions).any(|(a,b)|a.iter().zip(b).any(|(x,y)|(x-y).abs()>0.001)),"{name}: 30 Hz supplies intermediate geometry");
        assert!(source.sample_at_rate(clip,0,0).is_err());assert!(source.sample_at_rate(clip,0,61).is_err());
        assert_eq!(a.positions.len(),b.positions.len());assert!(a.positions.len()>500);
        let changed=a.positions.iter().zip(&b.positions).filter(|(a,b)|a.iter().zip(*b).any(|(a,b)|(a-b).abs()>0.01)).count();assert!(changed>100,"{name}: only {changed} vertices moved");
        assert!(b.positions.iter().flatten().all(|v|v.is_finite()&&v.abs()<100.0));
    }
}

#[test]
fn faction_buildings_load_with_finite_grounded_geometry() {
    let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms/Assets/Models");
    for faction in ["Kingdom","Warclans","Wildwood","Revenant"] {
        for kind in ["Hall","Hall2","Hall3","Barracks","Lodge","Tower","Altar","Workshop"] {
            let mesh=mengine_assets::load_gltf_mesh_data(&root.join(format!("{faction}{kind}.glb"))).unwrap();
            assert!(mesh.positions.len()>100);assert!(mesh.indices.len()>100);
            assert!(mesh.indices.iter().all(|i| (*i as usize)<mesh.positions.len()));
            assert!(mesh.positions.iter().flatten().all(|v|v.is_finite()&&v.abs()<8.0));
            assert!(mesh.positions.iter().map(|p|p[1]).fold(f32::INFINITY,f32::min).abs()<0.001);
            assert!(mesh.normals.iter().all(|n|(n.iter().map(|v|v*v).sum::<f32>()-1.0).abs()<0.001));
        }
    }
}

#[test]
fn skeleton_equipment_follows_animated_hand_socket() {
    let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    for name in ["Skeleton_Rogue","Skeleton_Mage"] {
        let source=GltfPoseSource::load(&root.join(format!("SourceAssets/kaykit-skeletons/{name}.glb"))).unwrap();
        let combined=GltfPoseSource::load(&root.join(format!("Assets/Models/{name}.glb"))).unwrap();
        let body=source.sample(90,4).unwrap();let a=combined.sample(1,4).unwrap();let b=combined.sample(1,9).unwrap();
        assert_eq!(&a.positions[..body.positions.len()],&body.positions,"character geometry remains intact");
        assert!(a.positions.len()>body.positions.len()+100,"weapon geometry is present");
        let weapon_a=&a.positions[body.positions.len()..];let weapon_b=&b.positions[body.positions.len()..];
        assert!(weapon_a.iter().zip(weapon_b).filter(|(a,b)|a.iter().zip(*b).any(|(x,y)|(x-y).abs()>0.01)).count()>100,"equipment moves with the arm");
        let span=|vertices:&[[f32;3]]|vertices[0].iter().zip(vertices.last().unwrap()).map(|(a,b)|(a-b).powi(2)).sum::<f32>();
        assert!((span(weapon_a)-span(weapon_b)).abs()<0.001,"rigid equipment preserves its shape");
        for clip in 0..6 {let pose=combined.sample(clip,4).unwrap();assert!(pose.positions.iter().flatten().all(|v|v.is_finite()&&v.abs()<10.0));}
    }
}
