# 飞行机器来源、转换与验收

Author: MiYu

人族遭遇战的车间使用 `F` 生产飞行机器；城堡完成后使用 `B` 研究飞行机器炸弹、`C` 研究高射炮火。三项与迫击炮共用车间队列，训练和研究均支付源资源价格，取消退还费用。出口被占用时已完成训练会等待出场，并可正常保存与读取。

`flying-machine.json` 保存本机《冰封王座》飞行机器 `hgyr` 的规则和源行；`flying-machine-models.json`、`flying-machine-portraits.json`、`flying-machine-effects.json` 提供身体、头像摄影机及攻击特效。联机协议117拒绝旧客户端；旧存档默认关闭新增玩法，保留原有车间名单。

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

规则文件按100源坐标单位对应1世界单位转换距离，保留完整未换算源行。铁匠铺 `Rhar` 每级增加2护甲，`Rhra` 每级为两种武器增加一个d2；既有和新造单位同步获得升级。飞行机器无魔法、无自然生命恢复，可维修，死亡动画体不能复活或供尸体技能使用。

对空在伤害点立即命中，不生成飞行弹；研究炸弹后可攻击地面，发射速度9、弧度0的跟踪炸弹。炸弹只伤害指定目标，发射者死亡后仍继续结算。攻击采用水平距离及碰撞半径，保留出手缓冲；蛛网等改变目标空地类别时重新判定武器。高射炮火以主目标为中心，排除主目标、友军和地面单位，按候选碰撞体选择7／6／5伤害档，再应用攻击类型与护甲。

真实视域覆盖9世界单位，沿用普通视野与隐形侦测共同决定可见性的流程。单位死亡后不再侦测。敌方网络快照隐藏研究、生产队列和前摇目标，仅公开攻击起始帧／武器槽以播放完整动作，并保留可见的被动能力；公开炸弹不携带伤害预算或研究等级。

原模型 `Attack one`（索引7）用于对空，`Attack two`（索引5）用于对地。`Attack one` 的源区间19133–20133内存在枪口粒子，声音事件19167与0.03秒伤害点互证。身体、头像、命中、炸弹和高射炮火均使用已保留的源几何、粒子与动画；头像使用原始透视摄影机，头像几何和内嵌粒子使用相同的初始序列1与采样时间。

## REA 证据

REA 源站：[morluto/rea](https://github.com/morluto/rea)，固定6.5.0、提交 `3b79af28e80785afce9f5998d8f03289402a1847`；安装更新入口为 `third_party/rea/README-MENGINE.md`。

本机 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`probe-frost-rea-flying-machine.mjs` 在调用前核对该摘要，并保留完整 Evidence、截断状态及执行前后摘要。

- `0x6f57bdd0` 返回 `CAbilityFlakCannon`，`0x6f57b460` 返回 `Aflk`；虚表身份指针位于 `0x6fa159a4`。
- `0x6f5725e0` 读取六个范围／伤害参数，传入三档范围调用 `0x6f6b19e0`，并安装 `0x6f573800` 回调。
- `0x6f573800` 先比较当前候选与上下文中的主目标；相等时返回0。范围伤害不应再次命中主目标。其余候选继续经过源能力处理。

- `0x6f6b19e0` 保存范围／伤害对、调用空间查询，并在伤害前执行主目标过滤回调。
- `0x6f6af6c0` 获取候选身体，使用 `0x6f03e260` 测试各档碰撞范围；`0x6f6af530 → 0x6f685690` 将固定档位伤害和触发武器的伤害描述送入目标伤害虚方法。技能不把主目标武器骰子重复加入各档伤害。
- 独立REA复核将 `Agyv` 绑定到 `CAbilityGyroVision`／`CAbilityDetector`；构造入口 `0x6f3f1e10`、注册入口 `0x6f3daf00`、可用性入口 `0x6f3fc090`。原模型粒子与声音事件独立支持武器动画选择。

六组静态探针覆盖高射炮火身份、三档范围、主目标过滤和伤害描述传递。引擎沿用已有共享护甲算法；没有执行原版完整伤害接收器、全部目标掩码／免疫组合或原游戏完整战斗。距离采用JavaScript双精度，未保证所有float32相切边界逐位一致。Detector中的部分禁用标志位语义、飓风等特殊状态下的原版侦测细节，以及原引擎动画槽分发仍未完成运行对照。

## 重建与验证

```powershell
python scripts/import-frost-flying-machine.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-flying-machine-effects.py --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-flying-machine-source.py
node scripts/probe-frost-rea-flying-machine.mjs
node scripts/qa-frost-flying-machine-assets.mjs
node scripts/test-frost-flying-machine.mjs
node scripts/test-frost-flying-machine-client.mjs
node scripts/test-frost-flying-machine-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
$env:MENGINE_QA_ROOT='G:/work/github/MEgine/tmp/docs-artifacts/frost-flying-machine/native-qa'
node scripts/qa-frost-flying-machine.mjs
node scripts/test-frostbound.mjs
```

规则／机身导入支持 `--source-sample`；特效导入支持 `--source-root`。保留原件可在无游戏安装的目录重建，仍需固定转换器与素材库。写入前核验既有输出摘要，拒绝覆盖已修改的生成物。维护时使用独立 `--output` 目录完成验证后再更新样例。

229项文件（含原件和输出）、2组来源验证和6组REA探针通过；规则、模型、头像、特效及收据离线重建逐字节一致。原生预览6项检查覆盖5种机身动画姿态和源头像摄影机；截图确认机身、命中特效、炸弹、高射火炮及头像可见，控制台和材质管线错误均为0。164项原生预览资产与最终样例文件逐字节相同。专用编辑器正常退出；WebView缓存因EPERM保留于专用QA目录。

玩法规则8组、生成客户端、真实TCP及原生3组通过，原生控制台错误0。最终生成、样例及原生验收Main的SHA-256均为 `ed907f429fdb2a9f13d9da68b5f61825c100fa0073ca2f692adb8052184294ad`。场景保留原有3804个实体，仅追加1个飞行器内嵌特效模板。

玩法检查包括完整训练／研究时钟、阻塞出口、退款、铁匠铺双武器升级、即时对空、跟踪对地、范围伤害、侦测、机械分类、保存续飞和伪造状态拒绝。生成客户端检查实际按钮、快捷键、武器面板、模型／头像与特效；TCP检查所有权、私有研究、断线重连和公开投射物。

证据与截图只保存在 `tmp/docs-artifacts/frost-flying-machine/`；独立源码／REA复核位于其 `review/` 子目录。这些检查不代表原游戏完整运行、物理输入、独立发布包或跨机器联机已验收；完整复刻目标继续推进。

完整主回归 `node scripts/test-frostbound.mjs` 退出码0，共776条PASS记录，包含24,000帧AI验证。日志为 `tmp/docs-artifacts/frost-flying-machine/regression-release.log`；最终摘要核对见 `release-verification.json`。
