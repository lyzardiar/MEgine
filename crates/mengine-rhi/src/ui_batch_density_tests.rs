// Author: MiYu. Dense UI overlap ordering and GPU transparency regression coverage.
use super::*;

fn dense_primitives(count: usize) -> Vec<UiPrimitive> {
    (0..count).map(|index| {
        let mut primitive = UiPrimitive::solid([(index % 128) as f32 * 12., (index / 128) as f32 * 12., 15., 19.], [index as f32, 0.4, 0.6, 0.35]);
        primitive.key.canvas_group = Some(3); primitive.key.material = format!("dense-{}", index % 3);
        primitive.canvas_sorting_grid_size = Some(0.1);
        primitive.pivot = [0.2, 0.7]; primitive.rotation_radians = (index % 5) as f32 * 0.07;
        primitive
    }).collect()
}

#[test]
fn dense_canvas_keeps_every_overlap_edge_and_requested_grid_independence() {
    let mut primitives = dense_primitives(8192);
    let bounds: Vec<_> = primitives.iter().map(primitive_bounds).collect();
    let order = canvas_segment_order(&primitives, 0.1);
    assert_eq!(order.len(), primitives.len());
    let mut sorted = order.clone(); sorted.sort_unstable(); assert_eq!(sorted, (0..primitives.len()).collect::<Vec<_>>());
    assert_ne!(order, sorted, "fixture must exercise reordering instead of the budget fallback");
    let mut positions = vec![0; order.len()]; for (position, &index) in order.iter().enumerate() { positions[index] = position; }
    let mut overlaps = 0;
    for left in 0..bounds.len() {
        for right in left + 1..bounds.len() {
            if bounds[left].intersects(bounds[right]) { overlaps += 1; assert!(positions[left] < positions[right], "overlap {left}->{right}"); }
        }
    }
    assert!(overlaps > primitives.len());
    for grid in [1., 0.1, 1. / 128.] { assert_eq!(canvas_segment_order(&primitives, grid), order, "grid={grid}"); }
    let mut cache = UiBatchOrderCache::default();
    let first = cache.build(primitives.clone());
    assert_eq!(first.primitives.iter().map(|p| p.color[0] as usize).collect::<Vec<_>>(), order);
    primitives[20].rect[0] += 14.; primitives[30].rotation_radians += 0.3;
    let expected = UiBatchPlan::build(primitives.clone()); let actual = cache.build(primitives);
    assert_eq!(actual.batches.len(), expected.batches.len());
    for (actual, expected) in actual.primitives.iter().zip(&expected.primitives) { assert_eq!(format!("{actual:?}"), format!("{expected:?}")); }
}

#[test]
fn dense_overlapping_canvas_retains_the_bounded_order_fallback() {
    let mut primitives = dense_primitives(20_000);
    for primitive in &mut primitives { primitive.rect = [0., 0., 10., 10.]; primitive.rotation_radians = 0.; }
    assert_eq!(canvas_segment_order(&primitives, 0.1), (0..primitives.len()).collect::<Vec<_>>());
}

#[test]
fn dense_canvas_gpu_pixels_match_original_paint_order_with_and_without_stencil() {
    use crate::{ClearColor, FrameCamera, FrameLighting, RenderFrame, RenderTarget, Renderer};
    use glam::{Mat4, Vec3};
    use winit::dpi::PhysicalSize;
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(256, 128))).expect("GPU for dense Canvas ordering");
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let target = renderer.create_offscreen_target(PhysicalSize::new(256, 128));
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    let render = |renderer: &mut Renderer, plan: &UiBatchPlan| {
        renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0.1, g: 0.2, b: 0.3, a: 1. }, camera, objects: &[], lighting: &lighting, ui: Some(plan), scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
        renderer.read_offscreen_rgba8(&target).unwrap()
    };
    for masked in [false, true] {
        let mut primitives = dense_primitives(8192);
        for (index, primitive) in primitives.iter_mut().enumerate() {
            primitive.rect = primitive.rect.map(|value| value / 6.);
            primitive.color = [0.2 + (index % 3) as f32 * 0.3, 0.1 + (index % 7) as f32 * 0.1, 0.7, 0.35];
            if masked { primitive.key.stencil = UiStencilMode::Test { reference: 1 }; }
        }
        if masked {
            let mut push = UiPrimitive::solid([8., 8., 240., 112.], [1.; 4]); push.key.canvas_group = Some(3); push.canvas_sorting_grid_size = Some(0.1); push.key.stencil = UiStencilMode::Push { reference: 0 };
            let mut pop = push.clone(); pop.key.stencil = UiStencilMode::Pop { reference: 1 };
            primitives.insert(0, push); primitives.push(pop);
        }
        let original = UiBatchPlan::from_ordered(primitives.clone()); let optimized = UiBatchPlan::build(primitives);
        assert!(optimized.batches.len() < original.batches.len());
        assert_eq!(optimized.primitives.len(), original.primitives.len());
        let expected = render(&mut renderer, &original); let actual = render(&mut renderer, &optimized);
        assert!(actual == expected, "dense Canvas pixels differ masked={masked}");
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}
