# 原版角鹰兽资产与飞行单位

Author: MiYu

新游戏的暗夜精灵可在已扎根的风之古树按 H 训练角鹰兽。训练扣除 160 金币、20 木材，使用现有队列耗时 30 秒，占用 2 人口；拔根暂停队列，扎根继续，取消退还费用。新游戏的暗夜祭坛仅生产英雄。`hippogryphVersion=0` 的旧存档保留旧风之古树和祭坛生产规则；新存档为版本 1，联机协议为 51。

| 原始单位 | 本体与头像 | 生命 | 移速 | 武器 | 射程 | 飞行高度 |
|---|---|---:|---:|---|---:|---:|
| ehip | HippoGryph / HippoGryph_Portrait | 525 | 4 | normal 近战，仅空中 | 1.28 | 2.4 |
| ehpr | RiddenHippoGryph / RiddenHippoGryph_Portrait | 765 | 3.5 | pierce 箭矢，对地对空 | 4 | 2.4 |

原始单位数据以每 100 源单位对应 1 世界单位转换。两种形态均保持原始 modelScale=1、selectionScale=1.5；没有采用包围盒统一尺寸。模型保留原始骨骼与节点动画、团队材质、透明层和独立头像相机。角鹰兽攻击前摇为 0.6 秒；骑士前摇为 0.633 秒，使用原始 ArrowMissile、15 世界单位/秒速度与源发射偏移。近战空中攻击使用水平攻击距离，避免显示高度不同导致永远不能出手；这一运行行为尚未经过原版实测比较。

角鹰兽使用 Resw/Rerh 升级族，骑士使用 Resm/Rema/Reib/Remk 升级族。两者分别夜间恢复 0.5/1 生命每秒，不产生魔法值，死亡不留下持续可食用尸体。保存中的单位属性、生产者、队列和科技状态接受现有严格验证。伤害采用原表骰子，箭矢保存发射时形态和科技。

## 骑乘源证据与当前边界

原始风之古树 `Trains=ehip,edot,efdr`，没有 ehpr 直接训练项。骑士当前可作为地图中预放置的源形态使用；尚未提供装载、卸载或 Reht 研究命令。

弓箭手 earc 持有 Aco2，角鹰兽 ehip 持有 Aco3，骑士 ehpr 持有 Adec。Aco2/Aco3 使用当前 Acoi 路径，Area1=900、Cool1=30，UnitID1=ehpr；其 DataB1 分别为 0/1，元数据含义是“移动到辅助”。Aco2 Rng1=99999，Aco3 Rng1=0。旧 Acoa/Acoh 的 Rng1=100 不适用于当前单位。三种命令均依赖 Reht；研究原表为 75 金、75 木、30 秒。所有原表、命令图标和研究图标均已保存。

525+245=770，而骑士原表生命为 765；生命不能简单相加。生命比例、原对象身份、buff/DOT、冷却、命令队列、死亡组件和无法落地时的卸载行为需要原版运行测量。此阶段不宣称完整复现骑乘机制或原版游戏等价。

## 交付与验证入口

- `scripts/import-frost-hippogryph.py`：从只读 asset-library 与已签名原始表导入 205 个输出，保留来源、哈希、生成器和原始相机；拒绝覆盖手工修改的输出。
- `hippogryph-sources.json`：素材与源表的签名清单。原始资产属于 Blizzard；下载、提取与转换不构成统一免费再分发许可。
- `scripts/test-frostbound.mjs`：包含角鹰兽规则、生成客户端和真实 TCP 检查。
- `scripts/test-frost-hippogryph-assets.py`：验证源数据、源哈希、相机、Stand 包围盒、逐字节再生成与写入保护。
- `scripts/qa-frost-hippogryph.mjs`：先排演生成客户端，再启动隔离原生编辑器，验证原模型/头像、H 训练、F5 队列保存与续跑。
- `hippogryph-validation.json` 和 `native-hippogryph-qa.json`：实际回归、原生验收和阶段时间记录。

原生验收使用 Agent 输入。它不证明物理鼠标、音频听感、跨机器 LAN 或原版客户端运行等价。全游戏复刻目标仍未完成。
