// Author: MiYu. Verify bounded material polling deadlines and real source refresh behavior.
use super::*;

#[test]
fn material_phases_spread_continuous_checks_and_keep_expired_sources_due() {
    let epoch = Instant::now() + Duration::from_secs(1);
    let phases = (0..256).map(|index| Duration::from_nanos(index * 250_000_000 / 256)).collect::<Vec<_>>();
    let mut checked = vec![epoch; phases.len()]; let mut before = checked.clone();
    let mut deadlines = phases.iter().map(|phase| next_material_check(epoch, *phase, epoch)).collect::<Vec<_>>();
    let (mut checks, mut baseline, mut peak) = (0, 0, 0);
    for frame in 1..=120 {
        let now = epoch + Duration::from_nanos(frame * 1_000_000_000 / 60); let mut frame_checks = 0;
        for (index, phase) in phases.iter().enumerate() {
            if now >= deadlines[index] { assert!(now.duration_since(checked[index]) <= ASSET_CHECK_INTERVAL + Duration::from_millis(17)); checked[index] = now; deadlines[index] = next_material_check(epoch, *phase, now); checks += 1; frame_checks += 1; }
            if now.duration_since(before[index]) >= ASSET_CHECK_INTERVAL { before[index] = now; baseline += 1; }
        }
        peak = peak.max(frame_checks);
    }
    assert_eq!(checks, baseline); assert!(peak < phases.len() / 4);
    let resumed = epoch + Duration::from_secs(5);
    assert!(deadlines.iter().all(|deadline| *deadline <= resumed));
    assert!(phases.iter().all(|phase| { let deadline = next_material_check(epoch, *phase, resumed); deadline > resumed && deadline <= resumed + ASSET_CHECK_INTERVAL }));
    println!("MATERIAL_POLL_PHASE checks={checks} baselineChecks={baseline} peak={peak} synchronizedPeak={}", phases.len());
}

#[test]
fn material_phase_boundaries_preserve_fresh_reads_and_path_determinism() {
    let epoch = Instant::now() + Duration::from_secs(1); let phase = Duration::from_millis(33);
    let read = next_material_check(epoch, phase, epoch); assert_eq!(read, epoch + phase);
    assert_eq!(next_material_check(epoch, phase, read), read + ASSET_CHECK_INTERVAL);
    assert_eq!(next_material_check(epoch, phase, read + ASSET_CHECK_INTERVAL - Duration::from_micros(1)), read + ASSET_CHECK_INTERVAL);
    let resumed = epoch + Duration::from_secs(10); let deadline = next_material_check(epoch, phase, resumed);
    assert!(deadline > resumed && deadline <= resumed + ASSET_CHECK_INTERVAL);
    for offset in 0..1000 { let phase = Duration::from_nanos(offset * 249_999); for period in [0, 1, 4, 1000] { let now = epoch + ASSET_CHECK_INTERVAL * period + phase; let deadline = next_material_check(epoch, phase, now); assert!(deadline > now && deadline <= now + ASSET_CHECK_INTERVAL); } }
    for key in ["Assets/材质 空格.mmat", "Assets/Unit.minst", "Assets/Surface.mshader"] { let path = Path::new(key); assert_eq!(material_check_phase(path), material_check_phase(path)); assert!(material_check_phase(path) < ASSET_CHECK_INTERVAL); }
}

struct PollFixture(PathBuf);
impl PollFixture {
    fn new() -> Self { let root = std::env::temp_dir().join(format!("mengine-material-poll-{}", uuid::Uuid::new_v4())); std::fs::create_dir_all(root.join("Assets")).unwrap(); Self(root) }
    fn write(&self, name: &str, contents: &str) { std::fs::write(self.0.join("Assets").join(name), contents).unwrap(); }
}
impl Drop for PollFixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

