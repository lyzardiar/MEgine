# 无效单位名称查询

`GetUnitName` 对空、已销毁或类型不兼容的单位句柄返回空字符串句柄，对有效单位继续返回其名称。固定版 `Game.dll` 的入口 `0x6f1e6340` 调用 `0x6f1d1550` 解析单位，解析返回零时直接返回零；指令记录于 `tmp/docs-artifacts/war3/tft-opening-1031/get-unit-name-native.txt`。

资料片 `NightElfX04.w3x` 的开场对话在移除一个哨兵之后查询先前随机选择的哨兵名称；当两者是同一单位时，原先会因销毁句柄而中止。原地图脚本的引用关系见 `tmp/docs-artifacts/war3/tft-opening-1031/nightelfX04-name-refs.log`。

Win32 Release 核心及隔离探针编译通过；最小会话检查验证有效单位有名称，空、移除和不兼容句柄均返回 null 字符串，见 `null-unit-name.log`。同版第四章原图越过原 23.5312 秒故障，80.25 秒采样时玩家控制恢复，静音空闲推进至 400 秒，见 `nightelfX04-name-fixed.log`。需集中验证动态名称、字幕表现、引用其他单位的分支、真实窗口及原版画面；完整战役仍待验证。
