# ScriptHost runtimes

Editor Play and the standalone Player share `ScriptHost`, `engine_api.js` and native effect validation. The default remains QuickJS-NG. The `v8-runtime` Cargo feature selects V8 152.2.0 for both consumers without changing project JavaScript or network protocols.

```powershell
cargo test -p mengine-script --features v8-runtime
cargo test -p mengine-runtime -p mengine-editor-host --lib --features mengine-script/v8-runtime
cargo build --release -p mengine-runtime -p mengine-editor-tauri --features mengine-script/v8-runtime,mengine-editor-tauri/custom-protocol
```

Build the editor frontend using the repository's normal editor build workflow before packaging the executable. V8 downloads its platform-specific prebuilt native library during the first build. On Windows, a registry and target directory on different drives require V8's `gn_root` directory link; developer mode or an equivalent directory junction must be available.

The V8 adapter provides all nine native callbacks: asset nodes, storage, network, world commands, sprite batches, runtime requests, revision, entity queries and snapshots. It preserves exact string entity IDs and uses the same JSON number roundtrip parsing as QuickJS. JSON storage and incoming network snapshots retain the original IEEE-754 values.

Each host owns one isolate and one sleeping deadline thread. Idle isolates remain exited so hosts can be used and destroyed in any order on their owning thread. A process-wide V8 platform survives individual hosts. Script deadlines remain one second, with three seconds for the initial tick. Termination and disarming share a lock; cancellation happens after JavaScript scopes unwind. Failed eval, input, snapshot and tick calls discard pending world commands and runtime requests. Synchronous microtask behavior matches the existing QuickJS host: promise jobs are not automatically drained.

The managed heap limit is 256 MiB with a fixed 64 MiB termination reserve. ArrayBuffer backing stores have a separate 256 MiB quota. A managed-heap limit failure retires the host; recreate it before further execution. These are resource protections for trusted project scripts, not process isolation or a total process-memory limit. V8 may still abort on allocations it cannot satisfy before termination unwinds; native callbacks and OS I/O cannot be interrupted by a JavaScript deadline.

`runtime_tests.rs` exercises multiple simultaneous hosts, thread-local creation, error/timeout recovery, failed-call isolation, native sprite array limits, and exact storage/TCP number roundtrips. `tests/runtime_limits.rs` checks managed-heap and ArrayBuffer failures in child processes. `examples/script_host_workload.rs` runs the native VM benchmark fixtures through the real host, including publication, storage and production deadlines:

```powershell
cargo run -p mengine-script --features v8-runtime --example script_host_workload -- workload.js 300 600 new-output-directory
```

This runner accepts trusted fixtures defining `benchmarkReset`, `benchmarkStep` and `benchmarkResult`. It creates a new output directory, saves final state through project storage and records callback timings. It does not measure viewport FPS or prove two-machine multiplayer acceptance. Default runtime selection should change only after native Editor and Player acceptance.
