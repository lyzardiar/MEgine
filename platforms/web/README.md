# Web / WASM Player

MEngine Web Player uses **browser-native JavaScript execution** (`web-native-js`, zero V8/QuickJS binary bloat) paired with async `fetch()` VFS asset streaming, WebGPU (with WebGL2 fallback), and WebAudio.

## Architecture
- `crates/mengine-platform`: `WebAdapter` (`requires_async_boot = true`, `ScriptBackendKind::WebNativeJs`)
- `crates/mengine-script/src/web_host.rs`: `WebCommandBridge` accepting JSON/TypedArray command batches directly from browser JS without compiling V8 or QuickJS into WASM.
- `platforms/web/src/webEngineHost.ts`: Browser lifecycle (`visibilitychange` pause), `requestAnimationFrame` loop, multi-touch/pointer/keyboard capture, `WebVfsLoader`, and `WebAudioHost`.
