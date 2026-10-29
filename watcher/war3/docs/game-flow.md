# 对局结束、脚本对话框与游戏菜单

2026-10-27。原Blizzard.j负责近战胜负和自定义结局，会话维护真实玩家结果、事件、对话框与退出请求，前端消费原FDF控件。完整窗口操作、结算还原度与长时间对局尚待阶段验证。

## 已接入

- RemovePlayer记录胜/负/平/中立结果与离开槽位，派发玩家胜负事件并防止递归重复结算；CachePlayerHeroData保留真实英雄类型、等级、经验与属性供结算使用。EndGame/RestartGame把是否显示结算及返回/重开请求交给前端，不直接操作用户原安装；实验联机的 EndGame 先产生本机离开意图，对话框回调按触发玩家定位，离开确认后再处理结算。多人 RestartGame／ChangeLevel 尚未实现，实验联机及回放执行时明确报错。
- 近战关键建筑查询解析UnitUI/name的townhall、greathall、treeoflife、necropolis等原内部名称，统计实际单位、未完成状态/队列及升级等价。GetPlayerTechCount也使用真实单位/科技消费，允许高级主基地满足低级前置。整数游戏状态 0／1 已接入会话读写和事件；网络断线消费与原版精度待完成或验证，见[整数游戏状态](integer-game-state.md)。
- Dialog/button/defeatcondition使用真实句柄与生命周期，消息/按钮/快捷键/玩家显示进入ScriptDialog.fdf。按钮和对话框事件携带GetClickedButton/GetClickedDialog/GetTriggerPlayer；点击、清理、销毁、重新显示和退出按钮连接脚本及前端。hashtable可保存这些句柄，失败条件说明进入菜单帮助内容。
- F10、Esc及游戏菜单按钮打开EscMenuMainPanel.fdf，原控件连接暂停/继续、返回、结束游戏、退出确认和重开。重开复用当前选图与玩家配置重新创建会话；退出程序由自己的客户端事件循环处理。菜单与脚本对话框隔离世界输入，EnableUserControl/UI/Select连接实际消费，暂停期间继续维护声音时钟。
- 游戏内选项入口与游戏性页面接入原 FDF，鼠标边缘滚动开关连接本地相机，声音页面开关及音量连接播放与独立用户设置；其他选项及实际窗口验收待完成，见[游戏内选项](game-options.md)。
- 结算使用 ScoreScreen.fdf、原背景／页签／顶栏模型及 GlobalStrings 的列标题，概况与单位、英雄、资源四个页签展示现有会话统计。概况和科技百分比通过 GetPlayerScore 消费当前实现，首次读取后缓存在结算界面；训练、击杀、建造、摧毁、物品、雇佣、人口峰值及采集计数由实际消费者更新。分数和科技百分比使用当前计算规则；资源交换列暂展示黄金付出／收到，英雄列使用缓存的英雄名称，均待与原版核对。列标题支持鼠标及键盘选择，按当前页签数据稳定排序并切换升降序；队伍、回放保存及完整结算布局尚待实现或验证。排序方向、视觉指示及原版精度待对照。

主菜单/地图资源仍直接从MPQ读取；原安装只读，运行不加载Game.dll，不生成地图解包工程。

## 来源及开发检查

原Blizzard.j的MeleeInitVictoryDefeat、MeleeCheckForLosersAndVictors、MeleeVictoryDialogBJ、MeleeDefeatDialogBJ和CustomVictory/Defeat调用链保留为脚本执行。所需FDF来源清单为tmp/docs-artifacts/war3/game-flow/source-manifest.json；内部单位名与原字段为typed-unit-source.json。

REA核对同一Game.dll摘要e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a：RemovePlayer注册入口0x6f1f2db0，调用0x6f24bee0；DialogDisplay入口0x6f1dfb70先核对本地玩家；EndGame入口0x6f1e0100保存结算标志和退出状态后交给主循环。原始观察在同目录match_native_*.json，事件重入/顺序的完整原件对照仍排队。

BootyBay的原2秒胜负检查曾在GetIntegerGameState停止。当前必要编译通过，26个字面量native声明与生成器语法核对通过；原main及2,100ms最小推进退出0，实际模拟2.09375秒，bj_gameStarted=true、结果0:0（玩家0胜利）、1个脚本对话框/2个按钮，无Game.dll。证据为bootybay-before.log、bootybay-after.log；它证明脚本胜利路径和状态生产者可执行，不证明窗口点击或GPU通过。

胜利路径还暴露了原QuestCompleted.wav尾部问题：文件454,870字节，完整PCM数据块454,656字节结束于454,700，后面170字节不能按RIFF chunk解释。时长读取在完整fmt/PCM data后使用有效音频块，不把尾部当新音频块；真正截断的data仍失败。原源文件时长5,155ms及截断拒绝的最小检查通过，证据为victory-wave-before.log、victory-wave.log；未验证有声播放与听感。

最终产品/消费者编译日志为build-final.log、consumer-final-build.log。新增专项消费者已编译，完整行为尚未运行：

```powershell
python watcher/war3/tests/generate-game-flow-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
cd watcher/war3
./build/windows-x86/bin/Release/war3_game_flow_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/game-flow/fixture.w3m'
```

阶段合并验证对话框事件/重入删除/快捷键/多玩家显示、胜负/离开回调、类型/科技计数、暂停与UI控制、原菜单键盘鼠标、继续/退出/重开、结算模型/页签/值/资源释放及三图实际流程。

尚未完成：原版加权总分、全部分项/排序/队伍和胜负模型动画；菜单选项、存档/载入、保存回放、完整帮助/提示；战役跨关/存档持久化；断线/LAN及作弊状态。对应菜单入口保持禁用或未绑定，完整客户端矩阵继续开放。统计定义、计数边界、离开/败退事件顺序、对话框布局/长文/滚动/设备恢复和原版精度需阶段对照。
