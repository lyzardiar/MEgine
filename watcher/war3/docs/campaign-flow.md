# 战役入口与关卡切换

战役菜单从原版 CampaignStrings 和 FDF 读取 ROC／TFT 战役、章节、难度和背景，依据本地进度开放入口；选择章节后直接读取原安装的地图归档，并进入现有地图准备和游戏加载流程。战役资料和难度写入独立用户目录的 Campaign/profile.bin；脚本可修改战役／章节／过场可用状态，并通过 ChangeLevel 请求下一关，跨关英雄与数值使用 [gamecache](campaign-gamecache.md)。重新开始、回菜单和强制选择战役接入相应入口。自定义地图切换路径限定在原安装 Maps 或当前地图所在目录内，保持其原有会话类型。

这是功能接入，尚未经过完整战役运行或原版一致性验证。模型过场的其他模型事件、第四个 Mission 字段的行为、完整章节解锁和配音、原版存档／回放／局域网以及 .w3v 文件兼容尚未完成。原安装目录只读，战役数据不生成地图解包资产。战役资源目录、路径与原版资料证据在 tmp/docs-artifacts/war3/campaign/。

教程标志的原版入口：Game.dll 1.27 的 `0x6f2d6372` 读取 `TutorialCleared`，为零且满足其他条件时显示原版 `SKIP_TUTORIAL` 文本；确认分支 `0x6f2d1818` 将该标志设为 1 并继续保存的目标，其他按钮分支不执行此流程。原版 `0x6f2b0070` 根据 `CampaignList` 中的非空段名查找目标并返回索引。静态证据为 `ev_32fc47bb339b9b3c837716f8ed74808553d5eebe939c778eec4011049142909a`、`ev_03df87b081f9a62a2fc757d238b061db6c47ddad5270f1f287d9ab7cf62819c6`、`ev_8ce2e61539276371372fac57663e78ed0e7805f481b92fb5f8d66addf76b9042`、`ev_fa5bc4d787b3573a6743f06f9710774952eaecccf374845b29ba0fac63019c6a`。客户端选择原版战役列表中第一个非空项之后的 ROC 战役且教程未完成时显示本地化确认框；确认保存标志并进入选定战役，取消返回战役列表；教程完成或 TFT 战役直接进入。控件使用源皮肤与 `SKIP_TUTORIAL`／`YES`／`NO` 字符串，版本门控、快捷键、控件布局和完整原版触发条件仍需对照。真实窗口、脚本 `SetTutorialCleared` 与跨会话保存尚待阶段验证。

战役菜单的影片条目读取 Movies 目录同名文件：虽然扩展名为 .mpq，其内容为 BLZ0 AVI／MP3。客户端以 DirectShow 从原文件播放，通过原安装的 blizzard.ax 免注册构造解码器，不写解包文件；支持静音、跳过及返回菜单。原版安装的解码器按 Win32 架构和 SHA-256 校验。资料片结局模型按原版顺序连续切换十段动画及对应相机，在第二段根据 UI/MiscData.txt 的 Scene1 声音标签启动原音轨。REA 确认原版场次切换和声音配置消费；原版 MRFX／MRDX 事件已接入六份 MRF 披风网格动画、纹理和帧插值；其完整画面、渲染状态和原版一致性仍待验证，其他模型事件仍待实现。影片实际画面、听感、跳过／窗口恢复也待功能阶段验证。

地图脚本的 PlayCinematic 与 PlayModelCinematic 分别登记影片和模型槽位；对局结束转场时先播放模型，再播放影片，随后继续胜利／切关流程。原版反汇编支持此顺序；退出类型边界及播放期间其他声音的处理仍待对照。

序章组选择流程所用 SyncSelections 在单机读取本地选择；自研实验联机与回放使用人类玩家快照和等待屏障，GroupEnumUnitsSelected 从当前脚本线程的同步视图读取，详见[实验联机](lan-experimental-flow.md)。该实现尚待双客户端、回放及原版对照；脚本本地选择的事件和实时命令状态同步仍待完成。序章掉落脚本的 SetItemDropID 将来源类型保存到物品状态，并由独立 gamecache 的单位物品快照保存及恢复；原版普通存档持久化该字段，原版 StoreUnit 是否保留仍待对照。

战役区域移动、地点视野查询、地面物品矩形枚举及对应过滤／枚举上下文已接入；单位选中查询、八种编组命令和研究单位查询连接现有选择、命令及研究事件。编组命令的返回值和部分失败、物品在过滤回调中的移除或转移、区域边界和原版事件语义仍待对照。序章第二关教学计数板状态和 HUD 已接入，原版布局与实际教程交互待验证；多人同步尚未实现，见[战役计数板](campaign-leaderboard.md)。

