// Author: MiYu. Merge borrowed membership streams without rebuilding an entity-sized set.
use std::{cmp::Reverse, collections::{btree_set, BinaryHeap, BTreeSet}, iter::Peekable};

pub(super) struct ComponentUnion<'a> { members: Vec<Peekable<btree_set::Iter<'a, u32>>>, heap: BinaryHeap<Reverse<(u32, usize)>> }
impl<'a> ComponentUnion<'a> {
    pub(super) fn new(members: impl Iterator<Item = &'a BTreeSet<u32>>) -> Self {
        let mut members: Vec<_> = members.filter(|members| !members.is_empty()).map(|members| members.iter().peekable()).collect();
        let heap = if members.len() > 8 { members.iter_mut().enumerate().filter_map(|(member, values)| values.next().map(|&index| Reverse((index, member)))).collect() } else { BinaryHeap::new() };
        Self { members, heap }
    }
}
impl Iterator for ComponentUnion<'_> {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if let [member] = self.members.as_mut_slice() { return member.next().copied(); }
        if self.members.len() > 8 {
            let next = self.heap.peek()?.0.0;
            while self.heap.peek().is_some_and(|head| head.0.0 == next) {
                let Reverse((_, member)) = self.heap.pop().unwrap();
                if let Some(&index) = self.members[member].next() { self.heap.push(Reverse((index, member))); }
            }
            return Some(next);
        }
        let next = self.members.iter_mut().filter_map(|member| member.peek().copied().copied()).min()?;
        for member in &mut self.members { if member.peek().is_some_and(|&&index| index == next) { member.next(); } }
        Some(next)
    }
}

#[cfg(test)]
mod tests {
    use super::super::*;
    use std::{hint::black_box, time::Instant};

    fn baseline(world: &World, names: &[&str]) -> Vec<Entity> {
        let indices: BTreeSet<_> = names.iter().filter_map(|name| world.component_entities.get(*name)).flat_map(|members| members.iter().copied()).collect();
        let ordered = world.iteration_order.as_ref().map(|_| { let mut ordered = indices.iter().copied().collect::<Vec<_>>(); ordered.sort_unstable_by_key(|index| world.entities[*index as usize].iteration_rank); ordered });
        ordered.into_iter().flatten().chain(indices.into_iter().take(if world.iteration_order.is_none() { usize::MAX } else { 0 })).filter_map(|index| { let record = &world.entities[index as usize]; record.alive.then_some(Entity::new(index, record.generation)) }).collect()
    }

    #[test]
    fn union_preserves_overlap_empty_types_custom_order_and_partial_consumption() {
        let mut world = World::new(); let entities: Vec<_> = (0..127).map(|_| world.spawn_empty()).collect();
        for (index, &entity) in entities.iter().enumerate() {
            if index % 2 == 0 { world.insert_component(entity, Name { value: index.to_string() }); }
            if index % 3 == 0 { world.insert_component(entity, Transform::default()); }
            if index % 5 == 0 { world.set_component_value(entity, "PointLight", serde_json::json!({})); }
        }
        let names = ["Missing", "Name", "Transform", "Name", "PointLight"];
        for reverse in [false, true] {
            if reverse { assert!(world.set_entity_iteration_order(&entities.iter().rev().copied().collect::<Vec<_>>())); }
            let expected = baseline(&world, &names);
            assert_eq!(world.entities_with_any_component(&names).collect::<Vec<_>>(), expected);
            assert_eq!(world.entities_with_any_component(&names).take(3).collect::<Vec<_>>(), expected[..3]);
            assert_eq!(world.entities_with_any_component(&["Missing"]).next(), None);
        }
    }

    #[test]
    fn many_memberships_merge_interleaved_disjoint_and_duplicate_indices() {
        let sets: Vec<BTreeSet<_>> = (0..32).map(|offset| (0..97).map(|index| index * 32 + offset).collect()).collect();
        let expected: Vec<_> = (0..32 * 97).collect();
        let actual: Vec<_> = super::ComponentUnion::new(sets.iter().chain(sets.iter())).collect();
        assert_eq!(actual, expected);
    }

    fn measure(world: &World, names: &[&str], label: &str) -> Value {
        let expected = baseline(world, names); assert_eq!(world.entities_with_any_component(names).collect::<Vec<_>>(), expected);
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..7 {
            for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..100 { black_box(if index == 0 { baseline(world, names) } else { world.entities_with_any_component(names).collect::<Vec<_>>() }); }
                if run > 1 { samples[index].push(started.elapsed().as_secs_f64() * 1000.0 / 100.0); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        serde_json::json!({"label": label, "matches": expected.len(), "baseline_ms": samples[0][2], "merge_ms": samples[1][2], "samples": 5, "equal": true})
    }

    #[test]
    #[ignore = "manual ordered component union CPU benchmark"]
    fn benchmark_component_union() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms/Assets/Scenes/Main.mscene");
        let scene: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let mut world = World::new();
        for source in scene["world"]["entities"].as_array().unwrap() { let entity = world.spawn_empty(); for (name, value) in source["components"].as_object().unwrap() { world.set_component_value(entity, name, value.clone()); } }
        let mut reports = Vec::new();
        reports.push(measure(&world, &["Tilemap", "Line2D", "SpriteBatch2D", "AnimatedSprite2D", "SpriteRenderer"], "Frostbound sprites"));
        reports.push(measure(&world, &["ParticleEmitter2D", "ParticleEmitter3D"], "Frostbound particles"));
        reports.push(measure(&world, &["EnvironmentLight", "DirectionalLight", "PointLight", "SpotLight"], "Frostbound lights"));
        let mut dense = World::new();
        for _ in 0..20_000 { let entity = dense.spawn_empty(); dense.insert_component(entity, Transform::default()); dense.insert_component(entity, Name::default()); }
        reports.push(measure(&dense, &["Name", "Transform", "Name"], "20k overlapping"));
        let mut order = dense.iter_entities().collect::<Vec<_>>(); order.reverse(); assert!(dense.set_entity_iteration_order(&order));
        reports.push(measure(&dense, &["Name", "Transform", "Name"], "20k reordered"));
        let mut sparse = World::new(); let names = &crate::generated::meta::COMPONENT_NAMES[..24];
        for index in 0..20_000 { let entity = sparse.spawn_empty(); sparse.set_component_value(entity, names[index % names.len()], serde_json::json!({})); }
        reports.push(measure(&sparse, names, "20k 24 disjoint types"));
        println!("COMPONENT_UNION_BENCHMARK={}", serde_json::json!(reports));
    }
}
