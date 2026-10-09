# 剑圣阶段交接

剑圣 Obla 使用原版身体、肖像相机、属性成长、攻击骰子、技能图标和 W/R/C/B 技能栏。疾风步保留渐隐、单位交通穿越与背刺；镜像保留 0.5 秒延迟、1/2/3 个可控制分身、继承属性和装备、零输出、双倍承伤与敌方伪装；致命一击及七秒剑刃风暴使用来源规则。

镜像使用原版 MirrorImageCaster、MirrorImageMissile 和 LevelupCaster。施法光效留在原位置，光带以原表速度 1000/100 飞往分身的初始出生点，出生光效附着角色 Origin 并按非循环动画结束。剑圣及镜像的身体粒子、丝带使用原模型采样数据，与身体动画的 clip/time 同步，不重复身体几何。来源位置受迷雾检查，隐藏起点不会经公开状态泄露。

协议为 67。新增 bladeMirrorEffect 保存起点、施法帧、等级、出生帧及初始目的地；校验身份、时间、范围和镜像一致性。旧存档允许缺少该字段。共享 asset-library 保持只读；本阶段未修改 C#。

## 验证

以下均退出 0：

- `node scripts/test-frost-blademaster.mjs`
- `node scripts/test-frost-blademaster-effects.mjs`
- `node scripts/test-frost-blademaster-generated.mjs`
- `node scripts/test-frost-blademaster-network.mjs`
- `node scripts/test-frost-effects.mjs`
- `node scripts/test-frost-blood-mage-generated.mjs`
- `python scripts/validate-frost-blademaster-effects.py`
- `node scripts/qa-frost-blademaster.mjs`

转换校验覆盖 20 个原始来源、106 个输出、38 个 GUID、4 个原生效果和 21 个几何采样；离线重建逐字节一致，修改过的生成文件及损坏来源被拒绝。来源覆盖顺序为 war3.mpq、War3x.mpq、War3xLocal.mpq、War3Patch.mpq，包含来源、工具和二进制哈希。W3ModelViewer MIT 文本对应转换工具。

原生验收检查施法、飞行与出生特效，身体效果与旋转动画绑定，镜像控制，伤害和 F5 保存恢复。Main、场景哈希与当前产物一致，控制台错误和材质拒绝均为零。原生实例正常退出，隔离工程和 QA 存档已清理。截图见 `blademaster-native-mirror-caster.png`、`blademaster-native-mirror-missile.png`、`blademaster-native-mirror.png`、`blademaster-native-bladestorm.png`。

前一阶段的 138 个导入模块及主正文分段结果留在 blademaster-validation.json 中，明确标记为历史记录；本阶段没有重新运行完整入口，也不声称完整入口退出 0。

## 原生验收时间

以下是当前原生 QA 的墙钟时间，不包含实现、转换及其他测试。命令耗时包含桥接等待与运行时间，不能直接当作引擎 CPU 时间。

| 步骤 | 秒 |
|---|---:|
| project open and ready | 89.263 |
| original Blademaster body, portrait camera, source stats and W/R/C/B cards | 42.302 |
| native Wind Walk fade and saved invisible state | 26.077 |
| native Mirror Image models, player control and F5 continuation | 104.414 |
| native Bladestorm spin animation, ground damage and saved continuation | 91.041 |
| 合计 | 353.097 |

规则、TCP 和资产校验在原生验收期间并行完成。完整命令计时见 native-blademaster-qa.json；playback.step 合计 148.764 秒，playback.input 合计 63.171 秒，是本次原生流程中耗时最多的两类调用。

## 接续

当前证据证明 MEngine 内的原版资源绑定和采样效果运行，尚未通过原游戏执行逐帧比较证明完整 Warcraft 求解器一致性。动态肖像相机、物理输入、音频、跨机器 LAN，以及其余三名兽族英雄玩法仍待完成。完整战役、原版地图编辑器和经典 TD/Dota 内容仍属于持续目标。

下一阶段接入其余兽族英雄的原版技能、召唤物与特效。使用现有转换工具及原生程序，保持按阶段验收、提交和推送。
