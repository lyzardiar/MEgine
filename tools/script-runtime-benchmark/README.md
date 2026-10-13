# Native JavaScript runtime benchmark

Author: MiYu

This standalone Rust executable runs the same trusted, synchronous JavaScript workload in QuickJS-NG (`rquickjs 0.14.0`) and embedded V8 (`v8 152.2.0`), matching the engine's two backends. Its independent Cargo workspace allows benchmarking both VMs together; production Editor and Player builds select one backend.

Build with `cargo build --release --locked --manifest-path tools/script-runtime-benchmark/Cargo.toml`.

On Windows, keep the Cargo target directory on the same drive as the Cargo registry, or provide the `target/release/gn_root` directory junction to the V8 crate source. Rusty V8 tries to create a symbolic link for a cross-drive build, which requires Windows privileges. A directory junction avoids that requirement. The first build downloads the official V8 static library.

The input script defines three global functions:

- `benchmarkReset()` creates the initial workload state.
- `benchmarkStep()` executes one synchronous simulation step.
- `benchmarkResult()` returns a JSON string describing the final state.

```text
mengine-script-runtime-benchmark quickjs workload.js 300 600 quickjs.json
mengine-script-runtime-benchmark v8 workload.js 300 600 v8.json
```

Each invocation starts a fresh VM, loads the script, resets, warms up, resets again, then times individual steps with Rust's monotonic clock. JSON serialization and file output happen after sampling. Reports include startup, both resets, warmup, every measured step and the complete final state. Both runtimes have a 256 MiB heap limit. The runner accepts trusted benchmark inputs only and has no per-call execution deadline; an orchestrating process must enforce a timeout.

The `codex/frostbound-realms` branch provides `scripts/benchmark-frost-script-runtimes.mjs`. It extracts the unchanged rules and their declarations from generated `Main.js`, runs opening, 110-unit battle, tower-defense and MOBA workloads, alternates runtime order across three fresh-process repetitions, and compares complete resulting states. The battle workload uses at most 10 warmup and 30 measured steps because its simulation cost is substantially larger. Actual counts are recorded per case. It validates repeated results within each runtime and records cross-runtime mismatches separately; `completed: true` does not imply `statesEquivalent: true`.

This measures JavaScript rules and the small Rust-to-JavaScript function call. It excludes MEngine's world snapshots, commands, asset sampling, networking, storage, rendering, editor UI, frame presentation and production timeout behavior. Startup includes the generated declarations preceding the rules, including asset metadata. A faster result does not establish editor FPS, API compatibility, replay equivalence or production readiness for a VM migration.
