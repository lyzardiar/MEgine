use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let sdk = manifest_dir.join("../../third_party/effekseer-1.80.6/Effekseer");
    let cmake = sdk.join("CMakeLists.txt");
    let source = fs::read_to_string(&cmake).expect("vendored Effekseer CMakeLists.txt");
    let sources = effekseer_sources(&source);

    let mut build = cc::Build::new();
    build.cpp(true).std("c++17").include(&sdk);
    build.file(manifest_dir.join("native/bridge.cpp"));
    for source in &sources {
        build.file(sdk.join(source));
    }
    if build.get_compiler().is_like_msvc() {
        build.flag("/utf-8").define("_CRT_SECURE_NO_WARNINGS", None);
    }
    build.compile("mengine_effekseer_native");

    println!("cargo:rerun-if-changed={}", cmake.display());
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("native/bridge.cpp").display()
    );
    println!("cargo:rerun-if-changed={}", sdk.display());
    if cfg!(target_os = "windows") {
        println!("cargo:rustc-link-lib=ws2_32");
    }
}

fn effekseer_sources(cmake: &str) -> Vec<PathBuf> {
    let start = cmake
        .find("set(effekseer_src")
        .expect("Effekseer source list start");
    let body = &cmake[start..];
    // The vendored SDK may be checked out with LF or CRLF line endings.
    // Locate the next CMake command instead of depending on blank-line bytes.
    let end = body.find("add_library").expect("Effekseer source list end");
    let sources = body[..end]
        .split_whitespace()
        .filter(|token| token.ends_with(".cpp"))
        .map(|token| Path::new(token.trim_end_matches(')')).to_owned())
        .collect::<Vec<_>>();
    assert!(
        sources.len() >= 50,
        "Effekseer core source list is incomplete"
    );
    sources
}
