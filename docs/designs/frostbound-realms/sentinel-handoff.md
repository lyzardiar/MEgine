# 原版 Sentinel 阶段交接

Author: MiYu。

工作区 `E:/work/codex/worktrees/1339/MEgine`，兼容路径 `C:/Users/admin/.codex/worktrees/1339/MEgine`，分支 `codex/frostbound-realms`。用户已重启后请求继续；完整 Warcraft III Frozen Throne 目标保持进行中，不再沿用上一批次的暂停状态。Ponytail 禁用，共享 `asset-library` 只读。

本批次接入原始 Owl 三部件及两个粒子发射器，包含飞行、停树、暂停、当前迷雾、保存恢复、联机快照恢复、重连等待及结算世界显示；动态池在预建 160 槽以外按需生成并复用。萨满 Q 可按实际显示高度选择停树的敌方 Owl，后端验证并扣费、播放施法姿态与事件。同帧删除不留下渲染节点。

引擎新增 `engine.findEntitiesByName()`，从同步快照只序列化命中节点。动态池注册使用该接口。编辑器在顶层代码与场景加载回调前同步真实世界，与独立播放器一致。保留现有脚本执行时间和内存限制。

验证入口及限制见 `sentinel.md`；原生报告 `native-sentinel-qa.json` 记录最终运行的编辑器、Main.js、场景哈希及逐步骤耗时。素材签名和可重建输出见 `sentinel-sources.json`。阶段提交后核对 `git log -1` 与 `git ls-remote origin refs/heads/codex/frostbound-realms`。

下一项优先完善暗夜真实野性兵种与变形，复用已转换的原版模型与原始技能/科技数据，使 Wild 升级只应用到正确兵种和形态。完整四族单位、英雄、科技、战役、经典 TD/Dota 内容及通用编辑器仍有未完成项，不能标记整体完成。

保护既有七个脏图片和原生报告：`classic-menu-4x3.png`、`classic-menu-title.png`、`native-classic-menu-qa.json`、`native-ground-qa.json`、`native-qa.json`、`native-terrain-qa.json`、`title.png`。不提交无关未跟踪草稿，禁止 `git add .`。
