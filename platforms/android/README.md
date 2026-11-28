# Android Player

Active mobile target for MEngine using **Rust native core (`mengine-runtime`) + V8 script engine + Vulkan (with GLES fallback) + Kotlin/Gradle host**.

## Layout
```
platforms/android/
  settings.gradle.kts
  build.gradle.kts
  app/
    build.gradle.kts
    src/main/AndroidManifest.xml
    src/main/java/com/mengine/player/
      MEngineBridge.kt    # JNI bindings to libmengine_runtime.so
      MainActivity.kt     # SurfaceHolder, Choreographer, WindowInsets, Multi-Touch
```

## Build Rust Native Library (arm64-v8a)
```bash
cargo ndk -t arm64-v8a -o platforms/android/app/src/main/jniLibs build -p mengine-runtime --release --no-default-features --features v8-runtime
```

Rust C-ABI lifecycle/touch entry points live in `crates/mengine-runtime/src/android_entry.rs` backed by `crates/mengine-platform`.
