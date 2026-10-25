# MEngine 原生 Warcraft 加载交接

2026-10-25。后续主线为 `watcher/war3` 的独立 C++／Win32 客户端；MEngine 移植在独立客户端完成后开展。

## 已推送与待验收

- 原生加载基线：`f1d71b1b62839051a7f9890704effa05736fb770`，分支 `codex/frostbound-realms`。原生归档、地图数据、地形／水面、定义继承、放置层级、共享模型纹理、节点旋转非继承和材质混合／深度状态的实现与来源说明已提交。
- 第163项遗留源码已提交推送：`5df88b2938980608140847a4048ba524ece16b47`，包含以下5个源码文件及待测记录。
- 158–160批次已关闭，结论提交 `06cec16`。161–163为新批次3/3，固定层序源码已随第163项提交；GPU混合／深度、真实BanditMage附件与相关消费者合并验证延期；已有定向检查不等于本批整体验收。
- 实际选图仍走 Python ContentImports 离线转换，原生世界／脚本／选图桥未完成，缓存问题尚未整体关闭。

## 第163项源码交付

5个源文件涉及 MDX 静态层序和 Host 消费：`mdx/mod.rs`、`mdx/reader.rs`、`mdx/tests.rs`、`warcraft_model.rs`、`warcraft_world.rs`，均位于现有 crates 下。层序在模型解析时按源opaque顺序及透明priority／filter／源顺序编译，并计入解码预算；Host共用0.01可见阈值，原生层使用LessEqual。

最终定向检查为2项 `native_mdx_draw_order` 与1项 `native_warcraft_layer_order`，3通过／0失败；5个文件已与交接摘要逐一核对并提交，未关闭161–163批次。后续验证应以实际提交和本地证据为依据，不能直接视为完整功能或覆盖用户改动。

补丁、文件摘要与状态：`tmp/docs-artifacts/war3-handoff/mengine-pending.patch`、`receipt.json`、`git-status.txt`。既有证据入口 `tmp/docs-artifacts/warcraft-archives/handoff.md`、`task161-receipt.json`、`task162-receipt.json`、`layer-order-source-tests.log`、`layer-order-host-tests.log`。

## 工作区与缓存

用户编辑器PID64664保持原进程，启动于2026-10-24 10:39:13，不停止或重启。`.editor/state.json`与仓库版本逐字节一致，已刷新索引消除伪改动；sample `.mengine/`、孤立 `asset-sources.json.meta` 与五个 `.frost-worker-*.mjs` 属于保留内容，不纳入源码提交。

用户已授权在原生直接加载完整验收后清理失去用途的旧地图解包／转换缓存。执行前核对活动引用、Git状态与解析后的绝对路径边界，保留原图／MPQ、版本资产及meta、可编辑导入和用户改动，记录清理数量与回收空间。当前条件尚未满足，未清理缓存。
