# StormLib / MEngine

Author: MiYu.

- Upstream: https://github.com/ladislav-zezula/StormLib
- Pinned commit: `116135c27e8c0dcf8ea0a0c549a6d737ce10fc73`.
- Source archive and SHA-256, selected upstream files and individual byte hashes: [source-info.json](source-info.json).
- License: [upstream LICENSE](source/LICENSE). Bundled codec notices remain in `source/src/`.

`source/` is an unmodified build subset: `src/**`, `CMakeLists.txt`, `LICENSE`, `README.md`, `Info.plist`. Upstream binaries, IDE projects and tests are not included. Git preserves upstream bytes. `crates/mengine-mpq/build.rs` builds the static library with bundled codecs, tests disabled and Unicode Windows paths enabled. CMake 3.25+, a C/C++ compiler and the existing Rust toolchain are required. No game DLL is linked or redistributed.

The Rust boundary exposes local, read-only archive handles and bounded member reads; it never exports members or writes `.meta`. The C ABI shim serializes archive creation and StormLib's process-global locale lookup, restoring locale before releasing the lock. Each archive is owned and accessed through a mutable borrow; MEngine's mounted resource source serializes shared handle access.

To update, choose an explicit upstream commit, verify the archive SHA-256, replace only the selected build sources, regenerate the file manifest, and review upstream license changes. Keep the C ABI shim outside the upstream snapshot. Revalidate compressed/encrypted/FIX_KEY sectors, Unicode paths, locale precedence, prefixed map headers, read limits, deletion markers and real maps before release. Binary delta patch members currently return an error; application-managed base/patch chaining remains pending. Do not reinterpret a patch or decode error as a missing resource.

Targeted commands:

```powershell
cargo test -p mengine-mpq --lib -- --test-threads=1
cargo test -p mengine-assets --lib asset_byte -- --test-threads=1
cargo run -p mengine-assets --example warcraft_archive_bytes -- <game-directory> <map-path>
node scripts/probe-frost-rea-archive-loading.mjs <game-directory>
```

The original Warcraft DLLs are inspected read-only by the pinned REA workflow. Raw evidence belongs in `tmp/docs-artifacts/warcraft-archives/`, not in this source dependency or `docs/`.
