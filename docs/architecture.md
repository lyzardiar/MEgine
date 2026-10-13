# MEngine Architecture

## Layers

1. **Authoring** — React editor, game TS, AI Intent IR  
2. **Bridge** — IDL codegen, CommandBuffer, World Snapshot  
3. **Core** — ECS World, Schedule, Assets, Scene/Prefab  
4. **RHI** — wgpu + linear RenderGraph  
5. **Platform** — window, input, mobile players  

## Mutation model

All writers (scripts / editor / agent) emit `WorldCommand` values.  
`World::commit()` applies them. Queries read via `WorldSnapshot`.

## Script host

Embedded **V8** through `rusty_v8` is the default for editor Play and standalone players; QuickJS-NG remains an explicit build-time fallback. Scripts use `engine.*` APIs and emit `CommandBuffer` entries. Each host owns its VM and request queues. JavaScript calls have a one-second deadline (three seconds for the initial tick). V8 has a 256 MiB managed-heap limit plus a termination reserve and a separate ArrayBuffer quota; see [ScriptHost runtimes](../crates/mengine-script/README.md) for limits and backend selection. SDK exports verify the actual Player's runtime and bridge versions against the editor.

World snapshots remain native data until a script reads `engine.snapshot` or `lastSnapshot`. Values stay stable within a frame and refresh before the next callback; `lastSnapshot` remains a JSON string. Pixel delivery uses WebView2 shared CPU buffers on Windows, with binary IPC on other hosts.

Windows binaries use mimalloc for native allocations. UI text geometry is cached with complete layout/style inputs and invalidated when font atlases change; each viewport retains at most 16,384 cached primitives.

## IDL

Source of truth lives in `/idl`. Run:

```bash
pnpm codegen
```

Generates Rust components and TypeScript types.

## Editor

- UI: `@mengine/editor` (Vite + React)
- Host: `mengine-editor-host` + optional Tauri shell under `packages/editor/src-tauri`
- Play Mode clones edit world; Stop discards play state
- Authoring guides: [Canvas Workspace](./canvas-workspace.md), [Figma UI Bridge](./figma-ui-bridge.md), [2D Effects](./2d-effects.md)

## Platforms

| Target | Status |
|--------|--------|
| PC runtime | `mengine-runtime` |
| PC editor | React + Tauri host |
| Android | stub under `platforms/android` |
| iOS | stub under `platforms/ios` |
