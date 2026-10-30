# DotA 黑皇杖与失效物品句柄

DotA_v6.83d 的黑皇杖 `I0FZ` 使用水元素原型触发地图脚本；脚本替换物品后，延迟回调仍读取原物品句柄。`GetItemPlayer` 对失效或不兼容物品返回空玩家，`GetItemCharges`、`GetItemUserData`、`GetItemLevel` 返回零，`GetItemType` 返回 `ITEM_TYPE_UNKNOWN`；有效物品继续读取实时状态。

固定版 Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 证据 `ev_28898112e11ff11c91c2565a3e2d58625b0cd20a91e40bd86d7cc7803e994f08` 和 `ev_2fc01d05c067920a3405ccc884ff69ccd8d6ee3694461d0b04f490c62d377897` 显示上述入口在物品解析失败后返回相应默认值。

Win32 Release 客户端及测试程序编译通过；`invalid-item` 1/1 覆盖有效、空、销毁和不兼容句柄。原图静音隔离会话直接创建英雄及 `I0FZ` 并使用：物品替换为 `I0G0`，免疫在第 1 至第 10 秒采样为真、第 11 秒为假，替换物品保留冷却；日志为 `tmp/docs-artifacts/war3/dota-bkb/bkb-after.log`。探针未经过自然购买和游戏窗口，不证明完整对局或原版精度。

阶段验证多次使用和最低持续时间、物品转移／删除、其他来源免疫与驱散、事件和冷却、跨玩家／联机、原版表现及真实窗口。其他物品 native 的无效句柄行为尚需按各自原版入口核对。
