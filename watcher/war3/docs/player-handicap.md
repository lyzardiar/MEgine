# 玩家让分

选图设置和 SetPlayerHandicap 连接玩家倍率与真实单位基础最大生命值。新单位、现存单位动态调整、易主、跨玩家幻象和建筑升级使用相应拥有者的倍率；动态调整保持现存生命比例。玩家经验倍率沿用独立的 SetPlayerHandicapXP。

原版 Game.dll 1.27 的 SetPlayerHandicap 入口会遍历玩家单位并更新生命；当前基础生命取整、状态下限、英雄／装备／科技增益组合以及跨玩家 GameCache 恢复仍待原版对照。

Win32 Release 产品编译通过；BootyBay 会话定向检查新旧单位倍率、生命比例及易主通过，未加载 Game.dll。日志 tmp/docs-artifacts/war3/terrain-handicap-timer-probe/result.log。
