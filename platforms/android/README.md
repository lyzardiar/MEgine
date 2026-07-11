# Android Player (stub)

MEngine Android player will link `mengine-runtime` via `android-activity` / JNI.

## Planned layout

```
platforms/android/
  app/                 # Gradle app shell
  mengine-jni/         # JNI glue calling Rust
```

## Build (future)

```bash
cargo ndk -t arm64-v8a -o app/src/main/jniLibs build -p mengine-runtime
```

PC editor remains the authoring environment; devices run exported player packs only in Phase 3.
