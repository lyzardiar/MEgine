# 兽族四英雄原版来源

Author: MiYu

原版祭坛顺序为剑圣 Obla、先知 Ofar、牛头人酋长 Otch、暗影猎手 Oshd。`orc-hero-rules.json` 保留四英雄属性和成长、模型引用、费用和视野、完整单位与武器源行、16 项技能的 40 个等级、目标掩码、buff、指令卡/学习槽位、学习等级、中文文字、原始技能参数和 Misc 常量。

技能指令顺序分别为：剑圣疾风步/镜像/致命一击/剑刃风暴；先知闪电链/远视/野兽幽魂/地震；牛头人酋长冲击波/战争践踏/耐久光环/重生；暗影猎手治疗波/妖术/毒蛇守卫/巫毒。源 `heroAbilList` 顺序与指令卡顺序均独立保留；72 张图标包括英雄招募、技能、学习和禁用版本，主动/被动与学习图标不混用。

从已安装 Warcraft III 的 MPQ 按覆盖优先级读取 62 个原始文件，记录档案名、路径、字节数和 SHA-256；源字节保存在 `SourceAssets/OrcHeroes/raw`，138 项输出和生成器记录见 `orc-hero-sources.json`。中文严格解码并保留原始文件；资产权属说明见 `Assets/Licenses/Classic-Orc-Heroes.txt`。共享 asset-library 未修改。

`python scripts/test-frost-orc-heroes-import.py` 已通过：四英雄/16 技能/40 等级与原版槽位、72 张 64×64 RGBA 图标、源/输出/工具指纹、脱离游戏安装的逐字节重建，以及损坏源和已修改输出的拒绝且无写入。文本规则固定 LF，原始源和图标按字节存储。Main 脚本和场景与当前提交逐字节相同；本阶段没有原生游戏验收。

本阶段为来源和图标交付，`runtimeIntegrated=false`、`originalRuntimeVerified=false`。兽族可玩英雄目前仍为通用行为，下一阶段需要转换英雄模型/肖像/技能效果，并按来源接入四英雄属性、技能、保存和联机。亡灵四英雄、完整战役、地图编辑器、经典地图行为及跨机器 LAN 的完整复刻仍未完成。
