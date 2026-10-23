// Author: MiYu. Compare cached hierarchy values against the stateless production resolver.
use super::*;
use std::{hint::black_box, time::Instant};

fn assert_equal(world: &World, cache: &mut TransformHierarchyCache, extra: &[Entity]) -> TransformHierarchy {
    let expected = TransformHierarchy::build(world); let actual = cache.build(world);
    assert_eq!(actual.nodes.len(), expected.nodes.len());
    for entity in world.iter_entities().chain(extra.iter().copied()) {
        assert_eq!(actual.is_active(entity), expected.is_active(entity), "activity {entity:?}");
        assert_eq!(format!("{:?}",actual.get(entity)), format!("{:?}",expected.get(entity)), "transform {entity:?}");
        assert_eq!(format!("{:?}",actual.parent_world(world,entity)), format!("{:?}",expected.parent_world(world,entity)), "parent {entity:?}");
    }
    actual
}

#[test]
fn hierarchy_cache_tracks_inputs_ancestors_cycles_order_and_generations() {
    let mut world = World::new(); let ids: Vec<_> = (0..64).map(|_| world.spawn_empty()).collect();
    for (i,e) in ids.iter().enumerate() {
        world.insert_component(*e,Transform { position:[i as f32,2.,-1.],rotation:Quat::from_rotation_y(i as f32*0.13).to_array(),scale:[2.,1.,-1.] });
        if i>0 { world.set_parent(*e,Some(ids[(i-1)/2])); }
    }
    let mut cache=TransformHierarchyCache::default(); let old=assert_equal(&world,&mut cache,&[]); let version=cache.version;
    assert_equal(&world,&mut cache,&[]); assert_eq!(cache.version,version,"unchanged local and parent inputs reuse aggregates");
    world.insert_component(ids[12],crate::generated::MeshRenderer::default()); assert_equal(&world,&mut cache,&[]); assert_eq!(cache.version,version,"non-transform edits reuse aggregates");
    for pass in 0..24 {
        let entity=ids[pass+1];
        match pass%6 {
            0 => { world.get_component_mut::<Transform>(entity).unwrap().position[0]+=3.; }
            1 => { world.set_editor_state(entity,0,false); }
            2 => { world.remove_component_by_name(entity,"Transform"); }
            3 => { world.insert_component(entity,Parent { entity:ids[pass+2] }); world.insert_component(ids[pass+2],Parent { entity }); }
            4 => { world.insert_component(entity,Parent { entity }); }
            _ => { world.remove_component_by_name(entity,"Parent"); }
        }
        assert_equal(&world,&mut cache,&[]); assert_equal(&world,&mut cache,&[]);
        let mut order:Vec<_>=world.iter_entities().collect(); order.reverse(); assert!(world.set_entity_iteration_order(&order));
        assert_equal(&world,&mut cache,&[]);
    }
    let stale=ids[0];world.despawn(stale);let replacement=world.spawn_empty();assert_eq!(stale.index,replacement.index);
    world.insert_component(replacement,Transform::default());world.insert_component(ids[63],Parent { entity:stale });
    assert_equal(&world,&mut cache,&[stale]);assert!(old.get(stale).is_some());assert!(old.get(replacement).is_none());
    world.insert_component(ids[60],Transform { position:[f32::NAN,f32::INFINITY,-0.],rotation:[0.;4],scale:[f32::NAN,2.,-1.] });
    assert_equal(&world,&mut cache,&[stale]);assert_equal(&world,&mut cache,&[stale]);
    let mut other=World::new();let e=other.spawn_empty();other.insert_component(e,Transform::default());assert_equal(&other,&mut cache,&[stale]);
    assert_equal(&World::new(),&mut cache,&[]);assert_eq!(cache.entries.len(),0);
}

#[test]
fn hierarchy_cache_bounds_sparse_storage_and_resets_wrapped_counters() {
    let mut world=World::new();let ids:Vec<_>=(0..128).map(|_| world.spawn_empty()).collect();let mut cache=TransformHierarchyCache::default();
    for e in &ids { world.insert_component(*e,Transform::default()); }
    assert_equal(&world,&mut cache,&[]);
    for e in &ids[..127] { world.set_editor_state(*e,0,false); }
    world.set_parent(ids[127],Some(ids[0]));assert_equal(&world,&mut cache,&[]);assert_eq!(cache.entries.capacity(),0);
    for e in &ids { world.set_editor_state(*e,0,true); }
    cache.frame=u64::MAX;assert_equal(&world,&mut cache,&[]);cache.version=u64::MAX;assert_equal(&world,&mut cache,&[]);
}

