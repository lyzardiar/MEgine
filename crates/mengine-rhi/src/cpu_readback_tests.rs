// Author: MiYu. Verify complete GPU readback bytes and retained-frame isolation with reusable CPU capacity.
use super::*;
use super::tests::readback_fixture;
use crate::recycle_readback_rgba;

#[test]
fn reusable_readback_matches_owned_pixels_for_all_formats_sizes_and_channels() {
    let renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    for format in [wgpu::TextureFormat::Rgba8Unorm, wgpu::TextureFormat::Rgba8UnormSrgb, wgpu::TextureFormat::Bgra8Unorm, wgpu::TextureFormat::Bgra8UnormSrgb] {
        for (width, height) in [(1,2), (63,3), (64,3), (65,2), (129,7), (31,1)] { for seed in [3,29] {
            let (target, expected) = readback_fixture(&renderer, width, height, format, seed);
            let (owned, _) = renderer.read_offscreen_rgba8_profiled(&target).unwrap();
            let (pooled, _) = renderer.begin_offscreen_rgba8_profiled(&target).unwrap().finish_reusing_rgba().unwrap();
            assert_eq!(owned, expected); assert_eq!(pooled, expected, "{width}x{height} {format:?} seed {seed}");
            recycle_readback_rgba(pooled);
        }}
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}

#[test]
fn retained_pixels_stay_unchanged_while_other_tickets_finish_and_recycle() {
    let renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    let (first, expected_first) = readback_fixture(&renderer, 65, 5, wgpu::TextureFormat::Rgba8Unorm, 7);
    let (second, expected_second) = readback_fixture(&renderer, 31, 7, wgpu::TextureFormat::Bgra8Unorm, 23);
    let first_ticket = renderer.begin_offscreen_rgba8_profiled(&first).unwrap();
    let second_ticket = renderer.begin_offscreen_rgba8_profiled(&second).unwrap();
    let (later, _) = second_ticket.finish_reusing_rgba().unwrap(); let (retained, _) = first_ticket.finish_reusing_rgba().unwrap();
    assert_eq!(later, expected_second); assert_eq!(retained, expected_first); assert_ne!(later.as_ptr(), retained.as_ptr());
    recycle_readback_rgba(later);
    for _ in 0..6 {
        let (next, _) = renderer.begin_offscreen_rgba8_profiled(&second).unwrap().finish_reusing_rgba().unwrap();
        assert_eq!(next, expected_second); assert_ne!(next.as_ptr(), retained.as_ptr()); assert_eq!(retained, expected_first);
        recycle_readback_rgba(next);
    }
    let pool = Arc::downgrade(&renderer.offscreen_readback); drop(renderer);
    assert!(pool.upgrade().is_none(), "CPU capacity must not retain the GPU readback pool"); assert_eq!(retained, expected_first);
    recycle_readback_rgba(retained);
}

#[test]
#[ignore = "manual real GPU readback packing comparison against fresh owned allocations"]
fn benchmark_reusable_cpu_readback() {
    let renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    for format in [wgpu::TextureFormat::Rgba8Unorm, wgpu::TextureFormat::Bgra8Unorm] {
        for (width,height) in [(920,518),(1280,720),(1920,1080)] {
            let (target,expected) = readback_fixture(&renderer,width,height,format,17);
            let mut pack = [Vec::new(),Vec::new()]; let mut finish = [Vec::new(),Vec::new()];
            for round in 0..11 { for mode in [round%2,1-round%2] {
                let mut pack_ms = 0.; let mut finish_ms = 0.;
                for _ in 0..20 {
                    let ticket = renderer.begin_offscreen_rgba8_profiled(&target).unwrap(); let started = Instant::now();
                    let (pixels,profile) = if mode == 0 {ticket.finish().unwrap()} else {ticket.finish_reusing_rgba().unwrap()};
                    finish_ms += started.elapsed().as_secs_f64()*1000.; pack_ms += profile.rgba_pack_ms;
                    assert!(pixels == expected, "complete readback must match");
                    if mode == 1 {recycle_readback_rgba(pixels);}
                }
                if round>=2 {pack[mode].push(pack_ms/20.);finish[mode].push(finish_ms/20.);}
            }}
            println!("CPU_RGBA_READBACK={{\"width\":{width},\"height\":{height},\"format\":\"{format:?}\",\"pack_ms\":{pack:?},\"finish_ms\":{finish:?},\"warmups\":2,\"iterations\":20,\"scope\":\"real mapped GPU pixels; fresh versus recycled CPU capacity; excludes rendering, IPC and FPS\"}}");
        }
    }
}