脚本可按单位原始名称或类型编号对应的字符串创建及枚举单位，并支持限制数量的类型／地点范围枚举；筛选复用现有编组和回调上下文。技能等级增减接入已有能力状态和装备刷新，默认索敌范围与物品无敌查询读取实际对象配置或状态。边界和原版精度待阶段验证。

战役列表按当前战役的 `AmbientSound` 读取 `UI/SoundInfo/AmbienceSounds.slk`，循环播放源声音；切换到不同声音时替换，离开战役界面时释放，重新进入时按当前音量、环境音开关及静音参数创建。该声音与菜单音乐独立；实际听感、切换时机与原版行为待集中验证。

返回战役章节页时重新读取脚本保存的战役进度；若战役选择已变化，则选择目标战役第一张可玩的章节，否则保留当前章节。章节页恢复后按当前进度重新启动后台地图准备，已锁定或影片条目沿用既有检查。窗口交互、实际章节胜负／跨战役返回与原版选择行为待集中验证。

`SetDefaultDifficulty` 更新本次会话的默认难度，`GetDefaultDifficulty` 返回该值；原 Blizzard.j 胜利回调可通过现有 `SetGameDifficulty` 恢复默认难度。当前实现允许 0–3，不直接修改当前难度或持久化战役界面选择；原版默认值、持久化与异常参数行为仍待对照。

Human01 胜利流程中的 `udg_QuestOrcs` 在地图脚本中未赋值，任务完成接口需接受空句柄；任务／目标句柄解析失败时的操作与查询使用安全返回。原版 `QuestSetCompleted` 入口 `0x6f1f2550` 与 `QuestItemSetCompleted` 入口 `0x6f1f24d0` 在句柄解析失败时直接返回，原始指令记录于 `tmp/docs-artifacts/war3/human01-victory-1030/original-quest-natives.txt`。隔离探针在玩家获得控制后以 `KillUnit` 触发首领组死亡事件，推进至胜利对话框；选择继续后得到 `Maps\Campaign\Human02.w3m` 换关请求，见 `tmp/docs-artifacts/war3/human01-victory-1030/victory-continue.log`。该探针不覆盖手动战斗、真实窗口、第二关载入及完整战役。

Human02 开场使用从未赋值的 `udg_Knight01`，将空单位传入 `GetUnitLoc`；无效单位现在返回空 location，读取无效位置的 X/Y 返回零，移除无效位置不产生动作。Warcraft III 1.27 Game.dll 的 `GetUnitLoc`（`0x6f1e6280`）、`GetLocationX/Y`（`0x6f1e3240/0x6f1e3260`）和 `RemoveLocation`（`0x6f1f2d80`）的句柄解析失败分支见 `tmp/docs-artifacts/war3/human02-1030/original-location-natives.txt`。隔离探针载入 Human02 并推进 400 秒，在 60.25 秒采样时玩家控制已恢复，日志见 `tmp/docs-artifacts/war3/human02-1030/locfixed.log`；这是未携带 Human01 gamecache、未操作战斗的空闲开局，不代表真实换关或完整关卡通过。

Human01 原胜利脚本保存阿尔萨斯并请求 Human02 后，隔离探针销毁前一会话并启动 Human02；原载入脚本恢复其 4 级、用户数据和指定库存物品，证据见[战役 gamecache](campaign-gamecache.md)。此探针通过直接击杀首领组加速，未经过实际窗口和自动换关界面。

Human02 原图胜利流程的隔离探针在开场控制恢复后，通过辅助脚本标记基地任务已完成，再对原图剑圣调用 KillUnit；原地图触发器进入胜利对话框，选择继续后发出 `Maps\Campaign\Human02Interlude.w3m` 换关请求，日志位于 `tmp/docs-artifacts/war3/human02-victory-1030/victory.log`。该复现跳过真实基地建造、战斗和窗口操作，未验证间章加载或完整关卡。

Human02 至 Human03 的隔离链路中，将阿尔萨斯设为 5 级后直接执行 Human02 原图的关卡准备函数；间章发出 Human03 换关请求，手动载入 Human03 后恢复了 5 级阿尔萨斯，开场结束后玩家控制权恢复。日志位于 `tmp/docs-artifacts/war3/human03-continuation-1031/cache-chain.log`。该检查未自然完成 Human02，也未经过产品窗口自动切关、真实战斗和完整战役。

Human03 隔离探针将阿尔萨斯移入原图粮仓区域并对目标仓库下达攻击命令；原图受击和死亡触发后出现胜利对话框，下一关目标为 `Maps\Campaign\Human04.w3m`，日志位于 `tmp/docs-artifacts/war3/human03-continuation-1031/attack-ending.log`。探针直接调整单位位置，未覆盖自然寻路、鼠标输入、实际窗口或完整关卡。

资料片暗夜精灵第一章的隔离开场已恢复玩家控制；真实任务、窗口及地图中战争践踏的参数处理仍待完成或验证，见[关卡状态](campaign-nightelfx01-status.md)。
