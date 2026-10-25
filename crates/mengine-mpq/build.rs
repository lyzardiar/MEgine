// Author: MiYu. Build the pinned, unmodified StormLib sources as a static dependency.
use std::{env, path::PathBuf};

fn main() {
    let source = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("../../third_party/stormlib/source");
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed=src/shim.cpp");
    let windows = env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows");
    let built = cmake::Config::new(&source).profile("Release").define("BUILD_SHARED_LIBS", "OFF").define("STORM_BUILD_TESTS", "OFF").define("STORM_USE_BUNDLED_LIBRARIES", "ON").define("STORM_UNICODE", if windows { "ON" } else { "OFF" }).define("CMAKE_POSITION_INDEPENDENT_CODE", "ON").build();
    let mut shim = cc::Build::new();
    shim.cpp(true).file("src/shim.cpp").include(source.join("src")).define("__STORMLIB_NO_STATIC_LINK__", None);
    if windows { shim.define("UNICODE", None).define("_UNICODE", None); }
    shim.compile("mengine_mpq_shim");
    println!("cargo:rustc-link-search=native={}", built.join("lib").display());
    println!("cargo:rustc-link-lib=static={}", if windows { "StormLib" } else { "storm" });
    if windows { println!("cargo:rustc-link-lib=wininet"); println!("cargo:rustc-link-lib=user32"); }
}
