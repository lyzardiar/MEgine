# MEngine

Cross-platform game engine: **Rust** core + **TypeScript** scripting/tools.

- Platforms: PC (primary), Android / iOS (player)
- Graphics: wgpu
- Editor: Tauri 2 + React/TS panels + native wgpu viewport
- Script: Boa JS host (CommandBuffer bridge)
- Architecture: Schema/IDL → ECS + CommandBuffer + Intent IR

## Quick start

```bash
# Prerequisites: Rust stable, Node 20+
npm install   # or pnpm.cmd install
npm run codegen
cargo run -p mengine-runtime -- --sample spinning-cube
```

## 样本脚本（TypeScript）

```bash
# 编辑 samples/*/main.ts，再编译给 runtime
npm run build:samples
npm run sample:cube
```

## 在 Cursor / VS Code 里打开编辑器

1. `Ctrl+Shift+B`（默认生成任务）→ **MEngine: Open Editor**  
   会启动 Vite，并在 IDE 内置浏览器打开 `http://localhost:5173/`
2. 或命令面板：`Tasks: Run Task` → `MEngine: Open Editor`
3. 终端备用（避开 PowerShell 禁止 `.ps1`）：

```powershell
npm.cmd run dev:editor
# 或
.\scripts\dev-editor.cmd
```

> 不要用 `pnpm`（会加载 `pnpm.ps1`）。请用 `pnpm.cmd` / `npm.cmd`。

## Workspace

| Path | Role |
|------|------|
| `crates/*` | Engine core, RHI, assets, script host, editor host, runtime |
| `packages/*` | `@mengine/api`, `@mengine/behaviour`, editor, agent, cli |
| `idl/` | Component / command / resource schemas |
| `samples/` | Demo projects |
| `docs/` | Architecture & API guidelines |

TS 业务组件（SerializeField / Inspector 元数据）：见 [docs/behaviour-guidelines.md](docs/behaviour-guidelines.md)。

See [docs/architecture.md](docs/architecture.md).
