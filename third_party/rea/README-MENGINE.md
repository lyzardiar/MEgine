# REA / MEngine MCP 工作流

REA（Reverse Engineer Anything）由上游项目提供，MEngine 通过独立的 REA MCP 服务获取分析证据，再通过现有引擎 MCP 操作和验证工程。

## 官方来源与固定版本

- GitHub 源站：https://github.com/morluto/rea
- 官方网站：https://rea.tools
- npm 包：https://www.npmjs.com/package/rea-agents/v/6.5.0
- 固定版本：`6.5.0`，Git 标签：`rea-agents-6.5.0`
- 固定提交：`3b79af28e80785afce9f5998d8f03289402a1847`
- 源码归档：https://codeload.github.com/morluto/rea/zip/3b79af28e80785afce9f5998d8f03289402a1847
- 源码归档 SHA-256：`32eb5cc973ca3eba354769681a92de5c9a4c23877ce5fb9931e3d80d3586d3d4`，14,270,809 字节。
- `source/`：该提交的 GitHub 源码快照，保留原始许可证、文档和上游子模块声明；归档不包含子模块仓库内容。
- `package.json` / `package-lock.json`：固定已发布运行包及全部 npm 依赖版本和完整性信息。`node_modules/rea-agents/` 为本地安装后的运行包。
- 机器可读来源信息：[`packages/agent/mcp/rea-source.json`](../../packages/agent/mcp/rea-source.json)。引擎 MCP 工作流及编辑器 **Help > AI Agent Setup** 共用此信息。

REA 自有代码使用 MIT；第三方代码仍遵守各自许可证。见 [`source/LICENSE`](source/LICENSE)、[`source/THIRD_PARTY_NOTICES.md`](source/THIRD_PARTY_NOTICES.md) 和 `source/licenses/`。

## 使用

要求 Node.js `22.19+`（22.x）、`24.11+`（24.x）或 `26+`。从 MEngine 仓库根目录执行：

```powershell
npm.cmd run rea:install
npm.cmd run rea -- --version
npm.cmd run test:rea
```

`.codex/config.toml` 已配置两个 stdio 服务：`mengine` 使用现有引擎 MCP，`rea` 使用此目录固定安装的 REA。配置使用当前检出目录的绝对路径；移动仓库后需更新两项 `args` 和 `cwd`。Codex 需要信任项目并重新连接 MCP / 开启新会话后加载配置。其他 MCP 客户端可以分别使用以下启动命令（路径换成实际绝对路径）：

```text
node G:/work/github/MEgine/packages/agent/mcp/server.mjs
node G:/work/github/MEgine/third_party/rea/node_modules/rea-agents/scripts/rea.mjs mcp
```

在引擎 MCP 中获取 `reverse_engineer_feature` prompt，传入 `targetPath` 和 `feature`。模板包含源站及维护信息，并要求：先确认目标身份及分析证据，再按请求修改引擎工程，最后使用 revision、语义差异、行为检查和后台截图验证。REA 与引擎服务并列注册，由 MCP 客户端协调。

无 MCP 连接时，可从终端执行静态分析：

```powershell
npm.cmd run rea -- analyze-javascript-application "D:/apps/example" --json
```

JavaScript/Electron 和托管程序集静态分析不需要原生反编译引擎。原生程序分析需要另行配置匹配的 Ghidra / Hopper / IDA；此接入没有安装这些工具。Windows Ghidra 支持仍为实验性。REA 托管分析器不解码 IL2CPP 元数据。安装版编辑器会携带工作流模板和来源说明；REA 运行包及原生分析工具仍在开发仓库中单独维护。

## 更新维护

法力训练与回复可用 `node scripts/probe-frost-rea-rewards.mjs --mana-upgrades` 复现。`CUpgradeManaEx`、policy 1、`rmnr` 加法回复、月井目录版本和验证入口见 [法力升级维护说明](../../docs/designs/frostbound-realms/mana-upgrades.md)。

生命升级效果 `rhpx` 可用 `node scripts/probe-frost-rea-rewards.mjs --hitpoint-upgrades` 复现。效果标识、生命比例写入、舍入地址、旧存档策略和七种单位形态的验证入口见 [生命升级维护说明](../../docs/designs/frostbound-realms/hitpoint-upgrades.md)。

Frostbound Realms 的人族石工技术对照可用 `node scripts/probe-frost-rea-rewards.mjs --human-masonry` 复现。源 MPQ、DLL 摘要、研究规则、静态证据地址和动态验收范围见 [人族石工技术维护说明](../../docs/designs/frostbound-realms/human-masonry.md)。

