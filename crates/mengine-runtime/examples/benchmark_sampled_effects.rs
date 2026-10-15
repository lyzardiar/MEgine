// Author: MiYu. Measure shared effect instances without scripts, GPU work or frame pacing.
use glam::Vec3;
use mengine_core::{generated::{SampledEffect, Transform}, TransformHierarchy, World};
use mengine_rhi::{FrameCamera, FrameLighting};
use mengine_runtime::sampled_effects::SampledEffectWorld;
use sha2::{Digest, Sha256};
use std::{path::PathBuf, time::{Instant, SystemTime}};

struct Fixture(PathBuf);
impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

fn main() -> anyhow::Result<()> {
    let instances: usize = std::env::args().nth(1).unwrap_or_else(|| "2000".into()).parse()?;
    let iterations: usize = std::env::args().nth(2).unwrap_or_else(|| "60".into()).parse()?;
    anyhow::ensure!(instances > 0 && iterations > 0, "counts must be positive");
    let fixture = Fixture(std::env::temp_dir().join(format!("mengine-effect-benchmark-{}-{}", std::process::id(), SystemTime::now().duration_since(SystemTime::UNIX_EPOCH)?.as_nanos())));
    std::fs::create_dir_all(fixture.0.join("Assets"))?;
    let particle = serde_json::json!({"material":0,"position":[0,0,0],"size":1,"color":[1,1,1,1],"uv":[0,0,1,1]});
    let asset = serde_json::json!({"schemaVersion":1,"fps":12,"materials":[{"texture":"Assets/s.png","blend":"alpha"}],"clips":[{"name":"Stand","duration":1,"loop":true,"frames":[{"seconds":0,"particles":[particle],"quads":[],"lights":[]},{"seconds":1,"particles":[particle],"quads":[],"lights":[]}]}]});
    std::fs::write(fixture.0.join("Assets/shared.mfx"), asset.to_string())?;
    let mut world = World::new();
    for index in 0..instances {
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform { position: [(index % 8) as f32 * 0.01, 0., 0.], ..Transform::default() });
        world.insert_component(entity, SampledEffect { effect: "Assets/shared.mfx".into(), ..SampledEffect::default() });
    }
    let hierarchy = TransformHierarchy::build(&world);
    let camera = FrameCamera { view: mengine_rhi::look_at(Vec3::new(0., 0., 10.), Vec3::ZERO, Vec3::Y), proj: mengine_rhi::orthographic(10., 1., 0.1, 100.), position: Vec3::new(0., 0., 10.) };
    let mut effects = SampledEffectWorld::default(); effects.set_project_root(Some(&fixture.0));
    let mut samples = Vec::new(); let mut signature = String::new();
    for iteration in 0..iterations + 2 {
        let started = Instant::now();
        let output = effects.collect(&world, &hierarchy, camera, 0., &mut FrameLighting::default());
        let elapsed = started.elapsed().as_secs_f64() * 1000.;
        anyhow::ensure!(output.len() == instances && effects.failures.is_empty(), "effect output changed");
        if iteration >= 2 { samples.push(elapsed); }
        if iteration == iterations + 1 { signature = format!("{:x}", Sha256::digest(format!("{output:?}").as_bytes())); }
    }
    samples.sort_by(f64::total_cmp);
    println!("{}", serde_json::json!({"scope":"CPU sampled effect collection; shared synthetic resource, no GPU or gameplay FPS", "instances":instances,"iterations":iterations,"medianMs":samples[iterations / 2],"p95Ms":samples[((iterations as f64 * 0.95).ceil() as usize - 1).min(iterations - 1)],"outputSha256":signature,"samplesMs":samples}));
    Ok(())
}
