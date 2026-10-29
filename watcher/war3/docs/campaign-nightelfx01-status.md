# 娜迦族的崛起：当前关卡状态

固定版资料片第一章 `nightelfX01.w3x` 的隔离会话已越过开场脚本，并在 40.25 秒采样到玩家控制恢复；静音空闲推进至 400 秒，记录位于 `tmp/docs-artifacts/war3/tft-opening-1031/nightelfX01-maxlife.log`。该探针没有操作任务目标、真实窗口、音画或完成关卡，不能证明关卡可玩或通关。

另一次隔离探针在开场后直接击杀原图胜利组中的 14 个单位；原触发器执行胜利过场并打开对话框，选择继续后请求 `Maps\FrozenThrone\Campaign\NightElfX02.w3x`，记录位于 `tmp/docs-artifacts/war3/tft-opening-1031/victory-dialog.log`。探针跳过了玩家战斗、实际窗口和自动切关。

地图中 `Awrs` 战争践踏的源 `DataB1=-50`、`DataC1=300`；现有通用技能参数校验会拒绝负 `DataB1`，而战争践踏当前只消费 `DataA` 伤害及眩晕。原版元数据 `Units/AbilityMetaData.slk` 中 `Wrs1` 只公开 DataA，DataB／DataC 的含义和消费方式仍需确认并实现。当前状态下，持有此技能的单位尝试使用它可能使会话停止，不应视作已支持。字段与异常见 `tmp/docs-artifacts/war3/tft-opening-1031/warstomp-metadata.log` 和 `nightelfX01-ability.log`。