原生离线分析已添加可选的 Rizin `0.8.1`，项目 MCP 配置通过 `REA_RIZIN_COMMAND` 指定本地可执行文件，可使用 REA 的 `execute_rizin_command` 检查 PE、字符串和汇编。官方来源、归档 SHA-256 和路径见 [`rizin-source.json`](rizin-source.json)。工具位于被 Git 忽略的 `tools/`；新检出可从记录的官方地址下载、校验并解压到对应目录，不需要系统安装。`rea:install` 仅恢复 Node 运行包，不会移除该目录。目标软件不会因静态检查而被执行；Rizin 的存在不代表 Ghidra 等其他引擎已配置。

1. 从 GitHub 源站及 npm 检查版本、发布说明、许可证和平台支持；`npm.cmd view rea-agents version` 只查询可用版本。
2. 选定版本后，核对上游 Git 标签对应提交，下载该固定提交源码归档，计算 SHA-256，替换 `source/` 快照；保持上游源码原样。
3. 更新本目录 `package.json` 的精确版本及 `version` 字段，然后在仓库根目录运行 `npm.cmd --prefix third_party/rea install --omit=dev --ignore-scripts --no-audit --no-fund --workspaces=false`，更新锁文件。固定安装跳过依赖安装脚本；本工作流验证静态分析，额外工具有各自前置条件。
4. 同步更新 `packages/agent/mcp/rea-source.json` 和本文件中的版本、标签、提交、下载地址、归档校验和及 npm integrity。
5. 运行 `npm.cmd run test:rea`，并执行 `node --experimental-strip-types --test packages/editor/tests/agentMcpContract.test.mjs packages/editor/tests/agentMcpProtocol.test.mjs`。涉及编辑器说明时，同时运行编辑器生产构建。
6. 重连两个 MCP 服务，再针对实际目标验证所需能力。不得仅凭版本号或握手成功宣称原生、IL2CPP 或目标软件运行验收通过。

固定安装使用锁文件恢复；不要在本目录运行 `rea update`，否则运行包、源码及维护信息可能失去对应关系。源码构建及其他分析引擎的安装方法见上游 `source/docs/installation.md`。

## 验证快照（2026-10-18）

3,777 个源码文件（47,103,748 字节）与固定提交归档逐字节一致。锁文件恢复后，真实 MCP 检查 3/3 通过：版本及来源一致、REA 工具发现及 JavaScript 静态分析、MEngine 工作流及维护信息读取。REA 返回 207 个工具，静态分析生成证据且未执行测试目标。引擎 MCP 协议、契约与交付回归 32/32 通过，编辑器生产构建通过；构建产物的浏览器页面已核对源站、标签、提交及维护入口。Codex CLI 已读到两个项目级 MCP 配置；当前聊天的工具连接仍需重连后载入。后续原生 Warcraft 分析证据见 `docs/designs/frostbound-realms/rea/README.md`；提交状态以仓库日志为准。

Warcraft 工人武器维护入口：`node scripts/probe-frost-rea-rewards.mjs --worker-weapons`，配合 `scripts/import-frost-worker-weapons.py` 和 `docs/designs/frostbound-realms/worker-weapons.md`。该 probe 绑定受检 Game.dll 摘要，保留字段、指针表和源数据来源供更新复核。

工人手动维修：`node scripts/probe-frost-rea-rewards.mjs --worker-repair` 保留 Repair/Renew 类标识证据，输出到 `tmp/docs-artifacts/frost-worker-repair/`。源技能/分类/图标、原版元数据、摘要及导入/验证入口见 `docs/designs/frostbound-realms/worker-repair.md` 和 `scripts/import-frost-worker-repair.py`。

原版采木维护入口：`node scripts/probe-frost-rea-rewards.mjs --worker-lumber`，配合 `scripts/import-frost-worker-lumber.py`、`scripts/import-frost-lumber-depots.py`。源技能/第二武器/树生命、交付建筑、模型及原版按钮的来源、摘要、复现和测试入口见 `docs/designs/frostbound-realms/worker-lumber.md`。GitHub 上游、固定版本及更新方法沿用本说明。

人族采木升级：`node scripts/probe-frost-rea-rewards.mjs --lumber-upgrade` 保留 rlum / CUpgradeLumberJack 至 Harvest DataB 容量字段的静态调用链。`scripts/import-frost-lumber-technology.py` 保留原件、研究等级、本地化、按钮、元数据和摘要，并支持无安装复现。使用与更新入口见 `docs/designs/frostbound-realms/lumber-technology.md`。
