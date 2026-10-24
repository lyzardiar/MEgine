// Author: MiYu. Preserve stable world sorting across float edge cases and measure actual sampled map draws.
use super::*;

fn fixture(index: usize, kind: WorldPrimitiveKind, layer: &str, order: i32, depth: f32) -> WorldPrimitive {
    let mut primitive = UiPrimitive::solid([index as f32, 2., 3., 4.], [0.1, 0.2, 0.3, 0.4]); primitive.key.material = format!("fixture-{index}");
    WorldPrimitive { kind, sorting_layer: layer.into(), sorting_order: order, depth, world_position: Some([index as f32, 1.]), primitive }
}

fn check(input: &[WorldPrimitive], layers: &SortingLayers) {
    let mut before = input.to_vec(); let mut after = input.to_vec();
    baseline_sort_world_primitives(&mut before, layers); sort_world_primitives(&mut after, layers);
    assert_eq!(before.len(), after.len());
    for (expected, actual) in before.iter().zip(&after) {
        assert_eq!(expected.depth.to_bits(), actual.depth.to_bits());
        assert_eq!(format!("{expected:?}"), format!("{actual:?}"));
    }
}

#[test]
fn cached_world_sort_matches_float_total_order_layers_and_stable_ties() {
    let layers = SortingLayers::from_layers(vec![SortingLayer { id: "behind".into(), name: "Behind".into() }, SortingLayer { id: "default".into(), name: "Default".into() }, SortingLayer { id: "effects".into(), name: "Effects".into() }]).unwrap();
    let depths = [0, 0x80000000, 1, 0x80000001, 0x7f800000, 0xff800000, 0x7fc00001, 0xffc00001, 0x7fffffff, 0xffffffff, 0x7f800001, 0xff800001];
    let mut seed = 0x834971u32;
    for mode in 0..3 {
        let input: Vec<_> = (0..1024).map(|index| {
            seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
            let depth = f32::from_bits(if index < 192 { depths[index % depths.len()] } else { seed });
            let kind = if mode == 0 || mode == 2 && index % 2 == 0 { WorldPrimitiveKind::ThreeD } else { WorldPrimitiveKind::TwoD };
            fixture(index, kind, ["behind", "DEFAULT", "missing", "effects"][index % 4], [i32::MIN, -1, 0, i32::MAX][index % 4], depth)
        }).collect();
        check(&input, &layers); let mut ordered = input.clone(); baseline_sort_world_primitives(&mut ordered, &layers); check(&ordered, &layers); ordered.reverse(); check(&ordered, &layers);
    }
    for kind in [WorldPrimitiveKind::ThreeD, WorldPrimitiveKind::TwoD] {
        let ties: Vec<_> = (0..512).map(|index| fixture(index, kind, if index % 2 == 0 { "default" } else { "unknown" }, 0, 0.5)).collect();
        check(&ties, &layers);
    }
    check(&[], &layers); check(&[fixture(0, WorldPrimitiveKind::ThreeD, "default", 0, 0.)], &layers);
}

#[test]
#[ignore = "manual actual-map and layered world sort CPU profile"]
fn benchmark_cached_world_sort() {
    use crate::sampled_effects::SampledEffectWorld;
    use mengine_core::{TransformHierarchy, World}; use mengine_rhi::{look_at, perspective, FrameCamera, FrameLighting};
    use glam::Vec3; use std::{hint::black_box, time::Instant};
    let root = std::path::PathBuf::from(std::env::var_os("MENGINE_MATERIAL_PROJECT").unwrap()); let scene = std::env::var_os("MENGINE_MATERIAL_SCENE").unwrap();
    let mut world = World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
    let ids: Vec<_> = world.entities_with_components(&["SampledEffect"]).collect();
    for entity in ids { world.get_component_mut::<mengine_core::generated::SampledEffect>(entity).unwrap().time_seconds = 1.; }
    let hierarchy = TransformHierarchy::build(&world);
    let position = Vec3::new(40.7, 114.9, 87.4); let camera = FrameCamera { view: look_at(position, Vec3::ZERO, Vec3::Y), proj: perspective(45., 850. / 507., 0.1, 1000.), position };
    let mut effects = SampledEffectWorld::default(); effects.set_project_root(Some(&root));
    let actual = effects.collect(&world, &hierarchy, camera, 0., &mut FrameLighting::default()); assert!(actual.len() >= 1000, "{} primitives, failures: {:?}", actual.len(), effects.failures); assert!(effects.failures.is_empty());
    let layers = SortingLayers::from_layers((0..32).map(|index| SortingLayer { id: format!("layer-{index}"), name: format!("Layer {index}") }).collect()).unwrap();
    let mut ordered = actual.clone(); baseline_sort_world_primitives(&mut ordered, &layers); let mut reversed = ordered.clone(); reversed.reverse();
    let mixed: Vec<_> = (0..4096).map(|index| fixture(index, if index % 4 == 0 { WorldPrimitiveKind::ThreeD } else { WorldPrimitiveKind::TwoD }, &format!("layer-{}", index * 13 % 32), index as i32 % 9, (index * 17 % 997) as f32)).collect();
    for (label, input) in [("actual-dota", actual), ("already-ordered", ordered), ("reverse-ordered", reversed), ("layered", mixed)] {
        check(&input, &layers); let mut samples = [Vec::new(), Vec::new()];
        for round in 0..12 {
            for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
                let mut elapsed = 0.;
                for _ in 0..20 {
                    let mut values = input.clone(); let started = Instant::now();
                    if mode == 0 { baseline_sort_world_primitives(&mut values, &layers); } else { sort_world_primitives(&mut values, &layers); }
                    elapsed += started.elapsed().as_secs_f64() * 1000.; black_box(values);
                }
                if round >= 2 { samples[mode].push(elapsed / 20.); }
            }
        }
        let summary = |mut v: Vec<f64>| { let mean = v.iter().sum::<f64>() / v.len() as f64; v.sort_by(f64::total_cmp); [mean, v[v.len() / 2], v[v.len() * 95 / 100]] };
        println!("WORLD_SORT label={label} primitives={} primitiveBytes={} samples=10 sortsPerSample=20 before={:?} after={:?}", input.len(), std::mem::size_of::<WorldPrimitive>(), summary(samples[0].clone()), summary(samples[1].clone()));
    }
}