#[test]
fn phased_material_instance_and_shader_sources_keep_invalidation_and_failure_recovery() {
    let fixture = PollFixture::new();
    let material = |color| format!(r#"{{"version":10,"shader":"custom","custom_shader":"Assets/Surface.mshader","base_color":{color}}}"#);
    let shader = "fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return color; }";
    fixture.write("Base.mmat", &material("[1,0,0,1]")); fixture.write("Surface.mshader", shader); fixture.write("Child.minst", r#"{"version":2,"parent":"Assets/Base.mmat","overrides":{"roughness":0.2}}"#);
    let mut cache = RuntimeMaterialCache::new(Some(fixture.0.clone()));
    let first = cache.resolve_shared("Assets/Child.minst").unwrap(); assert_eq!(first.base_color, [1.,0.,0.,1.]); assert!(!first.is_error);
    fixture.write("Base.mmat", &material("[0,0,1,1]")); cache.invalidate("Assets/Base.mmat");
    let current = cache.resolve_shared("Assets/Child.minst").unwrap(); assert_eq!(current.base_color, [0.,0.,1.,1.]); assert_eq!(first.base_color, [1.,0.,0.,1.]);
    fixture.write("Surface.mshader", "invalid shader"); cache.invalidate("Assets/Surface.mshader"); assert!(cache.resolve_shared("Assets/Child.minst").unwrap().is_error);
    fixture.write("Surface.mshader", shader); cache.invalidate("Assets/Surface.mshader"); assert!(!cache.resolve_shared("Assets/Child.minst").unwrap().is_error);
    std::fs::remove_file(fixture.0.join("Assets/Base.mmat")).unwrap(); for entry in cache.materials.values_mut() { entry.next_check_at -= ASSET_CHECK_INTERVAL; }
    assert!(cache.resolve_shared("Assets/Child.minst").unwrap().is_error);
    fixture.write("Base.mmat", &material("[0,1,0,1]")); cache.invalidate("Assets/Base.mmat");
    assert_eq!(cache.resolve_shared("Assets/Child.minst").unwrap().base_color, [0.,1.,0.,1.]); assert!(cache.diagnostics().is_empty());
}

#[test]
#[ignore = "manual continuous material polling cost on a preserved map scene"]
fn benchmark_phased_material_checks() {
    let root = std::env::var_os("MENGINE_POLL_PROJECT").map(PathBuf::from).unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms"));
    let scene = std::env::var_os("MENGINE_POLL_SCENE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("Assets/Maps/amazonia/Scenes/Main.mscene"));
    let input: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(&scene)).unwrap()).unwrap();
    let keys = input["world"]["entities"].as_array().unwrap().iter().filter_map(|entity| entity["components"]["MeshRenderer"]["material"].as_str()).filter(|key| is_material_path(key)).collect::<std::collections::BTreeSet<_>>();
    assert!(keys.len() >= 32);
    let mut caches = [RuntimeMaterialCache::new(Some(root.clone())), RuntimeMaterialCache::new(Some(root.clone()))]; caches[0].synchronized_asset_checks = true;
    for key in &keys { let before = caches[0].resolve_shared(key).unwrap(); let after = caches[1].resolve_shared(key).unwrap(); assert!(!before.is_error && !after.is_error, "{key}"); assert_eq!(format!("{before:?}"), format!("{after:?}")); }
    let mut samples = [Vec::new(), Vec::new()]; let mut checks = [Vec::new(), Vec::new()]; let start = Instant::now();
    for frame in 0..180 {
        let deadline = start + Duration::from_nanos(frame * 1_000_000_000 / 60); if let Some(delay) = deadline.checked_duration_since(Instant::now()) { std::thread::sleep(delay); }
        for mode in if frame % 2 == 0 { [0,1] } else { [1,0] } {
            let cache = &mut caches[mode]; let previous = cache.asset_checks;
            let began = Instant::now(); for key in &keys { std::hint::black_box(cache.resolve_shared(key)); } let ms = began.elapsed().as_secs_f64() * 1000.;
            if frame >= 30 { samples[mode].push(ms); checks[mode].push(cache.asset_checks - previous); }
        }
    }
    for key in &keys { assert_eq!(format!("{:?}", caches[0].resolve_shared(key)), format!("{:?}", caches[1].resolve_shared(key))); }
    assert!(caches.iter().all(|cache| cache.diagnostics().is_empty()));
    let mut summary = Vec::new();
    for mode in 0..2 { let mut times = samples[mode].clone(); times.sort_by(f64::total_cmp); summary.push(serde_json::json!({"medianMs":times[times.len()/2],"meanMs":times.iter().sum::<f64>()/times.len() as f64,"p95Ms":times[times.len()*95/100],"maxMs":times.last(),"assetChecks":checks[mode].iter().sum::<usize>(),"peakAssetChecks":checks[mode].iter().max(),"frameMs":samples[mode],"frameAssetChecks":checks[mode]})); }
    println!("MATERIAL_POLL_BENCHMARK={}", serde_json::json!({"root":root,"scene":scene,"keys":keys.len(),"warmupFrames":30,"measuredFrames":150,"periodMs":250,"scopes":"same-process actual source resolves at 60Hz; baseline age polling vs phased polling; no rendering, VM, IPC or native FPS","modes":summary}));
}
