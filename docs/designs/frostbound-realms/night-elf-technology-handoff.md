# 暗夜科技阶段续接

Author: MiYu。完整目标仍为 Warcraft III Frozen Throne 的单机、联机、经典 TD／Dota 地图、地图编辑器及所需引擎扩展；整体尚未完成。用户要求当前批次收尾后暂停，重启 Codex 后由用户继续。

工作区：`E:/work/codex/worktrees/1339/MEgine`（兼容路径 `C:/Users/admin/.codex/worktrees/1339/MEgine`），分支 `codex/frostbound-realms`。`G:/work/github/MEgine/.git` 为共同 Git 目录。Ponytail 在本任务禁用；共享 `asset-library` 保持只读。保护既有脏图片／原生 QA 与无关未跟踪草稿，禁止 `git add .`。

当前交付：11 个源研究 ID／19 等级、三格训练与研究共享队列、逐阶前置／计费／退款、原版攻击骰子／护甲／射程／月刃、夜间视野、月井原版费用／魔法／补给、哨兵飞行／停树／一次使用／驱散规则、树木 HP 和投刃车树木／对地攻击。协议 46；严格保存、旧版本兼容、实际 TCP 断线恢复与隐私过滤。客户端使用原版中文、槽位、热键与图标；冲突热键互斥，拔根恢复移动／停止并只显示一个取消按钮。

验证：素材 56 原始源／102 签名输出；104 项暂存 Git 签名批量验证通过；全量回归 106 条 PASS、退出 0。当前原生主报告及最终版本指令卡补充报告的范围与产品哈希分别保存。见 `night-elf-technology.md`、`night-elf-technology-art-validation.json`、`night-elf-technology-rule-validation.json`、`native-night-elf-technology-qa.json` 和 `native-night-elf-technology-mobile-qa.json`。规则与客户端测试复现命令在主文档中。

下一项先接入真实 Owl 哨兵渲染池。正确模型是 `Units/NightElf/Owl/Owl.mdx`（不是 OwlSCOUT／nowl），来自 `remaining-ready`，模型 SHA-256 `cfef44526635c98962dd9d1c72d2ef0bc1d6b2c267252ec49bb87b748ac27999`。只读代理的完整源／贴图／动画／转换核查在 `tmp/sentinel-research/review.json`；已采样与注释的 GLB 和效果 JSON 在同目录。模型包含三组材质 geoset、Plane01 billboard 和两个粒子发射器。复用 `convert-frost-classic-billboards.annotate`、`import-frost-classic.py`、`convert-warcraft-effects.py` 与 client 的 actor + SampledEffect；必须显式绑定 remaining-ready 并更新 overlay 来源集。转换尺度为 `(x,z,-y)/128`，现有 worldScale=2；保留模型原始高度，不套用可控 Scout Owl 的 1.2 缩放。粒子采样器并非原版引擎求解器，几何采样最大误差约 3.95e-7。

其他明确未完成：Shaman 的哨兵效果点选驱散、全部野性原版兵种／形态、AI 原版科技策略、完整四族单位／英雄／科技、原版战役、完整经典地图内容和完整通用编辑器。原生输入报告不证明物理键鼠、音频听感和跨机 LAN。整体目标不得标记 complete。

本批次提交标题：`Implement original Night Elf research rules and command controls`。重启后先核对 `git log -1`、分支、脏文件边界与 `git ls-remote origin refs/heads/codex/frostbound-realms`，再复用已通过证据，不重复完整资产扫描。
