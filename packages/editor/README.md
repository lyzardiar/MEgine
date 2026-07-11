# @mengine/editor

React + Vite editor UI. Hierarchy / Inspector / Viewport / Content / Toolbar / Console.

## Dev

```bash
pnpm --filter @mengine/editor dev
```

Play Mode, Undo, Scene save/load, Intent IR spawn are available in the browser store.

**Scenes on disk (Vite dev):** `project/Assets/Scenes/*.mscene`  
Active scene: `project/.editor/state.json`  
Without the Vite FS plugin (static preview), falls back to localStorage and migrates to disk on next `vite` run.

## Tauri host

`src-tauri/` embeds `mengine-editor-host` and exposes:

- `get_snapshot`
- `editor_command`

Native wgpu viewport attaches in the host process (Phase 2+). Until icons/toolchain are configured:

```bash
cd packages/editor
# requires: cargo install tauri-cli
# pnpm tauri dev
```

Web preview is the default day-to-day authoring loop.
