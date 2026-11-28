# Desktop Players (Windows Active; macOS & Linux Reserved)

| Platform | Stage | Script VM | Graphics | Platform Adapter |
|---|---|---|---|---|
| **Windows x64** | Active (Primary) | V8 (`v8-runtime`, QuickJS optional) | DX12 (Vulkan fallback) | `mengine_platform::WindowsAdapter` |
| **macOS arm64** | Adapter Reserved | V8 (`v8-runtime`, QuickJS optional) | Metal | `mengine_platform::MacOsAdapter` |
| **Linux x64** | Adapter Reserved | V8 (`v8-runtime`, QuickJS optional) | Vulkan (GLES fallback) | `mengine_platform::LinuxAdapter` |

Cross-compilation notes:
- `crates/mengine-effekseer/build.rs` now checks `CARGO_CFG_TARGET_OS` rather than host OS.
- `crates/mengine-assets` gates StormLib/Warcraft behind `--features warcraft`, allowing clean non-Warcraft builds via `--no-default-features`.
