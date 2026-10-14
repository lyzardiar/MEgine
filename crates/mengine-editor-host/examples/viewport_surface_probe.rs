//! Author: MiYu. Compare native submission and readback using one fixed Play world.
use anyhow::{Context, Result};
use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{EditorPlayRuntime, EditorViewportFrame, EditorViewportProfile, EditorViewportRenderer, PlayProject, ProjectSession, ScriptInput};
use serde_json::json;
use std::{path::PathBuf, sync::Arc, time::Instant};
use winit::{application::ApplicationHandler, dpi::PhysicalSize, event::WindowEvent, event_loop::{ActiveEventLoop, ControlFlow, EventLoop}, window::{Window, WindowId}};

struct Probe {
    root: PathBuf,
    output: PathBuf,
    visible: bool,
    sample_frames: usize,
    world: mengine_scene::SharedSnapshotWorld,
    window: Option<Arc<Window>>,
    native: Option<EditorViewportRenderer>,
    headless: Option<EditorViewportRenderer>,
    stage: usize,
    frame: usize,
    profiles: Vec<serde_json::Value>,
    samples: [Vec<f64>; 2],
    error: Option<String>,
}

fn summary(samples: &[f64]) -> serde_json::Value {
    let mut sorted = samples.to_vec(); sorted.sort_by(f64::total_cmp);
    json!({ "count": sorted.len(), "meanMs": sorted.iter().sum::<f64>() / sorted.len() as f64, "p50Ms": sorted[sorted.len()/2], "p95Ms": sorted[sorted.len()*95/100] })
}

fn memory(profile: &EditorViewportProfile, name: &str) -> u64 { profile.memory.iter().find(|entry| entry.name == name).unwrap().bytes }

fn compare(a: &EditorViewportFrame, b: &EditorViewportFrame) -> Result<serde_json::Value> {
    anyhow::ensure!((a.width, a.height) == (b.width, b.height) && a.rgba.len() == b.rgba.len(), "capture dimensions differ");
    let changed = a.rgba.chunks_exact(4).zip(b.rgba.chunks_exact(4)).filter(|(a, b)| a != b).count();
    anyhow::ensure!(changed as f64 <= (a.width * a.height) as f64 * 0.005, "surface/offscreen pixel mismatch: {changed} pixels");
    Ok(json!({ "width": a.width, "height": a.height, "changedPixels": changed, "totalPixels": a.width * a.height }))
}

impl Probe {
    fn initialize(&mut self, event_loop: &ActiveEventLoop) -> Result<()> {
        // Keep initialization hidden; the visible pass measures the surface outside occlusion throttling.
        let window = Arc::new(event_loop.create_window(Window::default_attributes().with_title("MEngine surface probe").with_inner_size(PhysicalSize::new(1225, 689)).with_visible(false).with_active(false))?);
        self.native = Some(pollster::block_on(EditorViewportRenderer::new_for_window(self.root.clone(), window.clone()))?);
        self.headless = Some(pollster::block_on(EditorViewportRenderer::new(self.root.clone(), 1225, 689))?);
        self.window = Some(window);
        println!("Viewport renderers initialized");
        Ok(())
    }

    fn tick(&mut self) -> Result<bool> {
        let started = Instant::now();
        let renderer = if self.stage == 0 { self.headless.as_mut().unwrap() } else { self.native.as_mut().unwrap() };
        let stage = self.stage;
        let profile = if stage == 0 { renderer.render_game(self.world.world(), 1225, 689)?.profile }
            else { renderer.present_game(self.world.world(), 1225, 689)?.profile };
        if stage == 1 {
            anyhow::ensure!(memory(&profile, "CPU readback RGBA") == 0 && memory(&profile, "GPU readback staging") == 0, "direct presentation allocated readback storage");
            anyhow::ensure!(memory(&profile, "GPU offscreen color") == 0 && memory(&profile, "GPU surface color") == 1225 * 689 * 4, "direct presentation memory did not describe its actual target");
            anyhow::ensure!(profile.gpu.is_none(), "unread GPU timestamps must not be reported as completed measurements");
        }
        if self.frame >= 30 { self.samples[stage].push(started.elapsed().as_secs_f64() * 1000.0); }
        self.frame += 1;
        if self.frame < 30 + self.sample_frames { return Ok(false); }
        self.profiles.push(serde_json::to_value(profile)?);
        println!("Stage {} complete: {}", self.stage, summary(&self.samples[stage]));
        self.stage += 1; self.frame = 0;
        if self.stage < 2 { self.window.as_ref().unwrap().set_visible(self.visible); return Ok(false); }
        self.verify()?;
        Ok(true)
    }

