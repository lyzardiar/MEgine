# 写实 MOBA 兵线

每条路线由 3 名近战步兵和 1 名远程弓手组成，每第 7 波追加 1 辆投石车。默认首波在 4 秒生成，此后每 30 秒出兵；自定义地图保留设置的波次间隔。这是原创 MOBA 原型的规则，数值不代表原版 Dota 平衡。

近战、远程和攻城兵分别复用 `RealFootman`、`RealArcher` 和 `RealCatapult`。模型、头像、移动、攻击、装填与生物死亡动画沿用现有资源。素材来自 Wildfire Games 的 0 A.D.，遵循 CC-BY-SA-3.0；原件、派生资源哈希及署名见 `human-sources.json`、`siege-sources.json` 和 Player 的 `Assets/Licenses`。本阶段没有新增下载，未取得 Free3D 资源。

双方共六条兵线先统一分配空位，再整波生成；容量不足或出生地阻塞时等待，不产生单边缺兵。出生点在基地出口，并复用编队的间距和可达性检查。默认地图清理了路边遮挡树木及不使用的金矿。

玩家可以单击查看小兵和建筑属性，指令、框选和编组仅包含英雄及召唤单位。客户端与服务器使用同一个控制权限判断。地图触发器仍可命令系统单位，旧存档的集结点可以读取。MOBA 不应用阵营生命、速度、伤害加成或亡灵 AI 恢复；其他模式保持原有属性。三类兵线都支持半血反补。

联机协议升级到 11，拒绝无法识别新增兵种的旧客户端；客户端和服务器必须同步更新。

验证：

- `node scripts/test-frostbound.mjs`：规则、资源哈希、客户端反馈和真实 TCP 测试通过，包括服务器拒绝控制小兵及旧协议连接。
- `node scripts/test-frost-lanes.mjs`：六路兵种数量、周期攻城、出生间距、移动、容量与阻塞原子性、英雄/召唤控制、旧集结点存档、反补、箭矢/石弹存档续飞及 2,200 tick 自然交战通过。
- `cargo test -p mengine-editor-host --test frost_sample`：3 passed / 0 failed。
- `node scripts/qa-frostbound.mjs --lanes-only`：原生 Release 编辑器、QuickJS 和 Agent 输入验证通过。默认地图关闭 AI、波次计数从 6 开始，以直接检验第 7 波的 30 个单位；验证查看小兵、隐藏动作按钮、键盘指令拒绝、英雄控制、存档恢复、移动及三类写实网格。材质管线拒绝数 0，证据见 `native-lanes-qa.json`。
- Windows 包：540 文件，234,753,781 字节，内容哈希 `42d9f3fa1bd0670bbb0cb2751d03bf12e433e487d2b2b8eeba75b93946cf4e49`。资源及清单哈希校验通过，实际启动 30 秒可响应、日志错误 0，见 `player-smoke.json`。

实际截图为 `lanes-siege-wave.png` 和 `lanes-marching.png`，来自上述原生验收场景。自动输入不代表物理鼠标、键盘、声音或跨机器局域网验收；本阶段未重新测量 FPS。完整游戏复刻仍在进行。
