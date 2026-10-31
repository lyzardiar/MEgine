# 亡灵最终章的英雄物品

`UnitRemoveItemFromSlot` 对空、已移除或类型不匹配的单位返回空物品；有效单位按槽位取出并通过现有掉落流程处理物品，空槽及越界槽返回空物品。亡灵第八章在恢复克尔苏加德后先尝试移出六格物品，再检查恢复结果；没有前关缓存时会对空单位执行这些调用，然后创建默认英雄。

固定版 Warcraft III 1.27.0.52240 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。本地 PE 注册与 Capstone 指令显示 `UnitRemoveItemFromSlot` 入口 `0x6f1fb1b0` 在单位解析失败时跳至 `0x6f1fb1fc` 并返回零。原始定位脚本及隔离会话日志位于 `tmp/docs-artifacts/war3/undead08-*.py` 和 `tmp/docs-artifacts/war3/tft-ne4-next/undead08-goal*.log`；运行客户端不加载 `Game.dll`。

Win32 Release 客户端和 `war3_undead_finale_tests` 编译通过。以新建用户目录和原版 `Undead08.w3m` 启动，默认英雄创建成功；空／已移除单位、越界／空槽返回空物品，有效槽位返回并掉落实际物品。将原图召唤计时器设为五秒后，实际计时事件驱动结尾并取得胜利，定向检查 1 通过、0 失败。该检查未携带前关缓存，不覆盖完整防守、正常 30 分钟计时、真实窗口及原版画面。
