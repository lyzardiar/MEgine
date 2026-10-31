# 亡灵最终章的英雄物品

`UnitRemoveItemFromSlot` 对空、已移除或类型不匹配的单位返回空物品；有效单位按槽位取出并通过现有掉落流程处理物品，空槽及越界槽返回空物品。亡灵第八章在恢复克尔苏加德后先尝试移出六格物品，再检查恢复结果；没有前关缓存时会对空单位执行这些调用，然后创建默认英雄。

固定版 Warcraft III 1.27.0.52240 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。本地 PE 注册与 Capstone 指令显示 `UnitRemoveItemFromSlot` 入口 `0x6f1fb1b0` 在单位解析失败时跳至 `0x6f1fb1fc` 并返回零。原始定位脚本及隔离会话日志位于 `tmp/docs-artifacts/war3/undead08-*.py` 和 `tmp/docs-artifacts/war3/tft-ne4-next/undead08-goal*.log`；运行客户端不加载 `Game.dll`。

Win32 Release 客户端和 `war3_undead_finale_tests` 编译通过。以新建用户目录和原版 `Undead08.w3m` 启动，默认英雄创建成功；空／已移除单位、越界／空槽返回空物品，有效槽位返回并掉落实际物品。将原图召唤计时器设为五秒后，实际计时事件驱动结尾并取得胜利，定向检查 1 通过、0 失败。该检查未携带前关缓存，不覆盖完整防守、正常 30 分钟计时、真实窗口及原版画面。

`UnitItemInSlot`、`UnitInventorySize`、`UnitHasItem` 和 `IsItemOwned` 对空、已销毁或不兼容句柄返回空值／零／false；`UnitRemoveItem` 对无效单位或物品直接返回。有效对象继续使用实时库存和掉落事件。固定版注册入口分别为 `0x6f1faf50`、`0x6f1faee0`、`0x6f1fad90`、`0x6f1e7c30` 和 `0x6f1fb170`；本地指令显示对象解析失败分支返回或跳过处理，定位脚本位于 `tmp/docs-artifacts/war3/inventory-null-*.py`。Win32 Release 原图定向检查 1 通过、0 失败，覆盖空／失效／不兼容句柄及有效查询和掉落；实际地图的重入、归属变化和原版事件时序待验证。
