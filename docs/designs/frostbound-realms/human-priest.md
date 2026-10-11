# 人族牧师驱散与心灵之火

作者：MiYu。协议 85。

牧师专家级训练 Rhpt1 解锁驱散 Adis，使用原版 D 热键、第 9 指令槽、75 魔法、5 施法距离和 2 范围。玩家选择可见地面点，牧师接近后完成原版前摇，成功施法时扣魔。范围内双方正负魔法效果均被移除，召唤单位受到 200 驱散伤害。死亡的召唤目标仍留下独立世界特效，直到原版 DispelMagicTarget 的 2.067 秒 Birth 动画结束。

大师级训练 Rhpt2 解锁心灵之火 Ainf，使用原版 F 热键、第 10 指令槽、35 魔法、1 秒冷却和 5 施法距离。当前目标为可见、存活的本方非建筑单位，排除魔法免疫、无敌、旋风、相位和城镇传送中的单位。增益持续 60 秒，增加 10% 攻击和 5 护甲；重复施法刷新时间，不叠加。攻击加成不放大物品固定攻击加值，与现有 Roar 百分比加成相加，最后应用 Cripple 倍率。原版物品、升级、Roar 的完整百分比叠加公式及中立外交关系仍需原版实机核验。

心灵之火默认关闭自动施法，右键指令按钮或 Shift+F 切换。自动施法优先选择附近未获得该增益的本方单位；Heal 与心灵之火共用施法占用，保持各自冷却。Stop、移动和已有眩晕、Hex、Cyclone、死亡、传送通路取消前摇。新局遵守暴雪牧师页面的 Hold Position 不自动 Heal 规则，humanPriestVersion=0 的旧档保留原有行为。

Binf 的源 Buff 表及 HumanAbilityFunc 指定 InnerFireTarget 和 overhead 挂点。客户端使用实际模型 Overhead Ref，播放原始 Birth 和循环 Stand；驱散使用世界 Birth 效果。两个模型各保留 6 个几何部分及原始材质透明度轨迹。场景只追加 14 个禁用模板，运行时按需创建效果，保留全部 8,982 个旧节点的内容、编号与父节点；初始场景为 8,996 个节点。

保存与恢复严格校验版本依赖、施法前摇、目标、自动状态、冷却、增益来源和世界效果时间。TCP 由服务器执行命令和时钟，拒绝敌方操控与未研究技能。可见敌方单位只公开施法动画阶段、增益剩余时间与起始帧，私有施法目标、自动状态、冷却和研究不公开；施法中重连继续原时钟。

human-priest-sources.json 和 human-priest-effects-sources.json 记录 13 份原始源文件、依赖与 123 份签名输出，包含 5 份新增指令贴图 meta，以及效果、模型、材质、贴图的全部 sidecar。资产测试逐字节再现，校验源表和 GLB，并验证修改输出、未签名同名输出、损坏依赖及损坏源文件的拒绝行为。

验证入口：test-frost-human-priest.mjs、test-frost-human-priest-client.mjs、test-frost-human-priest-network.mjs、test-frost-human-priest-assets.py、qa-frost-human-priest.mjs。规则验证包含实际 Water Elemental 召唤与致死驱散、实际攻击伤害和护甲、树妖驱散增益、建筑排除、刷新与到期。生成客户端使用原生 GLB 节点评估，TCP 验证真实连接、权限和施法中恢复。35 个已有回归入口全部通过；原生编辑器验证实际骑士攻击、D/F 输入、两种源模型效果、双方驱散、保存重载与效果回收，控制台错误和材质管线拒绝均为 0。

报告为 human-priest-validation.json、human-priest-assets-validation.json 和 native-human-priest-qa.json，截图为 human-priest-native-inner-fire.png 与 human-priest-native-dispel.png。物理输入、独立 Player、原版可执行程序一致性和跨机器 LAN 尚未验收。女巫其余技能、Feedback、Control Magic 及完整游戏复刻继续进行。
