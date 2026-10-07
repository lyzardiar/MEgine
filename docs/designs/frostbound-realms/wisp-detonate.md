# 小精灵自爆

Author: MiYu。协议 42；Ponytail 保持禁用。

近战小精灵接入原版 Adtn 自爆。原始 `AbilityData.slk` 提供 50 点法力削减、225 点召唤单位伤害、300 源单位作用半径、100 源单位施法距离，以及零费用、零冷却。沿用游戏规则每 100 源单位对应一个世界单位的换算。`NightElfAbilityFunc.txt` 决定 detonate 命令标识、按钮位置 `(1,2)`、原版 WispSplode 图标、WispExplode 和 DispelMagicTarget 模型。

[暴雪小精灵说明](https://classic.battle.net/war3/nightelf/units/wisp.shtml)用于核对地面目标、走近地点、友军影响和牺牲不让敌人获得经验的行为。范围采用留存 MPQ 中的 Adtn 行；来源、解码输出及转换签名见样例 `detonate-sources.json`。

## 游戏行为

- 按 D 或点击命令区第二格第三行图标，再选择地面位置。小精灵走到施法距离内，在自己的实际位置自爆；不会跟踪移动的敌人，也不会在无法到达的远处消失。
- 指令替换原有采集、施工及后续队列。S 或普通改令可以取消行走中的自爆；避难恢复期间不能下达自爆；眩晕暂停执行，驻矿小精灵需先卸载。
- 半径内友军、敌军及中立单位均受到法力削减和已实现的可驱散状态清理；地面及空中召唤单位承受伤害。法力最低为零。
- 清除狂热、残废、嗜血、闪电护盾、减速、冰冻、加速、缠绕、可驱散吸收护盾、速度卷轴和持续物品恢复。施法及物品冷却、眩晕、Avatar、法术免疫、隐身和避难恢复保持各自规则。
- 小精灵死亡释放人口，没有尸体、击杀计数、赏金或经验归属。受影响召唤单位沿用当前共享战斗结算。
- 游戏存档保留目标、路径与行走进度。对手快照隐藏目的地与队列；目标驱散效果根据施放时的可见性投递，未侦测的隐形单位不会因特效泄露坐标。

## 原版画面

WispExplode 的一层几何及三组粒子与 DispelMagicTarget 的六层几何及粒子一起播放原始 Birth 序列。目标模型保留原始节点、轴向 billboard 和变换轨道。几何、动画二进制及贴图保留源尺寸；特效使用现有源单位到世界的缩放。源模型中的空序列不用于施放。

24 个暂态槽显示实际事件，播放结束隐藏整套网格和粒子。单机暂停冻结这些特效；恢复后继续。沿用现有施法音效，未新增音频资产。

## 验证与入口

```text
node scripts/build-frostbound.mjs
node scripts/test-frost-detonate.mjs
node scripts/test-frost-detonate-network.mjs
node scripts/test-frost-wisp-client.mjs
python scripts/test-frost-detonate-assets.py
node scripts/test-frostbound.mjs
node scripts/qa-frost-detonate.mjs
```

规则测试覆盖区域边界、友军、地空召唤、免疫、牺牲结算、行走/停止/眩晕/不可达、采集与驻矿生命周期、无效指令原子性、单次组选择、严格存档及迷雾隐私。真实 TCP 测试覆盖重复序号、双方状态、行走中的断线重连、停止及再次施放。

资产测试核对所有来源及输出签名、无需游戏安装的重复导入、修改保护原子性、七层 GLB 原始二进制，并执行 54 次原生几何/粒子加载及七项终点保持检查。报告见 `detonate-art-validation.json`。实际界面及联机验收由 `qa-frost-detonate.mjs` 在独立原生工程中记录至 `native-detonate-qa.json`。

最终完整规则／客户端／真实 TCP 套件 80 条 PASS，原生双客户端实际 HUD 施放、区域效果、暂停、保存／载入和重连通过，两端材质拒绝及日志错误均为 0。`verify-frost-detonate-bundles.py` 核对两份独立原生工程各 6,649 个产品文件，差异仅限工程标识、临时 TCP 地址和 qaUnits 观察字段；报告见 `detonate-native-bundle-validation.json`。

素材转换使用现有 `convert-warcraft-effects.py`，选择 `remaining-ready/Units/NightElf/Wisp/WispExplode.mdx` 和 `remaining-ready/Abilities/Spells/Human/DispelMagic/DispelMagicTarget.mdx`，输出到 `tmp/wisp-detonate/effects`。相同两个模型通过 `convert-frost-classic-billboards.py` 转換节点信息至 `tmp/wisp-detonate/geometry`，随后执行 `import-frost-detonate.py`。转换及节点读取器继续使用已记录的固定解析器；完整转换记录和原始 MDX 保留在 SourceAssets，资产库只读。

本阶段复用当前战斗系统的免疫与召唤击杀结算，尚未用原版客户端独立测量所有免疫/无敌状态、召唤收益和精确视觉时相。完整四族、战役、Dota/经典塔防地图内容及编辑器仍未完成。Agent 输入不代表物理键鼠、试听或跨机器 LAN 验收。
