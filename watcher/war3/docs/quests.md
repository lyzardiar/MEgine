# 原版任务窗口与任务状态

2026-10-27。任务native维护真实状态，F9窗口使用原版 `UI/FrameDef/UI/QuestDialog.fdf`、EscMenuTemplates、皮肤纹理与字体。任务窗口及新增控件路径已编译，尚未执行GPU/真实输入验收。

## 流程

- CreateQuest/DestroyQuest分配及销毁独立任务句柄和所属目标句柄；维护标题、描述、图标、主线/可选、发现、启用、完成和失败状态。QuestCreateItem和目标描述/完成接口维护实际目标。
- F9或游戏上方任务入口打开窗口；源QuestAcceptButton、Esc和F9关闭。打开期间世界输入被窗口消费，任务修改按会话revision更新，不重建整个游戏。
- 主线/可选使用源容器和QuestListItem模板，显示已发现且启用的任务；任务图标、标题、状态高亮及详情对应选中任务。列表、目标和长说明可滚轮翻页；Tab/Enter沿用现有源控件焦点逻辑。
- 目标使用原版QuestCheckBox2及勾选纹理。说明沿用源文字样式、颜色、换行和裁剪，按实际换行数限制滚轮及原版滚动条的点击／拖动范围；任务内容更新和切换时同步偏移。行数计算与文字绘制使用相同的颜色解析和换行规则。
- FlashQuestDialogButton驱动HUD通知闪烁，打开任务窗口时确认；ForceQuestDialogUpdate驱动revision刷新。没有添加成功占位。

主要代码：`session_quest.cpp`、`quest_dialog.cpp`、`script_state.h`、`game_view.cpp`、`glue.cpp`。窗口资源按需直接读原归档，不生成解包文件。

## 开局接续

DotA原main已完成，123单位/1物品/205触发器/1,303事件，无Game.dll。推进250ms的延迟逻辑已创建6个任务，随后在 `Scripts/war3map.j:32750` 的IsPointBlighted失败；完整开局和玩法未通过。

已处理同一路径的空物品槽查询：GetItemPlayer(null)返回null，整数型物品getter对null返回0，非零无效句柄继续报错。REA核对GetItemPlayer注册至0x6f1e2c50，空解析结果直接返回0；GetItemUserData的0x6f1e2ce0同样返回0，非空读取+0x80。原始证据为 `tmp/docs-artifacts/war3/quest-item-*-rea.json`。

IsUnitType补齐源武器启用位、攻击目标和武器类型对应的对空/对地、近战/远程分类，以及实际summoner对应的召唤分类；未知状态分类继续明确失败，未用默认false替代状态实现。

## 验证队列

必要Win32 Release产品及扩展消费者编译通过，无警告；8个字面量任务native声明核对通过，动态绑定通过DotA实际模块初始化。任务与原有商店/英雄/幻象共用待执行消费者夹具，增加状态/目标/通知断言及空物品槽检查。

任务图标、皮肤/锚点、中文长文、任务/目标/说明翻页、键鼠/焦点/取消、实时增删、完成/失败、返回/切图释放，以及不同地图/单人与多人暂停规则仍需集中验收。主线、支线、目标及说明列表在内容超出可见行时显示原版滚动条背景和滑块，支持点击及拖动；任务更新后偏移会按现有内容收敛。说明区行距、布局与滚动条行为仍需对照原版；未发现任务的原版展示规则尚未完成。没有将编译或CPU任务创建作为GPU还原通过证据。

日志：`tmp/docs-artifacts/war3/quests-{build,dota}.log`。专项夹具、三图完整回归、GPU和性能仍未执行，旧MEngine延期批次保持原状态。

## 未发现任务的原版证据

原版 1.27 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 对该文件的静态查询显示，`UNDISCOVERED_QUEST` 位于 `0x6f9938a0`，引用位于 `0x6f3a8143`、`0x6f3a81ca` 和 `0x6f3b9cf6`；`0x6f3b9bfc` 附近还使用 `UndiscoveredQuestIcon`，并根据任务对象偏移 `+0x24` 的位 `0x04` 选择图标和标题。另一条路径引用 `QUESTNOTDISCOVERED`。原版 `GlobalStrings.fdf` 中 `UNDISCOVERED_QUEST` 在 `War3Patch.mpq` 和 `War3xLocal.mpq` 为“隐藏任务”，在 `war3.mpq` 为“未发现的任务”。

详情刷新路径 `0x6f3a80e0` 至 `0x6f3a8132` 仅在 `+0x24` 的 `0x04` 和 `0x10` 均置位时显示真实描述和目标，否则使用 `QUESTNOTDISCOVERED`；`0x6f3a814d` 至 `0x6f3a8161` 按 `0x04` 选择真实标题。`0x10` 的含义及这两个位的完整生命周期尚待确认。

这些静态片段尚不足以确定未发现任务何时纳入列表、是否可选择以及完整详情显示规则；当前客户端仍只列出已启用且已发现的任务。需结合对应状态位的写入、列表构建路径和原版实际交互继续验证。

## 局域网任务窗口

实验局域网对局可使用 F9 或顶部任务入口查看任务，打开窗口只确认本地任务提示，不暂停模拟；聊天、回放和离开对局期间不打开。任务条目仍由地图脚本和会话状态提供。双端输入、提示及原版行为待集中验证。
