# 战役中的矩形移动

`MoveRectToLoc` 对无效、已销毁或类型不匹配的矩形和地点直接返回；有效句柄继续按地点移动原矩形并保持原有尺寸。兽族第五章的目标重选触发器从单位组移除死亡单位后，使用随机单位的位置移动矩形；组清空时地点可能为空。

本机 Warcraft III 1.27.0.52240 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。本地 PE 注册表与 Capstone 指令显示 `MoveRectToLoc` 入口为 `0x6f1f0f20`，先解析矩形，再解析地点，任一解析失败均直接返回；`GetUnitLoc` 入口为 `0x6f1e6280`，单位解析失败时直接返回。原始定位脚本和日志位于 `tmp/docs-artifacts/war3/orc05-*.py` 与 `orc05-runtime-400*.log`，运行客户端不加载 `Game.dll`。

Win32 Release 客户端与定向测试编译通过；`war3_spatial_handle_tests` 的空、已销毁及有效句柄检查 1 通过、0 失败。`Orc05.w3m` 静音原图模拟在修复前于 `war3map.j:4175` 中断，修复后推进至 400 秒。该检查没有操作实际战役界面，不代表通关或完整原版行为一致。

已有 `war3_world_tests` 的 `world_rect_query_mutation_and_full_extent` 使用无归档的内存世界，当前在 `attachWorld` 阶段报 `World resources require archive-backed terrain`；该夹具尚需更新，本次使用独立的真实地图夹具进行定向检查。
