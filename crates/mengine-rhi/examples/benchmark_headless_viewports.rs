//! MiYu: measure initialization and process-private memory while independent viewports remain alive.
use mengine_rhi::Renderer;
use std::time::Instant;
use winit::dpi::PhysicalSize;

fn private_bytes() -> Option<u64> {
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        let result = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", &format!("(Get-Process -Id {}).PrivateMemorySize64", std::process::id())]).creation_flags(0x08000000).output().ok()?;
        if !result.status.success() { return None; }
        String::from_utf8(result.stdout).ok()?.trim().parse().ok()
    }
    #[cfg(not(windows))] { None }
}

fn report(stage: &str, count: usize, elapsed_ms: f64) {
    let bytes = private_bytes().map_or_else(|| "null".to_owned(), |bytes| bytes.to_string());
    println!("{{\"stage\":\"{stage}\",\"renderers\":{count},\"initializationMs\":{elapsed_ms},\"privateBytes\":{bytes}}}");
}

fn main() {
    let shared = match std::env::args().nth(1).as_deref() { None | Some("isolated") => false, Some("shared") => true, _ => panic!("expected isolated or shared") };
    report("before", 0, 0.0);
    let mut renderers = Vec::new();
    for _ in 0..3 {
        let started = Instant::now();
        let renderer = if shared { Renderer::new_shared_headless(PhysicalSize::new(1280, 720)) } else { pollster::block_on(Renderer::new_headless(PhysicalSize::new(1280, 720))) }.unwrap();
        let elapsed = started.elapsed().as_secs_f64() * 1000.0;
        renderers.push(renderer);
        report("initialized", renderers.len(), elapsed);
    }
    drop(renderers);
    report("released", 0, 0.0);
}
