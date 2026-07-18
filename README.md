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

## Windows 编辑器 EXE 打包

在新拷贝、尚未安装 Cargo 等构建环境的工程中，依次执行下面两个命令：

```powershell
# 1. 安装 Node.js、pnpm、Rust/Cargo、MSVC、WebView2 及仓库依赖
.\scripts\install-editor-build-env.cmd

# 2. 构建 Release 版本并生成 NSIS 安装 EXE
.\scripts\build-editor-exe.cmd
```

安装包输出到 `target\release\bundle\nsis\`。环境安装只需执行一次；后续改完代码直接执行第二条命令即可。

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

## 构建 PC 游戏

```powershell
# 编译 CLI
npm.cmd --prefix packages/cli run build

# Release 构建：编译 Rust player、复制 Assets、生成启动配置和 SHA-256 清单，最后由产物自检主场景
node packages/cli/dist/cli.js build packages/editor/project --clean

# 快速 Debug 构建
node packages/cli/dist/cli.js build packages/editor/project --debug --clean
```

默认输出到 `<工程>/Builds/windows-x64`（其他系统使用对应平台名）。播放器无需命令行参数即可读取同目录的 `mengine-player.json` 并启动 `project.json` 指定的主场景。已有输出不会被静默覆盖，必须显式传入 `--clean`。

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
