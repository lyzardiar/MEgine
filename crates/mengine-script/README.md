# ScriptHost runtimes

Editor Play and the standalone Player share `ScriptHost`, `engine_api.js` and native effect validation. Both default to V8 through rusty_v8 152.2.0. Runtime selection does not change project JavaScript or network protocols. Online games retain server-authoritative snapshots; selecting the same VM alone does not guarantee independent simulations are bitwise deterministic.

```powershell
node scripts/prepare-native-build.mjs
cargo test -p mengine-script
cargo build --release -p mengine-runtime -p mengine-editor-tauri --features mengine-editor-tauri/custom-protocol
```

Build the editor frontend using the repository's normal editor build workflow before packaging the executable. V8 downloads its platform-specific prebuilt native library during the first build. The SDK, CLI source builds and desktop dev entry automatically prepare Windows cross-drive `gn_root` junctions without administrator permissions. Run `npm run prepare:native` before raw Cargo commands. Preparation respects Cargo's target directory and the `CARGO_BUILD_TARGET` environment variable; configure an explicit cross-compilation target through that variable. Existing unrelated directories are rejected rather than replaced.

For QuickJS fallback, select it at every top-level package being built:

```powershell
$env:MENGINE_SCRIPT_RUNTIME = 'quickjs'
cargo test -p mengine-script --no-default-features --features quickjs-runtime
cargo build --release -p mengine-runtime --no-default-features --features quickjs-runtime
npm --prefix packages/editor run tauri:build -- --no-default-features --features quickjs-runtime
```

`MENGINE_SCRIPT_RUNTIME` controls the CLI/SDK build scripts; raw Cargo uses its feature arguments. The two backend features are mutually exclusive, so `--all-features` is intentionally invalid. Remove the environment override to restore default SDK builds. `mengine-runtime --runtime-info` prints the actual compiled VM version and bridge version without opening a window. SDK preparation verifies both Debug and Release binaries, including with `--skip-build`; the editor rejects SDK runtime identities that differ from its Play runtime. Source exports inherit the editor's selected backend, and the CLI verifies supplied Players when an editor specifies the backend.

The V8 adapter provides all nine native callbacks: asset nodes, storage, network, world commands, sprite batches, runtime requests, revision, entity queries and snapshots. It preserves exact string entity IDs and uses the same JSON number roundtrip parsing as QuickJS. JSON storage and incoming network snapshots retain the original IEEE-754 values.

Each host owns one isolate and one sleeping deadline thread. Idle isolates remain exited so hosts can be used and destroyed in any order on their owning thread. A process-wide V8 platform survives individual hosts. Script deadlines remain one second, with three seconds for the initial tick. Termination and disarming share a lock; cancellation happens after JavaScript scopes unwind. Failed eval, input, snapshot and tick calls discard pending world commands and runtime requests. Synchronous microtask behavior matches the existing QuickJS host: promise jobs are not automatically drained.

The managed heap limit is 256 MiB with a fixed 64 MiB termination reserve. ArrayBuffer backing stores have a separate 256 MiB quota. A managed-heap limit failure retires the host; recreate it before further execution. These are resource protections for trusted project scripts, not process isolation or a total process-memory limit. V8 may still abort on allocations it cannot satisfy before termination unwinds; native callbacks and OS I/O cannot be interrupted by a JavaScript deadline.

`runtime_tests.rs` exercises multiple simultaneous hosts, thread-local creation, error/timeout recovery, failed-call isolation, native sprite array limits, and exact storage/TCP number roundtrips. `tests/runtime_limits.rs` checks managed-heap and ArrayBuffer failures in child processes. `examples/script_host_workload.rs` runs the native VM benchmark fixtures through the real host, including publication, storage and production deadlines:

```powershell
cargo run -p mengine-script --features v8-runtime --example script_host_workload -- workload.js 300 600 new-output-directory
```

This runner accepts trusted fixtures defining `benchmarkReset`, `benchmarkStep` and `benchmarkResult`. It creates a new output directory, saves final state through project storage and records callback timings. It does not measure viewport FPS or prove two-machine multiplayer acceptance. Native Editor and Player acceptance results are recorded in `runtime-validation.json`.
