# 飞行机器来源、转换与验收

Author: MiYu

`flying-machine.json` 保存本机《冰封王座》飞行机器 `hgyr` 的规则和源行；`flying-machine-models.json`、`flying-machine-portraits.json`、`flying-machine-effects.json` 保存可由现有 MEngine 渲染的模型、头像摄影机和特效。当前完成资产与规则导入、原生独立预览；车间生产、研究、侦测、双武器和高射火炮的玩法接入尚未完成。主游戏菜单和战斗逻辑尚未引用这些新增文件。

## 原件与版本

原始游戏目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。MPQ 读取优先级为 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq`。原始表格、模型、纹理和按钮保存在 `SourceAssets/FlyingMachine/` 与 `SourceAssets/FlyingMachineEffects/`；每项记录 archive、字节数与 SHA-256。

资料片模型使用 `War3x.mpq` 中的 `Units/Human/GyroCopter/Gyrocopter_V1.mdx`，SHA-256 为 `39d1d5e76ce7740f68c28ceabc11ecf74ae0a546ca6164f8b5a54aa9f34d54c3`。头像使用 `Gyrocopter_V1_portrait.mdx`，SHA-256 为 `988ef83f640794e814f6708c3c52980d94a4b5f3daf479900f963e38418420d5`。转换前对照原MPQ与 `remaining-ready` 素材库的模型及纹理摘要；转换器版本、二进制摘要和生成文件摘要保存在两个 `*-sources.json` 收据中。

模型保留 Stand、Walk、Attack one、Attack two、Death 等源动画、队伍颜色、纹理状态和节点信息。头像保留源模型动画及原始透视摄影机。特效包括瞬时命中、对地炸弹、高射火炮，以及机身和头像的内嵌粒子。游戏原件遵循 Blizzard 原游戏条款；转换器许可独立保留。

## 规则依据

| 项目 | 原版字段 |
|---|---|
| 训练与生命 | 90 金、30 木、1 人口、13 秒；200 生命、2 重甲 |
| 飞行与视野 | 移速400、碰撞半径8；昼1800、夜1100；机械单位 |
| 初始对空武器 | 14–15 穿刺，500射程、2秒间隔、0.03秒前摇；instant武器 |
| 对地武器 | 7–8 攻城，100射程、2.5秒间隔、0.633秒前摇；900速度炸弹 |
| 飞行机器炸弹 Rhgb | 150金、100木、35秒，要求城堡；源升级 `renw=3` |
| 高射火炮 Rhfc | 100金、150木、40秒，要求城堡 |
| 真实视域 Agyv | 范围900、源侦测类型3 |
| 高射火炮 Aflk | 75／150／325三圈，源伤害值7／6／5；air、enemy、neutral目标 |

规则文件按100源坐标单位对应1世界单位转换距离，保留完整未换算源行。已有铁匠铺目录包含 `hgyr` 的 `Rhar/Rhra` 升级关系；后续运行时需将对应攻击骰子与护甲研究绑定到新增单位。

## REA 证据

REA 源站：[morluto/rea](https://github.com/morluto/rea)，固定6.5.0、提交 `3b79af28e80785afce9f5998d8f03289402a1847`；安装更新入口为 `third_party/rea/README-MENGINE.md`。

本机 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`probe-frost-rea-flying-machine.mjs` 在调用前核对该摘要，并保留完整 Evidence、截断状态及执行前后摘要。

- `0x6f57bdd0` 返回 `CAbilityFlakCannon`，`0x6f57b460` 返回 `Aflk`；虚表身份指针位于 `0x6fa159a4`。
- `0x6f5725e0` 读取六个范围／伤害参数，传入三档范围调用 `0x6f6b19e0`，并安装 `0x6f573800` 回调。
- `0x6f573800` 先比较当前候选与上下文中的主目标；相等时返回0。范围伤害不应再次命中主目标。其余候选继续经过源能力处理。

这三组静态探针证明身份、范围分发和主目标排除调用链。伤害缩放、全部目标掩码组合、精确距离边界及原版实际运行结果仍需后续核对。

## 重建与验证

```powershell
python scripts/import-frost-flying-machine.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-flying-machine-effects.py --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-flying-machine-source.py
node scripts/probe-frost-rea-flying-machine.mjs
node scripts/qa-frost-flying-machine-assets.mjs
```

规则／机身导入支持 `--source-sample`；特效导入支持 `--source-root`。保留原件可在无游戏安装的目录重建，仍需固定转换器与素材库。写入前核验既有输出摘要，拒绝覆盖已修改的生成物。维护时使用独立 `--output` 目录完成验证后再更新样例。

229项文件（含原件和输出）、2组来源验证和3组REA探针通过；规则、模型、头像、特效及收据离线重建逐字节一致。原生预览6项检查覆盖5种机身动画姿态和源头像摄影机；截图确认机身、命中特效、炸弹、高射火炮及头像可见，控制台和材质管线错误均为0。164项原生预览资产与最终样例文件逐字节相同。专用编辑器正常退出；WebView缓存因EPERM保留于专用QA目录。

证据与截图只保存在 `tmp/docs-artifacts/frost-flying-machine/`。这些检查不代表生产队列、研究、战斗、网络、存档或原版游戏运行对照已完成；完整复刻目标继续推进。