#[test]
fn hierarchy_cache_observes_serialized_edits_and_custom_live_projections() {
    use std::{any::Any, sync::{Arc, atomic::{AtomicBool,Ordering}}};
    struct Projected { switch:Arc<AtomicBool>, first:Transform, second:Transform }
    impl crate::Component for Projected {
        fn type_name()-> &'static str { "Projected" }
        fn as_any(&self)-> &dyn Any { if self.switch.load(Ordering::Relaxed) { &self.second } else { &self.first } }
        fn as_any_mut(&mut self)-> &mut dyn Any { self }
        fn to_value(&self)->serde_json::Value { serde_json::Value::Null }
    }
    let mut world=World::new();let parent=world.spawn_empty();let child=world.spawn_empty();let mut cache=TransformHierarchyCache::default();
    world.insert_component(parent,Transform::default());world.insert_component(child,Transform::default());world.set_parent(child,Some(parent));assert_equal(&world,&mut cache,&[]);
    world.set_component_value(parent,"transform",serde_json::json!({"position":[7,8,9]}));assert_equal(&world,&mut cache,&[]);
    world.get_component_mut::<Parent>(child).unwrap().entity=child;assert_equal(&world,&mut cache,&[]);world.remove_component_by_name(child,"Parent");assert_equal(&world,&mut cache,&[]);
    let switch=Arc::new(AtomicBool::new(false));world.remove_component_by_name(parent,"Transform");world.insert_component(parent,Projected { switch:switch.clone(),first:Transform::default(),second:Transform {position:[8.,9.,10.],..Default::default()} });
    world.set_parent(child,Some(parent));assert_equal(&world,&mut cache,&[]);let revision=world.entity_revision(parent);
    switch.store(true,Ordering::Relaxed);assert_equal(&world,&mut cache,&[]);assert_eq!(world.entity_revision(parent),revision);
    let current=cache.build(&world);assert_eq!(current.get(child).unwrap().position,Vec3::new(8.,9.,10.));
}

#[test]
#[ignore = "manual authored hierarchy cache comparison"]
fn benchmark_hierarchy_cache() {
    let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene","Assets/Scenes/Main.mscene"] {
        let value:serde_json::Value=serde_json::from_slice(&std::fs::read(root.join(scene)).unwrap()).unwrap();
        let snapshot:crate::snapshot::WorldSnapshot=serde_json::from_value(value["world"].clone()).unwrap();let mut world=World::new();let mut ids=HashMap::new();
        for source in &snapshot.entities { let entity=world.spawn_empty();ids.insert(source.entity,entity);for (name,value) in &source.components {world.set_component_value(entity,name,value.clone());}world.set_editor_state(entity,source.sibling_index,source.active); }
        for source in &snapshot.entities { if let Some(parent)=source.parent {world.set_parent(ids[&source.entity],Some(ids[&parent]));} }
        let mut cache=TransformHierarchyCache::default();assert_equal(&world,&mut cache,&[]);
        let edited=world.iter_entities().find(|e|world.get_component::<crate::generated::Camera3D>(*e).is_some()&&world.get_component::<Transform>(*e).is_some()).unwrap();
        let meshes:Vec<_>=world.entities_with_components(&["MeshRenderer"]).collect();
        let transforms:Vec<_>=world.entities_with_components(&["Transform"]).collect();
        for change in ["camera","mesh","transforms"] {
            let mut samples=[Vec::new(),Vec::new()];
            for group in 0..11 {for mode in [group%2,1-group%2] {let started=Instant::now();for frame in 0..40 {
                world.get_component_mut::<Transform>(edited).unwrap().position[0]=frame as f32*0.01;
                if change=="mesh" {for entity in &meshes {black_box(world.get_component_mut::<crate::generated::MeshRenderer>(*entity).unwrap());}}
                if change=="transforms" {for entity in &transforms {world.get_component_mut::<Transform>(*entity).unwrap().position[0]=frame as f32*0.01;}}
                black_box(if mode==0 {TransformHierarchy::build(&world)} else {cache.build(&world)});
            }if group>=2 {samples[mode].push(started.elapsed().as_secs_f64()*1000./40.);}}}
            assert_equal(&world,&mut cache,&[]);
            println!("HIERARCHY_CACHE {}",serde_json::json!({"scene":scene,"entities":snapshot.entities.len(),"samples_ms":samples,"iterations":40,"warmups":2,"cache_bytes":cache.entries.capacity()*std::mem::size_of::<Option<CachedNode>>(),"equal":true,"change":change,"mesh_mutations_per_frame":if change=="mesh" {meshes.len()}else{0},"transform_mutations_per_frame":if change=="transforms" {transforms.len()}else{1},"scope":"one camera transform changes every frame; owned output allocation and mutable access included"}));
        }
    }
}