    fn verify(&mut self) -> Result<()> {
        let renderer = self.native.as_mut().unwrap();
        let world = self.world.world();
        let results = {
                anyhow::ensure!(renderer.present_game(world, 0, 689).is_err(), "zero-sized presentation must be rejected");
                let mut comparisons = Vec::new();
                for (index, [width, height]) in [[1225, 689], [777, 433], [1225, 689]].into_iter().enumerate() {
                    let window = self.window.as_ref().unwrap();
                    let _ = window.request_inner_size(PhysicalSize::new(width, height));
                    anyhow::ensure!(window.inner_size() == PhysicalSize::new(width, height), "window resize has not completed; run the probe on a synchronous window-size platform");
                    renderer.present_game(world, width, height)?;
                    let capture = renderer.present_game_with_capture(world, width, height)?;
                    let offscreen = renderer.render_game(world, width, height)?;
                    comparisons.push(compare(&capture, &offscreen)?);
                    if index == 0 {
                        image::save_buffer(self.output.join("surface.png"), &capture.rgba, width, height, image::ColorType::Rgba8)?;
                        image::save_buffer(self.output.join("offscreen.png"), &offscreen.rgba, width, height, image::ColorType::Rgba8)?;
                    }
                    // A differently sized capture must not corrupt the window's next frame.
                    renderer.render_game(world, 319, 177)?;
                    let presented = renderer.present_game(world, width, height)?;
                    anyhow::ensure!(memory(&presented.profile, "CPU readback RGBA") == 0, "presentation copied CPU pixels after capture");
                    anyhow::ensure!(memory(&presented.profile, "GPU offscreen color") == 319 * 177 * 4 && memory(&presented.profile, "GPU surface color") == u64::from(width) * u64::from(height) * 4, "capture and surface memory dimensions were conflated");
                }
                comparisons
        };
        let headless = self.headless.as_mut().unwrap();
        anyhow::ensure!(headless.present_game(world, 1225, 689).is_err() && headless.present_game_with_capture(world, 1225, 689).is_err(), "headless host accepted a window request");
        headless.render_game(world, 64, 64)?;
        let report = json!({ "passed": true, "hiddenWindow": !self.visible, "fixedPlayWorld": true, "timingScope": "CPU call wall time including submission/backpressure; not physical scanout or equal-latency end-to-end FPS", "warmupFrames": 30, "readback": summary(&self.samples[0]), "surface": summary(&self.samples[1]), "comparisons": results, "profiles": self.profiles });
        std::fs::write(self.output.join("report.json"), serde_json::to_vec_pretty(&report)?)?;
        println!("{}", json!({ "passed": true, "readback": report["readback"], "surface": report["surface"], "comparisons": report["comparisons"] }));
        Ok(())
    }
}

impl ApplicationHandler for Probe {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() { return; }
        if let Err(error) = self.initialize(event_loop) { self.error = Some(format!("{error:#}")); event_loop.exit(); }
    }
    fn window_event(&mut self, event_loop: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        if matches!(event, WindowEvent::CloseRequested) { self.error = Some("probe window closed before acceptance".into()); event_loop.exit(); }
    }
    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if self.native.is_none() || self.error.is_some() { return; }
        match self.tick() { Ok(true) => event_loop.exit(), Ok(false) => {}, Err(error) => { self.error = Some(format!("{error:#}")); event_loop.exit(); } }
    }
}

fn main() -> Result<()> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    anyhow::ensure!(args.len() >= 2 && args[2..].iter().all(|arg| arg == "--hidden" || arg.starts_with("--frames=")), "Usage: viewport_surface_probe <Frost project root> <output directory> [--hidden] [--frames=180]");
    let sample_frames = args[2..].iter().find_map(|arg| arg.strip_prefix("--frames=")).unwrap_or("180").parse::<usize>()?;
    anyhow::ensure!((1..=10000).contains(&sample_frames), "sample frame count must be between 1 and 10000");
    let root = std::fs::canonicalize(&args[0])?; let output = PathBuf::from(&args[1]); std::fs::create_dir_all(&output)?;
    let mut project = ProjectSession::open(&root)?; project.open_main_scene()?;
    let manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("project.json"))?)?;
    let source = std::fs::read_to_string(root.join(manifest["startupScript"].as_str().context("startupScript missing")?))?;
    let runtime = EditorPlayRuntime::default(); let generation = runtime.begin();
    runtime.start(generation, source, WorldSnapshot::from_world(project.active_world()), PlayProject { root: Some(root.clone()), scene: manifest["mainScene"].as_str().unwrap_or_default().into(), name: "Surface probe".into(), ..PlayProject::default() }).map_err(anyhow::Error::msg)?;
    let mut snapshot = None;
    for frame in 0..3 {
        let mut input = ScriptInput { viewport: [1920, 1080], ..ScriptInput::default() }; if frame == 1 { input.key("F8".into(), true); }
        snapshot = Some(runtime.advance(generation, None, input, 0.001).map_err(anyhow::Error::msg)?);
    }
    let mut world = mengine_scene::SharedSnapshotWorld::default(); world.update_owned(snapshot.unwrap()); runtime.stop();
    let mut probe = Probe { root, output, visible: !args.iter().any(|arg| arg == "--hidden"), sample_frames, world, window: None, native: None, headless: None, stage: 0, frame: 0, profiles: Vec::new(), samples: [Vec::new(), Vec::new()], error: None };
    let event_loop = EventLoop::new()?; event_loop.set_control_flow(ControlFlow::Poll); event_loop.run_app(&mut probe)?;
    if let Some(error) = probe.error { anyhow::bail!(error); }
    anyhow::ensure!(probe.stage == 2, "probe did not finish");
    Ok(())
}
