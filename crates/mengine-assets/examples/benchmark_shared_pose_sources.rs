// Author: MiYu. Compare three consumers decoding each source with validated shared acquisition.
use mengine_assets::{GltfPoseSource, SharedGltfPoseSource};
use std::{path::PathBuf, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(&args[1]);
    let paths: Vec<String> = serde_json::from_slice(&std::fs::read(&args[2])?)?;
    let mut rows = Vec::new(); let mut reused = 0; let mut loaded = 0;
    for path in &paths {
        let path = root.join(path);
        let started = Instant::now();
        let independent = (0..3).map(|_| GltfPoseSource::load_in_project(&path, &root).map(|value| value.0)).collect::<Result<Vec<_>, _>>()?;
        let independent_ms = started.elapsed().as_secs_f64() * 1000.;
        let started = Instant::now();
        let shared = (0..3).map(|_| SharedGltfPoseSource::load(&path, &root)).collect::<Result<Vec<_>, _>>()?;
        let shared_ms = started.elapsed().as_secs_f64() * 1000.;
        assert!(!shared[0].reused && shared[1].reused && shared[2].reused);
        assert!(std::sync::Arc::ptr_eq(&shared[0].source, &shared[2].source));
        for (a, b) in independent.iter().zip(&shared) {
            assert_eq!(format!("{:?}", a.sample_nodes(0, 0, 12, None)), format!("{:?}", b.source.sample_nodes(0, 0, 12, None)));
        }
        reused += shared.iter().filter(|entry| entry.reused).count(); loaded += shared.iter().filter(|entry| !entry.reused).count();
        rows.push(serde_json::json!({"path":path,"independentMs":independent_ms,"sharedMs":shared_ms}));
    }
    let independent_ms: f64 = rows.iter().map(|row| row["independentMs"].as_f64().unwrap()).sum();
    let shared_ms: f64 = rows.iter().map(|row| row["sharedMs"].as_f64().unwrap()).sum();
    println!("{}", serde_json::json!({"scope":"Repeated CPU source reads for three consumers; not a cold-cache or gameplay FPS measurement","sources":paths.len(),"independentLoads":paths.len()*3,"sharedLoads":loaded,"reuses":reused,"independentMs":independent_ms,"sharedMs":shared_ms,"nodeResultsEqual":true,"rows":rows}));
    Ok(())
}
