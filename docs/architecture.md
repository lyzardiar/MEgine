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

Embedded **Boa** (pure-Rust JS). Scripts only use `engine.*` APIs that push into `CommandBuffer`.  
The host can be swapped for QuickJS/V8 later without changing the command contract.

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

## Platforms

| Target | Status |
|--------|--------|
| PC runtime | `mengine-runtime` |
| PC editor | React + Tauri host |
| Android | stub under `platforms/android` |
| iOS | stub under `platforms/ios` |
